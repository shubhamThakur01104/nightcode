# Nightcode — Coding Standards and Conventions Document

---

## 1. Purpose and How to Use This Document

This document defines the coding standards, patterns, and architectural rules for the Nightcode monorepo. It serves as the authoritative guide for developers and automated AI coding assistants modifying or adding code to this project. All new code must conform to the observed conventions and explicit owner rules defined herein. If this document and the underlying codebase ever disagree, consult the owner rather than guessing.

---

## 2. Language and Tooling

### TypeScript Environment & Compiler Options
The monorepo uses TypeScript 5.9.3 configured via a root base configuration `tsconfig.base.json` extended by individual workspace packages [tsconfig.base.json, packages/cli/tsconfig.json, packages/server/tsconfig.json].

* **Target & Module**: ESNext module resolution with Bun runtime target [tsconfig.base.json].
* **Strictness Settings**: Strict mode enabled (`"strict": true`, `"noImplicitAny": true`, `"strictNullChecks": true`) [tsconfig.base.json].
* **JSX Configuration**: React 19 JSX transformation (`"jsx": "react-jsx"`, `"jsxImportSource": "react"`) in CLI workspace [packages/cli/tsconfig.json].

### Linters & Formatters
* **Linter / Formatter Setup**: No ESLint or Prettier configuration files exist in the repository [UNCLEAR: linter and formatter preferences not configured]. Code formatting follows standard 2-space indentation with semicolon termination observed across packages [packages/cli/src/index.tsx, packages/server/src/index.ts].

### Common Commands

| Task | Exact Command | Execution Scope | File Reference |
| :--- | :--- | :--- | :--- |
| **Type Check CLI** | `bun run --cwd packages/cli typecheck` | CLI Package (`tsc --noEmit`) | [packages/cli/package.json] |
| **Dev CLI** | `bun run dev:cli` | Workspace Root (`bun run --watch packages/cli/src/index.tsx`) | [package.json] |
| **Dev Server** | `bun run dev:server` | Workspace Root (`bun run --hot packages/server/src/index.ts`) | [package.json] |
| **Build CLI** | `bun run build:cli` | Workspace Root (`bun build src/index.tsx --outdir dist --target bun --external @opentui/core`) | [package.json, packages/cli/package.json] |
| **Generate DB Client** | `bun run --cwd packages/database db:generate` | Database Package (`bunx prisma generate`) | [packages/database/package.json] |

---

## 3. Naming Conventions

### Naming Rules Matrix

