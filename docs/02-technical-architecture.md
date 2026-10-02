# Nightcode — Technical Architecture Document

---

## 1. System Overview

Nightcode is a terminal-native AI coding application built as a TypeScript monorepo using Bun workspace packages [package.json]. The application follows a decoupled client-server model where an interactive terminal user interface (`@nightcode/cli`) communicates over HTTP with a lightweight Hono backend server (`@nightcode/server`) [packages/cli/src/lib/api-client.ts, packages/server/src/index.ts]. The backend server acts as an AI orchestration gateway, delegating LLM streaming generation to cloud provider APIs, managing user credit validation via Polar, verifying OAuth Bearer tokens, and persisting chat histories to a PostgreSQL database via Prisma ORM [packages/server/src/routes/chat.ts, packages/server/src/lib/polar.ts, packages/database/src/client.ts]. Local workspace operations (such as reading files, writing changes, running regex searches, and executing shell commands) are dispatched by the CLI frontend directly on the developer's host machine upon receiving tool execution requests from the AI stream [packages/cli/src/lib/local-tools.ts, packages/cli/src/hooks/use-chat.ts]. Shared type definitions, Zod validation schemas, model pricing tables, and tool contracts are centralized in a common package shared by both CLI and server (`@nightcode/shared`) [packages/shared/src/index.ts].

```
+-------------------------------------------------------------------------+
|                              DEVELOPER HOST                             |
|                                                                         |
|  +-------------------------------------------------------------------+  |
|  |                     @nightcode/cli (OpenTUI UI)                   |  |
|  |  - Renders 60 FPS TUI frame buffer     [packages/cli/src/index.tsx] |  |
|  |  - Executes local tools & bash commands  [packages/cli/src/lib/loc] |  |
|  |  - Manages local token auth            [packages/cli/src/lib/auth] |  |
|  +---------------------------------+---------------------------------+  |
+------------------------------------|------------------------------------+
                                     | HTTP / Stream
                                     v
+-------------------------------------------------------------------------+
|                           @nightcode/server                             |
|                                                                         |
|  - Hono API Web Server (`Bun.serve`)      [packages/server/src/index]  |
|  - Clerk OAuth Authenticator              [packages/server/src/lib/aut] |
|  - Polar Pre-Flight & Metering            [packages/server/src/lib/pol] |
|  - Vercel AI SDK Provider Router          [packages/server/src/lib/mod] |
+---------------+---------------------+--------------------+--------------+
                |                     |                    |
                v                     v                    v
      +------------------+   +-----------------+  +------------------+
      | PostgreSQL (DB)  |   | External LLMs   |  | External Services|
      | - Session stores |   | - Gemini        |  | - Clerk Auth     |
      | - Messages JSON  |   | - Groq          |  | - Polar Billing  |
      | [packages/db]    |   | - OpenRouter    |  | - Sentry Telemetry|
      +------------------+   | - Omnirouter    |  +------------------+
                             +-----------------+
```

---

## 2. Tech Stack Table

