#!/usr/bin/env node

import { Command } from 'commander';
import { resolve } from 'path';
import { existsSync } from 'fs';
import chalk from 'chalk';
import ora from 'ora';
import { AnalysisEngine } from './core/analysisEngine.js';
import { ReportGenerator } from './reports/reportGenerator.js';
import { IssueType } from './types.js';

const program = new Command();

program
  .name('react-issue-finder')
  .description('CLI tool for detecting frontend issues in React codebases')
  .version('1.0.0');

program
  .argument('<project-path>', 'Path to the React project to analyze')
  .option('-t, --types <types...>', 'Issue types to analyze', ['all'])
  .option('-o, --output <format>', 'Output format (json, html, markdown, all)', 'all')
  .option('-b, --batch-size <size>', 'Batch size for file processing', '100')
  .option('-w, --workers <count>', 'Number of worker threads', '4')
  .option('--no-reports', 'Skip generating report files')
  .option('--watch', 'Watch mode for continuous analysis')
  .option('--config <path>', 'Path to configuration file')
  .option('--max-files <count>', 'Maximum number of files to analyze', '10000')
  .action(async (projectPath: string, options) => {
    const spinner = ora('Starting analysis...').start();
    
    try {
      // Validate project path
      const fullProjectPath = resolve(projectPath);
      if (!existsSync(fullProjectPath)) {
        spinner.fail(chalk.red(`Project path does not exist: ${fullProjectPath}`));
        process.exit(1);
      }

      // Parse issue types
      let issueTypes: IssueType[];
      if (options.types.includes('all')) {
        issueTypes = Object.values(IssueType);
      } else {
        issueTypes = options.types.map((type: string) => {
          const issueType = Object.values(IssueType).find(t => t === type || t.replace('-', '_').toUpperCase() === type.toUpperCase());
          if (!issueType) {
            spinner.fail(chalk.red(`Invalid issue type: ${type}`));
            process.exit(1);
          }
          return issueType;
        });
      }

      // Initialize analysis engine
      const analysisOptions = {
        batchSize: parseInt(options.batchSize),
        workerCount: parseInt(options.workers),
        maxFiles: parseInt(options.maxFiles),
        configPath: options.config
      };

      const engine = new AnalysisEngine(analysisOptions);
      
      spinner.text = 'Initializing analysis engine...';
      await engine.initialize();

      spinner.text = 'Analyzing project...';
      const results = await engine.analyzeProject(fullProjectPath, issueTypes, (progress) => {
        spinner.text = `Analyzing... ${progress.current}/${progress.total} files (${Math.round(progress.percentage)}%)`;
      });

      spinner.succeed(chalk.green('Analysis completed!'));

      // Display summary
      console.log('\n' + chalk.bold('Analysis Summary:'));
      console.log(`📁 Total files found: ${chalk.cyan(results.totalFiles)}`);
      console.log(`🔍 Files analyzed: ${chalk.cyan(results.analyzedFiles)}`);
      console.log(`⚠️  Total issues found: ${chalk.yellow(results.results.reduce((sum, r) => sum + r.issues.length, 0))}`);
      
      if (results.summary) {
        console.log('\n' + chalk.bold('Issue Breakdown:'));
        if (results.summary.typeErrors > 0) console.log(`🔴 Type errors: ${chalk.red(results.summary.typeErrors)}`);
        if (results.summary.jsFiles > 0) console.log(`📝 JS → TS migrations: ${chalk.blue(results.summary.jsFiles)}`);
        if (results.summary.refactoringOpportunities > 0) console.log(`🔧 Refactoring opportunities: ${chalk.magenta(results.summary.refactoringOpportunities)}`);
        if (results.summary.securityIssues > 0) console.log(`🛡️  Security issues: ${chalk.red(results.summary.securityIssues)}`);
        if (results.summary.performanceIssues > 0) console.log(`⚡ Performance issues: ${chalk.yellow(results.summary.performanceIssues)}`);
      }

      // Generate reports
      if (!options.noReports) {
        const reportSpinner = ora('Generating reports...').start();
        
        try {
          const reportGenerator = new ReportGenerator(fullProjectPath);
          const outputFormats = options.output === 'all' 
            ? ['json', 'html', 'markdown'] 
            : [options.output];

          for (const format of outputFormats) {
            await reportGenerator.generateReport(results, format as 'json' | 'html' | 'markdown');
          }

          const reportsPath = reportGenerator.getReportsPath();
          reportSpinner.succeed(chalk.green(`Reports generated in: ${chalk.cyan(reportsPath)}`));
        } catch (error) {
          reportSpinner.fail(chalk.red('Failed to generate reports'));
          console.error(error);
        }
      }

      // Watch mode
      if (options.watch) {
        console.log('\n' + chalk.blue('👁️  Watching for changes... Press Ctrl+C to stop'));
        await engine.watchMode(fullProjectPath, issueTypes, (newResults) => {
          console.log('\n' + chalk.green('🔄 Re-analysis completed!'));
          // Could update reports here too
        });
      }

    } catch (error) {
      spinner.fail(chalk.red('Analysis failed'));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

// Additional commands
program
  .command('config')
  .description('Generate a configuration file')
  .option('-o, --output <path>', 'Output path for config file', './react-issue-finder.config.json')
  .action(async (options) => {
    const configTemplate = {
      analysis: {
        batchSize: 100,
        workerCount: 4,
        maxFiles: 10000,
        excludePatterns: [
          "**/node_modules/**",
          "**/dist/**",
          "**/build/**",
          "**/*.test.{js,ts,jsx,tsx}",
          "**/*.spec.{js,ts,jsx,tsx}"
        ]
      },
      issueTypes: {
        "type-error": { enabled: true, severity: "error" },
        "js-to-ts": { enabled: true, severity: "warning" },
        "refactoring": { enabled: true, severity: "info" },
        "security": { enabled: true, severity: "error" },
        "performance": { enabled: true, severity: "warning" }
      },
      reports: {
        outputFormats: ["html", "json"],
        includeSourceCode: false,
        groupBy: "severity"
      }
    };

    const fs = await import('fs');
    await fs.promises.writeFile(options.output, JSON.stringify(configTemplate, null, 2), 'utf-8');
    console.log(chalk.green(`Configuration file created: ${options.output}`));
  });

program
  .command('doctor')
  .description('Check system requirements and project setup')
  .argument('<project-path>', 'Path to the React project')
  .action(async (projectPath: string) => {
    const spinner = ora('Running system checks...').start();
    
    // Check Node.js version
    const nodeVersion = process.version;
    const requiredVersion = '18.0.0';
    
    console.log('\n' + chalk.bold('System Requirements:'));
    console.log(`Node.js version: ${nodeVersion >= `v${requiredVersion}` ? chalk.green(nodeVersion) : chalk.red(nodeVersion)}`);
    
    // Check memory
    const memUsage = process.memoryUsage();
    console.log(`Available memory: ${chalk.cyan(Math.round(memUsage.heapTotal / 1024 / 1024))}MB`);
    
    // Check project structure
    const fullPath = resolve(projectPath);
    console.log('\n' + chalk.bold('Project Checks:'));
    console.log(`Project path: ${existsSync(fullPath) ? chalk.green('✓') : chalk.red('✗')} ${fullPath}`);
    
    if (existsSync(fullPath)) {
      const packageJsonPath = resolve(fullPath, 'package.json');
      const tsconfigPath = resolve(fullPath, 'tsconfig.json');
      
      console.log(`package.json: ${existsSync(packageJsonPath) ? chalk.green('✓') : chalk.yellow('⚠')} ${existsSync(packageJsonPath) ? 'Found' : 'Not found'}`);
      console.log(`tsconfig.json: ${existsSync(tsconfigPath) ? chalk.green('✓') : chalk.yellow('⚠')} ${existsSync(tsconfigPath) ? 'Found' : 'Not found'}`);
    }
    
    spinner.succeed('System check completed');
  });

if (process.argv.length === 2) {
  program.help();
}

program.parse();