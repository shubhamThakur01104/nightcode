# Nightcode — Product Description Document

---

## 1. Elevator Pitch & Glossary

### Elevator Pitch
Nightcode is an interactive, terminal-native AI coding assistant that helps developers inspect, write, and debug code directly inside their command line. It pairs terminal text manipulation with multi-provider Large Language Models and automated file and shell tool execution.

### Glossary
*   **PLAN Mode**: Read-only agent operating mode where the AI can analyze and inspect files but cannot modify files or execute shell commands.
*   **BUILD Mode**: Full implementation agent operating mode where the AI can read, create, edit files, and execute shell commands.
*   **Session**: A persisted conversation thread between the user and the AI assistant, containing prompt history and tool execution logs.
*   **Tool Call**: A structured request made by the AI model to execute a local operation (such as reading a file or running a shell command) on the developer's system.
*   **Credit**: A billable unit used to measure AI model usage, converted from estimated token consumption costs.
*   **Workspace**: The project directory on the user's host machine where Nightcode is executed.

---

## 2. Target Users & Non-Goals

### Target Users
Nightcode is built for software engineers, systems developers, and terminal-centric programmers who work in command-line environments. It is designed for developers who want AI assistance to research codebases, implement targeted code edits, create files, and execute shell commands without leaving their terminal session.

### Non-Goals
*   **Not a graphical code editor (IDE)**: Nightcode runs strictly inside the terminal interface without a GUI window, tabbed editor interface, or syntax-highlighted editor.
*   **No team collaboration or session sharing**: Sessions belong exclusively to the authenticated user; there are no multi-user co-editing or session-sharing features.
*   **No self-hosted or local AI models**: Nightcode requires cloud AI model access and does not support local model runtimes (such as Ollama).
*   **No cloud file hosting or workspace syncing**: Workspace files remain strictly on the user's local filesystem; project code is not uploaded or hosted on external storage servers.

---

## 3. Problem Solved

Developers context-switch continuously between code editors, web browsers, terminal windows, and AI web applications when building software. Copy-pasting code snippets between terminal outputs and AI interfaces introduces latency, manual steps, and syntax copy errors. 

Nightcode solves this by bringing AI directly into the terminal window. It executes file system reads, file modifications, regex searches, and bash commands locally while streaming responses from top AI models, maintaining full state across chat sessions.

---

## 4. Product Overview

Nightcode is a terminal application built with a client-server architecture:

*   **CLI UI (`@nightcode/cli`)**: The terminal frontend running in the developer's command line. It handles user inputs, auto-completing `@` file mentions, `/` slash commands, modal dialogs, toast notifications, and customizable color themes.
*   **Backend Server (`@nightcode/server`)**: The backend API server. It orchestrates AI model streaming, verifies user authentication tokens, checks credit balances before processing requests, persists session histories, and meters usage.
*   **Database (`@nightcode/database`)**: Relational database storage layer connected to PostgreSQL. Clerk is the sole user authentication store; the database only stores session records and message histories keyed by Clerk user ID, without keeping a separate user table.
*   **Shared Library (`@nightcode/shared`)**: Shared TypeScript schemas, model pricing definitions, agent mode contracts, and tool specifications used across the codebase.

### How a Message Works

1.  **User Input**: The user types a message in the CLI input bar and presses `Enter`.
2.  **Request Submission**: The CLI sends the user's message, current agent mode (`PLAN` or `BUILD`), and selected AI model to the server via an HTTP request.
3.  **Prompt & Context Assembly**: The server constructs system instructions for the requested mode, attaches historical session messages from the database, and initiates a streaming generation request to the selected AI model provider.
4.  **Tool Request Emission**: When the AI model determines it needs information or must take an action, it emits a tool call request (for example, reading a file or searching text).
5.  **Local Tool Execution**: The server streams the tool request to the CLI, which executes the requested tool locally on the user's host machine within the workspace directory.
6.  **Tool Result Return**: The CLI returns the local execution output (or error) to the server, which passes the result back into the running model context.
7.  **Response Completion & Ingestion**: The model processes the tool output and continues streaming text responses or issuing additional tool calls. Upon completion, the server saves the complete updated conversation message history to the database and ingests token usage for credit billing.

---

## 5. Feature Inventory

### Feature 1: Terminal User Interface & Chat Input
*   **Trigger**: Launching `nightcode` or typing in the input bar.
*   **Behavior**:
    1.  The CLI opens the interactive terminal application interface.
    2.  If launched without arguments, it displays an ascii logo header, prompt input bar, and status bar showing active agent mode and selected model.
    3.  Multi-line text input supports `Shift+Enter` for newlines and `Enter` for submission.
    4.  Submitting a prompt from the home screen creates a backend session and navigates to the session view (`/sessions/:id`).
    5.  AI responses stream into the chat view, with dynamic tool execution steps rendered in dimmed tool blocks.
    6.  Pressing `Escape` during an active generation interrupts the stream.
