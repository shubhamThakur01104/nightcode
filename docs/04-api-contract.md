# Nightcode — API Contract Document

---

## 1. API Overview

The `@nightcode/server` package exposes a RESTful and streaming HTTP API built with the Hono web framework running on the Bun runtime [packages/server/src/index.ts, packages/server/package.json].

### Server Configuration & Base URL
* **Base URL**: Defaults to `http://localhost:3000` [packages/server/src/index.ts, packages/cli/src/lib/api-client.ts].
* **Port & Host**: Server binds to hostname `0.0.0.0` and port specified by `process.env.PORT` (defaults to `3000`) [packages/server/src/index.ts].
* **Timeout Setting**: Server `idleTimeout` is set to `255` seconds to prevent request termination during long LLM tool execution loops [packages/server/src/index.ts].

### Route Mounting & Router Architecture
Routes are modularized in `packages/server/src/routes/*` and mounted on the primary Hono application instance [packages/server/src/index.ts]:
```typescript
// packages/server/src/index.ts
const routes = app
  .route("/auth", auth)
  .route("/sessions", sessions)
  .route("/chat", chat)
  .route("/billing", billing);

export type AppType = typeof routes;
```

### Data Formats & Typed Client Connection (`AppType`)
* **Request & Response Format**: API endpoints communicate via JSON payloads (`application/json`), except streaming chat responses which return Server-Sent Events (`text/plain; charset=utf-8` stream) and browser callback/success routes which return plain text or 302 redirects [packages/server/src/routes/chat.ts, packages/server/src/routes/auth.ts, packages/server/src/routes/billing.ts].
* **Hono RPC Client**: The CLI package (`@nightcode/cli`) initializes an end-to-end type-safe client using Hono's `hc<AppType>` RPC helper [packages/cli/src/lib/api-client.ts].
* **Type Coupling Rule**: Modifying route paths, request schemas, or response shapes in `@nightcode/server` directly alters `AppType`, causing compile-time TypeScript changes in `@nightcode/cli` [packages/server/src/index.ts, packages/cli/src/lib/api-client.ts].

---

## 2. Endpoint Index

