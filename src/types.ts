export interface AnalysisResult {
  file: string;
  issues: Issue[];
}

export interface Issue {
  type: IssueType;
  severity: IssueSeverity;
  message: string;
  line?: number;
  column?: number;
  rule?: string;
  suggestion?: string;
}

export enum IssueType {
  TYPE_ERROR = 'type-error',
  JS_TO_TS = 'js-to-ts',
  REFACTORING = 'refactoring',
  SECURITY = 'security',
  PERFORMANCE = 'performance'
}

export enum IssueSeverity {
  ERROR = 'error',
  WARNING = 'warning',
  INFO = 'info'
}

export interface ProjectAnalysis {
  totalFiles: number;
  analyzedFiles: number;
  results: AnalysisResult[];
  summary: {
    typeErrors: number;
    jsFiles: number;
    refactoringOpportunities: number;
    securityIssues: number;
    performanceIssues: number;
  };
  analysisTime?: number;
  metadata?: {
    batchSize: number;
    workerCount: number;
    timestamp: string;
    version: string;
  };
}

export interface FileInfo {
  path: string;
  extension: string;
  isReactComponent: boolean;
  hasTypes: boolean;
  size: number;
}

export interface AnalysisOptions {
  batchSize: number;
  workerCount: number;
  maxFiles: number;
  configPath?: string;
}