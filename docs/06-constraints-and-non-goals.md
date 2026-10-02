# Nightcode — Constraints and Non-Goals Document

---

## 1. How to Use This Document

This document defines the strict operational boundaries, security constraints, performance caps, and explicit non-goals for the Nightcode application. It must be read before planning, designing, or implementing any new feature. **Rule**: If a requested code change or feature proposal breaks any constraint, limit, or non-goal defined in this document, stop immediately and consult the project owner before building.

---

## 2. Non-Goals

### Features and Scope Excluded by Design

| Feature / Capability | Classification | One-Line Rationale | Decision Origin |
| :--- | :--- | :--- | :--- |
| **Graphical IDE / GUI Window** | `NON-GOAL` | Nightcode is strictly a terminal-native application; it will not build a desktop GUI or browser DOM editor. | Owner Decision [docs/01-product-description.md] |
| **Multi-User Session Sharing** | `NON-GOAL` | Sessions are private to individual developers; no real-time co-editing or session sharing features will be built. | Owner Decision [docs/01-product-description.md] |
| **Self-Hosted / Local LLMs** | `NON-GOAL` | Relies exclusively on cloud model provider APIs; local execution runtimes (such as Ollama) are explicitly excluded. | Owner Decision [docs/01-product-description.md] |
| **Cloud Workspace Syncing** | `NON-GOAL` | Code files remain local on the user's host filesystem; workspace code is not backed up or hosted on remote servers. | Owner Decision [docs/01-product-description.md] |
| **Database User Profile Store** | `NON-GOAL` | Clerk is the sole user identity store by design; the database will not store a separate relational `User` table. | Owner Decision [docs/01-product-description.md] |
| **Inbound Billing Webhooks** | `NON-GOAL` | Credit balances are checked live via Polar's API prior to processing requests; no billing webhook endpoints will be added. | Owner Decision [docs/01-product-description.md] |

### Deferred Capabilities ("Maybe Later")
* **Session Renaming and Deletion**: Deferred for future versions; current API routes and CLI screens support session creation and history reading only [packages/server/src/routes/sessions.ts].
* **Automated Unit & E2E Test Suite**: Deferred for future versions; current repository contains no automated test setup [package.json].

---

## 3. Scope Boundaries by Area

| Area | In-Scope (Current Version) | Out-of-Scope (Excluded / Future) |
| :--- | :--- | :--- |
| **CLI UI (`@nightcode/cli`)** | OpenTUI terminal UI, prompt input bar, `@` file mentions, `/` slash commands, modal dialogs, local tool execution engine, 16 theme presets. | IDE plugins (VS Code / JetBrains), mouse text selection inside scrollviews, custom HEX color theme builders. |
| **Server (`@nightcode/server`)** | Hono API routes (`/auth`, `/sessions`, `/chat`, `/billing`), Clerk OAuth verification, Polar credit checks & token metering, LLM stream routing. | Inbound webhook endpoints, user profile management CRUD, background worker job queues. |
| **Database (`@nightcode/database`)** | PostgreSQL relational database, Prisma ORM, `Session` model storing `userId`, `title`, timestamps, and `messages` JSON array. | Relational `User` table, foreign key constraints, soft delete columns (`deletedAt`), optimistic concurrency versioning (`@version`). |
| **AI Layer** | Google Gemini (`gemini-3.5-flash-lite`, `gemini-3.8-flash`), Groq (`qwen/qwen3.6-27b`, `openai/gpt-oss-120b`), OpenRouter, Omnirouter (`auto/coding`). | Local Ollama models, custom temperature/system prompt configuration sliders per user, model fine-tuning workflows. |
| **Billing & Credits** | Pre-flight credit checks via Polar API, token usage ingestion (`nightcode_usage` event), browser checkout & customer portal URL generation. | Native credit card payment forms inside terminal UI, custom promotional coupon engines, localized currency checkout. |
| **Authentication** | Clerk OAuth 2.0 PKCE browser flow, local token storage in `~/.nightcode/auth.json`, HTTP Bearer header validation. | Terminal-native username/password forms, SAML SSO enterprise integration, multi-tenant team management. |

