🌙 Nightcode

An AI-powered, terminal-native coding assistant and developer workspace built with Bun, TypeScript, React, OpenTUI, Hono, Prisma, PostgreSQL, and the Vercel AI SDK.

Nightcode brings an interactive AI coding experience directly into the terminal. Instead of relying on a browser-based chat interface or a traditional IDE plugin, developers can use a rich Terminal User Interface (TUI) to create sessions, chat with AI models, stream responses, switch models/modes, use tool-enabled workflows, and manage usage from the command line.

📑 Table of Contents

Overview

Why Nightcode

Key Features

System Architecture

High-Level Architecture Diagram

AI Request Data Flow

Streaming Response Flow

Tool Calling and Agent Flow

Session and Database Flow

Database Model

Credit and Billing Flow

Error Monitoring Flow

Monorepo Architecture

AI Tool Architecture

End-to-End Request Flow

Project Structure

Package Responsibilities

Technology Stack

AI Architecture

Authentication and Authorization

Persistence

Billing and Usage

Validation and Error Handling

Getting Started

Environment Variables

Development Commands

Engineering Concepts Demonstrated

Roadmap

Project Status

Contributing

License

🚀 Overview

Nightcode is a terminal-native AI coding assistant designed for developers who prefer a keyboard-first development workflow.

The application is organized as a Bun workspace monorepo. The terminal client is separated from the backend API, persistence layer, and shared contracts.

At a high level:

Developer
   │
   ▼
Nightcode CLI / TUI
   │
   ▼
Hono Backend API
   │
   ├── Authentication
   ├── Credit Validation
   ├── Session Management
   └── Chat / AI Routes
            │
            ▼
       Vercel AI SDK
            │
            ▼
        LLM Provider
            │
            ├── Normal response
            │
            └── Tool call
                    │
                    ▼
               Tool execution
                    │
                    ▼
               Tool result
                    │
                    ▼
                LLM again
                    │
                    ▼
              Final response

The repository currently contains four major packages:

packages/cli

packages/server

packages/database

packages/shared

🎯 Why Nightcode?

Traditional AI coding assistants commonly live inside:

Web applications

IDE extensions

Desktop applications

Nightcode explores a different interaction model:

AI-assisted software development directly inside the terminal.

This architecture provides a foundation for:

Fast keyboard-driven interaction

Persistent AI sessions

Streaming model responses

Multiple AI providers/models

Tool-enabled workflows

Usage and credit enforcement

A reusable backend API

Shared type-safe contracts between client and server

✨ Key Features

🖥️ Terminal User Interface

Built using:

React

OpenTUI

@opentui/core

@opentui/react

The CLI provides interactive terminal screens rather than a traditional browser UI.

💬 AI Chat and Streaming

Nightcode uses the Vercel AI SDK to communicate with LLM providers.

The architecture supports:

AI chat

Streaming responses

Multiple model configurations

Different operating modes

Tool-enabled workflows

Persistent conversation history

🧠 Tool-Enabled AI Workflows

The AI layer can operate with tools.

Conceptually:

User Prompt
     │
     ▼
   AI Model
     │
     ▼
Does the model need a tool?
     │
 ┌───┴────┐
 │        │
No       Yes
 │        │
 ▼        ▼
Final    Execute Tool
Response     │
             ▼
        Tool Result
             │
             ▼
        AI continues
             │
             ▼
        Final Response

This creates the foundation for agent-style workflows where the model can decide when an external operation is required.

🗂️ Persistent Sessions

Users can create and switch between AI sessions.

Session data is persisted through:

CLI
 ↓
Hono API
 ↓
Session Service
 ↓
Prisma
 ↓
PostgreSQL

Message history is persisted as JSON data associated with a session.

💳 Credit and Billing Integration

Nightcode includes server-side credit enforcement and Polar integration.

The server can check whether a user has enough credits before processing an AI request.

🔐 Authentication

Authenticated API routes protect application functionality and user-specific sessions.

🛡️ Validation and Monitoring

The backend uses:

Zod for runtime validation

Sentry for server-side error monitoring

Middleware for authentication and credit checks

🏗️ System Architecture

Nightcode follows a layered architecture:

┌──────────────────────────────────────────────────────┐
│                    Developer                         │
└─────────────────────────┬────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────┐
│                 Nightcode CLI                        │
│             React + OpenTUI + Router                 │
└─────────────────────────┬────────────────────────────┘
                          │
                          │ HTTP / JSON / Streaming
                          ▼