*   **Data**: Prompts and message parts (`text`, `reasoning`, `tool-*`) synced to the database session store.
*   **Result**: Interactive terminal UI streaming AI reasoning, code output, and tool logs.
*   **Boundaries**: No mouse text selection inside custom OpenTUI scroll views; UI size bounded by terminal window dimensions.

---

### Feature 2: File & Folder `@` Mentions Completion
*   **Trigger**: Typing `@` in the input bar.
*   **Behavior**:
    1.  Detects `@` at the cursor position.
    2.  Scans the current working directory recursively (excluding hidden entries, `node_modules`, and `.env` files).
    3.  Displays a floating popup menu with matching file and folder candidates.
    4.  Pressing `Enter` or `Tab` inserts the relative path into the prompt buffer.
*   **Data**: Reads workspace file and directory paths.
*   **Result**: Fast inline file path insertion without manual typing.
*   **Boundaries**: Search candidates capped for performance; absolute paths outside workspace excluded.

---

### Feature 3: `/` Slash Command Menu
*   **Trigger**: Typing `/` as the first character on an empty input line.
*   **Behavior**:
    1.  Opens a command menu overlay listing available slash commands (`/new`, `/agents`, `/models`, `/sessions`, `/theme`, `/login`, `/logout`, `/upgrade`, `/usage`, `/exit`).
    2.  Typing filters commands by name and description.
    3.  Pressing `Enter` executes the chosen command action.
*   **Data**: Command registry mappings.
*   **Result**: Direct keyboard access to modal dialogs, auth flows, billing links, and app termination.
*   **Boundaries**: Activates only if `/` is the initial character without leading spaces.

---

### Feature 4: OAuth 2.0 Browser Authentication (`/login`, `/logout`)
*   **Trigger**: Running `/login` or `/logout` slash command.
*   **Behavior**:
    1.  Executing `/login` starts a temporary local callback server on the developer's machine.
    2.  Opens default web browser to Clerk OAuth sign-in page.
    3.  After sign-in, Clerk redirects through the server callback back to the CLI local server.
    4.  CLI exchanges code for Bearer access token, saves credentials locally, and displays success toast.
    5.  Executing `/logout` deletes local credentials.
*   **Data**: Bearer token saved in `~/.nightcode/auth.json`.
*   **Result**: Authenticated CLI user session bound to Clerk user ID.
*   **Boundaries**: Login times out after 5 minutes if incomplete. Expired tokens return HTTP 401, clearing credentials and requiring re-login.

---

### Feature 5: Mode Switching (`PLAN` vs `BUILD`)
*   **Trigger**: Selecting agent mode via `/agents` slash command dialog or passing mode upon session creation.
*   **Behavior**:
    1.  `/agents` command opens a modal dialog to select between `Build` and `Plan`.
    2.  Selecting `Plan` configures system prompt for read-only research and restricts tool engine to read tools.
    3.  Selecting `Build` enables write tools (`writeFile`, `editFile`, `bash`).
    4.  Attempting write operations while in `PLAN` mode throws an immediate tool execution error.
*   **Data**: Mode string (`PLAN` | `BUILD`) stored in prompt context and message metadata.
*   **Result**: Enforced boundary between safe codebase analysis and active workspace modification.
*   **Boundaries**: Mode toggle applies to subsequent prompts in the active session.

---

### Feature 6: Model Selection (`/models`)
*   **Trigger**: Running `/models` slash command.
*   **Behavior**:
    1.  Opens a search dialog displaying supported models:
        *   **Gemini (Google)**: `gemini-3.5-flash-lite` (Default), `gemini-3.8-flash`.
        *   **Groq**: `qwen/qwen3.6-27b`, `openai/gpt-oss-120b`.
        *   **OpenRouter**: `cohere/north-mini-code:free`, `poolside/laguna-xs-2.1:free`.
        *   **Omnirouter**: `auto/coding` (routes via custom API gateway).
    2.  Selecting a model updates the active model indicator in the status bar.
    3.  Subsequent prompts stream generation from the selected model provider.
*   **Data**: Selected model ID stored in prompt configuration and sent in API requests.
*   **Result**: Generation requests route to chosen provider and model.
*   **Boundaries**: No custom system prompt or temperature overrides per model. Local models (Ollama) not supported.

---

### Feature 7: Session Management (`/sessions`, `/new`)
*   **Trigger**: Running `/sessions` or `/new` slash command.
*   **Behavior**:
    1.  Executing `/new` opens a fresh home screen prompt.
    2.  Executing `/sessions` fetches historical sessions from the backend and opens a modal dialog listing past conversations.
    3.  Selecting a session loads its historical messages into the chat view.
