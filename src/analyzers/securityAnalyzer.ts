import * as ts from 'typescript';
import { ASTParser } from '../utils/astParser.js';
import { FileUtils } from '../utils/fileUtils.js';
import { AnalysisResult, Issue, IssueType, IssueSeverity } from '../types.js';

export class SecurityAnalyzer {
  constructor(private parser: ASTParser) {}

  async analyzeFile(filePath: string): Promise<AnalysisResult> {
    const issues: Issue[] = [];

    try {
      const sourceFile = this.parser.parseFile(filePath);
      if (!sourceFile) {
        return { file: filePath, issues: [] };
      }

      issues.push(...this.findXSSVulnerabilities(sourceFile));
      issues.push(...this.findDangerousHTMLUsage(sourceFile));
      issues.push(...this.findInsecureRandomUsage(sourceFile));
      issues.push(...this.findHardcodedSecrets(sourceFile));
      issues.push(...this.findUnsafeEvals(sourceFile));
      issues.push(...this.findInsecureURLs(sourceFile));
      issues.push(...this.findWeakCryptography(sourceFile));
      issues.push(...this.findSQLInjectionRisks(sourceFile));

    } catch (error) {
      issues.push({
        type: IssueType.SECURITY,
        severity: IssueSeverity.ERROR,
        message: `Failed to analyze security issues: ${error}`
      });
    }

    return { file: filePath, issues };
  }

  private findXSSVulnerabilities(sourceFile: ts.SourceFile): Issue[] {
    const issues: Issue[] = [];

    const visit = (node: ts.Node) => {
      if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name)) {
        const attrName = node.name.text;
        
        if (attrName === 'dangerouslySetInnerHTML') {
          const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          issues.push({
            type: IssueType.SECURITY,
            severity: IssueSeverity.ERROR,
            message: 'dangerouslySetInnerHTML usage detected - XSS risk',
            line: position.line + 1,
            column: position.character + 1,
            suggestion: 'Sanitize HTML content or use safe alternatives'
          });
        }

        if ((attrName === 'href' || attrName === 'src') && 
            node.initializer && 
            ts.isJsxExpression(node.initializer) &&
            node.initializer.expression) {
          
          const expr = node.initializer.expression;
          if (ts.isTemplateExpression(expr) || 
              (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.PlusToken)) {
            
            const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
            issues.push({
              type: IssueType.SECURITY,
              severity: IssueSeverity.WARNING,
              message: `Dynamic ${attrName} attribute - potential XSS risk`,
              line: position.line + 1,
              column: position.character + 1,
              suggestion: 'Validate and sanitize dynamic URLs'
            });
          }
        }
      }

      if (ts.isCallExpression(node) && 
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === 'innerHTML') {
        
        const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        issues.push({
          type: IssueType.SECURITY,
          severity: IssueSeverity.ERROR,
          message: 'innerHTML assignment detected - XSS risk',
          line: position.line + 1,
          column: position.character + 1,
          suggestion: 'Use textContent or sanitize HTML content'
        });
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return issues;
  }