---

## 4. Cost and Token Constraints

### Pricing and Credit Accounting Rules
* `ENFORCED`: Token costs are calculated using provider-specific rates defined in `SUPPORTED_CHAT_MODELS` [packages/shared/src/models.ts, packages/server/src/lib/credits.ts].
* `ENFORCED`: Estimated USD costs are converted to credits at `$0.10` USD per credit, rounded up to the nearest integer (`Math.ceil`), with a minimum of 1 credit charged for non-free models [packages/server/src/lib/credits.ts].
* `ENFORCED`: Pre-flight middleware (`requireCreditsBalance`) blocks chat generation and session creation if user credit balance is `<= 0` [packages/server/src/middleware/require-credits-balance.ts].

### Token Reduction Goals & Context Rules
* `INTENDED`: Features must optimize context window usage; a typical task should aim to use 60% to 70% of the tokens it uses today [docs/06-constraints-and-non-goals.md].
* `ENFORCED`: Selective request packaging (`prepareSendMessagesRequest`) sends only the relevant message pair for the active turn rather than re-transmitting redundant request wrappers [packages/cli/src/hooks/use-chat.ts].
* `INTENDED`: New features must avoid sending full workspace files or unneeded historical turns when targeted snippets or summaries suffice [docs/06-constraints-and-non-goals.md].

---

## 5. Performance Constraints

### Enforced Operational Caps and Timeouts

| Operational Boundary | Exact Cap / Limit | Enforcement Mechanism | File Path Reference |
| :--- | :--- | :--- | :--- |
| **File Read Cap (`readFile`)** | `10,000` characters (`MAX_FILE_SIZE`) | Truncates output and returns `truncate: true` | [packages/cli/src/lib/local-tools.ts] |
| **Glob Match Cap (`glob`)** | `200` file paths (`MAX_RESULTS`) | Truncates array and returns `truncated: true` | [packages/cli/src/lib/local-tools.ts] |
| **Grep Match Cap (`grep`)** | `50` line matches (`MAX_MATCHES`) | Truncates results and returns `truncated: true` | [packages/cli/src/lib/local-tools.ts] |
| **Bash Output Cap (`bash`)** | `20,000` characters (`MAX_OUTPUT`) | Truncates stdout and stderr strings | [packages/cli/src/lib/local-tools.ts] |
| **Bash Process Timeout (`bash`)** | `30,000` ms (`DEFAULT_TIMEOUT`) | Kills spawned process via `clearTimeout` timer | [packages/cli/src/lib/local-tools.ts] |
| **OAuth Login Timeout** | `5` minutes (`5 * 60 * 1000` ms) | Stops local loopback server and rejects login | [packages/cli/src/lib/oauth.ts] |
| **Server HTTP Idle Timeout** | `255` seconds (`idleTimeout`) | Bun HTTP server socket idle timeout configuration | [packages/server/src/index.ts] |
| **Session Title Length** | `100` characters max | Truncates prompt string (`state.message.slice(0, 100)`) | [packages/cli/src/screens/new-session.tsx] |

### Responsiveness Expectations
* `INTENDED`: UI rendering must remain responsive (targeting 60 FPS terminal frame buffer updates) while streaming AI token responses [docs/06-constraints-and-non-goals.md].
* `INTENDED`: CLI slash commands and local dialog navigation should respond in under 1 second [docs/06-constraints-and-non-goals.md].
* `ENFORCED`: Long-running local tools or network streams must execute asynchronously without blocking the terminal event loop [packages/cli/src/hooks/use-chat.ts, packages/cli/src/lib/local-tools.ts].

---

## 6. Security Constraints

### Enforced Security Guards

1. **Path Traversal Guard**:
   * `ENFORCED`: `resolveInsideCwd(targetPath)` resolves absolute paths against `process.cwd()`. Throws `"Path is outside the project directory"` if target path escapes the workspace root [packages/cli/src/lib/local-tools.ts].