| Method | Path | Auth Required | Credits Check | Purpose | Calling CLI Function / Module |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/debug-sentry` | No | No | Debug endpoint to trigger test telemetry and error [DEBUG] | *None* (Unused in CLI UI) |
| `GET` | `/auth/callback` | No | No | Handles Clerk OAuth redirect, extracts port, and redirects to CLI | Browser redirect target during `performLogin()` |
| `GET` | `/sessions` | Yes | No | Lists all sessions for the authenticated user | `SessionDialogContent` (`apiClient.sessions.$get()`) |
| `GET` | `/sessions/:id` | Yes | No | Fetches a single session record with message history | `Session` screen (`apiClient.sessions[":id"].$get()`) |
| `POST` | `/sessions` | Yes | Yes | Creates a new chat session | `NewSession` screen (`apiClient.sessions.$post()`) |
| `POST` | `/chat` | Yes | Yes | Streams LLM text, reasoning, and tool calls; saves history | `useChat` hook via `DefaultChatTransport` |
| `POST` | `/billing/checkout` | Yes | No | Generates Polar checkout URL for credit purchases | `openUpgradeCheckout()` (`apiClient.billing.checkout.$post()`) |
| `POST` | `/billing/portal` | Yes | No | Generates Polar Customer Portal URL | `openBillingPortal()` (`apiClient.billing.portal.$post()`) |
| `GET` | `/billing/success` | No | No | Web landing page displayed after checkout or portal return | Browser redirect target from Polar checkout |

---

## 3. Global Behavior

### Authentication & Authorization Header Format
Endpoints protected by authentication require an HTTP `Authorization` header containing a Clerk OAuth Bearer token [packages/cli/src/lib/api-client.ts, packages/server/src/middleware/require-auth.ts]:
```
Authorization: Bearer <clerk_oauth_token>
```
* **Token Verification**: The `requireAuth` middleware passes the raw HTTP request to `authenticateOAuthRequest(c.req.raw)` [packages/server/src/middleware/require-auth.ts]. This executes `@clerk/backend`'s `clerkClient.authenticateRequest(request, { acceptsToken: "oauth_token" })` [packages/server/src/lib/auth.ts].
* **User Identity Context**: On successful validation, `requireAuth` sets `c.set("userId", auth.userId)` in the request environment, making `userId` accessible to downstream route handlers [packages/server/src/middleware/require-auth.ts].

### Middleware Execution Stack Order
Middleware executes in the following strict order for incoming requests [packages/server/src/index.ts]:
1. **Sentry Telemetry Middleware**: `sentry(app, ...)` intercepts all requests for error logging and tracing [packages/server/src/index.ts].
2. **Authentication Middleware**: `app.use("/sessions/*", requireAuth)`, `app.use("/chat/*", requireAuth)`, `app.use("/billing/checkout", requireAuth)`, `app.use("/billing/portal", requireAuth)` [packages/server/src/index.ts].
3. **Credits Balance Middleware**: `requireCreditsBalance` is executed specifically on `POST /sessions` and `POST /chat` endpoints [packages/server/src/routes/sessions.ts, packages/server/src/routes/chat.ts].
4. **Zod Body Validation Middleware**: `zValidator` parses and validates incoming JSON request bodies [packages/server/src/routes/sessions.ts, packages/server/src/routes/chat.ts].

### CORS, Rate Limiting, & Request Body Limits
* **CORS**: No CORS middleware (`cors()`) is configured; the API assumes direct CLI-to-server or browser-redirect invocation [packages/server/src/index.ts].
* **Rate Limiting**: No rate-limiting middleware is implemented [packages/server/src/index.ts].
* **Request Limits**: No explicit request payload body size limits are configured in Hono [packages/server/src/index.ts].

---

## 4. Standard Errors

### Error Response Formats

#### Standard JSON Error Format
Most API endpoints return errors as a JSON object containing an `error` string property [packages/server/src/index.ts, packages/server/src/middleware/require-auth.ts, packages/server/src/middleware/require-credits-balance.ts]:
```json
{
  "error": "Error description text here"
}
```

#### Plain Text Error Format (Inconsistent Endpoints)
The `/auth/callback` endpoint returns errors as plain text strings (`c.text(...)`) with status `400` [packages/server/src/routes/auth.ts].

### Status Code Reference Table

| Status Code | Reason / Trigger | Exact Fixed Message String | File Path Reference |
| :--- | :--- | :--- | :--- |
| `400 Bad Request` | Zod body validation failure in `POST /sessions` | `"Invalid request body"` | [packages/server/src/routes/sessions.ts] |
| `400 Bad Request` | Zod body validation failure in `POST /chat` | `"Invalid request body"` | [packages/server/src/routes/chat.ts] |
| `400 Bad Request` | Missing code or state parameters in `/auth/callback` | `"Missing authorization code or state"` (Plain text) | [packages/server/src/routes/auth.ts] |
| `400 Bad Request` | Invalid state payload or nonce mismatch in `/auth/callback` | `"Invalid state"` (Plain text) | [packages/server/src/routes/auth.ts] |
| `401 Unauthorized` | Missing, invalid, or expired OAuth Bearer token | `"Unauthorized. Run /login to continue"` | [packages/server/src/middleware/require-auth.ts] |
| `402 Payment Required` | Pre-flight check detects Polar credit balance `<= 0` | `"No credits remaining. Run /upgrade to buy more credits."` | [packages/server/src/middleware/require-credits-balance.ts] |
| `404 Not Found` | Session ID does not exist for the authenticated `userId` | `"Session not found"` | [packages/server/src/routes/sessions.ts, packages/server/src/routes/chat.ts] |
| `500 Internal Error` | Unhandled server exception caught by `app.onError` | `"Internal server error"` | [packages/server/src/index.ts] |
| `503 Service Unavailable` | Polar API failure during pre-flight credit check | `"Unable to verify credits balance right now."` | [packages/server/src/middleware/require-credits-balance.ts] |

---

## 5. Endpoint Details

### 5.1. `GET /debug-sentry` [DEBUG]
* **Purpose**: Triggers a test log, increments a Sentry metric counter, and throws a test runtime error [packages/server/src/index.ts].
* **Auth & Middleware**: Unprotected (No auth, no credits check) [packages/server/src/index.ts].
* **Request**:
  - Headers: Standard HTTP headers.
  - Body: None.
* **Success Response**: None (always throws error).
* **Error Response**:
  - `500 Internal Server Error`: `{ "error": "Internal server error" }` [packages/server/src/index.ts].
* **Side Effects**: Sends warning log and metric count to Sentry telemetry ingest [packages/server/src/index.ts].
* **Caller**: None (debug endpoint) [packages/server/src/index.ts].

---

### 5.2. `GET /auth/callback`
* **Purpose**: Receives Clerk OAuth code redirect, decodes state to extract local loopback port, and redirects user browser to CLI [packages/server/src/routes/auth.ts].
* **Auth & Middleware**: Unprotected (Public callback) [packages/server/src/routes/auth.ts].
* **Request**:
  - Query Parameters:
    - `code`: `string` (required for success). Authorization code from Clerk [packages/server/src/routes/auth.ts].
    - `state`: `string` (required for success). Base64url-encoded JSON state containing `{ port: number }` [packages/server/src/routes/auth.ts].
    - `error`: `string` (optional). Error code if authorization failed [packages/server/src/routes/auth.ts].
    - `error_description`: `string` (optional). Human-readable error description [packages/server/src/routes/auth.ts].
* **Success Response**:
  - Status: `302 Found` (HTTP Redirect) [packages/server/src/routes/auth.ts].
  - Location Header: `http://localhost:${port}/callback?code=${code}&state=${state}` [packages/server/src/routes/auth.ts].
