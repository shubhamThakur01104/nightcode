# Nightcode — Data Model & Schema Document

---

## 1. Data Overview

Nightcode manages state across four distinct persistence layers: a relational PostgreSQL database, a local developer filesystem store, external Clerk authentication, and external Polar usage metering [packages/database/prisma/schema.prisma, packages/cli/src/lib/auth.ts, packages/server/src/lib/auth.ts, packages/server/src/lib/polar.ts].

| Data Item | Storage Location | Source of Truth | Format / Technology | File Path Reference |
| :--- | :--- | :--- | :--- | :--- |
| **Session Metadata & Messages** | PostgreSQL Database | `@nightcode/database` | Prisma ORM (`Session` model with `messages` JSON) | [packages/database/prisma/schema.prisma] |
| **OAuth Access Credentials** | Local Filesystem (`~/.nightcode/auth.json`) | CLI Client (`@nightcode/cli`) | Local JSON file (POSIX `0o600` permissions) | [packages/cli/src/lib/auth.ts] |
| **CLI UI Theme Preferences** | Local Filesystem (`~/.nightcode/preferences.json`) | CLI Client (`@nightcode/cli`) | Local JSON file | [packages/cli/src/providers/theme/index.tsx] |
| **User Identity & Auth State** | Clerk Cloud | Clerk Authentication | External SaaS API | [packages/server/src/lib/auth.ts] |
| **Billing Meters & Credits** | Polar Cloud | Polar Billing | External SaaS API | [packages/server/src/lib/polar.ts] |

---

## 2. Database Schema

### Database Technology & Driver Setup
The backend uses PostgreSQL managed via Prisma ORM 7.10.0 with the `@prisma/adapter-pg` driver adapter [packages/database/package.json, packages/database/src/client.ts]. The schema is defined in `packages/database/prisma/schema.prisma` [packages/database/prisma/schema.prisma].

### Model: `Session`
Represents a single chat conversation thread owned by a user [packages/database/prisma/schema.prisma].

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

#### Field Specifications

| Field Name | Type | Nullable | Default | Description | Example Value | File Path Reference |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `String` | No | `cuid()` | Unique primary key identifier for the session | `"cm7z8x1q200003b6g89abc123"` | [packages/database/prisma/schema.prisma] |
| `userId` | `String` | No | *None* | Clerk user ID linking the session to an authenticated user | `"user_2tX9qL4mK7pW9vZ"` | [packages/database/prisma/schema.prisma, packages/server/src/routes/sessions.ts] |
| `title` | `String` | No | *None* | Session title generated from the first 100 characters of the initial prompt | `"Fix broken search validation in API routes"` | [packages/database/prisma/schema.prisma, packages/cli/src/screens/new-session.tsx] |
| `createdAt` | `DateTime` | No | `now()` | Timestamp when the session was created | `"2025-02-27T10:15:30.000Z"` | [packages/database/prisma/schema.prisma] |
| `updatedAt` | `DateTime` | No | Auto `@updatedAt` | Timestamp when the session was last modified | `"2025-02-27T10:16:45.000Z"` | [packages/database/prisma/schema.prisma] |
| `messages` | `Json` | No | `"[]"` | JSON array containing the full conversation message history | `[ { "id": "msg-1", "role": "user", ... } ]` | [packages/database/prisma/schema.prisma, packages/server/src/routes/chat.ts] |

#### Constraints & Indexes
* **Primary Key**: `@id` on field `id` [packages/database/prisma/schema.prisma].
* **Indexes**: `@@index([userId])` for fast session lookup by user ID [packages/database/prisma/schema.prisma].

#### What Does NOT Exist in Database
* **No `User` Table**: By design, user profiles are not mirrored or stored in PostgreSQL; user identity resides exclusively in Clerk [packages/database/prisma/schema.prisma, packages/server/src/lib/auth.ts].
* **No Foreign Keys**: `Session` is an isolated table without relational constraints [packages/database/prisma/schema.prisma].
* **No Soft Delete Column**: There is no `deletedAt` column or soft deletion mechanism [packages/database/prisma/schema.prisma].
* **No Optimistic Concurrency Lock**: No `@version` or locking field exists on the `Session` model [packages/database/prisma/schema.prisma].

---

## 3. The Messages JSON Structure

