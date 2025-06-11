import { readFileSync, statSync } from 'fs';
import { glob } from 'glob';
import { join, extname, basename } from 'path';
import { FileInfo } from '../types.js';

export class FileUtils {
  static async findReactFiles(projectPath: string): Promise<string[]> {
    const patterns = [
      '**/*.{js,jsx,ts,tsx}',
      '!node_modules/**',
      '!**/node_modules/**',
      '!dist/**',
      '!build/**',
      '!out/**',
      '!.next/**',
      '!coverage/**',
      '!.nyc_output/**',
      '!vendor/**',
      '!lib/**',
      '!libs/**',
      '!public/**',
      '!assets/**',
      '!static/**',
      '!*.config.{js,ts}',
      '!*.test.{js,ts,jsx,tsx}',
      '!*.spec.{js,ts,jsx,tsx}',
      '!**/*.test.{js,ts,jsx,tsx}',
      '!**/*.spec.{js,ts,jsx,tsx}',
      '!**/__tests__/**',
      '!**/__mocks__/**',
      '!**/cypress/**',
      '!**/e2e/**',
      '!**/.git/**',
      '!**/.vscode/**',
      '!**/.idea/**'
    ];

    const files = await glob(patterns, {
      cwd: projectPath,
      absolute: true
    });

    return files.filter(file => this.isLikelyReactFile(file));
  }

  static isLikelyReactFile(filePath: string): boolean {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const reactPatterns = [
        /import\s+.*\s+from\s+['"]react['"]/,
        /import\s+React/,
        /from\s+['"]react['"]/,
        /<[A-Z][a-zA-Z0-9]*[^>]*>/,
        /jsx|tsx/i.test(extname(filePath)),
        /\.component\./i.test(basename(filePath)),
        /components?\//i.test(filePath)
      ];

      return reactPatterns.some(pattern => 
        typeof pattern === 'object' ? pattern.test(content) : pattern
      );
    } catch {
      return false;
    }
  }

  static getFileInfo(filePath: string): FileInfo {
    const stats = statSync(filePath);
    const ext = extname(filePath);
    
    return {
      path: filePath,
      extension: ext,
      isReactComponent: this.isLikelyReactFile(filePath),
      hasTypes: ext === '.ts' || ext === '.tsx',
      size: stats.size
    };
  }

  static readFileContent(filePath: string): string {
    try {
      return readFileSync(filePath, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to read file ${filePath}: ${error}`);
    }
  }

  static isJavaScriptFile(filePath: string): boolean {
    const ext = extname(filePath);
    return ext === '.js' || ext === '.jsx';
  }

  static isTypeScriptFile(filePath: string): boolean {
    const ext = extname(filePath);
    return ext === '.ts' || ext === '.tsx';
  }
}