  private findDangerousHTMLUsage(sourceFile: ts.SourceFile): Issue[] {
    const issues: Issue[] = [];
    const dangerousFunctions = ['document.write', 'document.writeln', 'execScript'];

    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node)) {
        const callText = node.expression.getText();
        
        if (dangerousFunctions.some(func => callText.includes(func))) {
          const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          issues.push({
            type: IssueType.SECURITY,
            severity: IssueSeverity.ERROR,
            message: `Dangerous function usage: ${callText}`,
            line: position.line + 1,
            column: position.character + 1,
            suggestion: 'Use safer DOM manipulation methods'
          });
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return issues;
  }

  private findInsecureRandomUsage(sourceFile: ts.SourceFile): Issue[] {
    const issues: Issue[] = [];

    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && 
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.expression.getText() === 'Math' &&
          node.expression.name.text === 'random') {
        
        // Only flag if it's in a security-sensitive context
        if (this.isInSecurityContext(node)) {
          const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          issues.push({
            type: IssueType.SECURITY,
            severity: IssueSeverity.WARNING,
            message: 'Math.random() used in security-sensitive context',
            line: position.line + 1,
            column: position.character + 1,
            suggestion: 'Use crypto.getRandomValues() for security-sensitive operations'
          });
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return issues;
  }

  private findHardcodedSecrets(sourceFile: ts.SourceFile): Issue[] {
    const issues: Issue[] = [];
    
    const visit = (node: ts.Node) => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        const text = node.text;
        
        // Only flag strings that look like actual secrets (long, alphanumeric patterns)
        if (this.looksLikeRealSecret(text)) {
          const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          issues.push({
            type: IssueType.SECURITY,
            severity: IssueSeverity.ERROR,
            message: 'Potential hardcoded secret detected (long alphanumeric string)',
            line: position.line + 1,
            column: position.character + 1,
            suggestion: 'Move secrets to environment variables or secure configuration'
          });
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return issues;
  }

  private findUnsafeEvals(sourceFile: ts.SourceFile): Issue[] {
    const issues: Issue[] = [];
    const unsafeFunctions = ['eval', 'Function'];

    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node)) {
        const funcName = node.expression.getText();
        
        // Only flag eval and Function constructor, not setTimeout/setInterval
        if (unsafeFunctions.includes(funcName)) {
          if (node.arguments.length > 0 && ts.isStringLiteral(node.arguments[0])) {
            const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
            issues.push({
              type: IssueType.SECURITY,
              severity: IssueSeverity.ERROR,
              message: `Unsafe ${funcName} usage with string argument`,
              line: position.line + 1,
              column: position.character + 1,
              suggestion: 'Avoid dynamic code execution or use safer alternatives'
            });
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return issues;
  }

  private findInsecureURLs(sourceFile: ts.SourceFile): Issue[] {
    const issues: Issue[] = [];

    const visit = (node: ts.Node) => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        const text = node.text;
        
        if (text.startsWith('http://') && !text.includes('localhost') && !text.includes('127.0.0.1')) {
          const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          issues.push({
            type: IssueType.SECURITY,
            severity: IssueSeverity.WARNING,
            message: 'Insecure HTTP URL detected',
            line: position.line + 1,
            column: position.character + 1,
            suggestion: 'Use HTTPS for secure communication'
          });
        }

        if (text.includes('javascript:')) {
          const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          issues.push({
            type: IssueType.SECURITY,
            severity: IssueSeverity.ERROR,
            message: 'javascript: URL scheme detected - XSS risk',
            line: position.line + 1,
            column: position.character + 1,
            suggestion: 'Use event handlers instead of javascript: URLs'
          });
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return issues;
  }

  private findWeakCryptography(sourceFile: ts.SourceFile): Issue[] {
    const issues: Issue[] = [];
    const weakAlgorithms = ['md5', 'sha1', 'des', 'rc4'];

    const visit = (node: ts.Node) => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        const text = node.text.toLowerCase();
        
        if (weakAlgorithms.some(algo => text.includes(algo))) {
          const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          issues.push({
            type: IssueType.SECURITY,
            severity: IssueSeverity.WARNING,
            message: 'Weak cryptographic algorithm detected',
            line: position.line + 1,
            column: position.character + 1,
            suggestion: 'Use stronger algorithms like SHA-256 or AES'
          });
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return issues;
  }

  private findSQLInjectionRisks(sourceFile: ts.SourceFile): Issue[] {
    const issues: Issue[] = [];

    const visit = (node: ts.Node) => {
      if (ts.isTemplateExpression(node)) {
        const text = node.getText();
        
        if (/select|insert|update|delete|drop|create/i.test(text)) {
          const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          issues.push({
            type: IssueType.SECURITY,
            severity: IssueSeverity.WARNING,
            message: 'Potential SQL injection risk in template string',
            line: position.line + 1,
            column: position.character + 1,
            suggestion: 'Use parameterized queries or ORM methods'
          });
        }
      }

      if (ts.isBinaryExpression(node) && 
          node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
        
        const text = node.getText();
        if (/select|insert|update|delete|drop|create/i.test(text)) {
          const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          issues.push({
            type: IssueType.SECURITY,
            severity: IssueSeverity.WARNING,
            message: 'Potential SQL injection risk in string concatenation',
            line: position.line + 1,
            column: position.character + 1,
            suggestion: 'Use parameterized queries instead of string concatenation'
          });
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return issues;
  }

  private looksLikeRealSecret(text: string): boolean {
    // Only flag strings that actually look like secrets
    if (text.length < 20) return false;
    
    // Pattern for API keys, tokens, etc. (long alphanumeric strings)
    const secretPattern = /^[a-zA-Z0-9_-]{20,}$/;
    
    // Additional patterns for common secret formats
    const commonSecretPatterns = [
      /^[a-f0-9]{32,}$/i, // Hex strings
      /^[A-Za-z0-9+/]{20,}={0,2}$/, // Base64
      /^sk-[a-zA-Z0-9]{32,}$/, // OpenAI API keys
      /^pk_[a-zA-Z0-9_]{20,}$/, // Stripe keys
      /^AIza[a-zA-Z0-9_-]{35}$/, // Google API keys
    ];
    
    return secretPattern.test(text) || commonSecretPatterns.some(pattern => pattern.test(text));
  }

  private isInSecurityContext(node: ts.Node): boolean {
    const text = node.getFullText();
    const securityKeywords = ['token', 'key', 'auth', 'secret', 'password', 'crypto', 'hash', 'salt'];
    
    // Look for security-related context in surrounding code
    return securityKeywords.some(keyword => text.toLowerCase().includes(keyword));
  }
}