| Category | Technology | Exact Version | Purpose | Selection Reason |
| :--- | :--- | :--- | :--- | :--- |
| **Runtime** | Bun | `>=1.3.0` [packages/cli/package.json] | JavaScript/TypeScript runtime, package manager, workspace runner, and HTTP server (`Bun.serve`) [package.json, packages/server/src/index.ts] | Chosen for fast TypeScript execution and native workspace/bundling support [UNCLEAR: reason not explicitly documented in code comments]. |
| **Terminal UI** | `@opentui/core` | `0.5.10` [package.json, packages/cli/package.json] | Terminal buffer renderer and input system for CLI UI [packages/cli/src/index.tsx] | Provides terminal rendering primitives for React fiber nodes [UNCLEAR: selection rationale not documented]. |
| **Terminal UI** | `@opentui/react` | `0.5.10` [packages/cli/package.json] | React 19 bindings and hooks (`useKeyboard`, `useRenderer`) for OpenTUI terminal UI [packages/cli/src/components/inputBar.tsx] | Allows declarative React component rendering in terminal buffer [UNCLEAR: selection rationale not documented]. |
| **Terminal UI** | `react` | `^19.2.8` [packages/cli/package.json] | Component tree rendering engine for OpenTUI CLI frontend [packages/cli/src/index.tsx] | Standard UI framework for stateful component trees [UNCLEAR: selection rationale not documented]. |
| **Terminal UI** | `react-router` | `^8.3.1` [packages/cli/package.json] | In-memory routing (`createMemoryRouter`) for navigating CLI screens (`/`, `/sessions/new`, `/sessions/:id`) [packages/cli/src/index.tsx] | Provides client-side screen navigation without browser DOM [packages/cli/src/index.tsx]. |
| **Terminal UI** | `opentui-spinner` | `^0.0.7` [packages/cli/package.json] | Animated terminal spinner component for streaming states [packages/cli/src/components/spinner.tsx] | Terminal loading animation [packages/cli/src/components/spinner.tsx]. |
| **Backend API** | `hono` | `^4.13.7` [packages/cli/package.json, packages/server/package.json] | Web framework for API routes (`/auth`, `/sessions`, `/chat`, `/billing`) and RPC client (`hc<AppType>`) [packages/server/src/index.ts, packages/cli/src/lib/api-client.ts] | Lightweight web framework supporting streaming and full end-to-end TypeScript RPC typing [packages/server/src/index.ts]. |
| **Validation** | `zod` | `^4.5.4` [packages/cli/package.json, packages/server/package.json, packages/shared/package.json] | Schema definition and request payload validation [packages/shared/src/schemas.ts, packages/server/src/routes/chat.ts] | Type-safe runtime schema parsing across shared, client, and server packages [packages/shared/src/schemas.ts]. |
| **Database ORM** | `prisma` / `@prisma/client` | `7.10.0` [packages/database/package.json] | Database ORM client and schema migrations for PostgreSQL [packages/database/prisma/schema.prisma, packages/database/src/client.ts] | Relational ORM mapping for sessions table [packages/database/prisma/schema.prisma]. |
| **Database Driver**| `@prisma/adapter-pg` / `pg` | `^7.10.0` / `^8.23.0` [packages/database/package.json] | PostgreSQL database connection driver adapter [packages/database/src/client.ts] | Enables Prisma driver adapter support for PostgreSQL connection pooling [packages/database/src/client.ts]. |
| **AI Orchestration**| `ai` (Vercel AI SDK) | `^7.0.99` (CLI/Shared), `^7.0.93` (Server) [packages/cli/package.json, packages/server/package.json, packages/shared/package.json] | Multi-provider AI model streaming (`streamText`), message conversion, and client hooks (`useChat`) [packages/server/src/routes/chat.ts, packages/cli/src/hooks/use-chat.ts] | Standardized LLM streaming and tool call orchestration layer [packages/server/src/routes/chat.ts]. |
| **AI Providers** | `@ai-sdk/google` | `^4.0.60` [packages/server/package.json] | Gemini model provider integration (`google("gemini-3.5-flash-lite")`) [packages/server/src/lib/models.ts] | Integration for Google AI Studio models [packages/server/src/lib/models.ts]. |
| **AI Providers** | `@ai-sdk/groq` | `^4.0.37` [packages/server/package.json] | Groq model provider integration (`groq("qwen/qwen3.6-27b")`) [packages/server/src/lib/models.ts] | Integration for fast Groq inference models [packages/server/src/lib/models.ts]. |
| **AI Providers** | `@openrouter/ai-sdk-provider` | `^3.0.0` [packages/server/package.json] | OpenRouter model provider integration (`openrouter(...)`) [packages/server/src/lib/models.ts] | Integration for OpenRouter model marketplace models [packages/server/src/lib/models.ts]. |
| **AI Providers** | `@ai-sdk/openai` | `^4.0.71` [packages/server/package.json] | OpenAI-compatible provider integration for Omnirouter (`createOpenAI(...)`) [packages/server/src/lib/models.ts] | Allows custom API gateway routing via OpenAI-compatible endpoints [packages/server/src/lib/models.ts]. |
| **Authentication**| `@clerk/backend` | `^3.17.2` [packages/server/package.json] | Backend OAuth token authentication (`authenticateOAuthRequest`) [packages/server/src/lib/auth.ts] | Validates Clerk OAuth Bearer tokens on incoming HTTP requests [packages/server/src/middleware/require-auth.ts]. |
| **Billing** | `@polar-sh/sdk` | `^0.49.0` [packages/server/package.json] | Polar billing SDK for customer meter balance checks, event ingestion, and portal URL generation [packages/server/src/lib/polar.ts] | Usage metering and customer subscription checkout integration [packages/server/src/lib/polar.ts]. |
| **Monitoring** | `@sentry/hono` / `@sentry/bun` | `^10.73.0` [packages/server/package.json] | Error tracking and telemetry middleware (`sentry(app, ...)`) [packages/server/src/index.ts] | Application error logging and performance tracking [packages/server/src/index.ts]. |
| **Utilities** | `open` | `^11.0.2` (Server), default system open in CLI [packages/server/package.json, packages/cli/src/lib/oauth.ts] | Opens URLs in default system browser during login and checkout flows [packages/cli/src/lib/oauth.ts, packages/cli/src/lib/upgrade.ts] | Cross-platform browser invocation [packages/cli/src/lib/oauth.ts]. |
| **Utilities** | `pretty-ms` | `^9.3.1` [packages/cli/package.json] | Formats duration milliseconds into human-readable strings for UI [packages/cli/src/components/messages/bot-message.tsx] | Displays LLM generation duration in status bar [packages/cli/src/components/messages/bot-message.tsx]. |
| **Utilities** | `date-fns` | `^4.4.0` [packages/cli/package.json] | Date formatting helper (`format(date, "hh:mm a")`) [packages/cli/src/components/dialogs/sessions-dialog.tsx] | Formats session timestamps in dialog lists [packages/cli/src/components/dialogs/sessions-dialog.tsx]. |

---

## 3. Monorepo Structure & Dependency Directions