The `Session.messages` field stores a JSON array of `NightcodeUIMessage` objects defined by the Vercel AI SDK and customized via `@nightcode/shared` contracts [packages/server/src/routes/chat.ts, packages/cli/src/hooks/use-chat.ts].

### Top-Level Message Object Shape

```typescript
// Type definition in packages/server/src/routes/chat.ts & packages/cli/src/hooks/use-chat.ts
type NightcodeUIMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  parts: ClientMessagePart[];
  metadata?: {
    mode?: "PLAN" | "BUILD";
    model?: string;
    durationMs?: number;
    usage?: {
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
    };
  };
};
```

### Message Part Types (`parts`)

1. **Text Part**:
   - Shape: `{ type: "text", text: string }` [packages/cli/src/components/messages/bot-message.tsx].
2. **Reasoning Part (Thinking Blocks)**:
   - Shape: `{ type: "reasoning", text: string }` [packages/cli/src/components/messages/bot-message.tsx].
3. **Tool Execution Part**:
   - Shape: `{ type: "dynamic-tool" | "tool-readFile" | "tool-listDirectory" | "tool-glob" | "tool-grep" | "tool-writeFile" | "tool-editFile" | "tool-bash", toolCallId: string, toolName?: string, input: object, state?: string, output?: unknown, errorText?: string }` [packages/cli/src/components/messages/bot-message.tsx, packages/server/src/routes/chat.ts].

#### Tool Part States (`state`)
* **`undefined` / `call`**: Initial state when the AI model emits a tool call request; awaiting client execution [packages/server/src/routes/chat.ts].
* **`"output-available"`**: The CLI completed tool execution locally; the result object is stored in `output` [packages/cli/src/components/messages/bot-message.tsx, packages/server/src/routes/chat.ts].
* **`"output-error"`**: Local tool execution failed or threw an error; error message is stored in `errorText` [packages/cli/src/components/messages/bot-message.tsx].

### Realistic JSON Conversation Example

```json
[
  {
    "id": "msg_user_101",
    "role": "user",
    "metadata": {
      "mode": "BUILD",
      "model": "gemini-3.5-flash-lite"
    },
    "parts": [
      {
        "type": "text",
        "text": "Check packages/database/src/client.ts and update comments."
      }
    ]
  },
  {
    "id": "msg_assistant_102",
    "role": "assistant",
    "metadata": {
      "mode": "BUILD",
      "model": "gemini-3.5-flash-lite",
      "durationMs": 1420,
      "usage": {
        "inputTokens": 450,
        "outputTokens": 120,
        "totalTokens": 570
      }
    },
    "parts": [
      {
        "type": "reasoning",
        "text": "I need to inspect the contents of client.ts using readFile first."
      },
      {
        "type": "tool-readFile",
        "toolCallId": "call_abc123xyz",
        "input": {
          "path": "packages/database/src/client.ts"
        },
        "state": "output-available",
        "output": {
          "content": "import 'dotenv/config';\nimport { db } from './client';"
        }
      },
      {
        "type": "text",
        "text": "I have read packages/database/src/client.ts. The Prisma connection adapter is initialized."
      }
    ]
  }
]
```

### Validation & Schema Contracts
* **Request Validation**: Incoming payloads to `POST /chat` are validated by `submitValidator` using `zValidator` and `submitSchema` [packages/server/src/routes/chat.ts].
* **Message Normalization**: The server calls `validateUIMessages({ messages, tools })` from the Vercel AI SDK to validate message parts against active tool contracts (`getToolContracts(mode)`) [packages/server/src/routes/chat.ts, packages/shared/src/schemas.ts].
* **Model Message Conversion**: Validated UI messages are converted to LLM model format via `convertToModelMessages(nextMessages, { tools })` [packages/server/src/routes/chat.ts].

---

## 4. Relationships Across Systems

Even though PostgreSQL has no foreign key constraints, data items are logically linked across Clerk, PostgreSQL, and Polar using explicit String identifiers [packages/server/src/routes/sessions.ts, packages/server/src/lib/polar.ts].

