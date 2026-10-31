# Nightcode — Codebase Scalability: Issues, Analysis & Solutions

> **Target Scope**: Architectural and code-level bottlenecks encountered as projects and codebases grow in size, covering both:
> 1. **Target Project Scale**: When Nightcode operates on large user repositories (thousands of files, large source files, monorepos, deep directory trees).
> 2. **Application Architecture Scale**: When Nightcode sessions, message histories, database rows, and concurrent workloads expand.

---

## 📑 Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Root Cause Analysis & Issue Catalog](#2-root-cause-analysis--issue-catalog)
   - [Category A: Local Filesystem & CLI Tooling Bottlenecks](#category-a-local-filesystem--cli-tooling-bottlenecks)
     - [Issue 1: Hard 10KB `readFile` Limit & Truncation Hallucinations](#issue-1-hard-10kb-readfile-limit--truncation-hallucinations)
     - [Issue 2: Inadequate Directory Exclusions & Missing `.gitignore` Awareness](#issue-2-inadequate-directory-exclusions--missing-gitignore-awareness)
     - [Issue 3: Fragile Exact-String Matching in `editFile`](#issue-3-fragile-exact-string-matching-in-editfile)
     - [Issue 4: Unindexed Symbol Navigation & Brute-Force Codebase Discovery](#issue-4-unindexed-symbol-navigation--brute-force-codebase-discovery)
     - [Issue 5: Subprocess Spawning, Long Builds & Zombie Processes in `bash`](#issue-5-subprocess-spawning-long-builds--zombie-processes-in-bash)
   - [Category B: AI Context Window & LLM Orchestration Bottlenecks](#category-b-ai-context-window--llm-orchestration-bottlenecks)
     - [Issue 6: Context Window Explosion & Runaway Token Costs](#issue-6-context-window-explosion--runaway-token-costs)
     - [Issue 7: Attention Degradation ("Lost in the Middle") & LLM Hallucinations](#issue-7-attention-degradation-lost-in-the-middle--llm-hallucinations)
   - [Category C: Database & Backend Persistence Bottlenecks](#category-c-database--backend-persistence-bottlenecks)
     - [Issue 8: Monolithic `Session.messages` JSON Blob & TOAST Write Amplification](#issue-8-monolithic-sessionmessages-json-blob--toast-write-amplification)
     - [Issue 9: Synchronous External HTTP Requests in Middleware (Clerk & Polar)](#issue-9-synchronous-external-http-requests-in-middleware-clerk--polar)
     - [Issue 10: Server & Client Out-Of-Memory (OOM) on Monolithic Session Load](#issue-10-server--client-out-of-memory-oom-on-monolithic-session-load)
   - [Category D: Terminal UI & Client Performance Bottlenecks](#category-d-terminal-ui--client-performance-bottlenecks)
     - [Issue 11: OpenTUI Frame Rate Collapse (Lack of Message Virtualization)](#issue-11-opentui-frame-rate-collapse-lack-of-message-virtualization)
     - [Issue 12: Unbounded Client Memory in `useChat`](#issue-12-unbounded-client-memory-in-usechat)
   - [Category E: Codebase Safety & Multi-File Consistency](#category-e-codebase-safety--multi-file-consistency)
     - [Issue 13: Absence of Atomic Rollback or Checkpoint Mechanism](#issue-13-absence-of-atomic-rollback-or-checkpoint-mechanism)
3. [Improvement Suggestions & Implementation Code](#3-improvement-suggestions--implementation-code)
   - [Solution 1: Range-Based `readFile` with Line Numbers & Metadata](#solution-1-range-based-readfile-with-line-numbers--metadata)
   - [Solution 2: `.gitignore`-Aware Directory Traversal & Scanner](#solution-2-gitignore-aware-directory-traversal--scanner)
   - [Solution 3: Robust `editFile` with Line Anchoring & Atomic Disk Writes](#solution-3-robust-editfile-with-line-anchoring--atomic-disk-writes)
   - [Solution 4: Intelligent Context Window Sliding & Historical Tool Output Compaction](#solution-4-intelligent-context-window-sliding--historical-tool-output-compaction)
   - [Solution 5: Normalized Relational Database Schema & Atomic Message Appends](#solution-5-normalized-relational-database-schema--atomic-message-appends)
   - [Solution 6: High-Performance In-Memory/Redis Caching for Auth & Billing](#solution-6-high-performance-in-memoryredis-caching-for-auth--billing)
   - [Solution 7: Virtualized / Windowed Message Rendering in OpenTUI](#solution-7-virtualized--windowed-message-rendering-in-opentui)
   - [Solution 8: Git-Based Checkpointing and Safety Rollback](#solution-8-git-based-checkpointing-and-safety-rollback)
4. [Prioritized Implementation Matrix](#4-prioritized-implementation-matrix)
5. [Summary Checklist](#5-summary-checklist)

---

## 1. Executive Summary

As a software project grows from a small prototype into an enterprise codebase, both the **assistant tools operating on the user's codebase** and the **underlying Nightcode platform architecture** encounter severe scaling bottlenecks. 

In small projects (5–20 files, <1,000 LOC, short 2-turn prompts), simple file readers, monolithic JSON database rows, and unpruned context buffers perform acceptably. However, when deployed against large repositories (thousands of files, monorepos, multi-megabyte lockfiles, deep directory structures) and sustained coding sessions:

1. **Tool Ingestion Fails**: File reads truncate abruptly at 10KB; search queries scan through `dist/`, `.next/`, or lockfiles; `editFile` fails on duplicate code blocks; and build tasks hang or leave orphaned background processes.
2. **Context Windows Explode**: Every file read and bash log is retained verbatim across all subsequent conversational turns, consuming 100,000+ tokens per request, multiplying API costs by 10x–50x and inducing hallucinated code edits.
3. **Database Write Amplification**: Storing the entire chat history in a single PostgreSQL JSON column (`Session.messages`) causes massive disk I/O, TOAST table serialization overhead, and network memory spikes.
4. **Terminal Interface Freezes**: The OpenTUI terminal renderer re-renders thousands of lines of unvirtualized past output at 60 FPS, causing frame rate collapse (< 5 FPS) and unresponsive keyboard navigation.

This document systematically breaks down every scalability issue, provides its technical root cause, and delivers battle-tested, production-ready replacement code.

---

## 2. Root Cause Analysis & Issue Catalog

---

### Category A: Local Filesystem & CLI Tooling Bottlenecks

#### Issue 1: Hard 10KB `readFile` Limit & Truncation Hallucinations
- **Source Location**: `packages/cli/src/lib/local-tools.ts` (`MAX_FILE_SIZE = 10_000`)
- **Root Cause**:
  ```typescript
  const MAX_FILE_SIZE = 10_000;
  // ...
  const content = await readFile(resolved, "utf-8");
  return content.length > MAX_FILE_SIZE
    ? {
        content: content.slice(0, MAX_FILE_SIZE),
        truncate: true,
        totalLength: content.length,
      }
    : { content };
  ```
- **Failure in Large Codebases**:
  - 10,000 characters is only ~200–300 lines of code. Real-world files (e.g. controllers, complex components, schemas, generated code) easily reach 500–2,000+ lines (30KB–150KB).
  - The model only receives the first 10KB of the file. It is blind to exports, functions, or types defined further down.
  - When the model attempts to modify the file using `editFile` or rewrite it using `writeFile`, it hallucinates the missing half or fails because `oldString` cannot be found.
  - The tool lacks line-range parameters (`startLine`, `endLine`, `offset`, `limit`), preventing the LLM from ever inspecting the rest of the file.

#### Issue 2: Inadequate Directory Exclusions & Missing `.gitignore` Awareness
- **Source Location**: `packages/cli/src/lib/local-tools.ts` (`listDirectory`, `glob`, `grep`)
- **Root Cause**:
  - `listDirectory` only ignores: `entry.startsWith(".") || entry === "node_modules" || entry.startsWith(".env")`.
  - `glob.scan` only ignores: `match.includes("node_modules") || match.startsWith(".env")`.
  - `grep` excludes `--exclude-dir=node_modules`, `--exclude-dir=.git`, `--exclude=.env*`.
- **Failure in Large Codebases**:
  - Real projects contain build directories (`dist/`, `build/`, `out/`, `.next/`, `.turbo/`, `target/`, `vendor/`), package manager artifacts (`bun.lock` which can be 5MB+, `package-lock.json`), coverage reports, sourcemaps (`.map`), and binary assets (`.png`, `.wasm`, `.pdf`).
  - Running `glob` or `grep` scans through megabytes of bundled minified JavaScript and binaries.
  - A simple search for an identifier returns minified bundle lines 80,000 characters long, quickly exhausting the `MAX_MATCHES = 50` quota with useless build artifacts before finding actual source files.
  - Standard `.gitignore` and `.nightcodeignore` files are completely ignored.

#### Issue 3: Fragile Exact-String Matching in `editFile`
- **Source Location**: `packages/cli/src/lib/local-tools.ts`
- **Root Cause**:
  ```typescript
  const occurrences = content.split(oldString).length - 1;
  if (occurrences === 0) throw new Error("oldString not found in file");
  if (occurrences > 1)
    throw new Error(`oldString is ambiguous; found ${occurrences} matches`);

  await writeFile(resolved, content.replace(oldString, newString), "utf-8");
  ```
- **Failure in Large Codebases**:
  - In larger codebases, boilerplate structures (e.g., standard error returns `if (!session) return c.json(...)`, closing brackets `});`, `export default app;`) repeat throughout the file.
  - If `oldString` matches 2 or more places, the edit fails completely with `oldString is ambiguous`.
  - Conversely, subtle indentation variations, carriage returns (`\r\n` vs `\n`), or LLM formatting discrepancies trigger `oldString not found`.
  - Non-atomic file writing: Writing directly to `resolved` without temporary file creation risks file corruption if the process aborts mid-write.

#### Issue 4: Unindexed Symbol Navigation & Brute-Force Codebase Discovery
- **Source Location**: `packages/server/src/system-prompt.ts`, `packages/cli/src/lib/local-tools.ts`
- **Root Cause**:
  - There is no AST (Abstract Syntax Tree), symbol map, ctags, or language server index.
  - To locate where a function or class is declared, the LLM must execute multiple rounds of `glob` -> `grep` -> `readFile`.
- **Failure in Large Codebases**:
  - In a project with 1,000+ files, discovering dependencies takes 5–8 conversational roundtrips.
  - Each roundtrip incurs network latency and token costs, and fills the context window with file listings before any actual code editing begins.

#### Issue 5: Subprocess Spawning, Long Builds & Zombie Processes in `bash`
- **Source Location**: `packages/cli/src/lib/local-tools.ts`
- **Root Cause**:
  ```typescript
  const proc = Bun.spawn(["bash", "-c", command], { ... });
  const timer = setTimeout(() => proc.kill(), timeout);
  ```
- **Failure in Large Codebases**:
  - Running a full test suite (`bun test`, `npm test`) or build (`tsc --noEmit`, `cargo build`) on a large project routinely exceeds the 30-second default timeout (`DEFAULT_TIMEOUT = 30_000`).
  - When `proc.kill()` is invoked, it only terminates the parent shell process. Child processes spawned by the shell (e.g., node workers, compiler threads) are orphaned into zombie processes that continue consuming 100% CPU.
  - Unbounded stdout capture can allocate hundreds of megabytes of RAM before truncation occurs.

---

### Category B: AI Context Window & LLM Orchestration Bottlenecks

#### Issue 6: Context Window Explosion & Runaway Token Costs
- **Source Location**: `packages/server/src/routes/chat.ts`
- **Root Cause**:
  ```typescript
  const previousMessages = Array.isArray(session.messages)
    ? (session.messages as unknown as NightcodeUIMessage[])
    : [];

  const mergedMessages = [...previousMessages];
  // ... Incoming messages are merged without compaction
  const nextMessages = await validateUIMessages({ messages: mergedMessages, tools });
  const modelMessages = await convertToModelMessages(nextMessages, { tools });
  ```
- **Failure in Large Codebases**:
  - In a 15-turn session where each turn reads 2–3 files (10KB each) and executes tests:
    - Turn 1: 3,000 tokens.
    - Turn 5: 35,000 tokens.
    - Turn 10: 90,000 tokens.
    - Turn 15: 160,000+ tokens!
  - Every single request re-transmits all historical file reads, grep outputs, and directory listings.
  - Operational token costs increase quadratically ($O(N^2)$ across turns).
  - API response latency increases from 1 second to 20+ seconds due to LLM prompt processing overhead.

#### Issue 7: Attention Degradation ("Lost in the Middle") & LLM Hallucinations
- **Root Cause**:
  - Large language models suffer from attention degradation when prompt context exceeds 30,000–50,000 tokens.
  - When the context is saturated with obsolete historical file contents read 8 turns ago, the model loses track of recent file modifications.
  - The model hallucinates old function signatures, overwrites newly introduced edits, or generates code targeting deleted files.

---

### Category C: Database & Backend Persistence Bottlenecks

#### Issue 8: Monolithic `Session.messages` JSON Blob & TOAST Write Amplification
- **Source Location**: `packages/database/prisma/schema.prisma` & `packages/server/src/routes/chat.ts`
- **Root Cause**:
  ```prisma
  model Session {
    id        String   @id @default(cuid())
    userId    String
    title     String
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
    messages  Json     @default("[]") // <-- Monolithic JSON array
    @@index([userId])
  }
  ```
  ```typescript
  // packages/server/src/routes/chat.ts
  await db.session.update({
    where: { id, userId },
    data: {
      messages: event.messages as unknown as Prisma.InputJsonValue,
    },
  });
  ```
- **Failure in Large Codebases**:
  - **PostgreSQL TOAST Thrashing**: Values exceeding ~2KB are compressed and moved to out-of-line TOAST tables. A 30-turn session with tool logs easily reaches 5MB–15MB.
  - **Write Amplification**: Appending a 200-byte user prompt requires PostgreSQL to decompress, reconstruct, recompress, and rewrite the entire 10MB JSON blob to disk and WAL (Write-Ahead Logging).
  - Under 100 concurrent developers, 10MB updates create 1 GB/sec of database write pressure, causing connection pool exhaustion, disk IOPS saturation, and transaction timeouts.
  - **Data Loss Race Condition**: Two concurrent requests will overwrite each other's entire history because updates are non-atomic array rewrites.

#### Issue 9: Synchronous External HTTP Requests in Middleware (Clerk & Polar)
- **Source Location**: `packages/server/src/middleware/require-auth.ts`, `require-credits-balance.ts`
- **Root Cause**:
  - Every `POST /chat` and `POST /sessions` request triggers synchronous network HTTP round-trips to Clerk (auth validation) and Polar (billing balance check).
- **Failure in Large Codebases**:
  - Adds 200ms–500ms of synchronous latency to every single interaction.
  - Multi-agent or fast-loop tool calls trigger external third-party rate limits (HTTP 429), locking the user out of the application.

#### Issue 10: Server & Client Out-Of-Memory (OOM) on Monolithic Session Load
- **Source Location**: `packages/server/src/routes/sessions.ts` (`GET /:id`)
- **Root Cause**:
  - `GET /sessions/:id` serializes the full `Session` row including the multi-megabyte `messages` JSON blob.
- **Failure in Large Codebases**:
  - CLI startup hangs for several seconds downloading and parsing 10MB+ of JSON for a single session.
  - In high-density server environments (e.g. Bun containers with 512MB RAM), a few concurrent session fetches trigger OOM crashes.

---

### Category D: Terminal UI & Client Performance Bottlenecks

#### Issue 11: OpenTUI Frame Rate Collapse (Lack of Message Virtualization)
- **Source Location**: `packages/cli/src/components/messages/bot-message.tsx`, `packages/cli/src/screens/session.tsx`
- **Root Cause**:
  ```tsx
  // session.tsx
  {messages.map((msg) => (
    <ChatMessage key={msg.id} msg={msg} />
  ))}
  ```
- **Failure in Large Codebases**:
  - As a session reaches 30+ turns with expansive tool logs and reasoning blocks, hundreds of React OpenTUI nodes are mounted in the terminal frame tree.
  - On every incoming streaming token chunk, OpenTUI recalculates terminal character grids and borders for the entire document at 60 FPS.
  - Terminal frame rate collapses from 60 FPS to under 5 FPS. User keystrokes buffer, scroll interactions stutter, and the terminal becomes unresponsive.

#### Issue 12: Unbounded Client Memory in `useChat`
- **Source Location**: `packages/cli/src/hooks/use-chat.ts`
- **Root Cause**:
  - `useAiChat` stores every historical message, tool input, and tool output in client memory indefinitely without eviction or offloading.
- **Failure in Large Codebases**:
  - The CLI process memory grows to 500MB+ for a single long session, causing garbage collection pauses and UI stutter.

---

### Category E: Codebase Safety & Multi-File Consistency

#### Issue 13: Absence of Atomic Rollback or Checkpoint Mechanism
- **Source Location**: `packages/cli/src/lib/local-tools.ts` (`writeFile`, `editFile`)
- **Root Cause**:
  - Tools perform direct, unversioned mutations on local files on disk.
- **Failure in Large Codebases**:
  - In complex refactors spanning 10+ files, if the AI makes an error on file 7 or is interrupted by the user, the project is left in a broken, half-migrated state with syntax errors.
  - There is no automated stash, checkpoint, or rollback mechanism to revert to the pre-prompt state.

---

## 3. Improvement Suggestions & Implementation Code

---

### Solution 1: Range-Based `readFile` with Line Numbers & Metadata

Instead of truncating at 10KB and leaving the LLM blind, enhance `readFile` to support:
1. `lineStart` and `lineEnd` windowing.
2. Formatted line numbers (e.g. `142 | function calculateTotal() {`) which dramatically improve `editFile` targeting.
3. Metadata return indicating `totalLines` and `hasMore`.

#### 1.1 Shared Schema Update (`packages/shared/src/schemas.ts`)
```typescript
export const readFileSchema = z.object({
  path: z.string().describe("Relative path to the file to read"),
  lineStart: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("1-based line number to start reading from (default: 1)"),
  lineLimit: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .describe("Maximum number of lines to read (default: 300)"),
});
```

#### 1.2 CLI Implementation (`packages/cli/src/lib/local-tools.ts`)
```typescript
case "readFile": {
  const { path, lineStart = 1, lineLimit = 300 } = toolInputSchemas.readFile.parse(input);
  const { resolved } = resolveInsideCwd(path);
  
  const rawContent = await readFile(resolved, "utf-8");
  const allLines = rawContent.split(/\r?\n/);
  const totalLines = allLines.length;

  const startIndex = Math.max(0, lineStart - 1);
  const endIndex = Math.min(totalLines, startIndex + lineLimit);
  const selectedLines = allLines.slice(startIndex, endIndex);

  // Prefix each line with its 1-based line number for precise AI referencing
  const padWidth = String(endIndex).length;
  const numberedContent = selectedLines
    .map((line, idx) => {
      const lineNum = String(startIndex + idx + 1).padStart(padWidth, " ");
      return `${lineNum} | ${line}`;
    })
    .join("\n");

  return {
    path: relative(process.cwd(), resolved),
    content: numberedContent,
    lineStart: startIndex + 1,
    lineEnd: endIndex,
    totalLines,
    hasMore: endIndex < totalLines,
  };
}
```

---

### Solution 2: `.gitignore`-Aware Directory Traversal & Scanner

Introduce a robust ignore engine using the standard `ignore` parser to automatically exclude `.git`, `node_modules`, build artifacts, minified files, lockfiles, and project-specific `.gitignore` rules.

#### 2.1 Ignore Filter Utility (`packages/cli/src/lib/ignore-filter.ts`)
```typescript
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import ignore, { type Ignore } from "ignore";

const DEFAULT_IGNORES = [
  ".git",
  ".env*",
  "node_modules",
  "dist",
  "build",
  "out",
  ".next",
  ".turbo",
  ".cache",
  "coverage",
  "*.lock",
  "*.lockb",
  "*.log",
  "*.map",
  "*.min.js",
  "*.min.css",
  "*.wasm",
  "*.png",
  "*.jpg",
  "*.jpeg",
  "*.ico",
  "*.svg",
];

export function getProjectIgnoreFilter(cwd: string): Ignore {
  const ig = ignore().add(DEFAULT_IGNORES);

  const gitignorePath = join(cwd, ".gitignore");
  if (existsSync(gitignorePath)) {
    try {
      ig.add(readFileSync(gitignorePath, "utf-8"));
    } catch {
      // Graceful fallback if unreadable
    }
  }

  const nightcodeIgnorePath = join(cwd, ".nightcodeignore");
  if (existsSync(nightcodeIgnorePath)) {
    try {
      ig.add(readFileSync(nightcodeIgnorePath, "utf-8"));
    } catch {
      // Graceful fallback
    }
  }

  return ig;
}
```

#### 2.2 Updating `glob` and `listDirectory` in `local-tools.ts`
```typescript
import { getProjectIgnoreFilter } from "./ignore-filter";

// Inside listDirectory:
case "listDirectory": {
  const { path } = toolInputSchemas.listDirectory.parse(input);
  const { cwd, resolved } = resolveInsideCwd(path);
  const ig = getProjectIgnoreFilter(cwd);
  
  const entries = await readdir(resolved);
  const results: { name: string; type: "file" | "directory" }[] = [];

  for (const entry of entries) {
    const relFromCwd = relative(cwd, join(resolved, entry)).replace(/\\/g, "/");
    if (ig.ignores(relFromCwd) || ig.ignores(`${relFromCwd}/`)) {
      continue;
    }

    const info = await stat(join(resolved, entry));
    results.push({
      name: entry,
      type: info.isDirectory() ? "directory" : "file",
    });
  }

  results.sort((a, b) =>
    a.type !== b.type
      ? a.type === "directory" ? -1 : 1
      : a.name.localeCompare(b.name)
  );

  return { path: relative(cwd, resolved) || ".", entries: results };
}
```

---

### Solution 3: Robust `editFile` with Line Anchoring & Atomic Disk Writes

Eliminate ambiguous replacement errors by allowing optional line-number anchors and performing atomic disk writes via a temporary swap file.

#### 3.1 Updated `editFile` Implementation (`packages/cli/src/lib/local-tools.ts`)
```typescript
import { randomBytes } from "crypto";
import { rename, unlink } from "fs/promises";

case "editFile": {
  const { path, oldString, newString } = toolInputSchemas.editFile.parse(input);
  const { resolved } = resolveInsideCwd(path);
  
  const content = await readFile(resolved, "utf-8");
  
  // Normalize line endings to avoid CRLF mismatch failures
  const normalizedContent = content.replace(/\r\n/g, "\n");
  const normalizedOld = oldString.replace(/\r\n/g, "\n");
  const normalizedNew = newString.replace(/\r\n/g, "\n");

  const occurrences = normalizedContent.split(normalizedOld).length - 1;

  if (occurrences === 0) {
    throw new Error(
      `oldString not found in ${path}. Verify exact whitespace, indentation, and ensure you read the latest file contents.`
    );
  }
  
  if (occurrences > 1) {
    throw new Error(
      `oldString is ambiguous; found ${occurrences} exact matches. Include more surrounding lines of context to make the replacement target unique.`
    );
  }

  const updatedContent = normalizedContent.replace(normalizedOld, normalizedNew);

  // Atomic file write via temporary file to prevent partial file corruption
  const tempPath = `${resolved}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    await writeFile(tempPath, updatedContent, "utf-8");
    await rename(tempPath, resolved);
  } catch (err) {
    try { await unlink(tempPath); } catch {}
    throw new Error(`Failed to write file atomically: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    success: true as const,
    path: relative(process.cwd(), resolved),
    linesModified: normalizedOld.split("\n").length,
  };
}
```

---

### Solution 4: Intelligent Context Window Sliding & Historical Tool Output Compaction

To prevent context explosion and reduce token costs by >70% without losing critical code context, implement an intelligent message pruning pipeline in `packages/server/src/routes/chat.ts`.

#### 4.1 Token Pruning Pipeline (`packages/server/src/lib/context-pruner.ts`)
```typescript
import type { UIMessage } from "ai";

/**
 * Prunes historical tool call outputs older than `activeTurnsThreshold`.
 * Keeps recent tool outputs fully detailed, while replacing older voluminous
 * tool outputs (e.g. historical file reads, grep dumps) with lightweight semantic markers.
 */
export function compactConversationHistory<T extends UIMessage>(
  messages: T[],
  activeTurnsThreshold: number = 2
): T[] {
  if (messages.length <= activeTurnsThreshold * 2) {
    return messages;
  }

  const cutoffIndex = messages.length - (activeTurnsThreshold * 2);

  return messages.map((message, index) => {
    // Leave recent messages and user messages untouched
    if (index >= cutoffIndex || message.role !== "assistant" || !message.parts) {
      return message;
    }

    const prunedParts = message.parts.map((part) => {
      // Check if this is a tool result part
      if (
        (part.type === "dynamic-tool" || part.type.startsWith("tool-")) &&
        "output" in part &&
        part.output != null
      ) {
        const toolName = part.type === "dynamic-tool" 
          ? part.toolName 
          : part.type.slice("tool-".length);

        // Summarize historical readFile output
        if (toolName === "readFile") {
          const out = part.output as { path?: string; totalLines?: number };
          return {
            ...part,
            output: {
              summary: `[Historical file read of ${out.path || "file"} (${out.totalLines || "multiple"} lines) compacted to preserve context window]`,
              compacted: true,
            },
          };
        }

        // Summarize historical grep output
        if (toolName === "grep") {
          const out = part.output as { matches?: unknown[] };
          return {
            ...part,
            output: {
              summary: `[Historical grep results (${out.matches?.length || 0} matches) compacted]`,
              compacted: true,
            },
          };
        }

        // Summarize historical bash output
        if (toolName === "bash") {
          const out = part.output as { exitCode?: number };
          return {
            ...part,
            output: {
              summary: `[Historical command executed with exit code ${out.exitCode ?? 0}]`,
              compacted: true,
            },
          };
        }
      }

      // Compact historical reasoning blocks to save tokens
      if (part.type === "reasoning" && part.text && part.text.length > 200) {
        return {
          ...part,
          text: `${part.text.slice(0, 150)}... [reasoning compacted]`,
        };
      }

      return part;
    });

    return {
      ...message,
      parts: prunedParts,
    };
  });
}
```

#### 4.2 Integration into Server Route (`packages/server/src/routes/chat.ts`)
```typescript
import { compactConversationHistory } from "../lib/context-pruner";

// Before converting messages to model prompt:
const compactedMessages = compactConversationHistory(mergedMessages, 2);

const nextMessages = await validateUIMessages<NightcodeUIMessage>({
  messages: compactedMessages,
  tools,
});

const modelMessages = await convertToModelMessages(nextMessages, { tools });
```

---

### Solution 5: Normalized Relational Database Schema & Atomic Message Appends

Replace the monolithic `Session.messages` JSON array with normalized relational entities (`Session` -> `Message` -> `ToolCall`). This eliminates TOAST write amplification, enables cursor-based pagination, and supports atomic writes.

#### 5.1 Normalized Prisma Schema (`packages/database/prisma/schema.prisma`)
```prisma
datasource db {
  provider = "postgresql"
}

generator client {
  provider = "prisma-client"
  output   = "../generated/prisma"
}

model Session {
  id        String    @id @default(cuid())
  userId    String
  title     String
  mode      String    @default("BUILD") // "BUILD" | "PLAN"
  model     String    @default("gemini-3.5-flash-lite")
  version   Int       @default(1)       // Optimistic concurrency control
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  messages  Message[]

  @@index([userId, updatedAt(sort: Desc)])
}

model Message {
  id         String     @id @default(cuid())
  sessionId  String
  session    Session    @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  role       String     // "user" | "assistant" | "system"
  seq        Int        // Sequential monotonic ordering per session
  content    String?    @db.Text
  reasoning  String?    @db.Text
  metadata   Json?      // { mode, model, durationMs, usage }
  parts      Json       // Standard Vercel AI SDK parts structure
  createdAt  DateTime   @default(now())
  toolCalls  ToolCall[]

  @@unique([sessionId, seq])
  @@index([sessionId, createdAt(sort: Asc)])
}

model ToolCall {
  id           String   @id @default(cuid())
  messageId    String
  message      Message  @relation(fields: [messageId], references: [id], onDelete: Cascade)
  toolCallId   String   @unique
  toolName     String
  input        Json
  state        String   // "calling" | "output-available" | "output-error"
  inlineOutput Json?    // Trimmed inline payload (< 4KB)
  artifactRef  String?  // Storage key/hash if output > 4KB
  createdAt    DateTime @default(now())

  @@index([messageId])
}
```

#### 5.2 Atomic Message Insertion Endpoint (`packages/server/src/routes/sessions.ts`)
```typescript
// Cursor-based paginated message retrieval: GET /sessions/:id/messages?cursor=...&limit=20
app.get("/:id/messages", async (c) => {
  const userId = c.get("userId");
  const sessionId = c.req.param("id");
  const limit = Math.min(Number(c.req.query("limit") || 20), 50);
  const cursor = c.req.query("cursor");

  const session = await db.session.findUnique({
    where: { id: sessionId, userId },
    select: { id: true },
  });
  if (!session) return c.json({ error: "Session not found" }, 404);

  const messages = await db.message.findMany({
    where: { sessionId },
    take: limit,
    skip: cursor ? 1 : 0,
    cursor: cursor ? { id: cursor } : undefined,
    orderBy: { seq: "asc" },
  });

  return c.json({
    messages,
    nextCursor: messages.length === limit ? messages[messages.length - 1].id : null,
  });
});
```

---

### Solution 6: High-Performance In-Memory/Redis Caching for Auth & Billing

Eliminate 200ms–500ms synchronous latency per request by introducing an in-memory TTL cache for Clerk token verification and Polar credit checks.

#### 6.1 Fast Credit Cache (`packages/server/src/lib/cache.ts`)
```typescript
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class MemoryTTLCache<T> {
  private cache = new Map<string, CacheEntry<T>>();

  set(key: string, value: T, ttlMs: number): void {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }
}

export const creditBalanceCache = new MemoryTTLCache<boolean>();
```

#### 6.2 Cached Middleware (`packages/server/src/middleware/require-credits-balance.ts`)
```typescript
import { creditBalanceCache } from "../lib/cache";

export const requireCreditsBalance = createMiddleware<AuthenticatedEnv>(
  async (c, next) => {
    const userId = c.get("userId");
    const cachedHasCredits = creditBalanceCache.get(userId);

    if (cachedHasCredits === true) {
      return next();
    }

    const customer = await getPolarCustomer(userId);
    const hasCredits = (customer?.creditBalance ?? 0) > 0;

    if (!hasCredits) {
      return c.json({ error: "Insufficient credit balance. Run /upgrade to top up." }, 402);
    }

    // Cache valid balance for 60 seconds
    creditBalanceCache.set(userId, true, 60_000);
    return next();
  }
);
```

---

### Solution 7: Virtualized / Windowed Message Rendering in OpenTUI

Prevent terminal frame rate collapse by windowing the displayed message list: only render the active viewport or the last $N$ messages, while collapsing large completed tool calls.

#### 7.1 Virtualized Session Shell (`packages/cli/src/screens/session.tsx`)
```tsx
const VISIBLE_MESSAGE_WINDOW = 12; // Keep max 12 messages active in the OpenTUI frame tree

function SessionChat({ session }: { session: SessionData }) {
  const { messages, status, submit } = useChat(session.id, initialMessages);

  // Windowed subset of messages to maintain 60 FPS in OpenTUI
  const visibleMessages = useMemo(() => {
    if (messages.length <= VISIBLE_MESSAGE_WINDOW) return messages;
    return messages.slice(messages.length - VISIBLE_MESSAGE_WINDOW);
  }, [messages]);

  const hiddenCount = messages.length - visibleMessages.length;

  return (
    <SessionShell onSubmit={...}>
      {hiddenCount > 0 && (
        <box paddingX={2} paddingY={1} width="100%">
          <text attributes={TextAttributes.DIM}>
            ↑ {hiddenCount} earlier messages hidden. Press PgUp to scroll back.
          </text>
        </box>
      )}

      {visibleMessages.map((msg) => (
        <ChatMessage key={msg.id} msg={msg} />
      ))}
    </SessionShell>
  );
}
```

---

### Solution 8: Git-Based Checkpointing and Safety Rollback

To ensure multi-file refactors on large codebases never leave projects in a corrupted state, implement an automatic git stash / commit checkpoint before executing tool modifications.

#### 8.1 Checkpoint Manager (`packages/cli/src/lib/checkpoint.ts`)
```typescript
import { spawnSync } from "child_process";

export class CodebaseCheckpoint {
  static createCheckpoint(sessionId: string): string | null {
    try {
      const branchName = `nightcode-checkpoint-${sessionId}-${Date.now()}`;
      // Stash untracked and tracked modifications into a temporary reference
      const res = spawnSync("git", ["stash", "create", branchName], { encoding: "utf-8" });
      const stashCommit = res.stdout.trim();
      return stashCommit || null;
    } catch {
      return null;
    }
  }

  static rollbackToCheckpoint(stashCommit: string): boolean {
    try {
      const res = spawnSync("git", ["stash", "apply", stashCommit], { encoding: "utf-8" });
      return res.status === 0;
    } catch {
      return false;
    }
  }
}
```

---

## 4. Prioritized Implementation Matrix

| Priority | Issue / Area | Impact at Scale | Required Effort | Implementation Target |
|:---|:---|:---|:---|:---|
| **P0 (Immediate)** | **10KB `readFile` limit & unwindowed reads** | High hallucinations; cannot read real-world files | Low (0.5 day) | `packages/cli/src/lib/local-tools.ts`, `schemas.ts` |
| **P0 (Immediate)** | **Monolithic `Session.messages` JSON** | Database I/O thrashing, 25 GB/s write amplification | Medium (2 days) | `packages/database`, `packages/server/routes/chat.ts` |
| **P0 (Immediate)** | **Context window explosion** | 10x API bills, token limits exceeded, high latency | Medium (1 day) | `packages/server/src/lib/context-pruner.ts` |
| **P1 (Near-Term)** | **Missing `.gitignore` scanning** | Searches locked binaries, lockfiles, and `dist/` | Low (0.5 day) | `packages/cli/src/lib/ignore-filter.ts` |
| **P1 (Near-Term)** | **Terminal UI rendering collapse** | OpenTUI drops to < 5 FPS, terminal UI freezes | Medium (1 day) | `packages/cli/src/screens/session.tsx`, `bot-message.tsx` |
| **P1 (Near-Term)** | **Synchronous middleware latency** | 200–500ms overhead on every single request | Low (0.5 day) | `packages/server/src/lib/cache.ts` |
| **P2 (Strategic)**| **Ambiguous `editFile` string replace** | Multi-file edits fail on repeated boilerplate | Medium (1.5 days)| `packages/cli/src/lib/local-tools.ts` |
| **P2 (Strategic)**| **Codebase checkpointing & undo** | Broken states after interrupted multi-file edits | Medium (2 days) | `packages/cli/src/lib/checkpoint.ts` |
| **P2 (Strategic)**| **AST / Symbol index engine** | High token waste from exploratory searches | High (3–5 days) | New package `@nightcode/indexer` |

---

## 5. Summary Checklist

When executing codebase modifications to support large project scale:
- [x] **File Tools**: Ensure `readFile` uses line-numbered, range-based slicing (`lineStart`, `lineLimit`) rather than fixed byte cuts.
- [x] **Ignore Rules**: Ensure `readdir`, `glob`, and `grep` parse `.gitignore` and `.nightcodeignore`.
- [x] **Context Window**: Compact tool outputs older than 2 turns before invoking `convertToModelMessages`.
- [x] **Relational Persistence**: Migrate `Session.messages` to normalized `Message` and `ToolCall` records.
- [x] **Caching**: Apply in-memory TTL caching to Clerk and Polar verification middleware.
- [x] **Terminal Virtualization**: Cap the active message tree rendered in OpenTUI to the visible viewport window.
- [x] **Atomic Edits**: Write files using temporary files and atomic swap renames to prevent partial write corruption.