### Workspace Layout
```
nightcode/
├── package.json               # Root monorepo workspace configuration [package.json]
├── bun.lock                   # Lockfile for Bun workspace dependencies [bun.lock]
├── tsconfig.base.json         # Base TypeScript configuration [tsconfig.base.json]
└── packages/
    ├── shared/                # @nightcode/shared (Contracts, Schemas, Models) [packages/shared/package.json]
    │   └── src/
    │       ├── index.ts       # Re-exports shared definitions [packages/shared/src/index.ts]
    │       ├── models.ts      # LLM model registry & pricing tables [packages/shared/src/models.ts]
    │       └── schemas.ts     # Zod tool input schemas & mode contracts [packages/shared/src/schemas.ts]
    ├── database/              # @nightcode/database (Prisma ORM & PostgreSQL) [packages/database/package.json]
    │   ├── prisma/
    │   │   └── schema.prisma  # Database schema (Session model) [packages/database/prisma/schema.prisma]
    │   └── src/
    │       ├── client.ts      # Prisma client instantiation with PG adapter [packages/database/src/client.ts]
    │       └── index.ts       # Re-exports database client and generated types [packages/database/src/index.ts]
    ├── server/                # @nightcode/server (Hono API Server & AI Layer) [packages/server/package.json]
    │   └── src/
    │       ├── index.ts       # Server entrypoint & Bun HTTP serve config [packages/server/src/index.ts]
    │       ├── system-prompt.ts # System prompt builder for PLAN/BUILD modes [packages/server/src/system-prompt.ts]
    │       ├── lib/           # Auth, credits, models, and Polar helpers [packages/server/src/lib/*]
    │       ├── middleware/    # requireAuth & requireCreditsBalance [packages/server/src/middleware/*]
    │       └── routes/        # auth, billing, chat, sessions routes [packages/server/src/routes/*]
    └── cli/                   # @nightcode/cli (Terminal UI & Local Execution) [packages/cli/package.json]
        ├── bin/
        │   └── nightcode      # Executable CLI entrypoint binary [packages/cli/bin/nightcode]
        └── src/
            ├── index.tsx      # OpenTUI root initialization & memory router [packages/cli/src/index.tsx]
            ├── components/    # UI components, dialogs, messages, command menu [packages/cli/src/components/*]
            ├── hooks/         # useChat custom hook [packages/cli/src/hooks/use-chat.ts]
            ├── layouts/       # Root & Themed layout components [packages/cli/src/layouts/*]
            ├── lib/           # API client, auth storage, local tools, OAuth [packages/cli/src/lib/*]
            ├── providers/     # Dialog, Keyboard, PromptConfig, Theme, Toast [packages/cli/src/providers/*]
            └── screens/       # Home, NewSession, Session screens [packages/cli/src/screens/*]
```

### Dependency Graph & Direction Rules

```
                      +-------------------+
                      | @nightcode/shared |
                      +---------+---------+
                                ^
            +-------------------+-------------------+
            |                                       |
+-----------+-----------+               +-----------+-----------+
|  @nightcode/database  |               |   @nightcode/server   |
+-----------------------+               +-----------+-----------+
                                                    ^
                                                    | (Type Import: AppType)
                                        +-----------+-----------+
                                        |    @nightcode/cli     |
                                        +-----------------------+
```

### Import Rules & Violations Guard
1. **`@nightcode/shared`**: Base package. Must **NEVER** import from `@nightcode/database`, `@nightcode/server`, or `@nightcode/cli` [packages/shared/package.json].
2. **`@nightcode/database`**: Independent database package. Must **NEVER** import from `@nightcode/server` or `@nightcode/cli` [packages/database/package.json].
3. **`@nightcode/server`**: May import `@nightcode/database` and `@nightcode/shared`. Must **NEVER** import runtime code from `@nightcode/cli` [packages/server/package.json].
4. **`@nightcode/cli`**: May import `@nightcode/shared`. May import **TypeScript types only** (`import type { AppType } from "@nightcode/server"`) via Hono RPC client [packages/cli/src/lib/api-client.ts]. Must **NEVER** import server runtime code directly [packages/cli/package.json].

---

## 4. Runtime Flows

