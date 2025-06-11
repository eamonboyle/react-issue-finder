import * as ts from 'typescript';
import { ASTParser } from '../utils/astParser.js';
import { FileUtils } from '../utils/fileUtils.js';
import { AnalysisResult, Issue, IssueType, IssueSeverity } from '../types.js';

export class TypeAnalyzer {
  constructor(private parser: ASTParser) {}

  async analyzeFile(filePath: string): Promise<AnalysisResult> {
    const issues: Issue[] = [];
    
    try {
      const sourceFile = this.parser.parseFile(filePath);
      if (!sourceFile) {
        return { file: filePath, issues: [] };
      }

      const diagnostics = this.parser.getDiagnostics(sourceFile);
      
      for (const diagnostic of diagnostics) {
        if (diagnostic.file && diagnostic.start !== undefined) {
          const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
          
          issues.push({
            type: IssueType.TYPE_ERROR,
            severity: this.mapDiagnosticSeverity(diagnostic.category),
            message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
            line: position.line + 1,
            column: position.character + 1,
            rule: `TS${diagnostic.code}`
          });
        }
      }

      const additionalIssues = this.analyzeReactSpecificTypes(sourceFile);
      issues.push(...additionalIssues);

    } catch (error) {
      issues.push({
        type: IssueType.TYPE_ERROR,
        severity: IssueSeverity.ERROR,
        message: `Failed to analyze file: ${error}`
      });
    }

    return { file: filePath, issues };
  }

  private analyzeReactSpecificTypes(sourceFile: ts.SourceFile): Issue[] {
    const issues: Issue[] = [];
    const checker = this.parser.getTypeChecker();
    
    if (!checker) return issues;

    const visit = (node: ts.Node) => {
      if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
        issues.push(...this.checkJSXProps(node, checker));
      }

      if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node)) {
        issues.push(...this.checkReactComponentProps(node, checker));
      }

      if (ts.isCallExpression(node)) {
        issues.push(...this.checkHookUsage(node, checker));
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return issues;
  }

  private checkJSXProps(node: ts.JsxElement | ts.JsxSelfClosingElement, checker: ts.TypeChecker): Issue[] {
    const issues: Issue[] = [];
    
    const attributes = ts.isJsxElement(node) 
      ? node.openingElement.attributes 
      : node.attributes;

    attributes.properties.forEach(prop => {
      if (ts.isJsxAttribute(prop) && prop.initializer) {
        if (ts.isJsxExpression(prop.initializer) && prop.initializer.expression) {
          const type = checker.getTypeAtLocation(prop.initializer.expression);
          
          if (type.flags & ts.TypeFlags.Any) {
            const sourceFile = node.getSourceFile();
            const position = sourceFile.getLineAndCharacterOfPosition(prop.getStart());
            
            issues.push({
              type: IssueType.TYPE_ERROR,
              severity: IssueSeverity.WARNING,
              message: `JSX prop '${prop.name?.getText()}' has 'any' type`,
              line: position.line + 1,
              column: position.character + 1,
              suggestion: 'Consider adding explicit type annotation'
            });
          }
        }
      }
    });

    return issues;
  }

  private checkReactComponentProps(node: ts.FunctionDeclaration | ts.ArrowFunction, checker: ts.TypeChecker): Issue[] {
    const issues: Issue[] = [];
    
    if (node.parameters.length > 0) {
      const propsParam = node.parameters[0];
      
      if (!propsParam.type) {
        const sourceFile = node.getSourceFile();
        const position = sourceFile.getLineAndCharacterOfPosition(propsParam.getStart());
        
        issues.push({
          type: IssueType.TYPE_ERROR,
          severity: IssueSeverity.WARNING,
          message: 'React component props parameter lacks type annotation',
          line: position.line + 1,
          column: position.character + 1,
          suggestion: 'Add Props interface: function Component(props: ComponentProps)'
        });
      }
    }

    return issues;
  }

  private checkHookUsage(node: ts.CallExpression, checker: ts.TypeChecker): Issue[] {
    const issues: Issue[] = [];
    
    if (ts.isIdentifier(node.expression)) {
      const hookName = node.expression.text;
      
      if (hookName.startsWith('use') && hookName !== 'use') {
        if (hookName === 'useState' && node.arguments.length > 0) {
          const initialValue = node.arguments[0];
          const type = checker.getTypeAtLocation(initialValue);
          
          if (type.flags & ts.TypeFlags.Any) {
            const sourceFile = node.getSourceFile();
            const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
            
            issues.push({
              type: IssueType.TYPE_ERROR,
              severity: IssueSeverity.INFO,
              message: 'useState initial value has implicit any type',
              line: position.line + 1,
              column: position.character + 1,
              suggestion: 'Consider adding explicit type: useState<YourType>(initialValue)'
            });
          }
        }
      }
    }

    return issues;
  }

  private mapDiagnosticSeverity(category: ts.DiagnosticCategory): IssueSeverity {
    switch (category) {
      case ts.DiagnosticCategory.Error:
        return IssueSeverity.ERROR;
      case ts.DiagnosticCategory.Warning:
        return IssueSeverity.WARNING;
      case ts.DiagnosticCategory.Suggestion:
      case ts.DiagnosticCategory.Message:
        return IssueSeverity.INFO;
      default:
        return IssueSeverity.INFO;
    }
  }
}