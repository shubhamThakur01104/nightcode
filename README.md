# Nightcode 🚀

An AI-powered terminal-based coding assistant and developer workspace built with **Bun**, **OpenTUI**, **Hono**, and **Prisma**.

---

## 📌 1. Project Overview

**Nightcode** is an interactive, terminal-native AI coding assistant designed for software engineers who prefer working directly in the command line interface (CLI).

### What it solves and why it exists:
Traditional AI coding assistants often require web browsers, IDE plugins, or heavy desktop applications. Nightcode bridges the gap by providing a rich, high-performance **TUI (Terminal User Interface)** built using **OpenTUI** and **React**, allowing developers to chat with AI models, manage sessions, execute workflows, and manage credits seamlessly from their terminal.

### Primary Purpose & Capabilities:
* **Terminal UI (TUI):** Interactive terminal screens rendered via `@opentui/react` and `@opentui/core` supporting 60 FPS rendering, modals, commands, custom themes, and keyboard navigation.
* **AI Chat & Streaming:** Powered by the **Vercel AI SDK** (`ai` and `@ai-sdk/react`), supporting multiple LLM models and configurable operating modes with tool support and persistent message histories.
* **Backend API & Monorepo:** A robust **Hono** server running on **Bun**, providing secure routes for authentication, session management, chat interactions, and **Polar** billing/credit integration.
* **Database Persistence:** PostgreSQL database managed via **Prisma** with structured session and messaging support.

---

## ⚡ 2. Key Features

### Core Features
* **Interactive TUI Chat & Session Management:** Create, list, and switch between chat sessions directly from the terminal with real-time message streaming.
* **Multi-Model & Multi-Mode Support:** Switch between supported chat models and configurable execution modes (e.g., plan vs build / tool-enabled workflows).
* **Command Menu & Dialog System:** Quick command palette, agents dialog, models dialog, sessions dialog, and theme switcher.
* **Secure Authentication & Billing Integration:** OAuth authentication flow and **Polar** billing/checkout integration for credit balances[cite: 13].
* **Error Tracking:** Integrated with **Sentry** (`@sentry/hono/bun`) for error handling, metrics, and logging on the server[cite: 13].

### Supporting Features
* **Local Tool Execution:** Local tools and command line integration within the CLI workspace[cite: 13].
* **Theme & Keyboard Customization:** Custom OpenTUI theme system and keyboard layers[cite: 13].
* **Credit Balance Enforcement:** Server middleware ensuring users maintain adequate credit balances for AI requests[cite: 13].

---

## 🛠️ 3. Tech Stack

| Category | Technology / Library | Architectural Role |
| :--- | :--- | :--- |
| **Language** | TypeScript | Type-safe development across monorepo packages[cite: 13] |
| **Runtime** | Bun (`>=1.3.0`) | High-performance JavaScript/TypeScript runtime & package manager[cite: 13] |
| **Frontend Framework** | React 19+, OpenTUI React (`@opentui/react`) | Terminal-based UI rendering engine and component framework[cite: 13] |
| **Backend Framework** | Hono | Lightweight, ultrafast web framework running on Bun[cite: 13] |
| **Database** | PostgreSQL | Relational database for persistence[cite: 13] |
| **ORM** | Prisma (Prisma Client) | Type-safe database client and schema management[cite: 13] |
| **AI SDK** | Vercel AI SDK (`ai`, `@ai-sdk/react`) | AI abstraction layer for streaming text and tool management[cite: 13] |
| **Billing / Payments** | Polar | Subscription, checkout, and AI usage metering[cite: 13] |
| **Error Monitoring** | Sentry (`@sentry/hono/bun`) | Server-side error logging, tracing, and metrics[cite: 13] |
| **Validation** | Zod | Runtime schema validation for API requests and payloads[cite: 13] |
| **Routing** | React Router (`react-router`) | In-memory routing for TUI screens[cite: 13] |
| **Monorepo Management** | Bun Workspaces | Multi-package workspace organization (`packages/*`)[cite: 13] |

---

## 🏗️ 4. System Architecture & Data Flow

Nightcode is structured as a Bun workspace monorepo containing distinct packages (`cli`, `server`, `database`, `shared`). The architecture separates the terminal user interface from the backend API, persistence layer, and shared contracts[cite: 13].

```mermaid
flowchart TD
    subgraph Client [CLI Package (@nightcode/cli)]
        TUI[OpenTUI React App]
        Router[React Memory Router]
        ApiClient[API Client]
    end

    subgraph Backend [Server Package (@nightcode/server)]
        HonoAPI[Hono Web API]
        AuthMW[Auth Middleware]
        CreditMW[Credit Balance Middleware]
        ChatRoute["/chat Route"]
        SessionRoute["/sessions Route"]
        BillingRoute["/billing Route"]
    end

    subgraph AI [AI Layer]
        AISDK[Vercel AI SDK]
        LLM[LLM Providers]
    end

    subgraph Storage [Database Package (@nightcode/database)]
        Prisma[Prisma Client]
        Postgres[(PostgreSQL)]
    end

    subgraph External [External Services]
        Polar[Polar Billing / Usage]
        Sentry[Sentry Monitoring]
    end

    TUI --> Router
    Router --> ApiClient
    ApiClient -->|HTTP / JSON / SSE| HonoAPI
    HonoAPI --> AuthMW
    HonoAPI --> CreditMW
    HonoAPI --> ChatRoute
    HonoAPI --> SessionRoute
    HonoAPI --> BillingRoute
    ChatRoute --> AISDK
    AISDK --> LLM
    ChatRoute --> Prisma
    SessionRoute --> Prisma
    Prisma --> Postgres
    BillingRoute --> Polar
    ChatRoute --> Polar
    HonoAPI --> Sentry