* **Error Responses**:
  - `400 Bad Request` (if `error` param present): Plain text error description [packages/server/src/routes/auth.ts].
  - `400 Bad Request` (missing `code` or `state`): `"Missing authorization code or state"` (Plain text) [packages/server/src/routes/auth.ts].
  - `400 Bad Request` (malformed `state`): `"Invalid state"` (Plain text) [packages/server/src/routes/auth.ts].
* **Side Effects**: None on server [packages/server/src/routes/auth.ts].
* **Caller**: Systems web browser redirected by Clerk during `performLogin()` in `packages/cli/src/lib/oauth.ts`.

---

### 5.3. `GET /sessions`
* **Purpose**: Retrieves all chat sessions owned by the authenticated user [packages/server/src/routes/sessions.ts].
* **Auth & Middleware**: `requireAuth` [packages/server/src/index.ts].
* **Request**:
  - Headers: `Authorization: Bearer <token>` [packages/cli/src/lib/api-client.ts].
* **Success Response**:
  - Status: `200 OK` [packages/server/src/routes/sessions.ts].
  - Body Array (`SessionSummary[]`):
    ```json
    [
      {
        "id": "cm7z8x1q200003b6g89abc123",
        "title": "Fix broken search validation",
        "createdAt": "2025-02-27T10:15:30.000Z"
      }
    ]
    ```
* **Error Responses**:
  - `401 Unauthorized`: `{ "error": "Unauthorized. Run /login to continue" }` [packages/server/src/middleware/require-auth.ts].
  - `500 Internal Server Error`: `{ "error": "Internal server error" }` [packages/server/src/index.ts].
* **Side Effects**: Queries PostgreSQL database `Session` table (`findMany`) [packages/server/src/routes/sessions.ts].
* **Caller**: `SessionDialogContent` component via `apiClient.sessions.$get()` [packages/cli/src/components/dialogs/sessions-dialog.tsx].

---

### 5.4. `GET /sessions/:id`
* **Purpose**: Retrieves details and complete message history for a single chat session [packages/server/src/routes/sessions.ts].
* **Auth & Middleware**: `requireAuth` [packages/server/src/index.ts].
* **Request**:
  - Path Parameter: `id` (`string`, required). Session primary key ID [packages/server/src/routes/sessions.ts].
  - Headers: `Authorization: Bearer <token>` [packages/cli/src/lib/api-client.ts].
