# Nightcode — Documentation Index

### 1. Project Snapshot
Nightcode is a terminal-native AI coding assistant using React 19/OpenTUI CLI (`@nightcode/cli`), Hono server (`@nightcode/server`), Prisma/PostgreSQL (`@nightcode/database`), and shared Zod schemas (`@nightcode/shared`).
Run Server: `bun run dev:server` | Run CLI: `bun run dev:cli`

### 2. Document Map
| File | Contains | Read It When | Skip It When |
|---|---|---|---|
| `docs/01-product-description.md` | Product features, agent modes, UI behavior, and user journeys. | Learning what the product does or how features work. | Working strictly on backend implementation detail. |
| `docs/02-technical-architecture.md` | Monorepo layout, tech stack versions, and message flows. | Understanding component wiring or system dependencies. | Writing isolated UI CSS/theme changes. |
| `docs/03-data-model.md` | PostgreSQL schema, `Session.messages` JSON, and local files. | Modifying stored data, Prisma schema, or JSON state. | Working on pure UI layout components. |
| `docs/04-api-contract.md` | Full HTTP route details, request/response schemas, and SSE streams. | Creating, changing, or calling backend API endpoints. | Writing offline local CLI tools. |
| `docs/05-coding-standards.md` | Naming rules, code style, error formats, and task checklists. | Writing or refactoring any code file. | Doing non-code architectural review. |
| `docs/06-constraints-and-non-goals.md` | Security guards, caps, timeouts, non-goals, and hard agent rules. | Planning features or touching local execution tools. | Inspecting existing API types. |

### 3. Task Routing
| If the task is... | Read these, in this order |
|---|---|
| **Fixing a small bug** | `docs/05-coding-standards.md` (§7 Error Handling) → `docs/02-technical-architecture.md` (§4 Runtime Flows) |
| **Adding a slash command** | `docs/05-coding-standards.md` (§12 Task A) → `docs/01-product-description.md` (§5 Feature 3) |
| **Adding a CLI dialog or screen** | `docs/05-coding-standards.md` (§12 Task B) → `docs/01-product-description.md` (§5 Feature 1 & 10) |
| **Adding/changing a server route** | `docs/04-api-contract.md` (§10 Rules) → `docs/05-coding-standards.md` (§12 Task C) → `docs/02-technical-architecture.md` (§4 Runtime Flows) |
| **Changing database/session format** | `docs/03-data-model.md` (§2 Schema & §3 Messages JSON) → `docs/05-coding-standards.md` (§12 Task F) |
| **Adding an AI model or provider** | `docs/02-technical-architecture.md` (§5 AI Layer) → `docs/05-coding-standards.md` (§12 Task D) |
| **Adding/changing a local tool** | `docs/06-constraints-and-non-goals.md` (§6 Security) → `docs/05-coding-standards.md` (§12 Task E) → `docs/03-data-model.md` (§3 Messages JSON) |
| **Changing billing or credits** | `docs/04-api-contract.md` (§8 Billing) → `docs/03-data-model.md` (§9 External Data) → `docs/06-constraints-and-non-goals.md` (§4 Cost Constraints) |
| **Changing login or auth** | `docs/02-technical-architecture.md` (§4.2 OAuth Flow) → `docs/04-api-contract.md` (§7 Auth Flow) |
| **Changing theme or UI only** | `docs/01-product-description.md` (§5 Feature 10) → `docs/05-coding-standards.md` (§3 Naming & §6 Style) |
| **Writing tests** | `docs/05-coding-standards.md` (§10 Testing) → `docs/06-constraints-and-non-goals.md` (§2 Non-Goals) |
| **Planning a brand-new feature** | `docs/06-constraints-and-non-goals.md` (§2 Non-Goals & §11 Rules) → `docs/01-product-description.md` (§4 Product Overview) |

### 4. Always-On Rules
1. **Never access `.env` files**: Local tools and shell execution strictly block reading, writing, or grepping `.env` files [docs/06 §6].
2. **Never commit secrets**: API keys, OAuth tokens, and database passwords must never be logged or hardcoded [docs/05 §8].
3. **Always validate paths**: Pass target paths through `resolveInsideCwd()` to prevent workspace path traversal [docs/06 §6].
4. **Enforce agent modes**: In `PLAN` mode, write tools (`writeFile`, `editFile`, `bash`) must throw an error [docs/01 §5.5, docs/06 §6].
5. **Keep RPC types synced**: Export `AppType` in server `index.ts` so CLI client types update automatically [docs/04 §1, docs/05 §9].
6. **Synchronize shared contracts**: Update `@nightcode/shared` first when modifying models, modes, or tool schemas [docs/05 §12].
7. **Regenerate Prisma client**: Run `bun run --cwd packages/database db:generate` after changing `schema.prisma` [docs/05 §12].
8. **Preserve file permissions**: Auth files (`~/.nightcode/auth.json`) must be saved with POSIX `0o600` permissions [docs/03 §8].
9. **No raw DB imports in CLI**: `@nightcode/cli` must never import `@nightcode/database` directly [docs/02 §3, docs/05 §5].
10. **Check credits before generation**: Endpoints calling LLMs must apply `requireCreditsBalance` middleware [docs/04 §3, docs/06 §4].

### 5. Documentation Maintenance Matrix
| If you changed... | Update document section |
|---|---|
| **Slash commands or dialogs** | `docs/01-product-description.md` (§5) & `docs/04-api-contract.md` (§2) |
| **Server route, path, or middleware** | `docs/02-technical-architecture.md` (§4) & `docs/04-api-contract.md` (§5) |
| **Prisma schema or session JSON** | `docs/03-data-model.md` (§2 & §3) & `docs/02-technical-architecture.md` (§7) |
| **AI models, pricing, or providers** | `docs/01-product-description.md` (§5), `docs/02-technical-architecture.md` (§5), `docs/04-api-contract.md` (§5) |
| **Local tool or security guard** | `docs/01-product-description.md` (§5), `docs/03-data-model.md` (§3), `docs/06-constraints-and-non-goals.md` (§6) |
| **Environment variables** | `docs/02-technical-architecture.md` (§9) & `docs/05-coding-standards.md` (§12) |

### 6. Document Status
| Document | Last Updated | Open UNCLEAR / UNDECIDED Items |
|---|---|---|
| `docs/01-product-description.md` | 2025-02-27 | 1 UNCLEAR |
| `docs/02-technical-architecture.md` | 2025-02-27 | 4 UNCLEAR |
| `docs/03-data-model.md` | 2025-02-27 | 2 UNCLEAR |
| `docs/04-api-contract.md` | 2025-02-27 | 2 UNCLEAR |
| `docs/05-coding-standards.md` | 2025-02-27 | 2 UNCLEAR |
| `docs/06-constraints-and-non-goals.md` | 2025-02-27 | 3 UNDECIDED |

### 7. Conflicts to Resolve
None found.