### 4.1. Sending a Message & Tool Loop
```
CLI (User Input)         Server (POST /chat)         LLM Provider            CLI (Local Tools)
       |                          |                        |                         |
       |--- POST /chat ---------->|                        |                         |
       |   (id, messages, mode)   |--- streamText() ------>|                         |
       |                          |   (system prompt,      |                         |
       |                          |    model messages)     |                         |
       |                          |<-- Tool Call Request --|                         |
       |<-- Tool Call Stream -----|                        |                         |
       |                          |                        |                         |
       |--- Execute Tool Locally --------------------------------------------------->|
       |                                                                             | (readFile / editFile / bash)
       |<-- Tool Result -------------------------------------------------------------|
       |                          |                        |                         |
       |--- addToolOutput() ----->|                        |                         |
       |                          |--- Resume Stream ----->|                         |
       |                          |<-- Final Text Stream --|                         |
       |<-- Text Output Stream ---|                        |                         |
       |                          | (Save to PostgreSQL)   |                         |
       |                          | (Ingest Polar Usage)   |                         |
```
1. **Trigger**: User enters text into `InputBar` and presses `Enter` [packages/cli/src/components/inputBar.tsx].
2. **CLI Transport Assembly**: `useChat` hook calls `sendMessage()` [packages/cli/src/hooks/use-chat.ts]. `DefaultChatTransport.prepareSendMessagesRequest` packages request payload (`id`, `messages`, `mode`, `model`) and attaches Bearer authorization header from `~/.nightcode/auth.json` [packages/cli/src/hooks/use-chat.ts, packages/cli/src/lib/auth.ts].
3. **Server Validation**: Request hits `POST /chat` [packages/server/src/routes/chat.ts]. `requireAuth` validates token with Clerk [packages/server/src/middleware/require-auth.ts]. `requireCreditsBalance` checks user meter in Polar [packages/server/src/middleware/require-credits-balance.ts]. `submitValidator` validates JSON body against `submitSchema` [packages/server/src/routes/chat.ts].
4. **Session Verification**: Server verifies session exists in database (`db.session.findUnique({ where: { id, userId } })`) [packages/server/src/routes/chat.ts].
5. **Model & Message Preparation**: Server resolves tools via `getToolContracts(mode)` [packages/shared/src/schemas.ts], resolves model via `resolveChatModel(model)` [packages/server/src/lib/models.ts], merges incoming messages with database history, validates UI messages (`validateUIMessages`), and converts them (`convertToModelMessages`) [packages/server/src/routes/chat.ts].
6. **Streaming Generation**: Server calls `streamText` with system prompt generated by `buildSystemPrompt({ mode })` [packages/server/src/system-prompt.ts, packages/server/src/routes/chat.ts].
7. **Tool Call Execution Loop**:
   - If AI emits a tool request (e.g. `readFile`), server streams tool call chunk to CLI [packages/server/src/routes/chat.ts].
   - CLI hook fires `onToolCall` callback and invokes `executeLocalTool(toolName, input, mode)` on local machine [packages/cli/src/hooks/use-chat.ts, packages/cli/src/lib/local-tools.ts].
   - Local tool runs with security guards and returns result payload (or error) [packages/cli/src/lib/local-tools.ts].
   - CLI calls `chat.addToolOutput`, returning result to server [packages/cli/src/hooks/use-chat.ts].
   - Backend resumes `streamText` loop until final completion [packages/server/src/routes/chat.ts].
8. **Final Persistence & Billing**:
   - Upon finish, server updates session `messages` JSON in database (`db.session.update`) [packages/server/src/routes/chat.ts].
   - Server calculates billable credits (`calculateCreditsForUsage`) based on input/output token usage [packages/server/src/lib/credits.ts] and ingests event (`nightcode_usage`) into Polar (`ingestAiUsage`) [packages/server/src/lib/polar.ts, packages/server/src/routes/chat.ts].

---

### 4.2. OAuth 2.0 PKCE Login Flow
```
CLI                       Browser                 Clerk Auth           Server (/auth/callback)
 |                           |                        |                           |
 |-- /login ---------------->|                        |                           |
 |  (Start Bun server port 0)|                        |                           |
 |  (Gen verifier/challenge) |                        |                           |
 |-- Open Browser ----------->|                        |                           |
 |                           |-- Sign In ------------>|                           |
 |                           |<-- Redirect w/ code ---|                           |
 |                           |------------------------|--> GET /auth/callback     |
 |                           |                        |   (Extract port from state|
 |                           |<-- 302 Redirect -------|   (Redirect to CLI port)  |
 |<-- GET /callback ---------|                        |                           |
 |   (code & state)          |                        |                           |
 |-- POST /oauth/token ------------------------------>|                           |
 |<-- Bearer Token -----------------------------------|                           |
 |-- Save auth.json ---------|                        |                           |
 |-- Stop local server ------|                        |                           |
```
1. User executes `/login` command [packages/cli/src/components/command-menu/commands.tsx].
2. CLI starts temporary local HTTP server using `Bun.serve({ port: 0 })` [packages/cli/src/lib/oauth.ts].
3. CLI generates cryptographic `nonce`, 32-byte PKCE `code_verifier`, and SHA-256 `code_challenge` (base64url encoded via `crypto.subtle.digest`) [packages/cli/src/lib/oauth.ts].
4. CLI builds Clerk authorize URL with `response_type=code`, `client_id`, `redirect_uri=${apiUrl}/auth/callback`, `scope=openid email profile`, `state=encodeState({port, nonce})`, and `code_challenge` [packages/cli/src/lib/oauth.ts].
5. CLI invokes `open(authorizeUrl)` to launch system web browser [packages/cli/src/lib/oauth.ts].
6. User authenticates on Clerk page. Clerk redirects browser to backend route `GET /auth/callback?code=...&state=...` [packages/server/src/routes/auth.ts].
7. Backend extracts `port` from state JSON payload and redirects browser to `http://localhost:${port}/callback?code=...&state=...` [packages/server/src/routes/auth.ts].
8. CLI local server handles `/callback` request, validates `nonce` against state, and sends `POST` request to `${clerkFrontendApi}/oauth/token` with `grant_type: authorization_code`, `code`, `code_verifier`, `client_id`, and `redirect_uri` [packages/cli/src/lib/oauth.ts].
9. CLI receives `access_token` and calls `saveAuth({ token })`, writing to `~/.nightcode/auth.json` with `0o700` directory and `0o600` file permissions [packages/cli/src/lib/auth.ts, packages/cli/src/lib/oauth.ts].
10. Local server returns success HTML page to browser, shuts down HTTP server after 500ms, and resolves login promise [packages/cli/src/lib/oauth.ts].

---