```
+-------------------------------------------------------------------+
|                            Clerk SaaS                             |
|  - User Identity & Authentication                                 |
|  - Clerk User ID: "user_2tX9qL4mK7pW9vZ"                          |
+---------------------------------+---------------------------------+
                                  |
            +---------------------+---------------------+
            |                                           |
            v (userId String match)                     v (externalId String match)
+-----------------------------------+   +-----------------------------------+
|      PostgreSQL Database          |   |            Polar SaaS             |
|  - Table: Session                 |   |  - Customer Meter State           |
|  - Column: userId                 |   |  - External ID: user_2tX...       |
|  - Column: id (Session ID)        |   |  - Ingestion Event:               |
+-----------------------------------+   |    externalId: "chat-message:msg_"|
                                        +-----------------------------------+
```

### Cross-System Identifiers Matrix
1. **User Identity Link**: `Session.userId` in PostgreSQL equals Clerk `userId` (`user_...`) extracted from the OAuth Bearer token [packages/server/src/routes/sessions.ts, packages/server/src/middleware/require-auth.ts].
2. **Polar Customer Link**: Polar customer `externalId` equals Clerk `userId` (`user_...`) [packages/server/src/lib/polar.ts].
3. **Usage Ingestion Event Link**: Meter events posted to Polar set `externalId` to `"chat-message:" + messageId` and `externalCustomerId` to Clerk `userId` [packages/server/src/lib/polar.ts, packages/server/src/routes/chat.ts].

---

## 5. Data Lifecycle

```
[Home Prompt Submission] ──> POST /sessions ──> db.session.create ({ title, userId })
                                                        │
                                                        ▼
[User Sends Prompt] ───────> POST /chat ─────> streamText() + local tool loop
                                                        │
                                                        ├─ (If Stream Aborted / Error) ──> Early Return (No DB write)
                                                        │
                                                        └─ (On Finish) ──> db.session.update ({ messages })
```

### Step-by-Step Session & Message Lifecycle
1. **Creation**: When a user submits a prompt from the home screen, the CLI calls `POST /sessions` with `{ title: prompt.slice(0, 100) }` [packages/cli/src/screens/new-session.tsx]. The server creates a record via `db.session.create({ data: { title, userId } })` with default `messages = []` [packages/server/src/routes/sessions.ts].
2. **Read**: Selecting a session calls `GET /sessions/:id`. The server retrieves the session via `db.session.findUnique({ where: { id, userId } })` and returns the complete `messages` array [packages/server/src/routes/sessions.ts].
3. **Append & Update**:
   - When a user sends a prompt, the client sends messages to `POST /chat` [packages/cli/src/hooks/use-chat.ts].
   - The server validates messages, appends/updates turn metadata, and streams responses via `streamText` [packages/server/src/routes/chat.ts].
   - Upon finish (`onFinish`), if the request is not aborted (`!event.isAborted`) and has no pending tool calls (`!hasPendingToolCalls`), the server updates the record in PostgreSQL via `db.session.update({ where: { id, userId }, data: { messages } })` [packages/server/src/routes/chat.ts].
4. **Stream Cancellation & Failure Behavior**:
   - If the user presses `Escape` mid-response (`event.isAborted === true`), `onFinish` exits early without updating PostgreSQL. The database retains the message state prior to the cancelled turn [packages/server/src/routes/chat.ts].
   - If the server crashes or network breaks mid-stream, PostgreSQL retains the last successfully saved `messages` state [packages/server/src/routes/chat.ts].
5. **Deletion**: Session records are never deleted by application logic; no `DELETE` endpoints or cleanup background jobs exist in the codebase [packages/server/src/routes/sessions.ts].

---

## 6. Concurrency and Integrity

### Concurrency Overwrite Risk
The backend updates session messages by overwriting the entire JSON array (`data: { messages: event.messages as unknown as Prisma.InputJsonValue }`) [packages/server/src/routes/chat.ts]. 

* **Race Condition Hazard**: If a user submits two concurrent requests for the same session ID from separate clients, both requests read the initial `messages` array. Whichever request finishes last will overwrite the `messages` array in PostgreSQL, causing loss of the earlier completed turn [packages/server/src/routes/chat.ts].
* **Lack of Concurrency Control**: No database transactions (`db.$transaction`), row-level locks (`SELECT FOR UPDATE`), or optimistic concurrency fields (`@version`) are implemented [packages/database/prisma/schema.prisma, packages/server/src/routes/chat.ts].

### Data Sanitization & Integrity Protection
* Payload body structure is validated by Zod (`submitValidator`) before database lookups [packages/server/src/routes/chat.ts].
* Message structures are sanitized and normalized by `validateUIMessages` against tool schemas prior to passing to model providers [packages/server/src/routes/chat.ts].

