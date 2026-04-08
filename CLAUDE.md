# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ODC (OceanBase Developer Center) is an enterprise data development platform with both a centralized web version and a local Electron client version. The web version requires ODC Server, while the client version includes embedded dependencies for standalone operation.

**Tech Stack:**

- **Frontend Framework:** UmiJS 4 (React 17)
- **State Management:** MobX 5
- **Desktop Framework:** Electron 22
- **Editor:** Monaco Editor with OceanBase language plugin
- **UI Library:** Ant Design 5
- **SQL Parser:** @oceanbase-odc/ob-parser-js
- **Styling:** Less

## Common Development Commands

```bash
# Install dependencies
pnpm run install-odc

# Web version development
pnpm run dev
# or
pnpm run start

# Client development (starts both web server and electron)
pnpm run dev:client
pnpm run start-electron

# Type checking
pnpm run type-check

# Run tests
pnpm run test

# Build web version
pnpm run build:odc

# Build client
pnpm run build:client

# Format code
pnpm run prettier
```

## Project Architecture

### Dual Deployment Mode

The project supports two deployment modes configured via `UMI_ENV`:

- **Web mode:** Connects to remote ODC Server via proxy
- **Client mode:** Electron app with embedded local server

Configuration files:

- `config/config.js` - Main UmiJS config (web mode)
- `config/config.client.js` - Client-specific overrides
- `build/webpack.main.config.js` - Electron main process build

### Key Directories

- **`src/page/`** - Page components (Console, Project, Datasource, Task, Schedule, Workspace, etc.)
- **`src/component/`** - Reusable components (CommonIDE, CommonTable, Schedule, Task components, etc.)
- **`src/store/`** - MobX stores for state management (login, setting, modal, etc.)
- **`src/common/network/`** - API layer for backend communication
- **`src/main/`** - Electron main process code
- **`src/util/`** - Utility functions (request, intl, logger, etc.)
- **`src/layout/`** - Layout components and wrappers
- **`config/`** - UmiJS configuration and routing

### Network/API Layer

All API calls go through `src/common/network/`. Each domain has its own module:

- `connection.ts` - Database connection management
- `database.ts` - Database operations
- `sql/` - SQL execution and related operations
- `project.ts` - Project management
- `schedule.ts` - Scheduled tasks
- `task.ts` - Task execution
- `function.ts`, `procedure.ts`, `trigger.ts`, etc. - Object management

The request utility (`src/util/request/`) wraps calls and handles plugin extensibility via `odc.ODCRequest`.

### State Management Pattern

MobX stores in `src/store/` use decorators:

```typescript
@observable
public someData: Type = defaultValue;

@action
public async someMethod() { ... }
```

Key stores:

- `login.ts` - User authentication and organization management
- `setting.ts` - System/user configuration
- `modal.ts` - Global modal state
- `page.ts` - Page-level state

### Internationalization

- Uses `react-intl` with UmiJS locale plugin
- Locale files in `src/locales/`
- Supported: en-US, zh-CN, zh-TW
- Helper functions in `src/util/intl.tsx`

### Routing

Routes defined in `config/routes.js` using UmiJS routing:

- Nested routes with wrappers for auth/organization
- Key routes: `/console`, `/project`, `/datasource`, `/task`, `/schedule`, `/sqlworkspace`
- Layout wrappers: `PageLoadingWrapper`, `UserWrapper`, `SpaceContainer`, `OrganizationListenWrap`

### Plugin System

Plugins in `src/plugins/` allow extensibility:

- `odc.ts` - Main plugin interface
- `register.ts` - Plugin registration
- Plugin List managed via `src/plugins/pluginList.ts` (auto-generated during init)

### SQL Editor (CommonIDE)

Monaco-based SQL editor in `src/component/CommonIDE/`:

- Integrates `@oceanbase-odc/monaco-plugin-ob` for OB syntax
- Uses `@oceanbase-odc/ob-parser-js` for SQL parsing
- Supports SQL execution, result display, and formatting

### Electron Architecture

Main process in `src/main/`:

- `main.ts` - Entry point, app lifecycle
- `server/` - Local server for embedded ODC capabilities
- `windows/` - Window management
- `renderService/` - IPC communication
- `utils/` - Electron-specific utilities

## Development Notes

- **Type checking:** Run `pnpm run type-check` before committing (enforced by precommit hook)
- **Path aliases:** `@/*` → `src/*`, `@@/*` → `src/.umi/*`
- **Proxy config:** Edit `config/config.js` proxy target for local development
- **Client deps:** For client builds, JAR/JRE/OBClient must be prepackaged in `libraries/`

## Important Patterns

[README.md](../../everything-claude-code/rules/README.md)

1. **API calls:** Always use modules from `@/common/network` through the request utility
2. **State updates:** Use MobX actions with `@action` decorator
3. **Intl:** Use `formatMessage` from locale context, helper functions in `util/intl`
4. **Components:** Follow existing component structure with index.tsx + interface.ts + styles
5. **Testing:** Jest config in `jest.config.js`, test files co-located or in `__tests__` directories

