# pr-auto-ready

Automatically marks GitHub PRs as ready for review when all checks pass.

## Quick Start

```bash
# Auto-detect PR and repo
npx pr-auto-ready

# Specify PR number
npx pr-auto-ready 123

# Specify PR and repo
npx pr-auto-ready 123 syumai/example

# Deno
deno run --allow-run=gh npm:pr-auto-ready

# Bun
bunx pr-auto-ready
```

**Requirements:** [GitHub CLI](https://cli.github.com/) (`gh`) must be installed and authenticated

## Installation

```bash
npm install -g pr-auto-ready
```

After installation, you can use either `pr-auto-ready` or the shorter `prar` command.

## Usage

```
pr-auto-ready [PR_NUMBER] [REPO] [OPTIONS]
prar [PR_NUMBER] [REPO] [OPTIONS]
```

**Options:**
- `--interval N` - Check interval in seconds (default: 60)
- `--help, -h` - Show help

**Examples:**
```bash
pr-auto-ready                    # Auto-detect everything
pr-auto-ready 123               # Specific PR
pr-auto-ready 123 owner/repo    # Specific PR and repo
pr-auto-ready --interval 30     # Custom interval

# Or use the shorter alias
prar                            # Auto-detect everything
prar 123                        # Specific PR
prar 123 owner/repo            # Specific PR and repo
prar --interval 30             # Custom interval
```

## License

MIT

## Author

[syumai](https://github.com/syumai)