### 4.3. Session Creation, Saving, and Loading
*   **Creation**: User submits prompt on home screen [packages/cli/src/screens/home.tsx]. CLI navigates to `/sessions/new`, sending `POST /sessions` with `{ title: prompt.slice(0, 100) }` [packages/cli/src/screens/new-session.tsx]. Server verifies auth, checks credits balance, creates `Session` record in database via `db.session.create({ data: { title, userId } })`, and returns session JSON [packages/server/src/routes/sessions.ts].
*   **Saving**: During streaming chat generation in `POST /chat`, when the stream finishes (`onFinish`), the backend updates the database record via `db.session.update({ where: { id, userId }, data: { messages } })` [packages/server/src/routes/chat.ts].
*   **Listing & Loading**: Executing `/sessions` command opens dialog [packages/cli/src/components/command-menu/commands.tsx]. Dialog calls `GET /sessions`, returning sessions ordered by `createdAt desc` [packages/server/src/routes/sessions.ts]. User selects session, navigating to `/sessions/:id` [packages/cli/src/components/dialogs/sessions-dialog.tsx]. CLI calls `GET /sessions/:id`, which queries database (`db.session.findUnique({ where: { id, userId } })`) and returns stored message history [packages/server/src/routes/sessions.ts].

---

### 4.4. Credit Check and Usage Reporting
1. **Pre-Flight Validation**: Middleware `requireCreditsBalance` intercept requests to `POST /chat` and `POST /sessions` [packages/server/src/routes/chat.ts, packages/server/src/routes/sessions.ts].
2. **Polar State Lookup**: Middleware calls `getAvailableCreditsBalance(userId)` which executes `polar.customers.getStateExternal({ externalId: userId })` [packages/server/src/lib/polar.ts, packages/server/src/middleware/require-credits-balance.ts].
3. **Balance Decision**: If matching meter balance is `<= 0`, returns HTTP 402 (`{ error: "No credits remaining. Run /upgrade to buy more credits." }`) [packages/server/src/middleware/require-credits-balance.ts]. If customer not found (404), defaults balance to `0` and rejects [packages/server/src/lib/polar.ts].
4. **Token Cost Calculation**: Upon stream completion, backend retrieves `totalUsage` (`inputTokens`, `outputTokens`) [packages/server/src/routes/chat.ts]. `calculateCreditsForUsage` retrieves model pricing from `SUPPORTED_CHAT_MODELS` [packages/shared/src/models.ts], calculates USD cost `(inputTokens * inputRate + outputTokens * outputRate) / 1,000,000`, and converts USD to credits `Math.max(1, Math.ceil(cost / 0.1))` [packages/server/src/lib/credits.ts].
5. **Polar Meter Ingestion**: `ingestAiUsage` calls `polar.events.ingest({ events: [{ name: "nightcode_usage", externalId: eventId, externalCustomerId: userId, metadata: { credits } }] })` [packages/server/src/lib/polar.ts].

---

## 5. AI Layer

### Model & Provider Registry
All models and pricing are declared in `packages/shared/src/models.ts`:

```typescript
// Registered in packages/shared/src/models.ts
export const SUPPORTED_CHAT_MODELS = [
  { id: "qwen/qwen3.6-27b", provider: "groq", pricing: { inputUsdPerMillionTokens: 0.59, outputUsdPerMillionTokens: 0.79 } },
  { id: "openai/gpt-oss-120b", provider: "groq", pricing: { inputUsdPerMillionTokens: 0.05, outputUsdPerMillionTokens: 0.08 } },
  { id: "gemini-3.8-flash", provider: "gemini", pricing: { inputUsdPerMillionTokens: 0.075, outputUsdPerMillionTokens: 0.3 } },
  { id: "gemini-3.5-flash-lite", provider: "gemini", pricing: { inputUsdPerMillionTokens: 1.25, outputUsdPerMillionTokens: 5.0 } },
  { id: "cohere/north-mini-code:free", provider: "openrouter", pricing: { inputUsdPerMillionTokens: 0, outputUsdPerMillionTokens: 0 } },
  { id: "poolside/laguna-xs-2.1:free", provider: "openrouter", pricing: { inputUsdPerMillionTokens: 0, outputUsdPerMillionTokens: 0 } },
  { id: "auto/coding", provider: "omnirouter", pricing: { inputUsdPerMillionTokens: 0.1, outputUsdPerMillionTokens: 0.3 } },
] as const;
```

### Provider Resolution & Provider-Specific Options
Model instantiation is handled in `packages/server/src/lib/models.ts`:
* **Gemini Provider Options**: `gemini-3.5-flash-lite` configures thinking budget `10,000`; `gemini-3.8-flash` configures thinking budget `15,000` via `@ai-sdk/google` options (`includeThoughts: true`) [packages/server/src/lib/models.ts].
* **Groq Provider Options**: `qwen/qwen3.6-27b` configures `reasoningFormat: "parsed"`, `reasoningEffort: "default"`, `serviceTier: "on_demand"` [packages/server/src/lib/models.ts].
* **OpenRouter Provider Options**: Instantiated via `createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY })` [packages/server/src/lib/models.ts].
* **Omnirouter Provider Options**: Instantiated via `createOpenAI({ apiKey, baseURL: process.env.OMNIROUTER_BASE_URL || "https://api.omnirouter.ai/v1" })` [packages/server/src/lib/models.ts].