---

## 7. Size and Performance

### Title & String Limits
* **Session Title**: Truncated to the first 100 characters of the initial prompt string: `title: state.message.slice(0, 100)` [packages/cli/src/screens/new-session.tsx].
* **File Reading Cap**: `readFile` tool output is capped at `10,000` characters (`MAX_FILE_SIZE = 10_000`) [packages/cli/src/lib/local-tools.ts].
* **Glob Match Cap**: `glob` tool results are capped at `200` file paths (`MAX_RESULTS = 200`) [packages/cli/src/lib/local-tools.ts].
* **Grep Match Cap**: `grep` tool matches are capped at `50` lines (`MAX_MATCHES = 50`) [packages/cli/src/lib/local-tools.ts].
* **Bash Output Cap**: `bash` stdout/stderr is capped at `20,000` characters (`MAX_OUTPUT = 20_000`) [packages/cli/src/lib/local-tools.ts].

### Query & Pagination Behavior
* **No History Pagination**: `GET /sessions/:id` returns the full session row and the entire `messages` JSON array in a single query [packages/server/src/routes/sessions.ts].
* **No Session List Pagination**: `GET /sessions` queries `db.session.findMany({ where: { userId }, orderBy: { createdAt: "desc" } })` without `take`, `skip`, or cursor pagination [packages/server/src/routes/sessions.ts].

---

## 8. Local Files

The CLI application reads and writes two local state files inside the user's home directory (`~/.nightcode`) [packages/cli/src/lib/auth.ts, packages/cli/src/providers/theme/index.tsx].

```
~/.nightcode/
├── auth.json         # OAuth access token store (POSIX 0o600) [packages/cli/src/lib/auth.ts]
└── preferences.json  # Theme configuration preference [packages/cli/src/providers/theme/index.tsx]
```

### 1. Credentials File (`~/.nightcode/auth.json`)
* **Path**: `join(homedir(), ".nightcode", "auth.json")` [packages/cli/src/lib/auth.ts].
* **File Permissions**: Directory created with mode `0o700` (`rwx------`); file written with mode `0o600` (`rw-------`) [packages/cli/src/lib/auth.ts].
* **Exact JSON Shape**:
  ```json
  {
    "token": "oauth_bearer_token_string_here"
  }
  ```
* **Error Handling**:
  - **Missing**: `getAuth()` catches read errors and returns `null`. App acts as unauthenticated [packages/cli/src/lib/auth.ts].
  - **Corrupted**: `JSON.parse` fails, caught by try/catch, returns `null` [packages/cli/src/lib/auth.ts].
  - **Unauthorized (401)**: API client catches HTTP 401 and calls `clearAuth()`, executing `unlinkSync(AUTH_FILE)` to delete the file [packages/cli/src/lib/api-client.ts, packages/cli/src/lib/auth.ts].

### 2. UI Preferences File (`~/.nightcode/preferences.json`)
* **Path**: `join(homedir(), ".nightcode", "preferences.json")` [packages/cli/src/providers/theme/index.tsx].
* **Exact JSON Shape**:
  ```json
  {
    "themeName": "Nightfox"
  }
  ```
* **Error Handling**:
  - **Missing / Corrupted**: `getInitialTheme()` catches parse errors and falls back to `DEFAULT_THEME` ("Nightfox") [packages/cli/src/providers/theme/index.tsx].

---

## 9. External Data

Nightcode relies on external data structures hosted in third-party cloud services that cannot be queried directly from PostgreSQL [packages/server/src/lib/auth.ts, packages/server/src/lib/polar.ts].

### 1. Clerk Authentication Data
* **Stored Content**: User accounts, email addresses, password hashes, OAuth tokens [packages/server/src/lib/auth.ts].
* **Access Method**: `@clerk/backend` SDK via `authenticateOAuthRequest(request)` [packages/server/src/lib/auth.ts].

### 2. Polar Billing Data
* **Stored Content**: Customer meters, credit subscription balances, event logs [packages/server/src/lib/polar.ts].
* **Meter Balance Check**: `polar.customers.getStateExternal({ externalId: userId })` returns active meters array [packages/server/src/lib/polar.ts].
* **Event Ingestion Schema**:
  ```typescript
  // Ingested in packages/server/src/lib/polar.ts & packages/server/src/routes/chat.ts
  {
    name: "nightcode_usage",
    externalId: `chat-message:${messageId}`,
    externalCustomerId: userId,
    metadata: {
      credits: number // Calculated credits (USD cost / 0.1, rounded up)
    }
  }
  ```

