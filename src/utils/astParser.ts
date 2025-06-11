import * as ts from 'typescript';
import { parse } from '@typescript-eslint/typescript-estree';
import { FileUtils } from './fileUtils.js';

export class ASTParser {
  private program: ts.Program | null = null;
  private checker: ts.TypeChecker | null = null;

  constructor(private projectPath: string) {}

  getProjectPath(): string {
    return this.projectPath;
  }

  async initializeProgram(files: string[]): Promise<void> {
    const compilerOptions: ts.CompilerOptions = {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.React,
      allowJs: true,
      checkJs: false,
      declaration: false,
      outDir: undefined,
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      moduleResolution: ts.ModuleResolutionKind.NodeJs
    };

    this.program = ts.createProgram(files, compilerOptions);
    this.checker = this.program.getTypeChecker();
  }

  parseFile(filePath: string): ts.SourceFile | null {
    if (!this.program) {
      throw new Error('Program not initialized. Call initializeProgram first.');
    }

    const sourceFile = this.program.getSourceFile(filePath);
    if (!sourceFile) {
      const content = FileUtils.readFileContent(filePath);
      return ts.createSourceFile(
        filePath,
        content,
        ts.ScriptTarget.ES2020,
        true,
        FileUtils.isTypeScriptFile(filePath) ? ts.ScriptKind.TS : ts.ScriptKind.JS
      );
    }

    return sourceFile;
  }

  parseWithESTree(filePath: string) {
    const content = FileUtils.readFileContent(filePath);
    const isTypeScript = FileUtils.isTypeScriptFile(filePath);
    
    try {
      return parse(content, {
        loc: true,
        range: true,
        tokens: true,
        comments: true,
        jsx: true,
        useJSXTextNode: true,
        ecmaVersion: 2020,
        sourceType: 'module',
        project: isTypeScript ? './tsconfig.json' : undefined
      });
    } catch (error) {
      console.warn(`Failed to parse ${filePath}:`, error);
      return null;
    }
  }

  getTypeChecker(): ts.TypeChecker | null {
    return this.checker;
  }

  getProgram(): ts.Program | null {
    return this.program;
  }

  getDiagnostics(sourceFile: ts.SourceFile): ts.Diagnostic[] {
    if (!this.program) {
      return [];
    }

    const syntacticDiagnostics = this.program.getSyntacticDiagnostics(sourceFile);
    const semanticDiagnostics = this.program.getSemanticDiagnostics(sourceFile);
    
    return [...syntacticDiagnostics, ...semanticDiagnostics];
  }

  findReactComponents(sourceFile: ts.SourceFile): ts.Node[] {
    const components: ts.Node[] = [];

    function visit(node: ts.Node) {
      if (ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) {
        const text = node.getFullText();
        if (text.includes('return') && (text.includes('<') || text.includes('jsx'))) {
          components.push(node);
        }
      }
      
      if (ts.isClassDeclaration(node)) {
        const heritage = node.heritageClauses;
        if (heritage?.some(clause => 
          clause.types.some(type => 
            type.expression.getText().includes('Component') ||
            type.expression.getText().includes('PureComponent')
          )
        )) {
          components.push(node);
        }
      }

      if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
        const text = node.getFullText();
        if (text.includes('<') && text.includes('>')) {
          components.push(node);
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return components;
  }
}