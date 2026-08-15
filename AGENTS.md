# AGENTS.md — Project Rules for AI Coding Agents

## Project Context

This is the **Kapture Finance — Maya Collections Voice AI** take-home assignment. We are building an outbound Voice AI collections agent named "Maya" using Vapi.

**Current Phase**: Phase 1 — Design & Skeleton (complete)
**Next Phase**: Phase 2 — Mock Backend Implementation

---

## Core Rules (Non-Negotiable)

### 1. Authentication Enforcement
- **NEVER** rely on LLM prompt for authentication checks
- **ALWAYS** enforce via backend tool middleware
- Tools `get_account_details`, `log_promise_to_pay`, `send_payment_link` **must** verify `session.authStatus === 'verified'`
- Session store (keyed by `call_id`) is the single source of truth for auth state

### 2. No Debt Disclosure Before Verification
- The agent must not reveal: amounts, loan existence, EMI, due dates, payment status, days past due, internal IDs
- Only permitted pre-auth: company name, call purpose, verification request

### 3. Follow HLD and API Contracts
- `docs/HLD.md` = architecture authority
- `docs/api-contracts.md` = tool schema authority
- `vapi/tools.json` must match `api-contracts.md` exactly
- Do not invent new tools or change schemas without updating all three

### 4. State Machine Compliance
- Valid states: `INIT`, `AUTH_PENDING`, `AUTHENTICATED`, `NEGOTIATION`, `ACTION`, `ESCALATED`, `CALL_ENDED`
- `AUTH_PENDING → AUTHENTICATED` **only** on `verify_customer` returning `verified: true`
- LLM cannot self-transition authentication state

---

## Development Rules

### 5. Phase-Scoped Changes
- Only implement what the current phase requires
- Phase 1: Design docs only — no implementation code
- Phase 2: Mock backend only — no Vapi integration yet
- Phase 3: Vapi config only — no prompt engineering yet
- etc.

### 6. Minimal Dependencies
- Mock backend: Express + TypeScript only
- No databases, ORMs, queues, Docker, cloud services
- Mock data in `accounts.json` (static file)
- Session store: in-memory `Map`

### 7. Test-Driven Where Practical
- Unit tests for auth middleware (critical)
- Integration tests for tool endpoints
- Conversation fixtures for e2e validation
- Update tests when implementation changes

### 8. No False Claims
- Do not claim "Vapi integration works" unless actually tested end-to-end
- Do not claim "authentication enforced" unless middleware tested
- Document what is tested vs. what is designed

---

## Code Style

### TypeScript
- Strict mode enabled
- Explicit types for all tool inputs/outputs
- Zod schemas for runtime validation (Phase 2)
- No `any` — use proper types from `api-contracts.md`

### File Organization
```
mock-backend/src/
├── index.ts              # Express app entry
├── tools/
│   ├── verify_customer.ts
│   ├── get_account_details.ts
│   ├── log_promise_to_pay.ts
│   ├── send_payment_link.ts
│   ├── escalate_to_agent.ts
│   └── mark_disposition.ts
├── data/
│   └── accounts.json     # Mock data
├── middleware/
│   └── auth.ts           # Auth enforcement middleware
└── session/
    └── store.ts          # In-memory session Map
```

### Error Handling
- Tools return structured error objects (see `api-contracts.md`)
- HTTP status codes: 200 (success), 400 (validation), 403 (auth), 404 (not found), 500 (internal)
- Never throw unhandled errors

---

## Compliance Checklist (Per Implementation)

Before marking any tool complete:
- [ ] Input validation with Zod
- [ ] Auth middleware applied (where required)
- [ ] Session store updated correctly
- [ ] Error responses match `api-contracts.md`
- [ ] Unit test covers success + failure paths
- [ ] No console.log of PII (verification values, full phone, etc.)

---

## Git Hygiene

- One commit per logical change
- Commit messages: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`
- No commits to main without review (self-review via `/review`)

---

## Phase 2 Specific Instructions

When implementing the mock backend:

1. **Start with `auth.ts` middleware** — this is the compliance backbone
2. **Implement `verify_customer` first** — it creates the session
3. **Then `get_account_details`** — tests auth middleware
4. **Then remaining tools** — all use same auth pattern
5. **Add session store** — simple `Map<string, CallSession>`
6. **Create `accounts.json`** — 5–10 test accounts covering all scenarios
7. **Write unit tests for auth** — before other tests

---

## Escalation Path

If uncertain about:
- Architecture decision → Check `docs/HLD.md` first
- Tool schema → Check `docs/api-contracts.md` first
- Compliance rule → Check `docs/compliance.md` first
- Still unclear → Ask human (use `question` tool)

---

## Reminder

> This is an **intern take-home assignment**. The evaluator cares about:
> - Prompt engineering quality
> - State/flow design clarity
> - Tool calling correctness
> - **Authentication enforcement** (most important)
> - Compliance awareness
> - Edge-case handling
> - Debugging/reasoning ability
> - Clean engineering structure

**Build for evaluation clarity, not production scale.**