| Code Element | Convention | Code Evidence & Example | File Path Reference |
| :--- | :--- | :--- | :--- |
| **CLI Screen Files** | `kebab-case.tsx` | `home.tsx`, `new-session.tsx`, `session.tsx` | [packages/cli/src/screens/*] |
| **CLI Component Files** | `kebab-case.tsx` | `inputBar.tsx`, `statusBar.tsx`, `bot-message.tsx` | [packages/cli/src/components/*] |
| **CLI Component Names** | `PascalCase` | `export function Home()`, `export function BotMessage()` | [packages/cli/src/screens/home.tsx, packages/cli/src/components/messages/bot-message.tsx] |
| **CLI Custom Hooks** | `camelCase` with `use-` prefix file | `use-chat.ts` (`export function useChat(...)`) | [packages/cli/src/hooks/use-chat.ts] |
| **Server Route Files** | `kebab-case.ts` | `auth.ts`, `billing.ts`, `chat.ts`, `sessions.ts` | [packages/server/src/routes/*] |
| **Server Middleware Files** | `kebab-case.ts` | `require-auth.ts`, `require-credits-balance.ts` | [packages/server/src/middleware/*] |
| **Helper Functions** | `camelCase` | `executeLocalTool()`, `performLogin()`, `buildSystemPrompt()` | [packages/cli/src/lib/local-tools.ts, packages/server/src/system-prompt.ts] |
| **Variables & Parameters** | `camelCase` | `const sessionId`, `let completedUsage`, `const requestUrl` | [packages/server/src/routes/chat.ts, packages/server/src/lib/polar.ts] |
| **Constants** | `SCREAMING_SNAKE_CASE` | `MAX_FILE_SIZE`, `DEFAULT_CHAT_MODEL_ID`, `COMMANDS` | [packages/cli/src/lib/local-tools.ts, packages/shared/src/models.ts] |
| **TypeScript Types & Interfaces**| `PascalCase` | `type NightcodeUIMessage`, `type ModelPricing` | [packages/server/src/routes/chat.ts, packages/shared/src/models.ts] |
| **Zod Schemas** | `camelCase` with `Schema` suffix | `submitSchema`, `modeSchema`, `createSessionSchema` | [packages/server/src/routes/chat.ts, packages/shared/src/schemas.ts] |
| **Zod Middleware Validators**| `camelCase` with `Validator` suffix | `submitValidator`, `createSessionValidator` | [packages/server/src/routes/chat.ts, packages/server/src/routes/sessions.ts] |
| **Environment Variables** | `SCREAMING_SNAKE_CASE` | `DATABASE_URL`, `CLERK_SECRET_KEY`, `POLAR_ACCESS_TOKEN` | [packages/database/src/client.ts, packages/server/src/lib/auth.ts] |
| **Prisma Models** | `PascalCase` (Singular) | `model Session` | [packages/database/prisma/schema.prisma] |
| **Prisma Fields** | `camelCase` | `id`, `userId`, `title`, `createdAt`, `messages` | [packages/database/prisma/schema.prisma] |
| **API Route Paths** | `kebab-case` with `/` prefix | `/auth/callback`, `/sessions/:id`, `/billing/checkout` | [packages/server/src/routes/*] |
| **Polar Meter Event Names**| `snake_case` | `"nightcode_usage"` | [packages/server/src/lib/polar.ts] |

---

## 4. Folder Structure and File Placement

### File Placement Rules
* **New CLI Screen**: Place in `packages/cli/src/screens/<screen-name>.tsx` [packages/cli/src/screens/]. Register screen route in `createMemoryRouter` in `packages/cli/src/index.tsx` [packages/cli/src/index.tsx].
* **New CLI Dialog Content**: Place component in `packages/cli/src/components/dialogs/<dialog-name>-dialog.tsx` [packages/cli/src/components/dialogs/]. Re-export from `packages/cli/src/components/dialogs/index.tsx` [packages/cli/src/components/dialogs/index.tsx].
* **New Slash Command**: Add command definition object to `COMMANDS` array in `packages/cli/src/components/command-menu/commands.tsx` [packages/cli/src/components/command-menu/commands.tsx].
* **New React Context Provider**: Place in `packages/cli/src/providers/<provider-name>/index.tsx` [packages/cli/src/providers/]. Wrap inside `RootLayout` in `packages/cli/src/layouts/root-layout.tsx` [packages/cli/src/layouts/root-layout.tsx].
* **New Custom Hook**: Place in `packages/cli/src/hooks/use-<hook-name>.ts` [packages/cli/src/hooks/].
* **New Server Route Group**: Place router file in `packages/server/src/routes/<route-name>.ts` [packages/server/src/routes/]. Mount route on `app` in `packages/server/src/index.ts` [packages/server/src/index.ts].
* **New Middleware**: Place in `packages/server/src/middleware/require-<middleware-name>.ts` [packages/server/src/middleware/].
* **New Shared Schema / Model Contract**: Add schema to `packages/shared/src/schemas.ts` or model definition to `packages/shared/src/models.ts` [packages/shared/src/*]. Re-export in `packages/shared/src/index.ts` [packages/shared/src/index.ts].

### File Organization Rules
* **One Component Per File**: Each React component should reside in its own dedicated file (e.g. `user-message.tsx`, `bot-message.tsx`) [packages/cli/src/components/messages/*].
* **Barrel Exports**: Use barrel export files (`index.ts` or `index.tsx`) within component directories (`dialogs/index.tsx`, `messages/index.tsx`) to consolidate exports [packages/cli/src/components/dialogs/index.tsx].

---

## 5. Imports and Dependencies

### Import Grouping Order
OBSERVED: Source files organize imports in 3 distinct blocks separated by blank lines [packages/cli/src/screens/new-session.tsx, packages/server/src/routes/chat.ts]:
1. External npm packages and Node.js built-in modules (`react`, `hono`, `zod`, `ai`).
2. Shared monorepo packages (`@nightcode/shared`, `@nightcode/database`).
3. Local workspace modules (`../components/...`, `../lib/...`).

```typescript
// Evidence: Import structure in packages/cli/src/screens/new-session.tsx
import { useEffect, useMemo, useRef } from "react";
import { z } from "zod";
import { Mode, modeSchema } from "@nightcode/shared";
import { useNavigate, useLocation } from "react-router";

import { SessionShell } from "../components/session-shell";
import { useToast } from "../providers/toast";
import { apiClient } from "../lib/api-client";
```

### Type-Only Imports
RULE: Use explicit `import type` syntax when importing TypeScript types or interfaces [packages/cli/src/lib/api-client.ts, packages/server/src/routes/chat.ts]:
```typescript
// Evidence: Type-only import in packages/cli/src/lib/api-client.ts
import type { AppType } from "@nightcode/server";

// Evidence: Type-only import in packages/server/src/routes/chat.ts
import type { ModeType } from "@nightcode/shared";
```

### Relative Import Paths
OBSERVED: Workspace modules use relative import paths (`../components/inputBar`, `./client.js`) [packages/cli/src/screens/home.tsx, packages/database/src/index.ts]. Path aliases (such as `@/`) are not configured in `tsconfig.base.json` [tsconfig.base.json].

### Dependency Direction Rules
* `@nightcode/shared` has zero dependencies on other monorepo packages [packages/shared/package.json].
* `@nightcode/database` depends only on Prisma and PG adapter [packages/database/package.json].
* `@nightcode/server` depends on `@nightcode/database` and `@nightcode/shared` [packages/server/package.json].
* `@nightcode/cli` depends on `@nightcode/shared` and imports TypeScript types (`AppType`) from `@nightcode/server` [packages/cli/package.json, packages/cli/src/lib/api-client.ts].

---

## 6. Code Style Patterns

### Function Style: Declarations vs Arrows
* **CLI Screen & Component Functions**: Written as named function declarations (`export function Home()`, `export function SessionShell()`) [packages/cli/src/screens/home.tsx, packages/cli/src/components/session-shell.tsx].
* **Hono Route Handlers**: Written as arrow functions inside router chains [packages/server/src/routes/billing.ts]:
```typescript
// Evidence: Hono route handler style in packages/server/src/routes/billing.ts
const app = new Hono<AuthenticatedEnv>()
  .post("/checkout", async (c) => {
    const userId = c.get("userId");
    return c.json({ url: await createCheckoutUrl({ customerExternalId: userId, requestUrl: c.req.url }) });
  });
export default app;
```

### Exports: Named vs Default
* **Named Exports**: Used for UI components, custom hooks, helper libraries, and shared contracts (`export function useChat(...)`, `export const modeSchema = ...`) [packages/cli/src/hooks/use-chat.ts, packages/shared/src/schemas.ts].
* **Default Exports**: Used exclusively for Hono sub-router files (`export default app`) [packages/server/src/routes/auth.ts, packages/server/src/routes/billing.ts, packages/server/src/routes/chat.ts, packages/server/src/routes/sessions.ts] and main server entrypoint [packages/server/src/index.ts].

### React & OpenTUI UI Components
CLI components render OpenTUI layout primitives (`<box>`, `<text>`, `<scrollbox>`, `<input>`) directly inside JSX [packages/cli/src/components/session-shell.tsx, packages/cli/src/components/inputBar.tsx]:
```tsx
// Evidence: OpenTUI JSX in packages/cli/src/components/session-shell.tsx
export function SessionShell({ children, onSubmit }: Props) {
  return (
    <box flexDirection="column" flexGrow={1} width="100%" height="100%" paddingX={2}>
      <scrollbox flexGrow={1} width="100%" stickyScroll>
        <box>{children}</box>
      </scrollbox>
    </box>
  );
}
```

### Zod Validation Patterns
Validation middleware is created using `@hono/zod-validator`'s `zValidator` wrapper [packages/server/src/routes/chat.ts, packages/server/src/routes/sessions.ts]:
```typescript
// Evidence: Zod validation middleware in packages/server/src/routes/sessions.ts
const createSessionSchema = z.object({ title: z.string() });

const createSessionValidator = zValidator("json", createSessionSchema, (result, c) => {
  if (!result.success) {
    return c.json({ error: "Invalid request body" }, 400);
  }
});
```

---

## 7. Error Handling

### Local Tool Errors
Local tools throw plain `Error` instances with clear message strings when pre-conditions fail [packages/cli/src/lib/local-tools.ts]:
```typescript
// Evidence: Local tool error throwing in packages/cli/src/lib/local-tools.ts
if (occurrences === 0) throw new Error("oldString not found in file");
if (occurrences > 1) throw new Error(`oldString is ambiguous; found ${occurrences} matches`);
```
Caught by `useChat`'s `onToolCall` handler and converted into an `output-error` state payload:
```typescript
// Evidence: Tool error catch in packages/cli/src/hooks/use-chat.ts
.catch((error) =>
  chat.addToolOutput({
    tool: toolCall.toolName,
    toolCallId: toolCall.toolCallId,
    state: "output-error",
    errorText: error instanceof Error ? error.message : String(error),
  }),
);
```

### Server Route & Middleware Errors
Server routes and middleware return JSON error payloads with appropriate HTTP status codes [packages/server/src/middleware/require-auth.ts, packages/server/src/middleware/require-credits-balance.ts]:
```typescript
// Evidence: Middleware error response in packages/server/src/middleware/require-auth.ts
if (!auth) {
  return c.json({ error: "Unauthorized. Run /login to continue" }, 401);
}
```

### Global Error Handler (`app.onError`)
Uncaught exceptions hit Hono's global error handler in `packages/server/src/index.ts` [packages/server/src/index.ts]:
```typescript
// Evidence: Global error handler in packages/server/src/index.ts
app.onError((error, c) => {
  if (error instanceof HTTPException) {
    return c.json({ error: error.message || "Request failed" }, error.status);
  }
  return c.json({ error: "Internal server error" }, 500);
});
```

---

## 8. Validation and Security Rules

### Security Guard Enforcements
1. **Path Traversal Guard**: All tool paths MUST be validated via `resolveInsideCwd(path)`. Must throw `"Path is outside the project directory"` if target path resolves outside `process.cwd()` [packages/cli/src/lib/local-tools.ts].
2. **`.env` File Protection**: Must throw `"Access to .env files is forbidden"` if path equals or contains `.env`. Must throw `"Access to .env files via bash command is strictly forbidden"` if bash command matches `.env` inspection patterns [packages/cli/src/lib/local-tools.ts].
3. **Agent Mode Guard**: Must enforce `PLAN` mode restrictions by throwing `"Tool X is not available in PLAN mode"` for write tools (`writeFile`, `editFile`, `bash`) [packages/cli/src/lib/local-tools.ts].

### Secrets & Environment Variable Handling
* Environment variables must be accessed via `process.env.VAR_NAME` [packages/database/src/client.ts, packages/server/src/lib/auth.ts].
* Required variables MUST throw explicit configuration errors if missing on application startup [packages/database/src/client.ts, packages/server/src/lib/auth.ts]:
```typescript
// Evidence: Required env var guard in packages/database/src/client.ts
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}
```
* **Logging Restrictions**: API tokens, Clerk secret keys, database credentials, and contents of `.env` files MUST NEVER be logged to console or Sentry telemetry [packages/server/src/index.ts, packages/cli/src/lib/local-tools.ts].

---

## 9. State, Data, and API Usage

### CLI State Management
State is managed across localized React Context Providers wrapped in `<RootLayout />` [packages/cli/src/layouts/root-layout.tsx]:
* `ThemeProvider`: Manages active color theme and persists to `~/.nightcode/preferences.json` [packages/cli/src/providers/theme/index.tsx].
* `PromptConfigProvider`: Manages active agent mode (`PLAN` vs `BUILD`) and selected model ID [packages/cli/src/providers/prompt-config/index.tsx].
* `KeyboardLayerProvider`: Manages keypress routing stack and global `Ctrl+C` interrupt handlers [packages/cli/src/providers/keyboard-layer/index.tsx].
* `DialogProvider`: Controls modal overlay rendering (`open()`, `close()`) [packages/cli/src/providers/dialog/index.tsx].
* `ToastProvider`: Triggers floating toast notifications (`show()`) [packages/cli/src/providers/toast/index.tsx].

### API Client Invocation Pattern
The CLI interacts with the server exclusively through `apiClient` defined in `packages/cli/src/lib/api-client.ts` [packages/cli/src/lib/api-client.ts]:
```typescript
// Evidence: RPC client call in packages/cli/src/components/dialogs/sessions-dialog.tsx
const res = await apiClient.sessions.$get();
if (!res.ok) {
  throw new Error(await getErrorMessage(res));
}
const data = await res.json();
```

---

## 10. Testing

### Observed Test Setup
OBSERVED: The monorepo contains zero test configuration files (`jest.config.js`, `vitest.config.ts`), test runners, or test spec files (`*.test.ts`, `*.spec.ts`) [package.json, packages/cli/package.json, packages/server/package.json].

### Testing Expectations for New Code
RULE: No automated test suites are currently required for new features [package.json]. If unit tests are added in the future, they should target server-side credit calculation utilities (`packages/server/src/lib/credits.ts`) and shared validation schemas (`packages/shared/src/schemas.ts`) using Bun's native test runner (`bun test`).

---

## 11. Git and Workflow

### Commit Messages & Workflow Rules
OBSERVED: Commit history follows single-branch development on `main` with short, imperative task descriptions [git log].
RULE: Commit messages should be concise and describe the functional change (e.g. `feat: add model support`, `fix: update session loading error handler`).

---

## 12. Checklists for Common Tasks

### Task A: Add a Slash Command
1. Define command metadata and action handler in `COMMANDS` array in `packages/cli/src/components/command-menu/commands.tsx` [packages/cli/src/components/command-menu/commands.tsx].
2. If command requires a modal dialog, create dialog content component in `packages/cli/src/components/dialogs/` [packages/cli/src/components/dialogs/].
3. Update these documents: `docs/01-product-description.md`, `docs/04-api-contract.md`, `docs/05-coding-standards.md`.

### Task B: Add a CLI Dialog
1. Create dialog content component `packages/cli/src/components/dialogs/<name>-dialog.tsx` [packages/cli/src/components/dialogs/].
2. Re-export component from `packages/cli/src/components/dialogs/index.tsx` [packages/cli/src/components/dialogs/index.tsx].
3. Trigger dialog via `dialog.open({ title, children })` using `useDialog()` hook [packages/cli/src/providers/dialog/index.tsx].
4. Update these documents: `docs/01-product-description.md`, `docs/05-coding-standards.md`.

### Task C: Add a Server Route
1. Create router file `packages/server/src/routes/<name>.ts` exporting default `Hono` app instance [packages/server/src/routes/].
2. Add route handler with Zod body/param validation [packages/server/src/routes/].
3. Chain route on main app in `packages/server/src/index.ts` using `.route("/<name>", <name>)` [packages/server/src/index.ts].
4. Attach middleware (`requireAuth`, `requireCreditsBalance`) if endpoint requires protection [packages/server/src/index.ts].
5. Update these documents: `docs/02-technical-architecture.md`, `docs/04-api-contract.md`, `docs/05-coding-standards.md`.

### Task D: Add a New AI Model
1. Add model entry to `SUPPORTED_CHAT_MODELS` array in `packages/shared/src/models.ts` with `id`, `provider`, and `pricing` [packages/shared/src/models.ts].
2. Update provider resolution logic or model option maps in `packages/server/src/lib/models.ts` [packages/server/src/lib/models.ts].
3. Update these documents: `docs/01-product-description.md`, `docs/02-technical-architecture.md`, `docs/04-api-contract.md`, `docs/05-coding-standards.md`.

### Task E: Add a New Local Tool
1. Define input Zod schema in `toolInputSchemas` in `packages/shared/src/schemas.ts` [packages/shared/src/schemas.ts].
2. Add tool contract declaration to `buildToolContracts` (and `readOnlyToolContracts` if read-only) in `packages/shared/src/schemas.ts` [packages/shared/src/schemas.ts].
3. Add tool execution case to `executeLocalTool()` in `packages/cli/src/lib/local-tools.ts` with `resolveInsideCwd` path and `.env` guards [packages/cli/src/lib/local-tools.ts].
4. Add tool rendering logic in `BotMessage` in `packages/cli/src/components/messages/bot-message.tsx` [packages/cli/src/components/messages/bot-message.tsx].
5. Update these documents: `docs/01-product-description.md`, `docs/02-technical-architecture.md`, `docs/03-data-model.md`, `docs/05-coding-standards.md`.

### Task F: Add a Database Field
1. Update `model Session` in `packages/database/prisma/schema.prisma` [packages/database/prisma/schema.prisma].
2. Run Prisma client generation: `bun run --cwd packages/database db:generate` [packages/database/package.json].
3. Update server route query handlers in `packages/server/src/routes/sessions.ts` or `chat.ts` [packages/server/src/routes/].
4. Update these documents: `docs/02-technical-architecture.md`, `docs/03-data-model.md`, `docs/05-coding-standards.md`.

### Task G: Add an Environment Variable
1. Add validation check in target package library (e.g. `packages/server/src/lib/...` or `packages/cli/src/lib/...`) [packages/server/src/lib/auth.ts].
2. Add variable name to environment variable tables in documentation.
3. Update these documents: `docs/02-technical-architecture.md`, `docs/04-api-contract.md`, `docs/05-coding-standards.md`.

---

## 13. Inconsistencies for Owner Decision

1. **Component Export Style**:
   - Pattern A: Default export (`export default Headers` in `packages/cli/src/components/headers.tsx`, `export default StatusBar` in `packages/cli/src/components/statusBar.tsx`).
   - Pattern B: Named export (`export function BotMessage` in `packages/cli/src/components/messages/bot-message.tsx`, `export function UserMessage` in `packages/cli/src/components/messages/user-message.tsx`).
2. **Component Function Declaration**:
   - Pattern A: Function declaration (`export function Home()` in `packages/cli/src/screens/home.tsx`).
   - Pattern B: Arrow function expression (`export const AgentsDialogContent = (...) => ...` in `packages/cli/src/components/dialogs/agents-dialog.tsx`).
3. **Server Error Response Payload Formats**:
   - Pattern A: JSON object `{ "error": string }` returned by API endpoints and error middleware [packages/server/src/index.ts, packages/server/src/middleware/require-auth.ts].
   - Pattern B: Plain text string `c.text(...)` returned by `/auth/callback` [packages/server/src/routes/auth.ts] and `/billing/success` [packages/server/src/routes/billing.ts].
4. **Vercel AI SDK Version Dependency Pinning**:
   - Pattern A: `ai` pinned to `^7.0.99` in `@nightcode/cli` [packages/cli/package.json] and `@nightcode/shared` [packages/shared/package.json].
   - Pattern B: `ai` pinned to `^7.0.93` in `@nightcode/server` [packages/server/package.json].

---

## 14. Forbidden and Discouraged

### Forbidden (Off-Limits List)
* **NO Third-Party HTTP Clients**: Do not use `axios`, `got`, or `request`. Use native `fetch` or Hono RPC client `apiClient` [packages/cli/src/lib/api-client.ts].
* **NO Class Components**: React components must be written as functional components [packages/cli/src/screens/home.tsx].
* **NO Bypassing Path Guards**: Never bypass `resolveInsideCwd()` or `.env` security checks in local tools [packages/cli/src/lib/local-tools.ts].
* **NO Hardcoded Secrets**: Secrets, tokens, and API keys must never be committed to repository code [packages/server/src/lib/auth.ts].

### Discouraged Anti-Patterns (Found in Codebase)
* **Hardcoded Telemetry DSN**: Hardcoding Sentry ingest URLs in `packages/server/src/index.ts` [packages/server/src/index.ts].
* **Commented-Out Mock Code**: Leaving commented mock error/delay blocks in route files [packages/server/src/routes/sessions.ts].
* **Unused Debug Endpoints**: Leaving test endpoints (`GET /debug-sentry`) active in production routers [packages/server/src/index.ts].

---

## 15. Open Questions

1. `UNCLEAR:` Configured linter (ESLint) or code formatter (Prettier) rules — whether formatting is enforced via git hooks or IDE extensions [package.json].
2. `UNCLEAR:` Resolution strategy for minor version discrepancy of `ai` SDK package between CLI/shared (`^7.0.99`) and server (`^7.0.93`) [packages/cli/package.json, packages/server/package.json].