2. **`.env` Secret File Protection**:
   * `ENFORCED`: Local tools strictly block access to files matching `.env*`. Throws `"Access to .env files is forbidden"` for file/glob/grep tools [packages/cli/src/lib/local-tools.ts].
   * `ENFORCED`: Bash command guard scans commands against regex `/\b(cat|less|more|head|tail|grep|awk|sed|cp|mv)\s+.*\.env/i` and `/\.env\b/i`. Throws `"Access to .env files via bash command is strictly forbidden"` [packages/cli/src/lib/local-tools.ts].
3. **Agent Mode Access Restrictions**:
   * `ENFORCED`: `executeLocalTool` blocks write tools (`writeFile`, `editFile`, `bash`) while in `PLAN` mode. Throws `"Tool X is not available in PLAN mode"` [packages/cli/src/lib/local-tools.ts].
4. **Authentication Bearer Guard**:
   * `ENFORCED`: `requireAuth` middleware verifies Clerk OAuth Bearer tokens on protected backend routes. Rejects unauthenticated calls with HTTP 401 [packages/server/src/middleware/require-auth.ts].

### Local Execution Sandbox Nature
* `ENFORCED`: Local tools execute under the privileges of the host OS user running the CLI binary [packages/cli/src/lib/local-tools.ts]. Security guards are application-level input checks, **NOT a secure OS container sandbox** (e.g., Docker or `chroot`) [packages/cli/src/lib/local-tools.ts].

### Data Transmission & Logging Restrictions
* `INTENDED`: OAuth tokens, database credentials, Clerk keys, and `.env` contents must NEVER be written to console output or Sentry telemetry logs [docs/06-constraints-and-non-goals.md, packages/server/src/index.ts].
* `ENFORCED`: Workspace file contents read via `readFile`, regex search strings, user prompts, and non-sensitive tool outputs travel over HTTPS to third-party AI model providers during generation [packages/server/src/routes/chat.ts, packages/server/src/lib/models.ts].

---

## 7. Platform and Environment Constraints

### Supported Platforms & Runtimes
* `INTENDED`: Supported operating systems are macOS, Linux, and Windows via WSL [docs/06-constraints-and-non-goals.md].

### Required Host Tools & Runtimes
* `ENFORCED`: Bun JavaScript runtime `>=1.3.0` [package.json, packages/cli/package.json].
* `ENFORCED`: System `bash` shell executable available in system PATH (required for `executeLocalTool("bash", ...)` and CLI execution) [packages/cli/src/lib/local-tools.ts].
* `ENFORCED`: System `grep` binary available in system PATH (required for `executeLocalTool("grep", ...)` spawn) [packages/cli/src/lib/local-tools.ts].
* `ENFORCED`: Running PostgreSQL database server instance [packages/database/src/client.ts].

---

## 8. Dependency and Infrastructure Constraints

### Infrastructure Services & Budget Limits
* `INTENDED`: Infrastructure relies on free-tier external services where possible; no paid database tier expansions beyond current allocation [docs/06-constraints-and-non-goals.md].
* External dependency map:
  - **Clerk**: User authentication & OAuth issue [packages/server/src/lib/auth.ts].
  - **Polar**: Billing credit meters & checkout sessions [packages/server/src/lib/polar.ts].
  - **Google Gemini / Groq / OpenRouter / Omnirouter**: AI model inference APIs [packages/server/src/lib/models.ts].
  - **Sentry**: Telemetry tracking [packages/server/src/index.ts].

### Rules for Adding New Dependencies
* `INTENDED`: Developers must evaluate package bundle size, license compatibility, and obtain owner approval before adding new npm dependencies [docs/06-constraints-and-non-goals.md].

---

## 9. Data and Privacy Constraints

* `ENFORCED`: PostgreSQL stores user prompt text, AI text responses, reasoning text, tool call input parameters, and tool execution output payloads in `Session.messages` JSON array [packages/database/prisma/schema.prisma, packages/server/src/routes/chat.ts].
* `ENFORCED`: User credentials (`auth.json`) are stored locally in the home directory (`~/.nightcode`) with POSIX `0o600` file permissions [packages/cli/src/lib/auth.ts].
* `ENFORCED`: Sensitive `.env` files are strictly excluded from tool reading, listing, and LLM context transmission [packages/cli/src/lib/local-tools.ts].