*   **Data**: Database `Session` record with `id`, `userId`, `title`, timestamps, and conversation JSON array.
*   **Result**: Persistent, reloadable chat threads across app restarts.
*   **Boundaries**: No manual session renaming or deletion from CLI UI.

---

### Feature 8: Client-Side Local Tool Execution & Workspace Security
*   **Trigger**: AI model emits a tool call request during generation.
*   **Behavior**:
    1.  CLI catches tool call and executes local function on host machine:
        *   `readFile`: Reads workspace file (truncates if large).
        *   `listDirectory`: Lists folder contents (excludes hidden, `node_modules`, `.env*`).
        *   `glob`: Matches file pattern (excludes `node_modules`, `.env*`).
        *   `grep`: Searches regex pattern across files (excludes `.env*`).
        *   `writeFile`: Creates directories and writes file content.
        *   `editFile`: Verifies unique string match in file and replaces content.
        *   `bash`: Executes non-interactive shell command with timeout protection.
    2.  **Security Guards**:
        *   **Path Guard**: Rejects target paths outside active workspace directory.
        *   **.env Guard**: Blocks reading, writing, listing, or shell inspection of `.env` files.
    3.  Execution output or error streams back into AI model context.
*   **Data**: Reads/edits local files; executes shell commands on host machine.
*   **Result**: Safe, automated code modifications and command executions.
*   **Boundaries**: Cannot execute interactive shell commands requiring manual input.

---

### Feature 9: Billing, Usage Metering, & Credit Management (`/upgrade`, `/usage`)
*   **Trigger**: Running `/upgrade` or `/usage` slash commands, or sending a prompt.
*   **Behavior**:
    1.  **Pre-Flight Check**: Backend verifies credit balance directly via Polar API before processing requests. No webhooks used by design. Zero or negative balance returns HTTP 402 error.
    2.  **Usage Ingestion**: On message finish, backend converts token usage cost to credits ($0.10 USD per credit, rounded up, minimum 1 credit for paid models) and posts meter event to Polar.
    3.  **`/upgrade`**: Creates Polar checkout session URL and opens checkout in default browser.
    4.  **`/usage`**: Creates Polar Customer Portal session URL and opens portal in default browser.
*   **Data**: Polar credit meters linked to Clerk user ID.
*   **Result**: Metered credit usage with self-service browser purchasing.
*   **Boundaries**: Credit balances are managed in Polar portal, not displayed directly inside CLI status bar.

---

### Feature 10: Theme Customization (`/theme`)
*   **Trigger**: Running `/theme` slash command.
*   **Behavior**:
    1.  Opens modal dialog with 16 color themes (Nightfox, Draconic, Nord Frost, Solarized Dark, Synthwave 80s, Tokyo Night, Catppuccin Mocha, Gruvbox Dark, One Dark Pro, Rose Pine, Monokai Pro, Material Ocean, Palenight, Cyberpunk Neon, Emerald Forest, Sunset Velvet).
    2.  Moving selection highlight live-previews colors across UI.
    3.  `Enter` saves selection; `Escape` restores original theme.
*   **Data**: Theme preference saved locally in `~/.nightcode/preferences.json`.
*   **Result**: Customized UI color theme.
*   **Boundaries**: Custom HEX color definitions outside 16 presets not supported.

---

## 6. User Journeys

### Journey 1: Codebase Exploration (`PLAN` Mode)
1. Developer opens `nightcode` in a repository and signs in via `/login`.
2. Developer selects `Plan` mode in `/agents` dialog. Status bar updates to `Plan › gemini-3.5-flash-lite`.
3. Developer asks: "Explain the project architecture. Use @schema.prisma to start."
4. CLI resolves path `@schema.prisma` and sends prompt.
5. AI requests `readFile` tool call on `packages/database/prisma/schema.prisma`.
6. CLI reads file locally and returns contents to AI.
7. AI analyzes schema and streams architectural summary into chat view. No files modified.

### Journey 2: Bug Fix & Command Execution (`BUILD` Mode)
1. Developer loads existing session via `/sessions` and switches to `Build` mode.
2. Developer asks: "Find where message validation is implemented and add error logging."
3. AI uses `grep` to locate handler files, then calls `readFile` to inspect code.
4. AI issues `editFile` with exact target string replacement.
5. CLI validates string uniqueness, modifies file, and returns success.
6. AI issues `bash` tool call to execute project build/test scripts.
7. CLI runs process, returns stdout and exit code 0.
8. AI reports task completion in chat view.