* **Success Response**:
  - Status: `200 OK` [packages/server/src/routes/sessions.ts].
  - Body (`Session` record):
    ```json
    {
      "id": "cm7z8x1q200003b6g89abc123",
      "userId": "user_2tX9qL4mK7pW9vZ",
      "title": "Fix broken search validation",
      "createdAt": "2025-02-27T10:15:30.000Z",
      "updatedAt": "2025-02-27T10:16:45.000Z",
      "messages": [
        {
          "id": "msg-101",
          "role": "user",
          "parts": [{ "type": "text", "text": "Hello" }]
        }
      ]
    }
    ```
* **Error Responses**:
  - `401 Unauthorized`: `{ "error": "Unauthorized. Run /login to continue" }` [packages/server/src/middleware/require-auth.ts].
  - `404 Not Found`: `{ "error": "Session not found" }` [packages/server/src/routes/sessions.ts].
* **Side Effects**: Queries PostgreSQL database (`findUnique({ where: { id, userId } })`) [packages/server/src/routes/sessions.ts].
* **Caller**: `Session` screen component via `apiClient.sessions[":id"].$get({ param: { id } })` [packages/cli/src/screens/session.tsx].

---

### 5.5. `POST /sessions`
* **Purpose**: Creates a new session record in the database for the user [packages/server/src/routes/sessions.ts].
* **Auth & Middleware**: `requireAuth`, `requireCreditsBalance`, `createSessionValidator` [packages/server/src/routes/sessions.ts].
* **Request**:
  - Headers: `Authorization: Bearer <token>`, `Content-Type: application/json` [packages/cli/src/lib/api-client.ts].
  - Body JSON (`createSessionSchema`):
    - `title`: `string` (required). Session title [packages/server/src/routes/sessions.ts].
    ```json
    {
      "title": "Fix broken search validation"
    }
    ```
* **Success Response**:
  - Status: `201 Created` [packages/server/src/routes/sessions.ts].
  - Body: Created `Session` record object [packages/server/src/routes/sessions.ts].
* **Error Responses**:
  - `400 Bad Request`: `{ "error": "Invalid request body" }` [packages/server/src/routes/sessions.ts].
  - `401 Unauthorized`: `{ "error": "Unauthorized. Run /login to continue" }` [packages/server/src/middleware/require-auth.ts].
  - `402 Payment Required`: `{ "error": "No credits remaining. Run /upgrade to buy more credits." }` [packages/server/src/middleware/require-credits-balance.ts].
  - `503 Service Unavailable`: `{ "error": "Unable to verify credits balance right now." }` [packages/server/src/middleware/require-credits-balance.ts].
* **Side Effects**: Calls Polar API to check balance; creates `Session` row in PostgreSQL [packages/server/src/middleware/require-credits-balance.ts, packages/server/src/routes/sessions.ts].
* **Caller**: `NewSession` screen component via `apiClient.sessions.$post({ json: { title } })` [packages/cli/src/screens/new-session.tsx].

---

### 5.6. `POST /chat`
* **Purpose**: Orchestrates AI model streaming, validates tools, updates database session state, and ingests credit billing [packages/server/src/routes/chat.ts].
* **Auth & Middleware**: `requireAuth`, `requireCreditsBalance`, `submitValidator` [packages/server/src/routes/chat.ts].
* **Request**:
  - Headers: `Authorization: Bearer <token>`, `Content-Type: application/json` [packages/cli/src/hooks/use-chat.ts].
  - Body JSON (`submitSchema`):
    - `id`: `string` (required). Session ID [packages/server/src/routes/chat.ts].
    - `messages`: `array` (required, min 1 item). Array of `NightcodeUIMessage` objects [packages/server/src/routes/chat.ts].
    - `mode`: `"PLAN" | "BUILD"` (required) [packages/shared/src/schemas.ts, packages/server/src/routes/chat.ts].
    - `model`: `string` (required, must be valid model ID in `SUPPORTED_CHAT_MODELS`) [packages/shared/src/models.ts, packages/server/src/routes/chat.ts].
    ```json
    {
      "id": "cm7z8x1q200003b6g89abc123",
      "mode": "BUILD",
      "model": "gemini-3.5-flash-lite",
      "messages": [
        {
          "id": "msg-101",
          "role": "user",
          "parts": [{ "type": "text", "text": "Hello" }]
        }
      ]
    }
    ```
