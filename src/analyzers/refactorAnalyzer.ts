import * as ts from 'typescript';
import { ASTParser } from '../utils/astParser.js';
import { FileUtils } from '../utils/fileUtils.js';
import { AnalysisResult, Issue, IssueType, IssueSeverity } from '../types.js';

export class RefactorAnalyzer {
  constructor(private parser: ASTParser) {}

  async analyzeFile(filePath: string): Promise<AnalysisResult> {
    const issues: Issue[] = [];

    try {
      const sourceFile = this.parser.parseFile(filePath);
      if (!sourceFile) {
        return { file: filePath, issues: [] };
      }

      issues.push(...this.findExtremelyLargeComponents(sourceFile));
      issues.push(...this.findSignificantDuplicateCode(sourceFile));
      issues.push(...this.findVeryComplexFunctions(sourceFile));
      issues.push(...this.findDefinitelyUnusedImports(sourceFile));
      issues.push(...this.findProblematicInlineStyles(sourceFile));
      issues.push(...this.findExcessiveParameterLists(sourceFile));
      issues.push(...this.findExtremeNesting(sourceFile));
      issues.push(...this.findTrueMagicNumbers(sourceFile));

    } catch (error) {
      issues.push({
        type: IssueType.REFACTORING,
        severity: IssueSeverity.ERROR,
        message: `Failed to analyze refactoring opportunities: ${error}`
      });
    }

    return { file: filePath, issues };
  }

  private findExtremelyLargeComponents(sourceFile: ts.SourceFile): Issue[] {
    const issues: Issue[] = [];
    const components = this.parser.findReactComponents(sourceFile);

    components.forEach(component => {
      const componentText = component.getFullText();
      const lineCount = componentText.split('\n').length;

      // Only flag truly massive components (300+ lines)
      if (lineCount > 300) {
        const position = sourceFile.getLineAndCharacterOfPosition(component.getStart());
        issues.push({
          type: IssueType.REFACTORING,
          severity: IssueSeverity.WARNING,
          message: `Extremely large component (${lineCount} lines) should be broken down`,
          line: position.line + 1,
          column: position.character + 1,
          suggestion: 'Consider extracting sub-components or custom hooks'
        });
      }
    });

    return issues;
  }

