import * as ts from 'typescript';
import { ASTParser } from '../utils/astParser.js';
import { FileUtils } from '../utils/fileUtils.js';
import { AnalysisResult, Issue, IssueType, IssueSeverity } from '../types.js';

export class JSToTSAnalyzer {
  constructor(private parser: ASTParser) {}

  async analyzeFile(filePath: string): Promise<AnalysisResult> {
    const issues: Issue[] = [];

    if (!FileUtils.isJavaScriptFile(filePath)) {
      return { file: filePath, issues: [] };
    }

    try {
      const sourceFile = this.parser.parseFile(filePath);
      if (!sourceFile) {
        return { file: filePath, issues: [] };
      }

      const migrationScore = this.calculateMigrationScore(sourceFile);

      // Only suggest migration for files that clearly would benefit (higher threshold)
      if (migrationScore > 6) {
        issues.push({
          type: IssueType.JS_TO_TS,
          severity: IssueSeverity.INFO,
          message: `This JavaScript file would significantly benefit from TypeScript migration (score: ${migrationScore}/10)`,
          suggestion: this.generateMigrationPlan(sourceFile, filePath)
        });
      }

    } catch (error) {
      issues.push({
        type: IssueType.JS_TO_TS,
        severity: IssueSeverity.ERROR,
        message: `Failed to analyze JS file: ${error}`
      });
    }

    return { file: filePath, issues };
  }

  private calculateMigrationScore(sourceFile: ts.SourceFile): number {
    let score = 0;
    const factors = {
      hasReactImport: 0,
      hasComplexFunctions: 0,
      hasClassComponents: 0,
      hasPropsUsage: 0,
      hasStateUsage: 0,
      hasEventHandlers: 0,
      hasAsyncOperations: 0,
      hasObjectDestructuring: 0,
      hasModuleExports: 0,
      fileSize: sourceFile.getFullText().length
    };

    const visit = (node: ts.Node) => {
      if (ts.isImportDeclaration(node)) {
        const moduleSpecifier = node.moduleSpecifier.getText();
        if (moduleSpecifier.includes('react')) {
          factors.hasReactImport = 2;
        }
      }

      if (ts.isClassDeclaration(node)) {
        const heritage = node.heritageClauses;
        if (heritage?.some(clause => 
          clause.types.some(type => 
            type.expression.getText().includes('Component')
          )
        )) {
          factors.hasClassComponents = 2;
        }
      }

      if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node)) {
        if (node.parameters.length > 2) {
          factors.hasComplexFunctions += 0.5;
        }
      }

      if (ts.isPropertyAccessExpression(node)) {
        if (node.name.text === 'props') factors.hasPropsUsage = 1;
        if (node.name.text === 'state') factors.hasStateUsage = 1;
      }

      if (ts.isCallExpression(node)) {
        if (ts.isIdentifier(node.expression)) {
          const name = node.expression.text;
          if (name.startsWith('on') || name.includes('Handler')) {
            factors.hasEventHandlers = 0.5;
          }
          if (name === 'fetch' || name === 'axios' || name.includes('async')) {
            factors.hasAsyncOperations = 1;
          }
        }
      }

      if (ts.isObjectBindingPattern(node) || ts.isArrayBindingPattern(node)) {
        factors.hasObjectDestructuring = 0.5;
      }

      if (ts.isExportAssignment(node) || 
          (ts.isExpressionStatement(node) && 
           node.expression.getText().includes('module.exports'))) {
        factors.hasModuleExports = 1;
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    score = Object.values(factors).reduce((sum, val) => sum + (typeof val === 'number' ? val : 0), 0);
    
    if (factors.fileSize > 500) score += 1;
    if (factors.fileSize > 1000) score += 1;

    return Math.min(Math.round(score), 10);
  }

  private generateMigrationSuggestions(sourceFile: ts.SourceFile, filePath: string): Issue[] {
    const issues: Issue[] = [];
    
    const visit = (node: ts.Node) => {
      if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node)) {
        if (node.parameters.length > 0 && this.looksLikeReactComponent(node)) {
          const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          issues.push({
            type: IssueType.JS_TO_TS,
            severity: IssueSeverity.INFO,
            message: 'React component could benefit from TypeScript props interface',
            line: position.line + 1,
            column: position.character + 1,
            suggestion: 'Add props interface and type the component parameters'
          });
        }
      }

      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        if (node.expression.text === 'useState') {
          const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          issues.push({
            type: IssueType.JS_TO_TS,
            severity: IssueSeverity.INFO,
            message: 'useState hook would benefit from explicit typing',
            line: position.line + 1,
            column: position.character + 1,
            suggestion: 'Add type parameter: useState<StateType>(initialValue)'
          });
        }
      }

      if (ts.isVariableDeclaration(node)) {
        if (!node.type && node.initializer) {
          const initText = node.initializer.getText();
          if (initText.includes('{}') || initText.includes('[]')) {
            const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
            issues.push({
              type: IssueType.JS_TO_TS,
              severity: IssueSeverity.INFO,
              message: 'Variable could benefit from explicit typing',
              line: position.line + 1,
              column: position.character + 1,
              suggestion: 'Add type annotation for better type safety'
            });
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return issues;
  }

  private looksLikeReactComponent(node: ts.FunctionDeclaration | ts.ArrowFunction): boolean {
    const text = node.getFullText();
    return text.includes('return') && 
           (text.includes('<') || text.includes('jsx') || text.includes('createElement'));
  }

  private generateMigrationPlan(sourceFile: ts.SourceFile, filePath: string): string {
    const steps = [];
    const newPath = filePath.replace(/\.jsx?$/, '.tsx');
    
    steps.push(`1. Rename ${filePath} to ${newPath}`);
    steps.push('2. Add TypeScript configuration if not present');
    
    let hasReactImports = false;
    let hasComponents = false;
    let hasHooks = false;

    const visit = (node: ts.Node) => {
      if (ts.isImportDeclaration(node)) {
        const moduleSpecifier = node.moduleSpecifier.getText();
        if (moduleSpecifier.includes('react')) {
          hasReactImports = true;
        }
      }

      if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node)) {
        if (this.looksLikeReactComponent(node)) {
          hasComponents = true;
        }
      }

      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        if (node.expression.text.startsWith('use')) {
          hasHooks = true;
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    if (hasReactImports) {
      steps.push('3. Update React imports to include types');
    }
    
    if (hasComponents) {
      steps.push('4. Create Props interfaces for React components');
      steps.push('5. Add return type annotations for components');
    }
    
    if (hasHooks) {
      steps.push('6. Add type parameters to React hooks');
    }
    
    steps.push('7. Add type annotations to variables and functions');
    steps.push('8. Resolve any TypeScript compiler errors');

    return steps.join('\n');
  }
}