<!-- rtk-instructions v2 -->

# RTK (Rust Token Killer) - Token-Optimized Commands

## Golden Rule

**Always prefix commands with `rtk`**. If RTK has a dedicated filter, it uses it. If not, it passes through unchanged. This means RTK is always safe to use.

**Important**: Even in command chains with `&&`, use `rtk`:

```bash
# ❌ Wrong
git add . && git commit -m "msg" && git push

# ✅ Correct
rtk git add . && rtk git commit -m "msg" && rtk git push
```

## RTK Commands by Workflow

### Build & Compile (80-90% savings)

```bash
rtk cargo build         # Cargo build output
rtk cargo check         # Cargo check output
rtk cargo clippy        # Clippy warnings grouped by file (80%)
rtk tsc                 # TypeScript errors grouped by file/code (83%)
rtk lint                # ESLint/Biome violations grouped (84%)
rtk prettier --check    # Files needing format only (70%)
rtk next build          # Next.js build with route metrics (87%)
```

### Test (90-99% savings)

```bash
rtk cargo test          # Cargo test failures only (90%)
rtk vitest run          # Vitest failures only (99.5%)
rtk playwright test     # Playwright failures only (94%)
rtk test <cmd>          # Generic test wrapper - failures only
```

### Git (59-80% savings)

```bash
rtk git status          # Compact status
rtk git log             # Compact log (works with all git flags)
rtk git diff            # Compact diff (80%)
rtk git show            # Compact show (80%)
rtk git add             # Ultra-compact confirmations (59%)
rtk git commit          # Ultra-compact confirmations (59%)
rtk git push            # Ultra-compact confirmations
rtk git pull            # Ultra-compact confirmations
rtk git branch          # Compact branch list
rtk git fetch           # Compact fetch
rtk git stash           # Compact stash
rtk git worktree        # Compact worktree
```

Note: Git passthrough works for ALL subcommands, even those not explicitly listed.

### GitHub (26-87% savings)

```bash
rtk gh pr view <num>    # Compact PR view (87%)
rtk gh pr checks        # Compact PR checks (79%)
rtk gh run list         # Compact workflow runs (82%)
rtk gh issue list       # Compact issue list (80%)
rtk gh api              # Compact API responses (26%)
```

### JavaScript/TypeScript Tooling (70-90% savings)

```bash
rtk pnpm list           # Compact dependency tree (70%)
rtk pnpm outdated       # Compact outdated packages (80%)
rtk pnpm install        # Compact install output (90%)
rtk npm run <script>    # Compact npm script output
rtk npx <cmd>           # Compact npx command output
rtk prisma              # Prisma without ASCII art (88%)
```

### Files & Search (60-75% savings)

```bash
rtk ls <path>           # Tree format, compact (65%)
rtk read <file>         # Code reading with filtering (60%)
rtk grep <pattern>      # Search grouped by file (75%)
rtk find <pattern>      # Find grouped by directory (70%)
```

### Analysis & Debug (70-90% savings)

```bash
rtk err <cmd>           # Filter errors only from any command
rtk log <file>          # Deduplicated logs with counts
rtk json <file>         # JSON structure without values
rtk deps                # Dependency overview
rtk env                 # Environment variables compact
rtk summary <cmd>       # Smart summary of command output
rtk diff                # Ultra-compact diffs
```

### Infrastructure (85% savings)

```bash
rtk docker ps           # Compact container list
rtk docker images       # Compact image list
rtk docker logs <c>     # Deduplicated logs
rtk kubectl get         # Compact resource list
rtk kubectl logs        # Deduplicated pod logs
```

### Network (65-70% savings)

```bash
rtk curl <url>          # Compact HTTP responses (70%)
rtk wget <url>          # Compact download output (65%)
```

### Meta Commands

```bash
rtk gain                # View token savings statistics
rtk gain --history      # View command history with savings
rtk discover            # Analyze Claude Code sessions for missed RTK usage
rtk proxy <cmd>         # Run command without filtering (for debugging)
rtk init                # Add RTK instructions to CLAUDE.md
rtk init --global       # Add RTK to ~/.claude/CLAUDE.md
```

## Token Savings Overview

| Category         | Commands                       | Typical Savings |
| ---------------- | ------------------------------ | --------------- |
| Tests            | vitest, playwright, cargo test | 90-99%          |
| Build            | next, tsc, lint, prettier      | 70-87%          |
| Git              | status, log, diff, add, commit | 59-80%          |
| GitHub           | gh pr, gh run, gh issue        | 26-87%          |
| Package Managers | pnpm, npm, npx                 | 70-90%          |
| Files            | ls, read, grep, find           | 60-75%          |
| Infrastructure   | docker, kubectl                | 85%             |
| Network          | curl, wget                     | 65-70%          |

Overall average: **60-90% token reduction** on common development operations.

<!-- /rtk-instructions -->
