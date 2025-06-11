import { Worker } from 'worker_threads';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';
import { FileUtils } from '../utils/fileUtils.js';
import { ProjectAnalysis, AnalysisResult, IssueType } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface ProgressCallback {
  (progress: { current: number; total: number; percentage: number; currentFile?: string }): void;
}

export interface AnalysisEngineOptions {
  batchSize: number;
  workerCount: number;
  maxFiles: number;
  configPath?: string;
}

export class AnalysisEngine extends EventEmitter {
  private options: AnalysisEngineOptions;
  private workers: Worker[] = [];
  private workerPool: Worker[] = [];
  private activeJobs = new Map<number, { resolve: Function; reject: Function }>();
  private jobId = 0;

  constructor(options: AnalysisEngineOptions) {
    super();
    this.options = {
      batchSize: Math.max(1, Math.min(1000, options.batchSize)),
      workerCount: Math.max(1, Math.min(8, options.workerCount)),
      maxFiles: Math.max(100, options.maxFiles),
      configPath: options.configPath
    };
  }

  async initialize(): Promise<void> {
    // Initialize worker pool
    await this.initializeWorkers();
    
    // Load configuration if provided
    if (this.options.configPath && existsSync(this.options.configPath)) {
      await this.loadConfiguration(this.options.configPath);
    }
    
    // Perform initial memory check
    this.checkMemoryUsage();
  }

  private async initializeWorkers(): Promise<void> {
    const workerScript = join(__dirname, '../workers/analysisWorker.js');
    
    for (let i = 0; i < this.options.workerCount; i++) {
      const worker = new Worker(workerScript);
      
      worker.on('message', (message) => {
        if (message.jobId && this.activeJobs.has(message.jobId)) {
          const job = this.activeJobs.get(message.jobId)!;
          this.activeJobs.delete(message.jobId);
          
          if (message.error) {
            job.reject(new Error(message.error));
          } else {
            job.resolve(message.result);
          }
          
          // Return worker to pool
          this.workerPool.push(worker);
        }
      });
      
      worker.on('error', (error) => {
        console.error('Worker error:', error);
        // Remove failed worker and create a new one
        this.replaceWorker(worker);
      });
      
      this.workers.push(worker);
      this.workerPool.push(worker);
    }
  }

  private async replaceWorker(failedWorker: Worker): Promise<void> {
    const index = this.workers.indexOf(failedWorker);
    if (index !== -1) {
      try {
        await failedWorker.terminate();
      } catch (error) {
        // Ignore termination errors
      }
      
      // Create new worker
      const workerScript = join(__dirname, '../workers/analysisWorker.js');
      const newWorker = new Worker(workerScript);
      
      newWorker.on('message', (message) => {
        if (message.jobId && this.activeJobs.has(message.jobId)) {
          const job = this.activeJobs.get(message.jobId)!;
          this.activeJobs.delete(message.jobId);
          
          if (message.error) {
            job.reject(new Error(message.error));
          } else {
            job.resolve(message.result);
          }
          
          this.workerPool.push(newWorker);
        }
      });
      
      this.workers[index] = newWorker;
      this.workerPool.push(newWorker);
    }
  }

