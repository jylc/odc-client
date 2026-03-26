# AGENTS.md

This guide helps agents work effectively in the OceanBase Developer Center (ODC) repository.

## Project Overview

ODC is an enterprise-level data development platform with two deployment modes:

- **Web version**: Requires ODC Server backend
- **Client version**: Electron-based standalone application

**Tech Stack**:

- React 17 + TypeScript + UmiJS 4
- Electron (desktop client)
- MobX (state management)
- Ant Design 5
- Monaco Editor (SQL code editing)
- Webpack (build system)

## Essential Commands

### Development

```bash
# Initial setup (installs dependencies and runs postinstall)
pnpm run install-odc

# Web development (starts on port 8000)
pnpm run dev

# Client development (starts web + Electron)
pnpm run dev:client
# Then in another terminal:
pnpm run start-electron

# Type checking
pnpm run type-check

# Testing
pnpm run test
pnpm run cov  # with coverage
```

### Build

```bash
# Build web version
pnpm run build:odc

# Build client version (requires ODC Server Jar, JRE, OBClient in libraries/)
pnpm run build:client

# Specific platform builds
node ./scripts/client/build.js mac
node ./scripts/client/build.js win
node ./scripts/client/build.js linux_x86
node ./scripts/client/build.js linux_aarch64
```

### Code Quality

```bash
# Format code
pnpm run prettier

# Pre-commit check (type-check + lint-staged formatting)
pnpm run precommit
```

## Code Organization

### Directory Structure

```
src/
├── page/              # Route pages (feature modules)
├── component/         # Reusable components
├── common/            # Business logic
│   ├── network/       # API calls (request wrappers)
│   ├── datasource/    # Database connection configurations
│   └── task/          # Task-related logic
├── store/             # MobX stores (state management)
├── util/              # Utilities (logger, utils, request)
├── d.ts/              # TypeScript type definitions
├── locales/           # i18n translation files
├── layout/            # Layout components and wrappers
├── main/              # Electron main process code
├── plugins/           # ODC plugin system
└── constant/          # Constants and enums
```

### Routing

Routes defined in `config/routes.js` follow UmiJS conventions with hash routing.

- Main route structure: `/pageName/:id/:page`
- Example: `/project/123/console`, `/datasource/456/settings`

## Code Patterns

### State Management (MobX)

```typescript
import { action, observable } from 'mobx';

export class ExampleStore {
  @observable
  public data: any = null;

  @action
  public updateData(newData: any) {
    this.data = newData;
  }
}

// Export singleton instance
export default new ExampleStore();
```

### API Calls

```typescript
import request from '@/util/request';

export async function fetchItems(params: any): Promise<IResponseData> {
  const res = await request.get(`/api/v2/items`, { params });
  return res?.data;
}
```

### Components with MobX

```typescript
import { inject, observer } from 'mobx-react';

interface IProps {
  exampleStore?: ExampleStore;
}

const MyComponent: React.FC<IProps> = inject('exampleStore')(
  observer((props) => {
    // component logic
    return <div>{props.exampleStore?.data}</div>;
  }),
);
```

### Internationalization

```typescript
import { formatMessage } from '@/util/intl';

formatMessage({ id: 'common.save' }); // Returns localized string
```

## Testing

Test files use Jest with TypeScript:

```bash
# Test files located in:
# - src/util/test/*.test.ts
# - Component-specific test folders

# Run tests
pnpm run test
```

Testing pattern (from `src/util/test/util.test.ts`):

```typescript
describe('test feature', () => {
  it('should do something', () => {
    expect(result).toEqual(expected);
  });
});
```

## Configuration

### Proxy Configuration

For local development, modify `config/config.js`:

```javascript
proxy: {
  '/api/': {
    target: 'http://localhost:8990/',  // Your ODC Server address
  },
  '/oauth2/': {
    target: 'http://localhost:8990/',
  }
}
```

### TypeScript Configuration

