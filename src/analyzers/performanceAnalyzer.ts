import * as ts from 'typescript';
import { ASTParser } from '../utils/astParser.js';
import { FileUtils } from '../utils/fileUtils.js';
import { AnalysisResult, Issue, IssueType, IssueSeverity } from '../types.js';

export class PerformanceAnalyzer {
  constructor(private parser: ASTParser) {}

  async analyzeFile(filePath: string): Promise<AnalysisResult> {
    const issues: Issue[] = [];

    try {
      const sourceFile = this.parser.parseFile(filePath);
      if (!sourceFile) {
        return { file: filePath, issues: [] };
      }

      issues.push(...this.findUnnecessaryReRenders(sourceFile));
      issues.push(...this.findMissingMemoization(sourceFile));
      issues.push(...this.findIneffectiveEffects(sourceFile));
      issues.push(...this.findLargeInlineObjects(sourceFile));
      issues.push(...this.findUnoptimizedLoops(sourceFile));
      issues.push(...this.findLargeComponents(sourceFile));
      issues.push(...this.findMemoryLeaks(sourceFile));
      issues.push(...this.findUnoptimizedImages(sourceFile));

    } catch (error) {
      issues.push({
        type: IssueType.PERFORMANCE,
        severity: IssueSeverity.ERROR,
        message: `Failed to analyze performance issues: ${error}`
      });
    }

    return { file: filePath, issues };
  }