┌──────────────────────────────────────────────────────┐
│                 Hono Backend                         │
│                                                      │
│ Auth → Credit → Chat / Sessions / Billing            │
└───────────────┬─────────────────┬────────────────────┘
                │                 │
                │                 ▼
                │        ┌─────────────────┐
                │        │  Vercel AI SDK  │
                │        └────────┬────────┘
                │                 │
                │                 ▼
                │            LLM Provider
                │
                ▼
       ┌─────────────────┐
       │ Prisma + Postgres│
       └─────────────────┘

📊 High-Level Architecture Diagram

Important: The following Mermaid diagrams are intentionally written directly into this README.md. GitHub automatically renders Mermaid diagrams when this README is viewed on GitHub.

flowchart TB
    User["Developer"]

    subgraph CLI["Nightcode CLI"]
        TUI["React + OpenTUI"]
        Router["React Router"]
        APIClient["API Client"]
    end

    subgraph Server["Nightcode Server"]
        Hono["Hono API"]
        Auth["Authentication"]
        Credit["Credit Middleware"]
        Chat["Chat Routes"]
        Sessions["Session Routes"]
        Billing["Billing Routes"]
    end

    subgraph AI["AI Layer"]
        SDK["Vercel AI SDK"]
        Models["LLM Providers"]
        Tools["Tool Execution"]
    end

    subgraph Data["Persistence"]
        Prisma["Prisma Client"]
        DB[("PostgreSQL")]
    end

    subgraph External["External Services"]
        Polar["Polar"]
        Sentry["Sentry"]
    end

    User --> TUI
    TUI --> Router
    Router --> APIClient
    APIClient --> Hono

    Hono --> Auth
    Hono --> Credit
    Hono --> Chat
    Hono --> Sessions
    Hono --> Billing

    Chat --> SDK
    SDK --> Models
    Models --> Tools
    Tools --> Chat

    Chat --> Prisma
    Sessions --> Prisma
    Prisma --> DB

    Billing --> Polar
    Chat --> Polar
    Hono --> Sentry

🔄 AI Request Data Flow

A typical AI request follows this sequence:

Developer enters a prompt in the CLI.

CLI sends the request to the Hono backend.

Authentication middleware validates the request.

Credit middleware checks available credits.

Session/context information is loaded.

The chat route invokes the Vercel AI SDK.

The SDK communicates with the configured LLM provider.

The model generates a response or requests a tool.

The server streams the result back to the CLI.

The conversation is persisted.

sequenceDiagram
    participant User as Developer
    participant CLI as Nightcode CLI
    participant API as Hono Server
    participant Auth as Authentication
    participant Credit as Credit Middleware
    participant DB as PostgreSQL
    participant AI as Vercel AI SDK
    participant LLM as LLM Provider

    User->>CLI: Enter prompt
    CLI->>API: Send chat request

    API->>Auth: Validate user
    Auth-->>API: Authenticated

    API->>Credit: Check credit balance
    Credit-->>API: Credits available

    API->>DB: Load session/context
    DB-->>API: Session data

    API->>AI: Generate response
    AI->>LLM: Send prompt

    LLM-->>AI: Stream model output
    AI-->>API: Stream response
    API-->>CLI: Stream response
    CLI-->>User: Render AI response

    API->>DB: Persist messages

⚡ Streaming Response Flow

Streaming is important for an interactive coding assistant because the user does not need to wait for the complete model response.

flowchart LR
    User["Developer"]
    CLI["Nightcode CLI"]
    API["Hono API"]
    SDK["Vercel AI SDK"]
    LLM["LLM Provider"]
    Stream["Streaming Output"]

    User --> CLI
    CLI --> API
    API --> SDK
    SDK --> LLM
    LLM --> Stream
    Stream --> SDK
    SDK --> API
    API --> CLI
    CLI --> User

Instead of:

Prompt
  ↓
Wait
  ↓
Complete response
  ↓
Display

the system can behave like:

Prompt
  ↓
LLM
  ↓
Token / chunk
  ↓
CLI
  ↓
Render immediately
  ↓
Next token / chunk
  ↓
...

This produces a much more responsive terminal experience.

🔧 Tool Calling and Agent Flow

Tool calling allows the model to request an operation instead of only producing plain text.

flowchart TD
    User["Developer Prompt"]
    Model["AI Model"]
    Decision{"Tool Required?"}
    Tool["Tool Execution"]
    Result["Tool Result"]
    Continue["Continue Model Processing"]
    Final["Final Response"]

    User --> Model
    Model --> Decision

    Decision -->|No| Final
    Decision -->|Yes| Tool

    Tool --> Result
    Result --> Continue
    Continue --> Model

    Model --> Final