---

## 10. Reliability and Compatibility Constraints

* `ENFORCED`: The Hono RPC interface (`AppType`) exported by `@nightcode/server` MUST remain type-compatible with `@nightcode/cli` API client invocations [packages/server/src/index.ts, packages/cli/src/lib/api-client.ts].
* `ENFORCED`: The JSON array structure of `Session.messages` (`NightcodeUIMessage`) MUST remain backward-compatible with historical session records stored in PostgreSQL [packages/database/prisma/schema.prisma, packages/server/src/routes/chat.ts].
* `ENFORCED`: Modifying `Session` model fields in `schema.prisma` requires running `bun run --cwd packages/database db:generate` [packages/database/package.json].

---

## 11. Hard Rules for AI Agents Working on This Project

### MUST ALWAYS
1. **Always Verify Path Guards**: Ensure any new file or system tool validates paths using `resolveInsideCwd()` and checks `.env` security guards [packages/cli/src/lib/local-tools.ts].
2. **Always Use Typed Hono RPC**: Maintain type export `AppType` in `packages/server/src/index.ts` when modifying server API routes [packages/server/src/index.ts].
3. **Always Synchronize `@nightcode/shared`**: Update shared schemas (`schemas.ts`) and model definitions (`models.ts`) when modifying tool contracts or model choices [packages/shared/src/*].
4. **Always Regenerate Prisma Client**: Run `bun run --cwd packages/database db:generate` after changing database schema [packages/database/package.json].
5. **Always Preserve File Permissions**: Maintain POSIX `0o700` directory and `0o600` file permissions when handling local auth files [packages/cli/src/lib/auth.ts].
6. **Always Update Documentation**: Update documentation files (`docs/01` to `docs/06`) whenever adding features, endpoints, models, or environment variables [docs/*].

### MUST NEVER
1. **Never Access `.env` Files**: Never bypass `.env` protection checks in local tools or bash commands [packages/cli/src/lib/local-tools.ts].
2. **Never Commit Secrets or API Keys**: Never hardcode API keys, secrets, OAuth tokens, or real credentials into source code [packages/server/src/lib/auth.ts].
3. **Never Build GUI / IDE Interfaces**: Never introduce DOM HTML interfaces, desktop GUI windows, or IDE extension modules [docs/01-product-description.md].
4. **Never Direct-Import Server/Database Code into CLI**: Never import `@nightcode/database` or server runtime modules directly inside `@nightcode/cli` [packages/cli/package.json].
5. **Never Bypass Credit Verification**: Never expose AI streaming endpoints without applying `requireCreditsBalance` middleware [packages/server/src/routes/chat.ts, packages/server/src/middleware/require-credits-balance.ts].

---

## 12. Known Violations

1. **Hardcoded Telemetry Secret**: Sentry DSN ingest URL is hardcoded in server index [packages/server/src/index.ts].
2. **Exposed Test Endpoint**: Unused debug endpoint `GET /debug-sentry` remains exposed in server router [packages/server/src/index.ts].
3. **Commented Mock Code**: Commented mock error and delay blocks exist in route source code [packages/server/src/routes/sessions.ts].
4. **Missing Rate Limiting**: Server endpoints lack rate-limiting middleware, leaving routes open to burst abuse [packages/server/src/index.ts].
5. **Missing Session List Pagination**: `GET /sessions` loads all historical sessions for a user without pagination [packages/server/src/routes/sessions.ts].
6. **Dependency Version Discrepancy**: Dependency `ai` is pinned to `^7.0.99` in CLI/shared but `^7.0.93` in server [packages/cli/package.json, packages/server/package.json].

---

## 13. Undecided Items

1. `UNDECIDED:` Maximum token context budget per session turn — whether to enforce hard message history truncations for long conversations [packages/server/src/routes/chat.ts].
2. `UNDECIDED:` Rate limiting thresholds per user — what request per minute cap to implement if rate limiting middleware is added [packages/server/src/index.ts].
3. `UNDECIDED:` Strategy for cleaning up old or abandoned database sessions [packages/server/src/routes/sessions.ts].