* **Success Response**:
  - Status: `200 OK` [packages/server/src/routes/chat.ts].
  - Content-Type: `text/plain; charset=utf-8` (Server-Sent Event UI Stream) [packages/server/src/routes/chat.ts].
* **Error Responses**:
  - `400 Bad Request`: `{ "error": "Invalid request body" }` [packages/server/src/routes/chat.ts].
  - `401 Unauthorized`: `{ "error": "Unauthorized. Run /login to continue" }` [packages/server/src/middleware/require-auth.ts].
  - `402 Payment Required`: `{ "error": "No credits remaining. Run /upgrade to buy more credits." }` [packages/server/src/middleware/require-credits-balance.ts].
  - `404 Not Found`: `{ "error": "Session not found" }` [packages/server/src/routes/chat.ts].
  - `503 Service Unavailable`: `{ "error": "Unable to verify credits balance right now." }` [packages/server/src/middleware/require-credits-balance.ts].
* **Side Effects**: Checks Polar balance; queries & updates `Session.messages` in PostgreSQL; streams to third-party LLM provider; ingests usage event to Polar (`ingestAiUsage`) [packages/server/src/routes/chat.ts, packages/server/src/lib/polar.ts].
* **Caller**: `useChat` hook via `DefaultChatTransport` [packages/cli/src/hooks/use-chat.ts].

---

### 5.7. `POST /billing/checkout`
* **Purpose**: Generates a Polar checkout URL for buying credits [packages/server/src/routes/billing.ts].
* **Auth & Middleware**: `requireAuth` [packages/server/src/index.ts, packages/server/src/routes/billing.ts].
* **Request**:
  - Headers: `Authorization: Bearer <token>` [packages/cli/src/lib/api-client.ts].
* **Success Response**:
  - Status: `200 OK` [packages/server/src/routes/billing.ts].
  - Body:
    ```json
    {
      "url": "https://sandbox.polar.sh/checkout/chk_123456789"
    }
    ```
* **Error Responses**:
  - `401 Unauthorized`: `{ "error": "Unauthorized. Run /login to continue" }` [packages/server/src/middleware/require-auth.ts].
  - `500 Internal Server Error`: `{ "error": "Internal server error" }` [packages/server/src/index.ts].
* **Side Effects**: Calls Polar SDK `polar.checkouts.create` [packages/server/src/lib/polar.ts].
* **Caller**: `openUpgradeCheckout()` in `packages/cli/src/lib/upgrade.ts`.

---

### 5.8. `POST /billing/portal`
* **Purpose**: Generates a Polar Customer Portal session URL for managing billing [packages/server/src/routes/billing.ts].
* **Auth & Middleware**: `requireAuth` [packages/server/src/index.ts, packages/server/src/routes/billing.ts].
* **Request**:
  - Headers: `Authorization: Bearer <token>` [packages/cli/src/lib/api-client.ts].
* **Success Response**:
  - Status: `200 OK` [packages/server/src/routes/billing.ts].
  - Body:
    ```json
    {
      "url": "https://sandbox.polar.sh/customer-portal/cps_987654321"
    }
    ```
* **Error Responses**:
  - `401 Unauthorized`: `{ "error": "Unauthorized. Run /login to continue" }` [packages/server/src/middleware/require-auth.ts].
  - `500 Internal Server Error`: `{ "error": "Internal server error" }` [packages/server/src/index.ts].
* **Side Effects**: Calls Polar SDK `polar.customerSessions.create` [packages/server/src/lib/polar.ts].
* **Caller**: `openBillingPortal()` in `packages/cli/src/lib/upgrade.ts`.

---

### 5.9. `GET /billing/success`
* **Purpose**: Displays a web confirmation landing page after successful checkout or portal interaction [packages/server/src/routes/billing.ts].
* **Auth & Middleware**: Unprotected (Public web page) [packages/server/src/routes/billing.ts].
* **Request**:
  - Headers: Standard HTTP GET headers.