The important concept is that the model is not necessarily finished after the first generation.

A tool-enabled loop can be:

User Prompt
     ↓
   Model
     ↓
Tool required?
  ┌──┴──┐
 No     Yes
 │       │
 ▼       ▼
Final   Tool
        │
        ▼
     Tool Result
        │
        ▼
       Model
        │
        ├── Tool again
        │
        └── Final answer

This is the basic mechanism behind agentic workflows.

💾 Session and Database Flow

Nightcode separates database access from the rest of the application using the database package and Prisma.

flowchart LR
    User["Developer"]
    CLI["Nightcode CLI"]
    API["Hono API"]
    Session["Session Service"]
    Prisma["Prisma Client"]
    DB[("PostgreSQL")]

    User --> CLI
    CLI --> API
    API --> Session
    Session --> Prisma
    Prisma --> DB

    DB --> Prisma
    Prisma --> Session
    Session --> API
    API --> CLI

🗄️ Database Model

The current repository uses PostgreSQL through Prisma.

The session model stores information such as:

Session ID

User ID

Session title

Creation timestamp

Update timestamp

Message history

The message history is stored as JSON.

erDiagram
    SESSION {
        string id PK
        string userId
        string title
        string messages
        datetime createdAt
        datetime updatedAt
    }

messages represents the persisted JSON message history.

💳 Credit and Billing Flow

AI applications often need usage controls because model inference has an associated cost.

Nightcode includes credit-balance enforcement and Polar integration.

flowchart TD
    User["Developer"]
    Request["AI Request"]
    Auth["Authentication"]
    Credit{"Enough Credits?"}
    AI["AI Processing"]
    Usage["Usage Tracking"]
    Polar["Polar"]
    Reject["Reject Request"]

    User --> Request
    Request --> Auth
    Auth --> Credit

    Credit -->|No| Reject
    Credit -->|Yes| AI

    AI --> Usage
    Usage --> Polar

Conceptually:

Request
   ↓
Authenticate
   ↓
Check credits
   ↓
Enough?
 ┌─┴─┐
No  Yes
│    │
▼    ▼
Reject AI request
     │
     ▼
   Process
     │
     ▼
Track usage

🛡️ Error Monitoring Flow

Server-side failures are monitored using Sentry.

flowchart LR
    Request["API Request"]
    Server["Hono Server"]
    Error{"Runtime Error?"}
    Sentry["Sentry"]
    Response["API Response"]

    Request --> Server
    Server --> Error

    Error -->|No| Response
    Error -->|Yes| Sentry
    Sentry --> Response

This gives the backend an observability layer for production debugging.

📦 Monorepo Architecture

Nightcode uses Bun workspaces to organize the application into multiple packages.

flowchart TB
    Root["Nightcode Monorepo"]

    Root --> CLI["packages/cli"]
    Root --> Server["packages/server"]
    Root --> Database["packages/database"]
    Root --> Shared["packages/shared"]

    CLI --> Shared
    Server --> Shared
    Server --> Database

The separation allows each package to have a clear responsibility.

🧩 AI Tool Architecture

Shared tool contracts are useful when both the client and server need to understand the same tool definitions.

flowchart TB
    CLI["Nightcode CLI"]
    Shared["Shared Types / Tool Contracts"]
    Server["Hono Server"]
    AI["Vercel AI SDK"]
    Model["LLM"]
    Tool["Tool"]
    Result["Tool Result"]

    CLI --> Shared
    Server --> Shared

    Server --> AI
    AI --> Model

    Model --> Tool
    Tool --> Result
    Result --> Model

The conceptual separation is:

Shared
  │
  ├── Types
  ├── Zod schemas
  ├── Model definitions
  └── Tool contracts

        ↓

CLI                    Server
 │                       │
 └────────── Shared ─────┘

This reduces duplicated contracts between packages.

🌐 End-to-End Request Flow

The complete architecture can be summarized as:

flowchart TD
    User["Developer"]
    CLI["Nightcode CLI"]
    API["Hono API"]
    Auth["Authentication"]
    Credit["Credit Check"]
    Session["Session Service"]
    DB[("PostgreSQL")]
    AISDK["Vercel AI SDK"]
    LLM["LLM Provider"]
    Decision{"Tool Required?"}
    Tool["Tool Execution"]
    ToolResult["Tool Result"]
    Stream["Streaming Response"]

    User --> CLI
    CLI --> API

    API --> Auth
    Auth --> Credit

    Credit --> Session
    Session --> DB

    Credit --> AISDK
    AISDK --> LLM
    LLM --> Decision

    Decision -->|Yes| Tool
    Tool --> ToolResult
    ToolResult --> LLM

    Decision -->|No| Stream
    LLM --> Stream

    Stream --> API
    API --> CLI
    CLI --> User

    API --> DB