### Exact Files to Touch to Add a New Model or Provider
1. `packages/shared/src/models.ts`: Add model entry object to `SUPPORTED_CHAT_MODELS` array (include `id`, `provider`, and `pricing` USD per million tokens) [packages/shared/src/models.ts].
2. `packages/server/src/lib/models.ts`:
   - If adding a model to an existing provider: update provider model ID union type and add any optional provider configurations [packages/server/src/lib/models.ts].
   - If adding a new provider: add provider SDK import, update `SupportedProvider` type, create provider resolver function (`resolveNewProviderModel`), and add switch case in `resolveSupportedChatModel` [packages/server/src/lib/models.ts].

---

## 6. Local Tool Execution and Security

Tools are executed locally by the CLI process in `packages/cli/src/lib/local-tools.ts`.

### Tool Inventory & Operational Limits

| Tool Name | Input Schema | Caps & Timeouts | Operational Description | Enforcing File |
| :--- | :--- | :--- | :--- | :--- |
| `readFile` | `{ path: string }` | Output capped at `10,000` characters (`MAX_FILE_SIZE`). Truncates if larger. | Reads UTF-8 file contents from workspace directory. | [packages/cli/src/lib/local-tools.ts] |
| `listDirectory` | `{ path?: string }` | Excludes hidden files (`.`), `node_modules`, and `.env*`. | Readdir listing directory entries, sorted directories first then files. | [packages/cli/src/lib/local-tools.ts] |
| `glob` | `{ pattern: string, path?: string }` | Results capped at `200` files (`MAX_RESULTS`). Excludes `node_modules` and `.env*`. | Scans matching files using `Bun.Glob`. | [packages/cli/src/lib/local-tools.ts] |
| `grep` | `{ pattern: string, path?: string, include?: string }` | Results capped at `50` matches (`MAX_MATCHES`). Excludes `node_modules`, `.git`, `.env*`. | Spawns system `grep -rn -E` process. | [packages/cli/src/lib/local-tools.ts] |
| `writeFile` | `{ path: string, content: string }` | Creates directories recursively (`recursive: true`). | Overwrites or creates target file with UTF-8 content. | [packages/cli/src/lib/local-tools.ts] |
| `editFile` | `{ path: string, oldString: string, newString: string }` | Requires exact match. Fails if occurrences `=== 0` or `> 1`. | Replaces unique text string in target file. | [packages/cli/src/lib/local-tools.ts] |
| `bash` | `{ command: string, description?: string, timeout?: number }` | Timeout `30,000` ms (`DEFAULT_TIMEOUT`). Output capped at `20,000` chars (`MAX_OUTPUT`). | Spawns `bash -c <command>` process with `TERM=dumb`. | [packages/cli/src/lib/local-tools.ts] |

### Security Guards

1. **Path Traversal Guard**: `resolveInsideCwd(targetPath)` resolves absolute path against `process.cwd()`. If `relative(cwd, resolved)` starts with `..` or `isAbsolute`, throws `"Path is outside the project directory"` [packages/cli/src/lib/local-tools.ts].
2. **`.env` File Protection**:
   - File/Glob/Grep Tools: Checks if normalized relative path equals `.env`, starts with `.env`, or contains `/.env`. Throws `"Access to .env files is forbidden"` [packages/cli/src/lib/local-tools.ts].
   - Bash Command Guard: Scans command string against regex `/\b(cat|less|more|head|tail|grep|awk|sed|cp|mv)\s+.*\.env/i` and `/\.env\b/i`. Throws `"Access to .env files via bash command is strictly forbidden"` [packages/cli/src/lib/local-tools.ts].
3. **Agent Mode Restriction Guard**: In `PLAN` mode, `executeLocalTool` blocks execution of write tools (`writeFile`, `editFile`, `bash`). Throws `"Tool X is not available in PLAN mode"` [packages/cli/src/lib/local-tools.ts].

---

## 7. Data Layer

### Database Configuration
* **Database Technology**: PostgreSQL accessed via Prisma ORM (`@prisma/client` 7.10.0) with `@prisma/adapter-pg` driver adapter [packages/database/package.json, packages/database/src/client.ts].
* **Schema Location**: `packages/database/prisma/schema.prisma` [packages/database/prisma/schema.prisma].
* **Prisma Configuration File**: `packages/database/prisma7.config.ts` [packages/database/prisma7.config.ts].

### Table Definitions

```prisma
// packages/database/prisma/schema.prisma
model Session {
  id        String   @id @default(cuid())
  userId    String
  title     String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  messages  Json     @default("[]")

  @@index([userId])
}
```

### Data Stored Outside Database
* **Local Auth Token**: Stored in `~/.nightcode/auth.json` (`{ token: string }`) with POSIX permissions `0o700` (directory) and `0o600` (file) [packages/cli/src/lib/auth.ts].
* **Local Theme Preference**: Stored in `~/.nightcode/preferences.json` (`{ themeName: string }`) [packages/cli/src/providers/theme/index.tsx].
* **User Identity Store**: Managed externally by Clerk Authentication. No relational `User` table exists in PostgreSQL [packages/database/prisma/schema.prisma, packages/server/src/lib/auth.ts].
* **Billing Meters & Customer Balance**: Managed externally by Polar (`polar.customers.getStateExternal`) [packages/server/src/lib/polar.ts].

---

## 8. Shared Contracts

