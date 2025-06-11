// Legacy index file - kept for backward compatibility
// Main CLI entry point is now in cli.ts

export { AnalysisEngine } from './core/analysisEngine.js';
export { ReportGenerator } from './reports/reportGenerator.js';
export { ASTParser } from './utils/astParser.js';
export { FileUtils } from './utils/fileUtils.js';
export { TypeAnalyzer } from './analyzers/typeAnalyzer.js';
export { JSToTSAnalyzer } from './analyzers/jsToTsAnalyzer.js';
export { RefactorAnalyzer } from './analyzers/refactorAnalyzer.js';
export { SecurityAnalyzer } from './analyzers/securityAnalyzer.js';
export { PerformanceAnalyzer } from './analyzers/performanceAnalyzer.js';
export * from './types.js';