📁 Project Structure

nightcode/
│
├── packages/
│   │
│   ├── cli/
│   │   ├── src/
│   │   └── ...
│   │
│   ├── server/
│   │   ├── src/
│   │   └── ...
│   │
│   ├── database/
│   │   ├── prisma/
│   │   ├── src/
│   │   └── ...
│   │
│   └── shared/
│       ├── src/
│       └── ...
│
├── .env.example
├── .gitignore
├── bun.lock
├── bunfig.toml
├── package.json
├── tsconfig.base.json
└── README.md

🧱 Package Responsibilities

packages/cli

Responsible for the terminal experience.

Main responsibilities:

OpenTUI rendering

React components

Terminal navigation

Session UI

Model selection

Command menus

Keyboard interactions

API communication

Streaming response rendering

packages/server

Responsible for the backend API.

Main responsibilities:

Hono API

Authentication

Session endpoints

Chat endpoints

Billing endpoints

Credit validation

AI SDK integration

Usage integration

Error monitoring

packages/database

Responsible for persistence.

Main responsibilities:

Prisma schema

Prisma Client

PostgreSQL access

Session persistence

Message history persistence

packages/shared

Responsible for shared contracts.

Typical responsibilities include:

TypeScript types

Zod schemas

Model definitions

Shared tool contracts

Common application contracts

🛠️ Technology Stack

Category

Technology

Role

Language

TypeScript

Type-safe application development

Runtime

Bun

Runtime, package manager, workspace management

Frontend

React 19

Component architecture

TUI

OpenTUI

Terminal interface rendering

Routing

React Router

CLI screen navigation

Backend

Hono

HTTP API

Database

PostgreSQL

Persistent relational storage

ORM

Prisma

Type-safe database access

AI

Vercel AI SDK

AI generation, streaming and tool integration

Validation

Zod

Runtime input validation

Billing

Polar

Billing and usage integration

Monitoring

Sentry

Error monitoring and observability

Monorepo

Bun Workspaces

Package organization

🤖 AI Architecture

Nightcode uses the Vercel AI SDK as an abstraction layer between the backend and model providers.

Conceptually:

                 ┌──────────────────────┐
                 │      Nightcode       │
                 │      Chat Route      │
                 └──────────┬───────────┘
                            │
                            ▼
                 ┌──────────────────────┐
                 │   Vercel AI SDK      │
                 └──────────┬───────────┘
                            │
                 ┌──────────┴───────────┐
                 ▼                      ▼
          LLM Provider             Tool System
                 │                      │
                 ▼                      ▼
          Model Response            Tool Result
                 │                      │
                 └──────────┬───────────┘
                            ▼
                      Final Output

This abstraction makes it possible to work with model providers without coupling the application directly to one provider's API format.

🔐 Authentication and Authorization

The backend protects application functionality through authenticated requests.

The general request pipeline is:

Client Request
      ↓
Authentication
      ↓
User Identity
      ↓
Authorization / Credit Checks
      ↓
Protected Route

User-specific data such as sessions should remain associated with the authenticated user.

💾 Persistence

PostgreSQL provides durable application storage.

Prisma provides the type-safe database access layer.

Application
     │
     ▼
Prisma Client
     │
     ▼
PostgreSQL

This keeps database-specific logic separated from the terminal UI.

💰 Billing and Usage

Polar is integrated for billing and usage-related functionality.

The application architecture separates:

AI Request
    ↓
Credit Validation
    ↓
AI Processing
    ↓
Usage Tracking

This is important for an AI SaaS architecture because AI inference can create variable infrastructure costs.

✅ Validation and Error Handling

Zod

Zod is used for runtime validation.

A typical API pipeline is:

Incoming Request
       ↓
Parse Input
       ↓
Zod Validation
       ↓
Valid?
  ┌────┴────┐
 No         Yes
 │           │
 ▼           ▼
400 Error  Continue

This prevents invalid client payloads from reaching deeper application layers.

Sentry

Sentry provides server-side monitoring and error visibility.

The goal is to make production failures observable rather than silently failing.

🚀 Getting Started

Prerequisites

Install:

Bun >= 1.3.0

PostgreSQL

Required API credentials

Required authentication configuration

Polar configuration if billing functionality is enabled

Sentry configuration if monitoring is enabled

📥 Installation

Clone the repository:

git clone https://github.com/shubhamThakur01104/nightcode.git
cd nightcode

