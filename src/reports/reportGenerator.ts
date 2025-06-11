import { resolve, join } from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { ProjectAnalysis, AnalysisResult, Issue, IssueType, IssueSeverity } from '../types.js';

export class ReportGenerator {
  private projectPath: string;
  private reportsPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
    this.reportsPath = join(projectPath, 'react-issue-finder-reports');
    this.ensureReportsDirectory();
  }

  private ensureReportsDirectory(): void {
    if (!existsSync(this.reportsPath)) {
      mkdirSync(this.reportsPath, { recursive: true });
    }
  }

  getReportsPath(): string {
    return this.reportsPath;
  }

  async generateReport(analysis: ProjectAnalysis, format: 'json' | 'html' | 'markdown'): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `react-issues-${timestamp}.${format}`;
    const filePath = join(this.reportsPath, filename);

    switch (format) {
      case 'json':
        this.generateJsonReport(analysis, filePath);
        break;
      case 'html':
        this.generateHtmlReport(analysis, filePath);
        break;
      case 'markdown':
        this.generateMarkdownReport(analysis, filePath);
        break;
    }

    return filePath;
  }

  private generateJsonReport(analysis: ProjectAnalysis, filePath: string): void {
    const reportData = {
      ...analysis,
      generatedAt: new Date().toISOString(),
      projectPath: this.projectPath
    };

    writeFileSync(filePath, JSON.stringify(reportData, null, 2), 'utf-8');
  }

  private generateHtmlReport(analysis: ProjectAnalysis, filePath: string): void {
    const template = this.getHtmlTemplate();
    const html = template
      .replace('{{TITLE}}', 'React Issue Finder Report')
      .replace('{{PROJECT_PATH}}', this.projectPath)
      .replace('{{GENERATED_AT}}', new Date().toLocaleString())
      .replace('{{SUMMARY_DATA}}', this.generateSummaryHtml(analysis))
      .replace('{{ISSUES_DATA}}', this.generateIssuesHtml(analysis.results))
      .replace('{{CHART_DATA}}', this.generateChartData(analysis))
      .replace('{{ANALYSIS_METADATA}}', this.generateMetadataHtml(analysis));

    writeFileSync(filePath, html, 'utf-8');
  }

  private generateMarkdownReport(analysis: ProjectAnalysis, filePath: string): void {
    const markdown = this.generateMarkdownContent(analysis);
    writeFileSync(filePath, markdown, 'utf-8');
  }

  private generateSummaryHtml(analysis: ProjectAnalysis): string {
    const { summary } = analysis;
    return `
      <div class="summary-grid">
        <div class="summary-card error">
          <h3>Type Errors</h3>
          <div class="count">${summary.typeErrors}</div>
        </div>
        <div class="summary-card warning">
          <h3>JS → TS</h3>
          <div class="count">${summary.jsFiles}</div>
        </div>
        <div class="summary-card info">
          <h3>Refactoring</h3>
          <div class="count">${summary.refactoringOpportunities}</div>
        </div>
        <div class="summary-card error">
          <h3>Security</h3>
          <div class="count">${summary.securityIssues}</div>
        </div>
        <div class="summary-card warning">
          <h3>Performance</h3>
          <div class="count">${summary.performanceIssues}</div>
        </div>
      </div>
    `;
  }

  private generateIssuesHtml(results: AnalysisResult[]): string {
    const groupedIssues = this.groupIssuesByType(results);
    
    let html = '';
    
    Object.entries(groupedIssues).forEach(([issueType, issues]) => {
      html += `
        <div class="issue-section">
          <h2 class="issue-type-header">${this.getIssueTypeDisplayName(issueType as IssueType)}</h2>
          <div class="issues-container">
      `;
      
      issues.forEach(({ file, issue }) => {
        const severityClass = issue.severity.toLowerCase();
        const location = issue.line ? `Line ${issue.line}${issue.column ? `:${issue.column}` : ''}` : 'Unknown location';
        
        html += `
          <div class="issue-card ${severityClass}">
            <div class="issue-header">
              <span class="file-path">${file}</span>
              <span class="issue-location">${location}</span>
              <span class="severity-badge ${severityClass}">${issue.severity}</span>
            </div>
            <div class="issue-message">${this.escapeHtml(issue.message)}</div>
            ${issue.suggestion ? `<div class="issue-suggestion">💡 ${this.escapeHtml(issue.suggestion)}</div>` : ''}
            ${issue.rule ? `<div class="issue-rule">Rule: ${issue.rule}</div>` : ''}
          </div>
        `;
      });
      
      html += `
          </div>
        </div>
      `;
    });
    
    return html;
  }

  private generateChartData(analysis: ProjectAnalysis): string {
    const { summary } = analysis;
    const data = [
      { label: 'Type Errors', value: summary.typeErrors, color: '#dc3545' },
      { label: 'JS → TS', value: summary.jsFiles, color: '#007bff' },
      { label: 'Refactoring', value: summary.refactoringOpportunities, color: '#6f42c1' },
      { label: 'Security', value: summary.securityIssues, color: '#dc3545' },
      { label: 'Performance', value: summary.performanceIssues, color: '#ffc107' }
    ].filter(item => item.value > 0);

    return JSON.stringify(data);
  }

  private generateMetadataHtml(analysis: ProjectAnalysis): string {
    const metadata = analysis.metadata;
    const analysisTime = analysis.analysisTime ? `${(analysis.analysisTime / 1000).toFixed(2)}s` : 'Unknown';
    
    return `
      <div class="metadata-grid">
        <div class="metadata-item">
          <strong>Total Files:</strong> ${analysis.totalFiles}
        </div>
        <div class="metadata-item">
          <strong>Analyzed Files:</strong> ${analysis.analyzedFiles}
        </div>
        <div class="metadata-item">
          <strong>Analysis Time:</strong> ${analysisTime}
        </div>
        ${metadata ? `
          <div class="metadata-item">
            <strong>Batch Size:</strong> ${metadata.batchSize}
          </div>
          <div class="metadata-item">
            <strong>Workers:</strong> ${metadata.workerCount}
          </div>
          <div class="metadata-item">
            <strong>Version:</strong> ${metadata.version}
          </div>
        ` : ''}
      </div>
    `;
  }

  private generateMarkdownContent(analysis: ProjectAnalysis): string {
    const { summary } = analysis;
    const totalIssues = Object.values(summary).reduce((sum, count) => sum + count, 0);
    
    let markdown = `# React Issue Finder Report

**Project:** ${this.projectPath}  
**Generated:** ${new Date().toLocaleString()}  
**Total Issues Found:** ${totalIssues}

## Summary

| Issue Type | Count |
|------------|-------|
| Type Errors | ${summary.typeErrors} |
| JS → TS Migration | ${summary.jsFiles} |
| Refactoring Opportunities | ${summary.refactoringOpportunities} |
| Security Issues | ${summary.securityIssues} |
| Performance Issues | ${summary.performanceIssues} |

## Analysis Details

- **Total Files Found:** ${analysis.totalFiles}
- **Files Analyzed:** ${analysis.analyzedFiles}
- **Analysis Time:** ${analysis.analysisTime ? `${(analysis.analysisTime / 1000).toFixed(2)}s` : 'Unknown'}

`;

    // Add detailed issues by type
    const groupedIssues = this.groupIssuesByType(analysis.results);
    
    Object.entries(groupedIssues).forEach(([issueType, issues]) => {
      markdown += `\n## ${this.getIssueTypeDisplayName(issueType as IssueType)}\n\n`;
      
      issues.forEach(({ file, issue }, index) => {
        const location = issue.line ? ` (Line ${issue.line}${issue.column ? `:${issue.column}` : ''})` : '';
        markdown += `### ${index + 1}. ${file}${location}\n\n`;
        markdown += `**Severity:** ${issue.severity}  \n`;
        markdown += `**Message:** ${issue.message}  \n`;
        
        if (issue.suggestion) {
          markdown += `**Suggestion:** ${issue.suggestion}  \n`;
        }
        
        if (issue.rule) {
          markdown += `**Rule:** ${issue.rule}  \n`;
        }
        
        markdown += '\n---\n\n';
      });
    });

    return markdown;
  }

  private groupIssuesByType(results: AnalysisResult[]): Record<string, Array<{ file: string; issue: Issue }>> {
    const grouped: Record<string, Array<{ file: string; issue: Issue }>> = {};
    
    results.forEach(result => {
      result.issues.forEach(issue => {
        if (!grouped[issue.type]) {
          grouped[issue.type] = [];
        }
        grouped[issue.type].push({ file: result.file, issue });
      });
    });
    
    return grouped;
  }

  private getIssueTypeDisplayName(issueType: IssueType): string {
    switch (issueType) {
      case IssueType.TYPE_ERROR:
        return 'Type Errors';
      case IssueType.JS_TO_TS:
        return 'JavaScript to TypeScript Migration';
      case IssueType.REFACTORING:
        return 'Refactoring Opportunities';
      case IssueType.SECURITY:
        return 'Security Issues';
      case IssueType.PERFORMANCE:
        return 'Performance Issues';
      default:
        return issueType;
    }
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private getHtmlTemplate(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{TITLE}}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 20px;
            background: #f8f9fa;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        .header h1 {
            margin: 0 0 10px 0;
            font-size: 2em;
        }
        .header p {
            margin: 0;
            opacity: 0.9;
        }
        .content {
            padding: 30px;
        }
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 40px;
        }
        .summary-card {
            padding: 20px;
            border-radius: 8px;
            text-align: center;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }
        .summary-card.error {
            background: linear-gradient(135deg, #ff6b6b, #ee5a52);
            color: white;
        }
        .summary-card.warning {
            background: linear-gradient(135deg, #feca57, #ff9ff3);
            color: white;
        }
        .summary-card.info {
            background: linear-gradient(135deg, #48dbfb, #0abde3);
            color: white;
        }
        .summary-card h3 {
            margin: 0 0 10px 0;
            font-size: 1em;
            font-weight: 600;
        }
        .summary-card .count {
            font-size: 2.5em;
            font-weight: bold;
            margin: 0;
        }
        .issue-section {
            margin-bottom: 40px;
        }
        .issue-type-header {
            color: #333;
            border-bottom: 3px solid #667eea;
            padding-bottom: 10px;
            margin-bottom: 20px;
        }
        .issues-container {
            display: grid;
            gap: 15px;
        }
        .issue-card {
            border: 1px solid #e1e8ed;
            border-radius: 8px;
            padding: 20px;
            background: white;
            transition: box-shadow 0.2s;
        }
        .issue-card:hover {
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        .issue-card.error {
            border-left: 4px solid #dc3545;
        }
        .issue-card.warning {
            border-left: 4px solid #ffc107;
        }
        .issue-card.info {
            border-left: 4px solid #17a2b8;
        }
        .issue-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
            flex-wrap: wrap;
            gap: 10px;
        }
        .file-path {
            font-family: monospace;
            background: #f8f9fa;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 0.9em;
            flex: 1;
            min-width: 200px;
        }
        .issue-location {
            color: #6c757d;
            font-size: 0.9em;
        }
        .severity-badge {
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.8em;
            font-weight: 600;
            text-transform: uppercase;
        }
        .severity-badge.error {
            background: #dc3545;
            color: white;
        }
        .severity-badge.warning {
            background: #ffc107;
            color: #212529;
        }
        .severity-badge.info {
            background: #17a2b8;
            color: white;
        }
        .issue-message {
            font-size: 1.1em;
            margin-bottom: 10px;
            color: #333;
        }
        .issue-suggestion {
            background: #e8f5e8;
            border: 1px solid #c3e6c3;
            border-radius: 4px;
            padding: 10px;
            margin-bottom: 10px;
            font-size: 0.95em;
        }
        .issue-rule {
            color: #6c757d;
            font-size: 0.9em;
            font-style: italic;
        }
        .metadata-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            margin-top: 30px;
        }
        .metadata-item {
            padding: 10px;
            background: white;
            border-radius: 4px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        @media (max-width: 768px) {
            .container {
                margin: 10px;
                border-radius: 0;
            }
            .content {
                padding: 20px;
            }
            .issue-header {
                flex-direction: column;
                align-items: flex-start;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>{{TITLE}}</h1>
            <p>Project: {{PROJECT_PATH}}</p>
            <p>Generated: {{GENERATED_AT}}</p>
        </div>
        <div class="content">
            {{SUMMARY_DATA}}
            {{ISSUES_DATA}}
            {{ANALYSIS_METADATA}}
        </div>
    </div>
</body>
</html>`;
  }
}