The `@nightcode/shared` package defines TypeScript contracts imported by both `@nightcode/cli` and `@nightcode/server` [packages/shared/package.json]:

1. **Agent Modes & Schema**:
   - `Mode = { BUILD: "BUILD", PLAN: "PLAN" }` [packages/shared/src/schemas.ts].
   - `modeSchema = z.enum([Mode.BUILD, Mode.PLAN])` [packages/shared/src/schemas.ts].
2. **Tool Input Schemas & Tool Contracts**:
   - `toolInputSchemas`: Zod validation schemas for `readFile`, `listDirectory`, `glob`, `grep`, `writeFile`, `editFile`, and `bash` [packages/shared/src/schemas.ts].
   - `readOnlyToolContracts` vs `buildToolContracts`: Vercel AI SDK `tool()` declarations [packages/shared/src/schemas.ts].
   - `getToolContracts(mode)`: Returns read-only tools for `PLAN` mode and full tools for `BUILD` mode [packages/shared/src/schemas.ts].
3. **Supported LLM Models & Pricing Registry**:
   - `SUPPORTED_CHAT_MODELS`: Array of supported model definitions with provider name and token pricing (`inputUsdPerMillionTokens`, `outputUsdPerMillionTokens`) [packages/shared/src/models.ts].
   - `DEFAULT_CHAT_MODEL_ID = "gemini-3.5-flash-lite"` [packages/shared/src/models.ts].
   - `findSupportedChatModel(modelId)`: Helper to locate model definition by string ID [packages/shared/src/models.ts].

---

## 9. Configuration

### Environment Variables Matrix

| Environment Variable | Package | Status | Purpose | Consequence if Missing | File Path Reference |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `DATABASE_URL` | `@nightcode/database` | Required | PostgreSQL database connection string | Server fails on boot (`"DATABASE_URL is not set"`) | [packages/database/src/client.ts] |
| `CLERK_SECRET_KEY` | `@nightcode/server` | Required | Clerk backend API secret key | Server fails on boot (`"CLERK_SECRET_KEY... is required"`) | [packages/server/src/lib/auth.ts] |
| `CLERK_PUBLISHABLE_KEY` | `@nightcode/server` | Required | Clerk frontend publishable key | Server fails on boot (`"CLERK_PUBLISHABLE_KEY... is required"`) | [packages/server/src/lib/auth.ts] |
| `CLERK_FRONTEND_API` | `@nightcode/cli` | Required (Login) | Clerk frontend API domain URL | CLI `/login` throws `"CLERK_FRONTEND_API not set"` | [packages/cli/src/lib/oauth.ts] |
| `CLERK_OAUTH_CLIENT_ID` | `@nightcode/cli` | Required (Login) | Clerk OAuth client ID | CLI `/login` throws `"CLERK_OAUTH_CLIENT_ID not set"` | [packages/cli/src/lib/oauth.ts] |
| `POLAR_ACCESS_TOKEN` | `@nightcode/server` | Required (Billing) | Polar API access token | Server billing functions throw `"POLAR_ACCESS_TOKEN... is required"` | [packages/server/src/lib/polar.ts] |
| `POLAR_PRODUCT_ID` | `@nightcode/server` | Required (Billing) | Polar credits product ID | Server checkout fails (`"POLAR_PRODUCT_ID... is required"`) | [packages/server/src/lib/polar.ts] |
| `POLAR_CREDITS_METER_ID` | `@nightcode/server` | Required (Billing) | Polar credit meter ID | Credit check fails (`"POLAR_CREDITS_METER_ID... is required"`) | [packages/server/src/lib/polar.ts] |
| `POLAR_SERVER` | `@nightcode/server` | Optional | Polar environment (`sandbox` or `production`) | Defaults to `"sandbox"` | [packages/server/src/lib/polar.ts] |
| `OPENROUTER_API_KEY` | `@nightcode/server` | Optional | OpenRouter API key | OpenRouter models fail API authentication | [packages/server/src/lib/models.ts] |
| `OMNIROUTER_API_KEY` | `@nightcode/server` | Optional | Omnirouter API key | Omnirouter models fail API authentication | [packages/server/src/lib/models.ts] |
| `OMNIROUTER_BASE_URL` | `@nightcode/server` | Optional | Custom base URL for Omnirouter | Defaults to `"https://api.omnirouter.ai/v1"` | [packages/server/src/lib/models.ts] |
| `PORT` | `@nightcode/server` | Optional | Server HTTP listening port | Defaults to `3000` | [packages/server/src/index.ts] |
| `API_URL` | `@nightcode/cli` | Optional | Server API base URL for RPC & OAuth callback | Defaults to `"http://localhost:3000"` | [packages/cli/src/lib/api-client.ts] |

### Local Files Created on User Machine
1. `~/.nightcode/auth.json`: Stores OAuth Bearer token [packages/cli/src/lib/auth.ts].
2. `~/.nightcode/preferences.json`: Stores selected color theme preference [packages/cli/src/providers/theme/index.tsx].

---

## 10. Build, Run, and Deploy