### Journey 3: Credit Purchase & Account Management
1. Developer prompt fails with error notification: "No credits remaining. Run /upgrade to buy more credits."
2. Developer types `/upgrade`; CLI opens Polar checkout in browser.
3. Developer completes credit purchase in browser.
4. Developer types `/usage`; CLI opens Polar Customer Portal in browser to inspect balance and invoices.
5. Developer returns to terminal and resumes sending AI prompts.

---

## 7. Sessions and Workspaces

*   **Session Scope**: Sessions are stored centrally in PostgreSQL indexed by Clerk user ID. `/sessions` lists all historical conversations created by the authenticated user across all workspaces.
*   **Workspace Binding**: The CLI operates inside whichever directory it was executed from (`process.cwd()`). Reopening a past session restores its message history, but local tool executions (`readFile`, `writeFile`, `editFile`, `bash`) always target the active workspace folder where the CLI process is currently running.
*   **Reopening History**: Selecting a session from `/sessions` sends `GET /sessions/:id`. The server retrieves stored JSON message history from PostgreSQL and sends it to the CLI, which renders conversation text, reasoning blocks, and tool logs into the chat view.

---

## 8. Error and Failure Behavior

### 1. No Internet / Disconnect
*   **User View**: Toast notification ("Sign in failed", "Failed to load session", or network failure text).
*   **App State**: CLI remains on active screen; input buffer preserved.

### 2. Server Unreachable
*   **User View**: Inline error message or toast indicating connection failure.
*   **App State**: CLI remains active; user can retry prompt submission when server recovers.

### 3. Expired Login (401 Unauthorized)
*   **User View**: Toast notification: "Unauthorized. Run /login to continue".
*   **App State**: CLI purges `~/.nightcode/auth.json`. Requests blocked until user re-authenticates via `/login`.

### 4. Out of Credits (402 Payment Required)
*   **User View**: Error notification: "No credits remaining. Run /upgrade to buy more credits."
*   **App State**: Pre-flight check blocks generation. User runs `/upgrade` to open browser checkout.

### 5. Model Provider Error
*   **User View**: Inline `ErrorMessage` displaying provider error text (e.g. rate limits or outage).
*   **App State**: Stream halts cleanly; user can switch models via `/models` or retry message.

### 6. Local Tool Failure
*   **User View**: Tool execution block shows error indicator and message ("oldString not found in file", "Path outside workspace", missing file).
*   **App State**: Error details stream into AI context; model explains issue or attempts corrected tool call.

### 7. Bash Timeout
*   **User View**: Tool block displays output accumulated prior to timeout along with termination status.
*   **App State**: Process killed safely; output returned to AI model context.

### 8. Escape Key Interrupt
*   **User View**: Spinner stops immediately; status text returns to ready.
*   **App State**: Active stream aborted; output generated up to Escape press remains in chat buffer.

---

## 9. Setup and Running

### Prerequisites
*   Node.js / Bun runtime installed on host machine.
*   Running PostgreSQL database server.

### Environment Variable Names
*   **Backend Server (`@nightcode/server`)**: `DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `POLAR_ACCESS_TOKEN`, `POLAR_PRODUCT_ID`, `POLAR_CREDITS_METER_ID`, `POLAR_SERVER` (Optional), `OPENROUTER_API_KEY`, `OMNIROUTER_API_KEY` (or `OMNIROUTE_API_KEY`), `OMNIROUTER_BASE_URL` (or `OMNIROUTE_BASE_URL`), `PORT` (Optional).
*   **CLI UI (`@nightcode/cli`)**: `CLERK_FRONTEND_API`, `CLERK_OAUTH_CLIENT_ID`, `API_URL` (Optional).

### Startup Steps
1. Initialize database and generate Prisma client (`bunx prisma generate`).
2. Start backend server (`bun run dev:server`).
3. Launch CLI (`bun run dev:cli` or `nightcode`).

---

## 10. Known Gaps & Open Questions

### Known Gaps
1.  **Hardcoded Telemetry Settings**: Sentry DSN hardcoded in server entrypoint rather than configured via environment variables.
2.  **Debug Endpoints**: Unused debug endpoint (`/debug-sentry`) exposed in server routes.
3.  **No Token Refresh**: CLI does not refresh Bearer tokens; expired tokens trigger 401 and require manual `/login`.
4.  **Coarse Credit Rounding**: USD-to-credit conversion rounds up to whole credits ($0.10 value), charging a minimum 1 credit for any paid model invocation.
5.  **Non-Interactive Shell Limit**: `bash` tool cannot handle interactive commands requiring manual stdin input.
6.  **No Session Management Endpoints**: No UI options or backend routes to rename or delete past sessions.
7.  **No Local Model Support**: Local model engines (such as Ollama) not supported.

### Open Questions
1.  `UNCLEAR:` **Sentry Telemetry Configuration**: Unclear whether hardcoded Sentry DSN in server entrypoint is intended for production collection or is a development setting.