* **Success Response**:
  - Status: `200 OK` [packages/server/src/routes/billing.ts].
  - Content-Type: `text/plain` [packages/server/src/routes/billing.ts].
  - Body Text: `"Done. You can close this tab and return to Nightcode"` [packages/server/src/routes/billing.ts].
* **Error Responses**: None [packages/server/src/routes/billing.ts].
* **Side Effects**: None [packages/server/src/routes/billing.ts].
* **Caller**: Web browser redirected from Polar checkout page [packages/server/src/lib/polar.ts].

---

## 6. The Chat Streaming Protocol

The streaming protocol for `POST /chat` orchestrates interactive text generation, thinking/reasoning blocks, local tool executions, and credit accounting [packages/server/src/routes/chat.ts, packages/cli/src/hooks/use-chat.ts].

```
CLI UI                                Backend Server                         LLM Provider
  │                                         │                                     │
  ├── 1. POST /chat (messages, mode) ──────>│                                     │
  │                                         ├── 2. streamText() ─────────────────>│
  │                                         │                                     │
  │<── 3. SSE Stream (start chunk) ─────────┤                                     │
  │<── 4. SSE Stream (reasoning/text) ──────|<── 5. LLM Token Stream ─────────────┤
  │<── 6. SSE Stream (tool call chunk) ─────|<── 7. LLM requests toolCall ───────┤
  │                                         │                                     │
  ├── 8. CLI executes tool locally          │                                     │
  │   (readFile / editFile / bash)          │                                     │
  │                                         │                                     │
  ├── 9. POST /chat (tool output appended) >│                                     │
  │                                         ├── 10. Resume streamText() ─────────>│
  │<── 11. SSE Stream (final text) ─────────|<── 12. LLM Final Output ───────────┤
  │                                         │                                     │
  │                                         ├── 13. db.session.update()           │
  │                                         └── 14. ingestAiUsage (Polar)         │
```

### Request Structure & Optimizations
* **Selective Request Truncation**: `prepareSendMessagesRequest` sends only the user-assistant message pair relevant to the active turn if the last message is assistant role, or the last message if user role, avoiding redundant payload transfer [packages/cli/src/hooks/use-chat.ts].
* **History Merging**: The backend fetches existing `Session.messages` from PostgreSQL and merges incoming request messages by matching message `id` [packages/server/src/routes/chat.ts].

### Stream Event Types (`toUIMessageStreamResponse`)
The server streams UI message stream parts to the client [packages/server/src/routes/chat.ts]:
1. **`start` Part**: Emitted at stream start; carries metadata `{ mode, model }` [packages/server/src/routes/chat.ts].
2. **`reasoning` Part**: Emitted when model generates thinking tokens [packages/cli/src/components/messages/bot-message.tsx].
3. **`text` Part**: Emitted as text tokens arrive [packages/cli/src/components/messages/bot-message.tsx].
4. **Tool Call Part**: Emitted when model calls a tool (`type: "dynamic-tool"` or `type: "tool-<name>"`), carrying `toolCallId`, `toolName`, and `input` [packages/cli/src/components/messages/bot-message.tsx, packages/server/src/routes/chat.ts].
5. **`finish` Part**: Emitted when stream completes; carries metadata `{ mode, model, durationMs, usage }` [packages/server/src/routes/chat.ts].

### Resuming Stream with Local Tool Output
1. CLI receives tool call event in `onToolCall` [packages/cli/src/hooks/use-chat.ts].
2. CLI executes `executeLocalTool(toolName, input, mode)` on local machine [packages/cli/src/hooks/use-chat.ts, packages/cli/src/lib/local-tools.ts].
3. CLI calls `chat.addToolOutput`, setting tool part state to `"output-available"` with `output` payload (or `"output-error"` with `errorText`) [packages/cli/src/hooks/use-chat.ts].
4. `useChat`'s `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls` triggers a new `POST /chat` request with the updated tool output [packages/cli/src/hooks/use-chat.ts].
5. Backend verifies no tool calls are pending (`!hasPendingToolCalls`), passes messages to `streamText`, resumes LLM generation, saves complete messages to PostgreSQL, and ingests usage to Polar [packages/server/src/routes/chat.ts].

