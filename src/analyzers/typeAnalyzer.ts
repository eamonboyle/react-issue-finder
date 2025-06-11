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

    // Only analyze if this is a TypeScript file - JS files are handled by JSToTSAnalyzer
    if (!FileUtils.isTypeScriptFile(sourceFile.fileName)) {
      return issues;
    }

    const visit = (node: ts.Node) => {
      // Only check complex JSX props, not simple ones
      if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
        issues.push(...this.checkCriticalJSXProps(node, checker));
      }

      // Only check components that explicitly seem to need types
      if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node)) {
        issues.push(...this.checkCriticalComponentProps(node, checker));
      }

      // Only check problematic hook usage
      if (ts.isCallExpression(node)) {
        issues.push(...this.checkProblematicHookUsage(node, checker));
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return issues;
  }

  private checkCriticalJSXProps(node: ts.JsxElement | ts.JsxSelfClosingElement, checker: ts.TypeChecker): Issue[] {
    const issues: Issue[] = [];
    
    const attributes = ts.isJsxElement(node) 
      ? node.openingElement.attributes 
      : node.attributes;

    // Only check function props or complex expressions, not simple props
    attributes.properties.forEach(prop => {
      if (ts.isJsxAttribute(prop) && prop.initializer) {
        if (ts.isJsxExpression(prop.initializer) && prop.initializer.expression) {
          const propName = prop.name?.getText() || '';
          
          // Only check function props or props with complex expressions
          if (propName.startsWith('on') || ts.isFunctionExpression(prop.initializer.expression) || ts.isArrowFunction(prop.initializer.expression)) {
            const type = checker.getTypeAtLocation(prop.initializer.expression);
            
            if (type.flags & ts.TypeFlags.Any) {
              const sourceFile = node.getSourceFile();
              const position = sourceFile.getLineAndCharacterOfPosition(prop.getStart());
              
              issues.push({
                type: IssueType.TYPE_ERROR,
                severity: IssueSeverity.WARNING,
                message: `Function prop '${propName}' has 'any' type`,
                line: position.line + 1,
                column: position.character + 1,
                suggestion: 'Consider adding explicit function type annotation'
              });
            }
          }
        }
      }
    });

    return issues;
  }

  private checkCriticalComponentProps(node: ts.FunctionDeclaration | ts.ArrowFunction, checker: ts.TypeChecker): Issue[] {
    const issues: Issue[] = [];
    
    // Only check if this looks like a substantial React component
    const isReactComponent = this.isSubstantialReactComponent(node);
    
    if (isReactComponent && node.parameters.length > 0) {
      const propsParam = node.parameters[0];
      
      if (!propsParam.type && this.hasComplexPropsUsage(node)) {
        const sourceFile = node.getSourceFile();
        const position = sourceFile.getLineAndCharacterOfPosition(propsParam.getStart());
        
        issues.push({
          type: IssueType.TYPE_ERROR,
          severity: IssueSeverity.WARNING,
          message: 'Complex React component props parameter lacks type annotation',
          line: position.line + 1,
          column: position.character + 1,
          suggestion: 'Add Props interface: function Component(props: ComponentProps)'
        });
      }
    }

    return issues;
  }

  private checkProblematicHookUsage(node: ts.CallExpression, checker: ts.TypeChecker): Issue[] {
    const issues: Issue[] = [];
    
    if (ts.isIdentifier(node.expression)) {
      const hookName = node.expression.text;
      
      // Only check useState with complex initial values
      if (hookName === 'useState' && node.arguments.length > 0) {
        const initialValue = node.arguments[0];
        
        // Only flag complex objects or arrays without types
        if (ts.isObjectLiteralExpression(initialValue) || ts.isArrayLiteralExpression(initialValue)) {
          const type = checker.getTypeAtLocation(initialValue);
          
          if (type.flags & ts.TypeFlags.Any) {
            const sourceFile = node.getSourceFile();
            const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
            
            issues.push({
              type: IssueType.TYPE_ERROR,
              severity: IssueSeverity.INFO,
              message: 'useState with complex initial value lacks explicit type',
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

  private isSubstantialReactComponent(node: ts.FunctionDeclaration | ts.ArrowFunction): boolean {
    const text = node.getFullText();
    const hasJSX = text.includes('<') && text.includes('>');
    const hasReturn = text.includes('return');
    const isLargeEnough = text.length > 200; // Only check substantial components
    
    return hasJSX && hasReturn && isLargeEnough;
  }

  private hasComplexPropsUsage(node: ts.FunctionDeclaration | ts.ArrowFunction): boolean {
    const text = node.getFullText();
    // Look for destructuring or multiple prop accesses
    return text.includes('props.') || text.includes('props?.') || text.includes('...props') || 
           (text.match(/props/g) || []).length > 3;
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