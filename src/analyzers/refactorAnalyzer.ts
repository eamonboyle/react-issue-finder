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

      issues.push(...this.findLargeComponents(sourceFile));
      issues.push(...this.findDuplicateCode(sourceFile));
      issues.push(...this.findComplexFunctions(sourceFile));
      issues.push(...this.findUnusedImports(sourceFile));
      issues.push(...this.findInlineStyles(sourceFile));
      issues.push(...this.findLongParameterLists(sourceFile));
      issues.push(...this.findDeepNesting(sourceFile));
      issues.push(...this.findMagicNumbers(sourceFile));

    } catch (error) {
      issues.push({
        type: IssueType.REFACTORING,
        severity: IssueSeverity.ERROR,
        message: `Failed to analyze refactoring opportunities: ${error}`
      });
    }

    return { file: filePath, issues };
  }

  private findLargeComponents(sourceFile: ts.SourceFile): Issue[] {
    const issues: Issue[] = [];
    const components = this.parser.findReactComponents(sourceFile);

    components.forEach(component => {
      const componentText = component.getFullText();
      const lineCount = componentText.split('\n').length;

      if (lineCount > 100) {
        const position = sourceFile.getLineAndCharacterOfPosition(component.getStart());
        issues.push({
          type: IssueType.REFACTORING,
          severity: IssueSeverity.WARNING,
          message: `Large component (${lineCount} lines) should be broken down`,
          line: position.line + 1,
          column: position.character + 1,
          suggestion: 'Consider extracting sub-components or custom hooks'
        });
      }
    });

    return issues;
  }

  private findComplexFunctions(sourceFile: ts.SourceFile): Issue[] {
    const issues: Issue[] = [];

    const visit = (node: ts.Node) => {
      if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node)) {
        const complexity = this.calculateCyclomaticComplexity(node);
        
        if (complexity > 10) {
          const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          issues.push({
            type: IssueType.REFACTORING,
            severity: IssueSeverity.WARNING,
            message: `Function has high cyclomatic complexity (${complexity})`,
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

  private findDuplicateCode(sourceFile: ts.SourceFile): Issue[] {
    const issues: Issue[] = [];
    const codeBlocks = new Map<string, ts.Node[]>();

    const visit = (node: ts.Node) => {
      if (ts.isBlock(node) && node.statements.length > 3) {
        const blockText = node.getText().trim();
        if (blockText.length > 100) {
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
      if (nodes.length > 1) {
        nodes.forEach(node => {
          const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          issues.push({
            type: IssueType.REFACTORING,
            severity: IssueSeverity.INFO,
            message: `Duplicate code block detected (${nodes.length} instances)`,
            line: position.line + 1,
            column: position.character + 1,
            suggestion: 'Consider extracting common logic into a shared function'
          });
        });
      }
    });

    return issues;
  }

  private findUnusedImports(sourceFile: ts.SourceFile): Issue[] {
    const issues: Issue[] = [];
    const imports = new Set<string>();
    const usages = new Set<string>();

    sourceFile.forEachChild(node => {
      if (ts.isImportDeclaration(node) && node.importClause) {
        if (node.importClause.name) {
          imports.add(node.importClause.name.text);
        }
        if (node.importClause.namedBindings) {
          if (ts.isNamedImports(node.importClause.namedBindings)) {
            node.importClause.namedBindings.elements.forEach(element => {
              imports.add(element.name.text);
            });
          }
        }
      }
    });

    const visit = (node: ts.Node) => {
      if (ts.isIdentifier(node)) {
        usages.add(node.text);
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    imports.forEach(importName => {
      if (!usages.has(importName)) {
        const importDeclaration = sourceFile.statements.find(stmt => 
          ts.isImportDeclaration(stmt) && stmt.getText().includes(importName)
        );
        
        if (importDeclaration) {
          const position = sourceFile.getLineAndCharacterOfPosition(importDeclaration.getStart());
          issues.push({
            type: IssueType.REFACTORING,
            severity: IssueSeverity.INFO,
            message: `Unused import: ${importName}`,
            line: position.line + 1,
            column: position.character + 1,
            suggestion: 'Remove unused import to reduce bundle size'
          });
        }
      }
    });

    return issues;
  }

  private findInlineStyles(sourceFile: ts.SourceFile): Issue[] {
    const issues: Issue[] = [];

    const visit = (node: ts.Node) => {
      if (ts.isJsxAttribute(node) && 
          ts.isIdentifier(node.name) && 
          node.name.text === 'style' &&
          node.initializer &&
          ts.isJsxExpression(node.initializer)) {
        
        const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        issues.push({
          type: IssueType.REFACTORING,
          severity: IssueSeverity.INFO,
          message: 'Inline styles detected',
          line: position.line + 1,
          column: position.character + 1,
          suggestion: 'Consider moving to CSS classes or styled-components'
        });
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return issues;
  }

  private findLongParameterLists(sourceFile: ts.SourceFile): Issue[] {
    const issues: Issue[] = [];

    const visit = (node: ts.Node) => {
      if ((ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node)) &&
          node.parameters.length > 5) {
        
        const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        issues.push({
          type: IssueType.REFACTORING,
          severity: IssueSeverity.WARNING,
          message: `Function has too many parameters (${node.parameters.length})`,
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

  private findDeepNesting(sourceFile: ts.SourceFile): Issue[] {
    const issues: Issue[] = [];

    const checkNesting = (node: ts.Node, depth: number = 0) => {
      if (depth > 4 && (ts.isIfStatement(node) || ts.isForStatement(node) || ts.isWhileStatement(node))) {
        const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        issues.push({
          type: IssueType.REFACTORING,
          severity: IssueSeverity.WARNING,
          message: `Deep nesting detected (depth: ${depth})`,
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

  private findMagicNumbers(sourceFile: ts.SourceFile): Issue[] {
    const issues: Issue[] = [];
    const allowedNumbers = new Set([0, 1, -1, 2, 10, 100, 1000]);

    const visit = (node: ts.Node) => {
      if (ts.isNumericLiteral(node)) {
        const value = parseFloat(node.text);
        if (!allowedNumbers.has(value) && Math.abs(value) > 1) {
          const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          issues.push({
            type: IssueType.REFACTORING,
            severity: IssueSeverity.INFO,
            message: `Magic number detected: ${node.text}`,
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
}