Install dependencies:

bun install

🔑 Environment Variables

Copy the example environment file:

cp .env.example .env

On Windows PowerShell:

Copy-Item .env.example .env

Then configure the environment variables required by the packages.

Typical categories include:

Database
Authentication
AI provider credentials
Billing / Polar
Sentry
Application URLs

Do not commit real secrets to Git.

🗃️ Database Setup

Nightcode uses Prisma with PostgreSQL.

After configuring your database environment variables, run the Prisma commands required by the current schema/migration setup.

For example, during development you may use the project's configured Prisma migration or generation commands.

bunx prisma generate

Use the repository's current Prisma configuration/migrations as the source of truth for applying database changes.

▶️ Running the Project

The root project exposes development scripts for the CLI and server.

Start the server:

bun run dev:server

Start the CLI:

bun run dev:cli

Depending on your local configuration, you may run the backend and CLI in separate terminals.

🧪 Development

Useful development areas include:

packages/cli
    ↓
Terminal UI / user interaction

packages/server
    ↓
API / authentication / AI / billing

packages/database
    ↓
Prisma / PostgreSQL

packages/shared
    ↓
Types / schemas / tool contracts

Type-checking and build commands should be run according to the package scripts defined in package.json.

🧠 Engineering Concepts Demonstrated

Nightcode demonstrates several concepts relevant to modern full-stack and AI application development.

Backend Engineering

REST-style API design

Middleware

Authentication

Authorization

Runtime validation

Error handling

Streaming

Database persistence

Separation of concerns

Database Engineering

PostgreSQL

Prisma ORM

Relational data modeling

JSON message persistence

User/session relationships

AI Engineering

LLM integration

AI SDK abstraction

Streaming generation

Tool calling

Agent-style loops

Model/provider abstraction

SaaS Engineering

Authentication

Credits

Usage tracking

Billing integration

Server-side enforcement

Developer Experience

Terminal-native UI

Keyboard-driven navigation

Interactive sessions

Command menus

Model selection

Real-time streaming

🗺️ Roadmap

Potential future improvements include:

More developer tools

Stronger autonomous coding workflows

Improved repository/file operations

Git-aware workflows

Better agent orchestration

More model providers

More granular usage analytics

Improved context management

Automated code editing workflows

Better testing coverage

Production deployment improvements

📌 Project Status

Nightcode is an active development project.

The architecture is designed as a foundation for a more complete terminal-native AI development environment.

Some integrations and workflows may continue to evolve as the project develops.

💡 What Nightcode Demonstrates

Nightcode is more than a simple AI chat application.

It combines:

Terminal UI
     +
Backend API
     +
Authentication
     +
Database
     +
AI SDK
     +
Streaming
     +
Tool Calling
     +
Credits / Billing
     +
Observability

That combination makes it a useful demonstration of how an AI-powered product can be structured as a real full-stack application.

🤝 Contributing

Contributions, ideas, bug reports, and improvements are welcome.

A typical contribution workflow is:

Fork
  ↓
Create feature branch
  ↓
Implement change
  ↓
Run validation/tests
  ↓
Commit
  ↓
Open Pull Request

👨‍💻 Author

Shubham Thakur

GitHub:

https://github.com/shubhamThakur01104

Project:

https://github.com/shubhamThakur01104/nightcode

📄 License

See the repository's license configuration for the current licensing terms.

⭐ Final Architecture Summary

                         ┌────────────────────┐
                         │     Developer      │
                         └─────────┬──────────┘
                                   │
                                   ▼
                     ┌─────────────────────────┐
                     │     Nightcode CLI       │
                     │    React + OpenTUI       │
                     └────────────┬────────────┘
                                  │
                                  ▼
                     ┌─────────────────────────┐
                     │       Hono API          │
                     │ Auth + Credit + Routes  │
                     └──────┬─────────┬────────┘
                            │         │
                 ┌──────────┘         └──────────┐
                 ▼                               ▼
       ┌──────────────────┐             ┌─────────────────┐
       │  Vercel AI SDK   │             │ Prisma + PG     │
       └────────┬─────────┘             └─────────────────┘
                │
                ▼
          ┌─────────────┐
          │ LLM Provider│
          └──────┬──────┘
                 │
          ┌──────┴───────┐
          │              │
       Response       Tool Call
          │              │
          │              ▼
          │          Tool Execute
          │              │
          │              ▼
          │          Tool Result
          │              │
          └───────┬──────┘
                  ▼
           Stream to CLI
                  │
                  ▼
              Developer

Nightcode — AI development, directly in the terminal.
