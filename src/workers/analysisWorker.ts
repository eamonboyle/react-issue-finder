import { parentPort } from 'worker_threads';
import { ASTParser } from '../utils/astParser.js';
import { TypeAnalyzer } from '../analyzers/typeAnalyzer.js';
import { JSToTSAnalyzer } from '../analyzers/jsToTsAnalyzer.js';
import { RefactorAnalyzer } from '../analyzers/refactorAnalyzer.js';
import { SecurityAnalyzer } from '../analyzers/securityAnalyzer.js';
import { PerformanceAnalyzer } from '../analyzers/performanceAnalyzer.js';
import { IssueType, AnalysisResult } from '../types.js';

interface WorkerMessage {
  jobId: number;
  filePath: string;
  projectPath: string;
  issueTypes: IssueType[];
}

if (!parentPort) {
  throw new Error('This script must be run as a worker thread');
}

// Global parser instance for reuse within worker
let parser: ASTParser | null = null;
let analyzers: Record<IssueType, any> = {} as any;

async function initializeAnalyzers(projectPath: string, filePath: string): Promise<void> {
  if (!parser || parser.getProjectPath() !== projectPath) {
    parser = new ASTParser(projectPath);
    await parser.initializeProgram([filePath]);
    
    // Initialize analyzers
    analyzers = {
      [IssueType.TYPE_ERROR]: new TypeAnalyzer(parser),
      [IssueType.JS_TO_TS]: new JSToTSAnalyzer(parser),
      [IssueType.REFACTORING]: new RefactorAnalyzer(parser),
      [IssueType.SECURITY]: new SecurityAnalyzer(parser),
      [IssueType.PERFORMANCE]: new PerformanceAnalyzer(parser),
    };
  }
}

async function analyzeFile(
  filePath: string, 
  projectPath: string, 
  issueTypes: IssueType[]
): Promise<AnalysisResult> {
  try {
    await initializeAnalyzers(projectPath, filePath);
    
    const allIssues: any[] = [];
    
    for (const issueType of issueTypes) {
      const analyzer = analyzers[issueType];
      if (analyzer) {
        try {
          const result = await analyzer.analyzeFile(filePath);
          if (result.issues.length > 0) {
            allIssues.push(...result.issues);
          }
        } catch (analyzerError) {
          console.error(`Worker: Error with ${issueType} analyzer for ${filePath}:`, analyzerError);
          // Continue with other analyzers
        }
      }
    }
    
    return {
      file: filePath,
      issues: allIssues
    };
  } catch (error) {
    console.error(`Worker: Failed to analyze ${filePath}:`, error);
    return {
      file: filePath,
      issues: []
    };
  }
}

parentPort.on('message', async (message: WorkerMessage) => {
  try {
    const result = await analyzeFile(
      message.filePath,
      message.projectPath,
      message.issueTypes
    );
    
    parentPort!.postMessage({
      jobId: message.jobId,
      result
    });
  } catch (error) {
    parentPort!.postMessage({
      jobId: message.jobId,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle cleanup on exit
process.on('SIGTERM', () => {
  // Cleanup parser resources if needed
  if (parser) {
    // Add any cleanup logic here
  }
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Worker uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Worker unhandled rejection:', reason);
  process.exit(1);
});