  private findUnnecessaryReRenders(sourceFile: ts.SourceFile): Issue[] {
    const issues: Issue[] = [];

    const visit = (node: ts.Node) => {
      if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name)) {
        const attrName = node.name.text;
        
        if ((attrName === 'onClick' || attrName.startsWith('on')) && 
            node.initializer && 
            ts.isJsxExpression(node.initializer) &&
            node.initializer.expression &&
            ts.isArrowFunction(node.initializer.expression)) {
          
          const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          issues.push({
            type: IssueType.PERFORMANCE,
            severity: IssueSeverity.WARNING,
            message: 'Inline arrow function in JSX causes unnecessary re-renders',
            line: position.line + 1,
            column: position.character + 1,
            suggestion: 'Extract to useCallback hook or class method'
          });
        }

        if (attrName === 'style' && 
            node.initializer && 
            ts.isJsxExpression(node.initializer) &&
            node.initializer.expression &&
            ts.isObjectLiteralExpression(node.initializer.expression)) {
          
          const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          issues.push({
            type: IssueType.PERFORMANCE,
            severity: IssueSeverity.INFO,
            message: 'Inline style object causes unnecessary re-renders',
            line: position.line + 1,
            column: position.character + 1,
            suggestion: 'Extract style object outside component or use CSS classes'
          });
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return issues;
  }

  private findMissingMemoization(sourceFile: ts.SourceFile): Issue[] {
    const issues: Issue[] = [];

    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const functionName = node.expression.text;
        
        if (functionName === 'map' || functionName === 'filter' || functionName === 'reduce') {
          const parent = node.parent;
          if (ts.isJsxExpression(parent)) {
            const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
            issues.push({
              type: IssueType.PERFORMANCE,
              severity: IssueSeverity.INFO,
              message: `Array.${functionName}() in JSX without memoization`,
              line: position.line + 1,
              column: position.character + 1,
              suggestion: 'Consider using useMemo for expensive calculations'
            });
          }
        }
      }

      if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node)) {
        if (this.isComplexCalculation(node) && !this.hasMemoization(node)) {
          const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          issues.push({
            type: IssueType.PERFORMANCE,
            severity: IssueSeverity.INFO,
            message: 'Complex calculation without memoization',
            line: position.line + 1,
            column: position.character + 1,
            suggestion: 'Consider using useMemo or useCallback'
          });
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return issues;
  }

  private findIneffectiveEffects(sourceFile: ts.SourceFile): Issue[] {
    const issues: Issue[] = [];

    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        if (node.expression.text === 'useEffect') {
          if (node.arguments.length < 2) {
            const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
            issues.push({
              type: IssueType.PERFORMANCE,
              severity: IssueSeverity.WARNING,
              message: 'useEffect without dependency array runs on every render',
              line: position.line + 1,
              column: position.character + 1,
              suggestion: 'Add dependency array to prevent unnecessary effect runs'
            });
          } else if (node.arguments.length >= 2) {
            const depsArg = node.arguments[1];
            if (ts.isArrayLiteralExpression(depsArg) && depsArg.elements.length === 0) {
              const effectCallback = node.arguments[0];
              if (ts.isArrowFunction(effectCallback) && effectCallback.body) {
                const hasStateAccess = this.hasStateAccess(effectCallback.body);
                if (hasStateAccess) {
                  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
                  issues.push({
                    type: IssueType.PERFORMANCE,
                    severity: IssueSeverity.WARNING,
                    message: 'useEffect accesses state but has empty dependency array',
                    line: position.line + 1,
                    column: position.character + 1,
                    suggestion: 'Add missing dependencies or use useCallback'
                  });
                }
              }
            }
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return issues;
  }

  private findLargeInlineObjects(sourceFile: ts.SourceFile): Issue[] {
    const issues: Issue[] = [];

    const visit = (node: ts.Node) => {
      if (ts.isObjectLiteralExpression(node) && 
          node.properties.length > 5 &&
          ts.isJsxExpression(node.parent)) {
        
        const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        issues.push({
          type: IssueType.PERFORMANCE,
          severity: IssueSeverity.INFO,
          message: `Large inline object (${node.properties.length} properties)`,
          line: position.line + 1,
          column: position.character + 1,
          suggestion: 'Extract to constant or useMemo to prevent recreation'
        });
      }

      if (ts.isArrayLiteralExpression(node) && 
          node.elements.length > 10 &&
          ts.isJsxExpression(node.parent)) {
        
        const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        issues.push({
          type: IssueType.PERFORMANCE,
          severity: IssueSeverity.INFO,
          message: `Large inline array (${node.elements.length} elements)`,
          line: position.line + 1,
          column: position.character + 1,
          suggestion: 'Extract to constant or useMemo to prevent recreation'
        });
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return issues;
  }

  private findUnoptimizedLoops(sourceFile: ts.SourceFile): Issue[] {
    const issues: Issue[] = [];

    const visit = (node: ts.Node) => {
      if (ts.isForStatement(node) || ts.isForInStatement(node) || ts.isForOfStatement(node)) {
        if (this.hasNestedDOMAccess(node)) {
          const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          issues.push({
            type: IssueType.PERFORMANCE,
            severity: IssueSeverity.WARNING,
            message: 'Loop with DOM access may cause performance issues',
            line: position.line + 1,
            column: position.character + 1,
            suggestion: 'Cache DOM elements or batch DOM operations'
          });
        }
      }

      if (ts.isCallExpression(node) && 
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === 'map') {
        
        if (this.hasNestedMapCall(node)) {
          const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          issues.push({
            type: IssueType.PERFORMANCE,
            severity: IssueSeverity.INFO,
            message: 'Nested map calls may impact performance',
            line: position.line + 1,
            column: position.character + 1,
            suggestion: 'Consider flattening or optimizing the data structure'
          });
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return issues;
  }

  private findLargeComponents(sourceFile: ts.SourceFile): Issue[] {
    const issues: Issue[] = [];
    const components = this.parser.findReactComponents(sourceFile);

    components.forEach(component => {
      const componentText = component.getFullText();
      const jsxElements = this.countJSXElements(component);

      if (jsxElements > 50) {
        const position = sourceFile.getLineAndCharacterOfPosition(component.getStart());
        issues.push({
          type: IssueType.PERFORMANCE,
          severity: IssueSeverity.INFO,
          message: `Component renders many elements (${jsxElements})`,
          line: position.line + 1,
          column: position.character + 1,
          suggestion: 'Consider virtualization for large lists or break into smaller components'
        });
      }
    });

    return issues;
  }

  private findMemoryLeaks(sourceFile: ts.SourceFile): Issue[] {
    const issues: Issue[] = [];

    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const funcName = node.expression.text;
        
        if (funcName === 'setInterval' || funcName === 'setTimeout') {
          const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          issues.push({
            type: IssueType.PERFORMANCE,
            severity: IssueSeverity.WARNING,
            message: `${funcName} may cause memory leaks if not cleared`,
            line: position.line + 1,
            column: position.character + 1,
            suggestion: 'Clear timers in useEffect cleanup or componentWillUnmount'
          });
        }

        if (funcName === 'addEventListener') {
          const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          issues.push({
            type: IssueType.PERFORMANCE,
            severity: IssueSeverity.INFO,
            message: 'Event listener may cause memory leaks if not removed',
            line: position.line + 1,
            column: position.character + 1,
            suggestion: 'Remove event listeners in cleanup functions'
          });
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return issues;
  }

  private findUnoptimizedImages(sourceFile: ts.SourceFile): Issue[] {
    const issues: Issue[] = [];

    const visit = (node: ts.Node) => {
      if (ts.isJsxSelfClosingElement(node) && 
          ts.isIdentifier(node.tagName) && 
          node.tagName.text === 'img') {
        
        const hasLoading = node.attributes.properties.some(prop => 
          ts.isJsxAttribute(prop) && 
          ts.isIdentifier(prop.name) && 
          prop.name.text === 'loading'
        );

        if (!hasLoading) {
          const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          issues.push({
            type: IssueType.PERFORMANCE,
            severity: IssueSeverity.INFO,
            message: 'Image without lazy loading attribute',
            line: position.line + 1,
            column: position.character + 1,
            suggestion: 'Add loading="lazy" for better performance'
          });
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return issues;
  }

  private isComplexCalculation(node: ts.Node): boolean {
    let complexity = 0;
    
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node)) complexity++;
      if (ts.isForStatement(node) || ts.isForInStatement(node) || ts.isForOfStatement(node)) complexity += 2;
      if (ts.isBinaryExpression(node)) complexity++;
      
      ts.forEachChild(node, visit);
    };

    visit(node);
    return complexity > 5;
  }

  private hasMemoization(node: ts.Node): boolean {
    const text = node.getFullText();
    return text.includes('useMemo') || text.includes('useCallback') || text.includes('React.memo');
  }

  private hasStateAccess(node: ts.Node): boolean {
    const text = node.getFullText();
    return text.includes('state') || text.includes('useState') || text.includes('props.');
  }

  private hasNestedDOMAccess(node: ts.Node): boolean {
    const text = node.getFullText();
    return text.includes('document.') || text.includes('getElementById') || text.includes('querySelector');
  }

  private hasNestedMapCall(node: ts.Node): boolean {
    let hasNested = false;
    
    const visit = (child: ts.Node) => {
      if (ts.isCallExpression(child) && 
          ts.isPropertyAccessExpression(child.expression) &&
          child.expression.name.text === 'map') {
        hasNested = true;
      }
      ts.forEachChild(child, visit);
    };

    if (ts.isCallExpression(node) && node.arguments.length > 0) {
      visit(node.arguments[0]);
    }
    
    return hasNested;
  }

  private countJSXElements(node: ts.Node): number {
    let count = 0;
    
    const visit = (node: ts.Node) => {
      if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
        count++;
      }
      ts.forEachChild(node, visit);
    };

    visit(node);
    return count;
  }
}