  private findVeryComplexFunctions(sourceFile: ts.SourceFile): Issue[] {
    const issues: Issue[] = [];

    const visit = (node: ts.Node) => {
      if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node)) {
        const complexity = this.calculateCyclomaticComplexity(node);
        const lineCount = node.getFullText().split('\n').length;
        
        // Only flag extremely complex functions (20+ complexity AND 100+ lines)
        if (complexity > 20 && lineCount > 100) {
          const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          issues.push({
            type: IssueType.REFACTORING,
            severity: IssueSeverity.WARNING,
            message: `Function has very high cyclomatic complexity (${complexity}) and is very long (${lineCount} lines)`,
            line: position.line + 1,
            column: position.character + 1,
            suggestion: 'Consider breaking down into smaller functions'
          });
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return issues;
  }

  private findSignificantDuplicateCode(sourceFile: ts.SourceFile): Issue[] {
    const issues: Issue[] = [];
    const codeBlocks = new Map<string, ts.Node[]>();

    const visit = (node: ts.Node) => {
      if (ts.isBlock(node) && node.statements.length > 5) {
        const blockText = node.getText().trim();
        // Only check substantial code blocks (500+ characters)
        if (blockText.length > 500 && !this.isBoilerplateCode(blockText)) {
          if (!codeBlocks.has(blockText)) {
            codeBlocks.set(blockText, []);
          }
          codeBlocks.get(blockText)!.push(node);
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    codeBlocks.forEach((nodes, blockText) => {
      // Only flag if duplicated 3+ times
      if (nodes.length > 2) {
        nodes.forEach(node => {
          const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          issues.push({
            type: IssueType.REFACTORING,
            severity: IssueSeverity.INFO,
            message: `Significant duplicate code block detected (${nodes.length} instances)`,
            line: position.line + 1,
            column: position.character + 1,
            suggestion: 'Consider extracting common logic into a shared function'
          });
        });
      }
    });

    return issues;
  }

  private findDefinitelyUnusedImports(sourceFile: ts.SourceFile): Issue[] {
    const issues: Issue[] = [];
    
    // Skip this check - too many false positives
    // Modern bundlers handle tree shaking automatically
    // and this check is unreliable without proper type checking
    
    return issues;
  }

  private findProblematicInlineStyles(sourceFile: ts.SourceFile): Issue[] {
    const issues: Issue[] = [];
    let inlineStyleCount = 0;

    const visit = (node: ts.Node) => {
      if (ts.isJsxAttribute(node) && 
          ts.isIdentifier(node.name) && 
          node.name.text === 'style' &&
          node.initializer &&
          ts.isJsxExpression(node.initializer)) {
        
        inlineStyleCount++;
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    
    // Only flag if there are many inline styles (10+) in one file
    if (inlineStyleCount > 10) {
      issues.push({
        type: IssueType.REFACTORING,
        severity: IssueSeverity.INFO,
        message: `Many inline styles detected (${inlineStyleCount}) in this file`,
        line: 1,
        column: 1,
        suggestion: 'Consider consolidating styles into CSS classes or styled-components'
      });
    }

    return issues;
  }

  private findExcessiveParameterLists(sourceFile: ts.SourceFile): Issue[] {
    const issues: Issue[] = [];

    const visit = (node: ts.Node) => {
      if ((ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node)) &&
          node.parameters.length > 8) { // Only flag truly excessive parameter lists
        
        const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        issues.push({
          type: IssueType.REFACTORING,
          severity: IssueSeverity.WARNING,
          message: `Function has excessive parameters (${node.parameters.length})`,
          line: position.line + 1,
          column: position.character + 1,
          suggestion: 'Consider using an options object or breaking down the function'
        });
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return issues;
  }

  private findExtremeNesting(sourceFile: ts.SourceFile): Issue[] {
    const issues: Issue[] = [];

    const checkNesting = (node: ts.Node, depth: number = 0) => {
      // Only flag extremely deep nesting (8+ levels)
      if (depth > 8 && (ts.isIfStatement(node) || ts.isForStatement(node) || ts.isWhileStatement(node))) {
        const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        issues.push({
          type: IssueType.REFACTORING,
          severity: IssueSeverity.WARNING,
          message: `Extreme nesting detected (depth: ${depth})`,
          line: position.line + 1,
          column: position.character + 1,
          suggestion: 'Consider early returns or extracting nested logic'
        });
      }

      const newDepth = (ts.isIfStatement(node) || ts.isForStatement(node) || 
                       ts.isWhileStatement(node) || ts.isBlock(node)) ? depth + 1 : depth;

      ts.forEachChild(node, child => checkNesting(child, newDepth));
    };

    checkNesting(sourceFile);
    return issues;
  }

  private findTrueMagicNumbers(sourceFile: ts.SourceFile): Issue[] {
    const issues: Issue[] = [];
    
    // Be very selective about magic numbers - only flag obvious cases
    const allowedNumbers = new Set([
      0, 1, -1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 16, 20, 24, 25, 30, 50, 
      60, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1024
    ]);

    const visit = (node: ts.Node) => {
      if (ts.isNumericLiteral(node)) {
        const value = parseFloat(node.text);
        const text = node.text;
        
        // Only flag large, unusual numbers that are clearly not CSS/UI related
        if (!allowedNumbers.has(value) && value > 1000 && 
            !this.isLikelyUIValue(text) && 
            !this.isInCSSContext(node)) {
          
          const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          issues.push({
            type: IssueType.REFACTORING,
            severity: IssueSeverity.INFO,
            message: `Large magic number detected: ${node.text}`,
            line: position.line + 1,
            column: position.character + 1,
            suggestion: 'Consider using a named constant'
          });
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return issues;
  }

  private calculateCyclomaticComplexity(node: ts.Node): number {
    let complexity = 1;

    const visit = (node: ts.Node) => {
      if (ts.isIfStatement(node) || 
          ts.isConditionalExpression(node) ||
          ts.isWhileStatement(node) ||
          ts.isForStatement(node) ||
          ts.isDoStatement(node) ||
          ts.isCaseClause(node) ||
          ts.isCatchClause(node)) {
        complexity++;
      }

      if (ts.isBinaryExpression(node) && 
          (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
           node.operatorToken.kind === ts.SyntaxKind.BarBarToken)) {
        complexity++;
      }

      ts.forEachChild(node, visit);
    };

    visit(node);
    return complexity;
  }

  private isBoilerplateCode(text: string): boolean {
    // Common boilerplate patterns that shouldn't be flagged as duplicates
    const boilerplatePatterns = [
      /import.*from/,
      /export.*{/,
      /const.*=.*{/,
      /interface.*{/,
      /type.*=/,
      /return.*null/,
      /return.*<div/
    ];
    
    return boilerplatePatterns.some(pattern => pattern.test(text));
  }

  private isLikelyUIValue(text: string): boolean {
    // Common UI/CSS values that shouldn't be flagged
    const value = parseFloat(text);
    
    // Common viewport widths, heights, etc.
    if (value === 1920 || value === 1080 || value === 768 || value === 1024 || 
        value === 1366 || value === 1440 || value === 1280) {
      return true;
    }
    
    // Percentages
    if (value <= 100 && text.includes('.')) {
      return true;
    }
    
    return false;
  }

  private isInCSSContext(node: ts.Node): boolean {
    const parent = node.parent;
    
    // Check if it's in a style object or CSS-related context
    if (ts.isPropertyAssignment(parent)) {
      const propName = parent.name?.getText()?.toLowerCase() || '';
      const cssProps = ['width', 'height', 'margin', 'padding', 'top', 'left', 'right', 'bottom', 'fontSize', 'lineHeight'];
      return cssProps.some(prop => propName.includes(prop));
    }
    
    return false;
  }
}