- Strict mode disabled: `strictNullChecks: false`, `noImplicitAny: false`
- Base URL: `src/`
- Path aliases: `@/*` → `src/*`, `@@/*` → `src/.umi/*`

### Code Style

- **Indentation**: 2 spaces
- **Quotes**: Single quotes
- **Trailing commas**: All
- **Print width**: 100 characters
- **Line endings**: LF

## Important Gotchas

### Memory Requirements

- Requires **minimum 8GB RAM**
- Build commands use `--max_old_space_size=8192` for Node.js

### Pre-commit Hook

- Runs `type-check` and `lint-staged` automatically
- Must pass before commits can be made

### Client Build Dependencies

To build client version, you need:

1. ODC Server Jar in `libraries/java/odc.jar`
2. JRE in `libraries/jre/`
3. OBClient in `libraries/obclient/`

Run `pnpm run prepack jar/jre/obclient` to download these dependencies.

### Version System

- Version format: `package-version-git-timestamp` (e.g., `4.4.1-1700000000000`)
- Generated from git commit date in `config/version.js`

### Session Management

- Uses session IDs (SID) with format: `sid:session-id:type:data`
- Session manager in `src/store/sessionManager/`

### Database Support

Supports multiple database types:

- OceanBase (MySQL/Oracle compatibility modes)
- MySQL
- Oracle
- PostgreSQL
- Doris

Configuration per database type in `src/common/datasource/`

### Electron vs Web

- **Web version**: Standard UmiJS app
- **Client version**: Electron wrapper with main process in `src/main/`
- Use `isClient()` from `@/util/env` to detect environment

### Plugin System

ODC uses a plugin system (`src/plugins/`):

- Custom ODC plugin provides `ODCRequest` for network calls
- Other plugins extend functionality
- Registered in `src/plugins/register.ts`

### Logging

- Uses `loglevel` library
- Debug level in development/pre-production, Info otherwise
- Logger imported from `@/util/logger`

### Error Handling

- Custom error handlers can be registered via `odc.addErrorHandle()`
- Centralized error resolution in `src/util/request/errorResolve.ts`

### Internationalization

- Supported locales: `en-US`, `zh-CN`, `zh-TW`
- Locale files in `src/locales/`
- Use `formatMessage({ id: 'key' })` for translations

### SQL Editing

- Monaco Editor with OceanBase plugin
- Supports YAML and JSON workers
- SQL parsing and validation via `@oceanbase-odc/ob-parser-js`

## Build Artifacts

- **Web version**: Output to `dist/renderer/`
- **Client version**: Electron builds to platform-specific installers

## CI/CD

### GitHub Workflows

- **bundleSize.yaml**: Monitors bundle size on PRs
- **copyright.yaml**: Automatically adds copyright headers via skywalking-eyes

### Copyright Headers

All source files must include Apache 2.0 license header:

```c
/*
 * Copyright 2023 OceanBase
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * ...
 */
```

## Type Definitions

Central type definitions in `src/d.ts/` include:

- `IConnection` - Database connection configuration
- `IDatabase` - Database metadata
- `ITable`, `ITableColumn` - Table structure
- `IResultSet` - SQL query results
- `IUser`, `IOrganization` - User and organization
- `IResponseData` - API response wrapper

## Common Utilities

- `@/util/utils` - General utility functions
- `@/util/intl` - Internationalization helpers
- `@/util/request` - HTTP request wrapper
- `@/util/env` - Environment detection (web vs client)
- `@/util/logger` - Logging utility

## Debugging

### Web Version

- Access at `http://localhost:8000`
- DevTools available in browser

### Client Version

- Electron DevTools: `pnpm run start-electron` with `--inspect=5858`
- Renderer process uses same DevTools as web version

## Additional Notes

- The project uses `pnpm` as package manager (not `npm` or `yarn`)
- Monaco plugin version is used in publicPath and worker copying
- Source maps disabled in production (enable with `ENABLE_SOURCEMAP=true`)
- Uses custom Electron build configuration in `build/`