---

## 10. Privacy and Retention

### Stored User Content
* **PostgreSQL Database**: Stores raw user prompts, assistant text responses, reasoning text, tool call input arguments, and tool call execution output payloads (including file contents read via `readFile` or command outputs from `bash`) [packages/server/src/routes/chat.ts, packages/cli/src/lib/local-tools.ts].

### Sensitive File Protection (`.env`)
* Tool execution engine strictly blocks reading, listing, globbing, grepping, writing, or bash inspection of files matching `.env*` [packages/cli/src/lib/local-tools.ts].
* Attempting to access `.env` files via tools throws security errors ("Access to .env files is forbidden") before any file reading or execution occurs [packages/cli/src/lib/local-tools.ts].

### Third-Party Data Transmission
* User prompts, context messages, and tool outputs are sent over HTTPS to external AI model providers (Google Gemini, Groq, OpenRouter, Omnirouter) during generation requests [packages/server/src/lib/models.ts, packages/server/src/routes/chat.ts].

---

## 11. Rules for Future Changes

### Must Always
1. **Regenerate Prisma Client**: Run `bun run --cwd packages/database db:generate` whenever `packages/database/prisma/schema.prisma` is modified [packages/database/package.json].
2. **Maintain Strict Path & `.env` Protection**: Ensure any new local file tool passes target paths through `resolveInsideCwd()` and checks against `.env` security guards [packages/cli/src/lib/local-tools.ts].
3. **Synchronize Zod Schemas**: Keep tool input schemas in `@nightcode/shared` synchronized between CLI execution handlers and backend model contracts [packages/shared/src/schemas.ts, packages/cli/src/lib/local-tools.ts].
4. **Preserve Credentials File Modes**: Maintain POSIX permissions `0o700` (directory) and `0o600` (file) when saving auth credentials to disk [packages/cli/src/lib/auth.ts].

### Must Never
1. **Never Store Secrets in Database**: Do not store OAuth tokens, Clerk secret keys, or Polar API keys inside PostgreSQL tables or Git repositories [packages/database/prisma/schema.prisma, packages/server/src/lib/auth.ts].
2. **Never Bypass `resolveInsideCwd()`**: Never allow file reading or writing tools to accept unvalidated absolute paths or parent relative paths (`..`) [packages/cli/src/lib/local-tools.ts].
3. **Never Direct-Import Database Client into CLI**: The `@nightcode/cli` package must never import `@nightcode/database` directly [packages/cli/package.json].
4. **Never Modify `messages` Format Without Zod Updates**: Never change the JSON shape of `NightcodeUIMessage` without updating `submitSchema` and `validateUIMessages` [packages/server/src/routes/chat.ts].

---

## 12. Known Gaps

1. **No Migration Files**: No `prisma/migrations` folder exists in `@nightcode/database`; database schema synchronization relies on manual `prisma db push` [packages/database/prisma7.config.ts, packages/database/package.json].
2. **No Relational Foreign Keys**: Database schema has no foreign keys or cascading rules [packages/database/prisma/schema.prisma].
3. **Array Overwrite Concurrency Risk**: `db.session.update` replaces the entire `messages` JSON array without optimistic locking or versioning (`@version`), creating overwrite hazards during concurrent stream finishes [packages/server/src/routes/chat.ts, packages/database/prisma/schema.prisma].
4. **No Session Deletion or Renaming**: API routes provide no `DELETE /sessions/:id` or `PATCH /sessions/:id` endpoints [packages/server/src/routes/sessions.ts].
5. **No Query Pagination**: Session listing (`GET /sessions`) and history loading (`GET /sessions/:id`) query all records without limit/offset pagination [packages/server/src/routes/sessions.ts].

---

## 13. Open Questions

1. `UNCLEAR:` Absence of Prisma migration files (`packages/database/prisma/migrations`) — whether production schema migrations are applied via `prisma db push` or external CI/CD pipelines [packages/database/prisma7.config.ts].
2. `UNCLEAR:` External storage or logging of prompt data by the custom API gateway at `https://api.omnirouter.ai/v1` [packages/server/src/lib/models.ts].