### Stream Interruption & Disconnect Behavior
* If stream is aborted (`event.isAborted === true`) or pending tool outputs remain (`hasPendingToolCalls === true`), `onFinish` returns early:
  - Database `Session.messages` is **NOT updated** [packages/server/src/routes/chat.ts].
  - Polar usage metering is **NOT ingested** [packages/server/src/routes/chat.ts].

---

## 7. Authentication Flow Endpoints

### Authorization Callback (`GET /auth/callback`)
* **URL**: `GET /auth/callback?code=...&state=...` [packages/server/src/routes/auth.ts].
* **Query Parameters**:
  - `code`: Authorization code issued by Clerk [packages/server/src/routes/auth.ts].
  - `state`: Base64url-encoded string representing `{ port: number, nonce: string }` [packages/cli/src/lib/oauth.ts, packages/server/src/routes/auth.ts].
  - `error`: Error code string returned by Clerk if access was denied [packages/server/src/routes/auth.ts].
  - `error_description`: Human-readable error description [packages/server/src/routes/auth.ts].

### Validation & Redirect Sequence
1. Route checks for `error` parameter. If present, returns status `400` with `error_description` text [packages/server/src/routes/auth.ts].
2. Route checks for missing `code` or `state`. If missing, returns `400` with text `"Missing authorization code or state"` [packages/server/src/routes/auth.ts].
3. Route splits `state` on `.` and decodes base64url JSON payload [packages/server/src/routes/auth.ts].
4. Route validates `port` is a valid number. If invalid, returns `400` with text `"Invalid state"` [packages/server/src/routes/auth.ts].
5. Route constructs redirect URL `http://localhost:${port}/callback?code=${code}&state=${state}` and issues an HTTP `302 Redirect` to the local CLI server [packages/server/src/routes/auth.ts].

---

## 8. Billing Endpoints

### 1. Checkout Endpoint (`POST /billing/checkout`)
* Calls `createCheckoutUrl({ customerExternalId: userId, requestUrl: c.req.url })` [packages/server/src/routes/billing.ts, packages/server/src/lib/polar.ts].
* Invokes `polar.checkouts.create({ products: [POLAR_PRODUCT_ID], successUrl: ".../billing/success", externalCustomerId: userId })` [packages/server/src/lib/polar.ts].
* Returns `{ "url": "https://..." }` [packages/server/src/routes/billing.ts].

### 2. Customer Portal Endpoint (`POST /billing/portal`)
* Calls `createCustomerPortalUrl({ customerExternalId: userId, requestUrl: c.req.url })` [packages/server/src/routes/billing.ts, packages/server/src/lib/polar.ts].
* Invokes `polar.customerSessions.create({ externalCustomerId: userId, returnUrl: ".../billing/success" })` [packages/server/src/lib/polar.ts].
* Returns `{ "url": "https://..." }` [packages/server/src/routes/billing.ts].

### 3. Success Endpoint (`GET /billing/success`)
* Returns status `200` plain text `"Done. You can close this tab and return to Nightcode"` [packages/server/src/routes/billing.ts].

### Polar Outage / Failure Behavior
* If Polar API is unreachable during checkout or portal requests, SDK call throws an exception, caught by `app.onError` and returned as `500 Internal Server Error` (`{ "error": "Internal server error" }`) [packages/server/src/index.ts, packages/server/src/lib/polar.ts].

---

## 9. Idempotency and Concurrency

### Idempotency Matrix

| Endpoint | Safe to Retry (Idempotent)? | Double-Write / Double-Charge Risk | Notes |
| :--- | :--- | :--- | :--- |
| `GET /sessions` | Yes | No | Read-only query [packages/server/src/routes/sessions.ts] |
| `GET /sessions/:id` | Yes | No | Read-only query [packages/server/src/routes/sessions.ts] |
| `POST /sessions` | No | Low | Repeated calls create duplicate empty sessions [packages/server/src/routes/sessions.ts] |
| `POST /chat` | No | Medium | Retrying completed messages can double-ingest Polar usage events if eventId differs [packages/server/src/routes/chat.ts, packages/server/src/lib/polar.ts] |
| `POST /billing/checkout` | Yes | No | Generates ephemeral checkout session URLs [packages/server/src/lib/polar.ts] |
| `POST /billing/portal` | Yes | No | Generates ephemeral portal session URLs [packages/server/src/lib/polar.ts] |