  async analyzeProject(
    projectPath: string, 
    issueTypes: IssueType[], 
    progressCallback?: ProgressCallback
  ): Promise<ProjectAnalysis> {
    const startTime = Date.now();
    
    // Find all React files
    const allFiles = await FileUtils.findReactFiles(projectPath);
    
    // Apply file limits
    const filesToAnalyze = allFiles.slice(0, this.options.maxFiles);
    
    if (allFiles.length > this.options.maxFiles) {
      console.warn(`Found ${allFiles.length} files, analyzing first ${this.options.maxFiles} files`);
    }

    // Process files in batches
    const results: AnalysisResult[] = [];
    const batches = this.createBatches(filesToAnalyze, this.options.batchSize);
    
    let processedFiles = 0;
    
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      
      // Process batch in parallel using workers
      const batchPromises = batch.map(async (file) => {
        const result = await this.analyzeFileWithWorker(file, projectPath, issueTypes);
        processedFiles++;
        
        if (progressCallback) {
          progressCallback({
            current: processedFiles,
            total: filesToAnalyze.length,
            percentage: (processedFiles / filesToAnalyze.length) * 100,
            currentFile: file
          });
        }
        
        return result;
      });
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      // Collect successful results
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value.issues.length > 0) {
          results.push(result.value);
        } else if (result.status === 'rejected') {
          console.error(`Failed to analyze ${batch[index]}:`, result.reason);
        }
      });
      
      // Memory management: force garbage collection between batches
      if (batchIndex % 5 === 0) {
        this.checkMemoryUsage();
        if (global.gc) {
          global.gc();
        }
      }
    }

    const analysisTime = Date.now() - startTime;
    
    // Generate summary
    const summary = {
      typeErrors: results.reduce((sum, r) => sum + r.issues.filter(i => i.type === IssueType.TYPE_ERROR).length, 0),
      jsFiles: results.reduce((sum, r) => sum + r.issues.filter(i => i.type === IssueType.JS_TO_TS).length, 0),
      refactoringOpportunities: results.reduce((sum, r) => sum + r.issues.filter(i => i.type === IssueType.REFACTORING).length, 0),
      securityIssues: results.reduce((sum, r) => sum + r.issues.filter(i => i.type === IssueType.SECURITY).length, 0),
      performanceIssues: results.reduce((sum, r) => sum + r.issues.filter(i => i.type === IssueType.PERFORMANCE).length, 0)
    };

    return {
      totalFiles: allFiles.length,
      analyzedFiles: filesToAnalyze.length,
      results,
      summary,
      analysisTime,
      metadata: {
        batchSize: this.options.batchSize,
        workerCount: this.options.workerCount,
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      }
    };
  }

  private async analyzeFileWithWorker(
    filePath: string, 
    projectPath: string, 
    issueTypes: IssueType[]
  ): Promise<AnalysisResult> {
    return new Promise((resolve, reject) => {
      if (this.workerPool.length === 0) {
        // Wait for available worker
        setTimeout(() => {
          this.analyzeFileWithWorker(filePath, projectPath, issueTypes)
            .then(resolve)
            .catch(reject);
        }, 10);
        return;
      }

      const worker = this.workerPool.pop()!;
      const currentJobId = ++this.jobId;
      
      this.activeJobs.set(currentJobId, { resolve, reject });
      
      worker.postMessage({
        jobId: currentJobId,
        filePath,
        projectPath,
        issueTypes
      });
      
      // Set timeout for worker jobs
      setTimeout(() => {
        if (this.activeJobs.has(currentJobId)) {
          this.activeJobs.delete(currentJobId);
          this.workerPool.push(worker); // Return worker to pool
          reject(new Error(`Worker timeout for file: ${filePath}`));
        }
      }, 30000); // 30 second timeout
    });
  }

  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  private checkMemoryUsage(): void {
    const usage = process.memoryUsage();
    const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(usage.heapTotal / 1024 / 1024);
    
    // Warn if memory usage is high
    if (heapUsedMB > 1000) {
      console.warn(`High memory usage detected: ${heapUsedMB}MB used of ${heapTotalMB}MB total`);
    }
    
    this.emit('memoryUsage', { heapUsed: heapUsedMB, heapTotal: heapTotalMB });
  }

  private async loadConfiguration(configPath: string): Promise<void> {
    try {
      const fs = await import('fs-extra');
      const config = await fs.readJson(configPath);
      
      // Merge configuration with options
      if (config.analysis) {
        this.options.batchSize = config.analysis.batchSize || this.options.batchSize;
        this.options.workerCount = config.analysis.workerCount || this.options.workerCount;
        this.options.maxFiles = config.analysis.maxFiles || this.options.maxFiles;
      }
    } catch (error) {
      console.warn(`Failed to load configuration from ${configPath}:`, error);
    }
  }

  async watchMode(
    projectPath: string,
    issueTypes: IssueType[],
    changeCallback: (results: ProjectAnalysis) => void
  ): Promise<void> {
    const chokidar = await import('chokidar');
    
    let analysisTimeout: NodeJS.Timeout;
    
    const watcher = chokidar.watch(projectPath, {
      ignored: [
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
        '**/.git/**'
      ],
      ignoreInitial: true,
      persistent: true
    });
    
    const scheduleAnalysis = () => {
      if (analysisTimeout) {
        clearTimeout(analysisTimeout);
      }
      
      analysisTimeout = setTimeout(async () => {
        try {
          const results = await this.analyzeProject(projectPath, issueTypes);
          changeCallback(results);
        } catch (error) {
          console.error('Watch mode analysis failed:', error);
        }
      }, 2000); // 2 second debounce
    };
    
    watcher
      .on('add', scheduleAnalysis)
      .on('change', scheduleAnalysis)
      .on('unlink', scheduleAnalysis);
    
    // Keep process alive
    return new Promise(() => {});
  }

  async cleanup(): Promise<void> {
    // Terminate all workers
    await Promise.all(this.workers.map(worker => worker.terminate()));
    this.workers = [];
    this.workerPool = [];
    this.activeJobs.clear();
  }
}