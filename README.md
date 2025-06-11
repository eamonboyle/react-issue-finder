# React Issue Finder

A powerful CLI tool for detecting frontend issues in large React codebases. Optimized for projects with 5000+ files with efficient memory management and parallel processing.

## Features

- **Scalable Analysis**: Handles large codebases with streaming file processing and worker threads
- **Multiple Issue Types**: Type errors, JS→TS migration opportunities, refactoring suggestions, security vulnerabilities, and performance issues
- **Rich Reports**: Generate HTML, JSON, and Markdown reports with actionable insights
- **Memory Optimized**: Configurable batch processing and automatic garbage collection
- **Progress Tracking**: Real-time progress indicators and detailed analysis feedback
- **Watch Mode**: Continuous monitoring for file changes
- **Configurable**: Customizable analysis options and exclusion patterns

## Installation

### Global Installation (Recommended)

```bash
npm install -g react-issue-finder
```

### Local Installation

```bash
npm install react-issue-finder
```

## Quick Start

Analyze your React project:

```bash
react-issue-finder /path/to/your/react/project
```

The tool will:
1. Scan your project for React files
2. Analyze them in batches using worker threads
3. Generate comprehensive reports in `react-issue-finder-reports/` folder
4. Display a summary in your terminal

## Usage

### Basic Analysis

```bash
# Analyze entire project
react-issue-finder ./my-react-app

# Analyze specific issue types
react-issue-finder ./my-react-app --types security performance

# Generate only JSON reports
react-issue-finder ./my-react-app --output json

# Skip report generation (console only)
react-issue-finder ./my-react-app --no-reports
```

### Advanced Options

```bash
# Large project optimization
react-issue-finder ./my-react-app --batch-size 50 --workers 8 --max-files 5000

# Watch mode for continuous analysis
react-issue-finder ./my-react-app --watch

# Use custom configuration
react-issue-finder ./my-react-app --config ./my-config.json
```

### Available Issue Types

- `type-error` - TypeScript compilation errors and type issues
- `js-to-ts` - JavaScript files that should be migrated to TypeScript
- `refactoring` - Code quality issues and refactoring opportunities
- `security` - Security vulnerabilities and unsafe patterns
- `performance` - Performance bottlenecks and optimization opportunities

### CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `--types <types...>` | Issue types to analyze | `all` |
| `--output <format>` | Report format (json, html, markdown, all) | `all` |
| `--batch-size <size>` | Files per batch for processing | `100` |
| `--workers <count>` | Number of worker threads | `4` |
| `--max-files <count>` | Maximum files to analyze | `10000` |
| `--no-reports` | Skip generating report files | `false` |
| `--watch` | Enable watch mode | `false` |
| `--config <path>` | Configuration file path | - |

## Configuration

Generate a configuration file:

```bash
react-issue-finder config --output ./react-issue-finder.config.json
```

Example configuration:

```json
{
  "analysis": {
    "batchSize": 100,
    "workerCount": 4,
    "maxFiles": 10000,
    "excludePatterns": [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/*.test.{js,ts,jsx,tsx}",
      "**/*.spec.{js,ts,jsx,tsx}"
    ]
  },
  "issueTypes": {
    "type-error": { "enabled": true, "severity": "error" },
    "js-to-ts": { "enabled": true, "severity": "warning" },
    "refactoring": { "enabled": true, "severity": "info" },
    "security": { "enabled": true, "severity": "error" },
    "performance": { "enabled": true, "severity": "warning" }
  },
  "reports": {
    "outputFormats": ["html", "json"],
    "includeSourceCode": false,
    "groupBy": "severity"
  }
}
```

## System Requirements

Check if your system is ready:

```bash
react-issue-finder doctor ./my-react-app
```

**Requirements:**
- Node.js 18.0.0 or higher
- Minimum 4GB RAM (8GB+ recommended for large projects)
- TypeScript project with `tsconfig.json` (recommended)

## Performance Optimization

### For Large Codebases (5000+ files)

```bash
# Optimize for memory usage
react-issue-finder ./large-project --batch-size 50 --workers 6 --max-files 5000

# Use configuration file for complex setups
react-issue-finder ./large-project --config ./large-project.config.json
```

### Memory Management

The tool automatically:
- Processes files in configurable batches
- Uses worker threads for parallel processing
- Performs garbage collection between batches
- Monitors memory usage with warnings

### Exclusion Patterns

By default, the tool excludes:
- `node_modules`
- Build directories (`dist`, `build`, `out`, `.next`)
- Test files
- Configuration files
- Asset directories

## Reports

Reports are generated in `{project-path}/react-issue-finder-reports/`:

### HTML Report
- Interactive dashboard with charts
- Issue categorization and filtering
- File-by-file breakdown
- Actionable recommendations

### JSON Report
- Machine-readable format
- Full analysis data
- Integration-friendly structure

### Markdown Report
- Human-readable format
- Great for documentation
- Perfect for sharing with teams

## Issue Types Detected

### Type Errors
- TypeScript compilation errors
- Missing type annotations
- JSX prop type issues
- React hook type problems

### JS to TS Migration
- JavaScript components ready for TypeScript
- Migration complexity scoring
- Type annotation suggestions

### Refactoring Opportunities
- Large components that should be broken down
- Complex functions with high cyclomatic complexity
- Duplicate code blocks
- Unused imports and variables

### Security Issues
- XSS vulnerabilities (dangerouslySetInnerHTML)
- Hardcoded secrets and API keys
- Unsafe eval() usage
- Dynamic URL construction

### Performance Issues
- Unnecessary re-renders from inline functions
- Missing memoization opportunities
- Ineffective useEffect dependencies
- Memory leaks from timers and listeners

## Examples

### CI/CD Integration

```yaml
# GitHub Actions
- name: Run React Issue Analysis
  run: |
    npx react-issue-finder ./src --output json --no-reports
    # Parse JSON output for build decisions
```

### Team Workflow

```bash
# Daily analysis
react-issue-finder ./src --types security type-error --output html

# Before release
react-issue-finder ./src --types performance security --output all
```

## Development

```bash
# Clone and setup
git clone <repository>
npm install
npm run build

# Run locally
npm start -- ./path/to/test/project

# Run tests
npm test
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

- 📖 [Documentation](./docs)
- 🐛 [Report Issues](https://github.com/your-repo/issues)
- 💬 [Discussions](https://github.com/your-repo/discussions)