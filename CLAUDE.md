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