### Overwrite & Race Condition Behavior
* Concurrent requests to `POST /chat` for the same session ID will execute in parallel.
* `db.session.update` overwrites the complete `messages` JSON array with the payload from whichever request completes last, destroying messages saved by earlier requests [packages/server/src/routes/chat.ts].

### Billing Deduplication
* Polar meter event ingestion uses a deterministic event ID: `eventId: "chat-message:" + event.responseMessage.id` [packages/server/src/routes/chat.ts, packages/server/src/lib/polar.ts]. Polar deduplicates events matching the same `eventId` [packages/server/src/lib/polar.ts].

---

## 10. Rules for Changing the API

### Must Always
1. **Maintain `AppType` Route Registration**: Register every new route on the primary Hono app chain using `.route("/path", handler)` so types export to `AppType` for CLI RPC usage [packages/server/src/index.ts].
2. **Apply `requireAuth` to Protected Routes**: Register new protected endpoints under `app.use("/path/*", requireAuth)` or attach middleware directly to route instances [packages/server/src/index.ts, packages/server/src/middleware/require-auth.ts].
3. **Validate Inputs with Zod & `zValidator`**: Wrap request body inputs using `zValidator("json", schema)` to enforce runtime validation [packages/server/src/routes/sessions.ts, packages/server/src/routes/chat.ts].
4. **Use Standard Error Format**: Return JSON error objects using `{ error: string }` with appropriate HTTP status codes (`400`, `401`, `402`, `404`, `503`) [packages/server/src/middleware/require-auth.ts, packages/server/src/middleware/require-credits-balance.ts].
5. **Synchronize `@nightcode/shared`**: Update shared schemas or models in `@nightcode/shared` before referencing new tools or models in server route handlers [packages/shared/src/schemas.ts, packages/server/src/routes/chat.ts].

### Must Never
1. **Never Break `AppType` RPC Types**: Never return inconsistent response types for the same status code that break Hono client type inference in `@nightcode/cli` [packages/cli/src/lib/api-client.ts].
2. **Never Bypass `requireCreditsBalance` on Generation Endpoints**: Never expose routes that invoke LLM model streams without applying pre-flight credit verification [packages/server/src/routes/chat.ts, packages/server/src/middleware/require-credits-balance.ts].
3. **Never Log OAuth Tokens or Keys**: Never include authorization tokens or API keys in Sentry logs or server error outputs [packages/server/src/index.ts, packages/server/src/middleware/require-auth.ts].

---

## 11. Known Gaps

1. **Exposed Debug Endpoint**: `GET /debug-sentry` remains exposed in production routes, allowing unauthenticated users to trigger server errors and Sentry logs [packages/server/src/index.ts].
2. **Inconsistent Error Formats**: Most routes return JSON `{ error: string }`, but `/auth/callback` and `/billing/success` return plain text responses (`c.text(...)`) [packages/server/src/routes/auth.ts, packages/server/src/routes/billing.ts].
3. **Missing Session Management Endpoints**: No endpoints exist for deleting sessions (`DELETE /sessions/:id`) or updating session titles (`PATCH /sessions/:id`) [packages/server/src/routes/sessions.ts].
4. **Missing Pagination**: `GET /sessions` loads all sessions for a user without limit/offset pagination [packages/server/src/routes/sessions.ts].
5. **Missing Rate Limiting**: Server endpoints lack rate-limiting middleware, exposing backend routes to abuse [packages/server/src/index.ts].
6. **Missing CORS Configuration**: Hono server has no explicit CORS policy configured [packages/server/src/index.ts].

---

## 12. Open Questions

1. `UNCLEAR:` Whether `GET /debug-sentry` is intentionally left in routes for production environment testing or should be stripped before release [packages/server/src/index.ts].
2. `UNCLEAR:` Absence of explicit CORS middleware in Hono server (`packages/server/src/index.ts`) — whether cross-origin web client requests are intentionally disallowed or deferred [packages/server/src/index.ts].
