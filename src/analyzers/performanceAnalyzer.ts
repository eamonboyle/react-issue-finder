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
    let inlineFunctionCount = 0;
    let inlineStyleCount = 0;

    const visit = (node: ts.Node) => {
      if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name)) {
        const attrName = node.name.text;
        
        // Count inline functions but only flag if many in one component
        if ((attrName === 'onClick' || attrName.startsWith('on')) && 
            node.initializer && 
            ts.isJsxExpression(node.initializer) &&
            node.initializer.expression &&
            ts.isArrowFunction(node.initializer.expression)) {
          
          inlineFunctionCount++;
        }

        // Count inline styles but only flag if many
        if (attrName === 'style' && 
            node.initializer && 
            ts.isJsxExpression(node.initializer) &&
            node.initializer.expression &&
            ts.isObjectLiteralExpression(node.initializer.expression)) {
          
          inlineStyleCount++;
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    
    // Only flag if there are many inline functions (5+) in one file
    if (inlineFunctionCount > 5) {
      issues.push({
        type: IssueType.PERFORMANCE,
        severity: IssueSeverity.INFO,
        message: `Many inline arrow functions in JSX (${inlineFunctionCount}) may cause unnecessary re-renders`,
        line: 1,
        column: 1,
        suggestion: 'Consider extracting to useCallback hooks or class methods'
      });
    }
    
    // Only flag if there are many inline styles (8+) in one file
    if (inlineStyleCount > 8) {
      issues.push({
        type: IssueType.PERFORMANCE,
        severity: IssueSeverity.INFO,
        message: `Many inline style objects (${inlineStyleCount}) may cause unnecessary re-renders`,
        line: 1,
        column: 1,
        suggestion: 'Consider extracting style objects or using CSS classes'
      });
    }

    return issues;
  }

  private findMissingMemoization(sourceFile: ts.SourceFile): Issue[] {
    const issues: Issue[] = [];

    const visit = (node: ts.Node) => {
      // Only check for very complex calculations without memoization
      if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node)) {
        if (this.isVeryComplexCalculation(node) && !this.hasMemoization(node)) {
          const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          issues.push({
            type: IssueType.PERFORMANCE,
            severity: IssueSeverity.INFO,
            message: 'Very complex calculation without memoization',
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

      // Only flag extremely large components with many elements (100+)
      if (jsxElements > 100) {
        const position = sourceFile.getLineAndCharacterOfPosition(component.getStart());
        issues.push({
          type: IssueType.PERFORMANCE,
          severity: IssueSeverity.INFO,
          message: `Component renders very many elements (${jsxElements})`,
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
    let timerCount = 0;
    let listenerCount = 0;

    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const funcName = node.expression.text;
        
        if (funcName === 'setInterval' || funcName === 'setTimeout') {
          timerCount++;
        }

        if (funcName === 'addEventListener') {
          listenerCount++;
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    
    // Only flag if there are many timers/listeners in one file (likely problematic)
    if (timerCount > 3) {
      issues.push({
        type: IssueType.PERFORMANCE,
        severity: IssueSeverity.WARNING,
        message: `Multiple timers (${timerCount}) may cause memory leaks if not cleared`,
        line: 1,
        column: 1,
        suggestion: 'Ensure all timers are cleared in cleanup functions'
      });
    }
    
    if (listenerCount > 5) {
      issues.push({
        type: IssueType.PERFORMANCE,
        severity: IssueSeverity.INFO,
        message: `Multiple event listeners (${listenerCount}) may cause memory leaks`,
        line: 1,
        column: 1,
        suggestion: 'Ensure all event listeners are removed in cleanup functions'
      });
    }

    return issues;
  }

  private findUnoptimizedImages(sourceFile: ts.SourceFile): Issue[] {
    const issues: Issue[] = [];
    let imageCount = 0;
    let unoptimizedCount = 0;

    const visit = (node: ts.Node) => {
      if (ts.isJsxSelfClosingElement(node) && 
          ts.isIdentifier(node.tagName) && 
          node.tagName.text === 'img') {
        
        imageCount++;
        
        const hasLoading = node.attributes.properties.some(prop => 
          ts.isJsxAttribute(prop) && 
          ts.isIdentifier(prop.name) && 
          prop.name.text === 'loading'
        );

        if (!hasLoading) {
          unoptimizedCount++;
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    
    // Only flag if there are many unoptimized images
    if (imageCount > 5 && unoptimizedCount > 3) {
      issues.push({
        type: IssueType.PERFORMANCE,
        severity: IssueSeverity.INFO,
        message: `Multiple images (${unoptimizedCount}/${imageCount}) without lazy loading`,
        line: 1,
        column: 1,
        suggestion: 'Consider adding loading="lazy" for better performance'
      });
    }
    
    return issues;
  }

  private isVeryComplexCalculation(node: ts.Node): boolean {
    let complexity = 0;
    
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node)) complexity++;
      if (ts.isForStatement(node) || ts.isForInStatement(node) || ts.isForOfStatement(node)) complexity += 3;
      if (ts.isBinaryExpression(node)) complexity++;
      
      ts.forEachChild(node, visit);
    };

    visit(node);
    return complexity > 15; // Much higher threshold
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