### Monorepo Scripts (`package.json`)
* **Install Dependencies**: `bun install` [package.json].
* **Start Server in Development**: `bun run dev:server` (executes `bun run --hot packages/server/src/index.ts`) [package.json, packages/server/package.json].
* **Start CLI in Development**: `bun run dev:cli` (executes `bun run --watch packages/cli/src/index.tsx`) [package.json, packages/cli/package.json].
* **Build CLI Binary**: `bun run build:cli` (executes `bun build src/index.tsx --outdir dist --target bun --external @opentui/core`) [package.json, packages/cli/package.json].
* **Link CLI Binary Globally**: `bun run link:cli` (builds CLI and runs `bun link` inside `packages/cli`) [package.json].
* **Generate Prisma Client**: `bun run --cwd packages/database db:generate` (executes `bunx prisma generate`) [packages/database/package.json].

### Deployment Setup
* **Server Deployment**: `bun run --cwd packages/server build` bundles `src/index.ts` to `dist/index.js` targeting the Bun runtime [packages/server/package.json]. Runnable via `bun packages/server/dist/index.js` or `bun packages/server/src/index.ts` [packages/server/package.json].
* **Deployment Config Files**: No Dockerfiles or cloud deployment manifests (such as Kubernetes or Terraform) exist in the repository [UNCLEAR: no container or cloud infrastructure files found].

---

## 11. External Services

| Service Name | Purpose | Failure Consequence | File Path Reference |
| :--- | :--- | :--- | :--- |
| **Clerk Authentication** | User authentication & OAuth token issue/validation | User login (`/login`) fails; API requests return HTTP 401 Unauthorized | [packages/server/src/lib/auth.ts, packages/cli/src/lib/oauth.ts] |
| **Polar Billing** | Customer credit balance verification & token usage metering | Pre-flight check returns HTTP 503 ("Unable to verify credits balance right now"); checkout fails | [packages/server/src/lib/polar.ts, packages/server/src/middleware/require-credits-balance.ts] |
| **Google Gemini API** | AI model generation (`gemini-3.5-flash-lite`, `gemini-3.8-flash`) | Stream returns provider error message in chat UI | [packages/server/src/lib/models.ts] |
| **Groq API** | AI model generation (`qwen/qwen3.6-27b`, `openai/gpt-oss-120b`) | Stream returns provider error message in chat UI | [packages/server/src/lib/models.ts] |
| **OpenRouter API** | AI model generation (`cohere/north-mini-code:free`, `poolside/laguna-xs-2.1:free`) | Stream returns provider error message in chat UI | [packages/server/src/lib/models.ts] |
| **Omnirouter API** | Custom AI gateway generation (`auto/coding`) | Stream returns provider error message in chat UI | [packages/server/src/lib/models.ts] |
| **Sentry Telemetry** | Server error logging and metric collection | Log collection fails silently; server continues processing HTTP requests | [packages/server/src/index.ts] |

---

## 12. Technical Debt and Risks

1. **Hardcoded Telemetry Secret**: Sentry DSN URL (`https://72a8408b8994e8...`) is hardcoded directly in server source code instead of referencing an environment variable [packages/server/src/index.ts].
2. **Debug Test Endpoint Exposed**: Unused debug endpoint `GET /debug-sentry` remains registered in production app router, throwing intentional runtime test errors [packages/server/src/index.ts].
3. **No OAuth Refresh Token Exchange**: CLI saves `access_token` but does not handle refresh token rotation. Expired tokens trigger HTTP 401, which immediately deletes `auth.json` and forces manual re-authentication [packages/cli/src/lib/api-client.ts, packages/cli/src/lib/auth.ts].
4. **Coarse Credit Conversion Math**: `convertUsdToCredits` uses `$0.10` USD per credit and applies `Math.ceil()`. Any non-zero USD cost invocation (even $0.00001 USD) charges 1 full credit to the user [packages/server/src/lib/credits.ts].
5. **Non-Interactive Shell Execution Limits**: `executeLocalTool("bash", ...)` runs non-interactive `Bun.spawn` processes. Interactive commands (e.g. `npm init`, `sudo`) stall until reaching the 30-second timeout [packages/cli/src/lib/local-tools.ts].
6. **Missing Session Management Endpoints**: Neither CLI UI nor backend API endpoints support deleting sessions or updating session titles [packages/server/src/routes/sessions.ts].
7. **Version Discrepancy in Monorepo Dependencies**: Dependency `ai` is set to `^7.0.99` in `packages/cli` and `packages/shared`, but `^7.0.93` in `packages/server` [packages/cli/package.json, packages/server/package.json, packages/shared/package.json].
8. **Lack of Automated Test Suites**: No automated unit, integration, or end-to-end test files exist anywhere in the repository [UNCLEAR: test suites not present in project tree].

---

## 13. Open Questions

1. `UNCLEAR:` Selection rationale for core tools (Bun, OpenTUI, Hono, Prisma) is not documented in code comments or repository ADRs [package.json, packages/cli/package.json, packages/server/package.json].
2. `UNCLEAR:` Hardcoded Sentry DSN in server entrypoint [packages/server/src/index.ts] — whether intended for production telemetry or a legacy development setting.
3. `UNCLEAR:` Version mismatch of `ai` SDK (`^7.0.99` in CLI/shared vs `^7.0.93` in server) [packages/cli/package.json, packages/server/package.json].
4. `UNCLEAR:` Containerization and cloud deployment scripts/manifests (Docker, Terraform, etc.) are absent from repository [packages/server/package.json].
