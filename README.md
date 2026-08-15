# Kapture Finance — Maya Collections Voice AI

## Project Overview

**Maya** is an outbound Voice AI collections agent that conducts compliant, empathetic conversations with customers who have overdue loans. Built for the Kapture CX AI Delivery Intern take-home assignment.

### Assignment Tasks

| Task | Description | Status |
|------|-------------|--------|
| **Task 1** | HLD/Design Document + Architecture Diagram | ✅ Phase 1 Complete |
| **Task 2** | Working Vapi Voicebot + Tools + Demo | 🔄 Phase 2+ |

---

## Current Phase: Phase 5 Complete — Testing & Demo Preparation

This repository contains the complete design artifacts, implemented Express mock backend with verified Vapi webhook adapter, compressed production-ready system prompt, and comprehensive demo scenarios.

### Phase 1 Deliverables

```
docs/
├── HLD.md                 # High-Level Design (this is the main design doc)
├── architecture.mmd       # Mermaid architecture diagram
├── api-contracts.md       # Canonical tool/API schemas (source of truth)
├── compliance.md          # Compliance rules & guardrails

vapi/
├── tools.json             # Vapi function definitions (from api-contracts.md)
├── system-prompt.md       # Production system prompt (320 lines, compressed from 845)
├── assistant.json         # Vapi assistant configuration

mock-backend/              # Empty scaffold (Phase 2 will implement)
tests/                     # Empty scaffold (Phase 5 will implement)
scripts/                   # Empty scaffold (Phase 2 will implement)
```

---

## High-Level Architecture

```
Customer → Vapi (STT/LLM/TTS) → Vapi Webhook Adapter → Session Store + Mock DB
                                     ↓
                             Authentication Enforcement
                                     ↓
                               Disposition Logging
```

### Key Components

| Component | Technology | Purpose |
|-----------|------------|---------|
| Voice Platform | Vapi | Telephony, STT, LLM orchestration, TTS |
| LLM | GPT-4o (via Vapi) | Conversation flow, intent classification |
| Tool Backend | Express + TypeScript | Business logic, auth enforcement, data access |
| Session State | In-Memory Map | Tracks auth status, customer info, intent per call |
| Mock Data | JSON file | Static test accounts (no external DB) |

---

## Critical Design Principles

### 1. Authentication Enforcement (Non-Negotiable)
- **Backend middleware** enforces auth — not the LLM prompt
- `get_account_details`, `log_promise_to_pay`, `send_payment_link` **require** `authStatus === 'verified'`
- Session store (keyed by `call_id`) is the authority

### 2. State Machine Driven
- Explicit states: `INIT` → `AUTH_PENDING` → `AUTHENTICATED` → `NEGOTIATION` → `ACTION` → `CALL_ENDED`
- `ESCALATED` branch for human handoff
- Transitions validated by backend

### 3. Compliance First
- No debt disclosure before verification
- Mandatory opening disclosure
- Calling window: 8 AM – 7 PM local
- DNC handling
- Fair collection practices

---

## Planned Phases

| Phase | Scope | Target |
|-------|-------|--------|
| **1** | Skeleton, HLD, Architecture, API Contracts, Compliance, Vapi Config | ✅ Done |
| **2** | Mock Backend: Express server, 6 tools, session store, auth middleware, mock accounts | ✅ Done |
| **3** | Vapi Assistant Config: Import tools.json, configure assistant, test webhook adapter | ✅ Done |
| **4** | Prompt Engineering: Production system prompt, Hindi support, edge cases, prompt injection defense | ✅ Done |
| **5** | Testing & Demo Prep: Compressed prompt (320 lines), demo scenarios, data correction, test validation | ✅ Done |
| **6** | Live Vapi Testing: Configure assistant, test all scenarios, measure latency, record demo | 🔄 Next |

---

## Getting Started

### Backend Server
```bash
cd mock-backend
npm install
npm run dev          # Start Express server on localhost:3000
```

### Expose via ngrok (for Vapi integration)
```bash
ngrok http 3000
# Update vapi/assistant.json server URLs with your ngrok URL
```

### Test Mock Backend
```bash
cd mock-backend
npm test             # Run test suite (backend.test.ts, vapi.test.ts)
```

---

## Repository Structure

```
kapture-finance-maya/
├── docs/
│   ├── HLD.md
│   ├── architecture.mmd
│   ├── api-contracts.md
│   └── compliance.md
├── vapi/
│   ├── tools.json
│   └── system-prompt.md
├── mock-backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts
│   │   ├── tools/
│   │   ├── data/
│   │   └── middleware/
│   └── tests/
├── tests/
│   ├── e2e/
│   └── unit/
├── scripts/
├── .env.example
├── AGENTS.md
└── README.md
```

---

## Compliance Summary

- ✅ Authentication before debt disclosure (backend-enforced)
- ✅ Mandatory identity/purpose disclosure
- ✅ Calling window enforcement (design)
- ✅ DNC handling (design)
- ✅ No threats/harassment (prompt + escalation)
- ✅ Hallucination restrictions (tool-only data)
- ✅ No unauthorized waivers (prompt + escalation)
- ✅ PII-safe logging (design)

---

## License

Take-home assignment for Kapture CX. Not for production use.