# High-Level Design: Kapture Finance — Maya Collections Voice AI

## A. System Overview

**Maya** is an outbound Voice AI collections agent for Kapture Finance. It conducts compliant, empathetic, and effective overdue-loan conversations with customers.

### Call Lifecycle

1. **Outbound Initiation** — System dials customer; Vapi answers with Maya
2. **Opening Disclosure** — Maya identifies as Kapture Finance, states purpose (collections), requests permission to continue
3. **Authentication** — Maya requests verification (DOB, last 4 of phone/loan, OTP); backend verifies via `verify_customer`
4. **Debt Disclosure (Post-Auth Only)** — After successful verification, Maya discloses overdue amount, loan details, due date
5. **Intent Understanding** — Maya listens, classifies intent (PTP, Already Paid, Hardship, Dispute, Wrong Person, DNC, Callback, Hostile)
6. **Action/Resolution** — Based on intent:
   - **PTP**: Collect date + amount → `log_promise_to_pay` → optionally `send_payment_link`
   - **Already Paid**: Collect reference → verify → close
   - **Hardship**: Document reason → escalate or offer restructuring path
   - **Dispute**: Log details → escalate
   - **Wrong Person**: Log → end call politely
   - **DNC**: Log → suppress future calls → end call
   - **Callback**: Schedule → end call
   - **Hostile/Abusive**: De-escalate → escalate to human
7. **Closing** — Summarize outcome, confirm next steps, thank customer
8. **Disposition Logging** — `mark_disposition` with final call outcome

---

## B. Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────────────┐
│  Customer   │────▶│  Telephony   │────▶│    STT      │────▶│   LLM/Orchestrator│
│  (Phone)    │     │   / Vapi     │     │  (Realtime) │     │   (Vapi Assistant)│
└─────────────┘     └──────────────┘     └─────────────┘     └────────┬─────────┘
                                                                       │
                                                          ┌─────────────▼─────────┐
                                                          │ Vapi Webhook Adapter  │
                                                          │  (/vapi/webhook API)  │
                                                          └─────────────┬─────────┘
                                                                        │
                    ┌──────────────────────────────────────────────────┼──────────────┐
                    │                                                  │              │
                    ▼                                                  ▼              ▼
           ┌───────────────┐                               ┌──────────────────┐ ┌───────────┐
           │ Session State │                               │  Mock Datastore  │ │   TTS     │
           │  (In-Memory)  │                               │  (accounts.json) │ │  (Vapi)   │
           └───────────────┘                               └──────────────────┘ └───────────┘
                    │                                                  │
                    │                    AUTHENTICATION BOUNDARY       │
                    │                    ◄─────────────────────────────┘
                    │
                    ▼
           ┌───────────────┐
           │ Disposition   │
           │   Logging     │
           └───────────────┘
```

### Responsibility Mapping

| Layer | Responsibility |
|-------|----------------|
| Telephony/Vapi | Call handling, STT/TTS, audio streaming, function calling orchestration |
| STT | Real-time speech-to-text (Deepgram/Whisper via Vapi) |
| LLM/Orchestrator | Conversation flow, intent classification, tool selection, response generation |
| Webhook Adapter | Parses Vapi `tool-calls` payload, extracts `call_id`, enforces auth, maps to internal tools |
| Tool/API Layer | Business logic: auth, account lookup, PTP logging, escalation, disposition |
| Session State | In-memory store keyed by `call_id`; tracks `auth_status`, `customer_id`, `account_id`, `intent`, `ptp_data` |
| Mock Datastore | Static JSON file with test accounts; no external DB |
| TTS | Text-to-speech (Vapi-managed) |

---

## C. Latency Budget (Design Targets)

| Component | Target Latency | Notes |
|-----------|----------------|-------|
| STT (streaming) | 300–500ms | Vapi handles; first token ~300ms |
| LLM First Response | 400–700ms | GPT-4o/4o-mini; depends on prompt size |
| Tool/API Overhead | 50–150ms | Local Express server; no external deps |
| TTS (streaming) | 200–400ms | First audio chunk |
| Network/Other | 100–200ms | ngrok + local latency |
| **Total (P50)** | **~1.1–1.5s** | **Design target: <1.2s end-to-end** |

> **Assumptions**: Local backend, no cold starts, optimized prompts, streaming STT/TTS. P99 will be higher. Actual measurement required in Phase 5.

---

## D. State Machine

### States

| State | Description |
|-------|-------------|
| `INIT` | Call connected; opening disclosure in progress |
| `AUTH_PENDING` | Verification requested; awaiting customer input + tool result |
| `AUTHENTICATED` | Verification successful; debt data now accessible |
| `NEGOTIATION` | Authenticated; discussing repayment options |
| `ACTION` | Executing resolution (PTP, payment link, escalation) |
| `ESCALATED` | Transferred to human agent; call may stay connected |
| `CALL_ENDED` | Terminal state; disposition logged |

### Valid Transitions

```
INIT → AUTH_PENDING                    (after opening disclosure)
AUTH_PENDING → AUTHENTICATED           (ONLY after verify_customer returns success)
AUTH_PENDING → INIT                    (failed verification; retry up to 3×)
AUTH_PENDING → ESCALATED               (3 failed attempts → human)
AUTH_PENDING → CALL_ENDED              (wrong person / DNC / customer hangs up)
AUTHENTICATED → NEGOTIATION            (debt disclosed; customer engages)
NEGOTIATION → ACTION                   (intent resolved to actionable outcome)
NEGOTIATION → ESCALATED                (dispute, hardship requiring human, hostile)
NEGOTIATION → CALL_ENDED               (already paid verified / wrong person / DNC)
ACTION → CALL_ENDED                    (PTP logged, payment link sent, callback scheduled)
ESCALATED → CALL_ENDED                 (human takes over or call ends)
```

### Post-Resolution Outcomes

| Trigger | Next State | Disposition |
|---------|------------|-------------|
| Failed verification (1–2) | `AUTH_PENDING` (retry) | — |
| Failed verification (3) | `ESCALATED` | `AUTH_FAILED_MAX_RETRIES` |
| Wrong person | `CALL_ENDED` | `WRONG_PERSON` |
| DNC request | `CALL_ENDED` | `DO_NOT_CALL` |
| Dispute | `ESCALATED` | `DISPUTED` |
| Already paid (verified) | `CALL_ENDED` | `ALREADY_PAID` |
| Hardship | `ESCALATED` | `HARDSHIP` |
| Successful PTP | `CALL_ENDED` | `PROMISE_TO_PAY` |
| Callback scheduled | `CALL_ENDED` | `CALLBACK_SCHEDULED` |
| Hostile/abusive | `ESCALATED` | `HOSTILE` |
| Silence/no response | `CALL_ENDED` | `NO_RESPONSE` |
| Voicemail | `CALL_ENDED` | `VOICEMAIL` |

### Authentication Enforcement Rule

> **CRITICAL**: `AUTH_PENDING → AUTHENTICATED` transition occurs **ONLY** when `verify_customer` tool returns `verified: true`. The LLM **must not** be the source of truth for authentication state. Backend session store is the authority.

---

## E. Authentication and Data Safety

### Pre-Authentication Disclosure Restrictions

**The agent MUST NOT reveal any of the following before successful verification:**

| Protected Data | Examples |
|----------------|----------|
| Overdue amount | "₹15,000 overdue" |
| Loan/Account existence | "Your personal loan..." |
| EMI details | "EMI of ₹5,000" |
| Due dates | "Due on 15th August" |
| Payment status | "You missed 2 payments" |
| Days past due | "30 days overdue" |
| Internal account IDs | "Account LN-2024-00123" |

### Permitted Pre-Auth Disclosure

- Company name: "Kapture Finance"
- Purpose: "This is a collections call regarding an overdue account"
- Generic verification request: "For security, please verify your date of birth"

### Authentication Representation

- **Backend Session Store** (in-memory Map keyed by `call_id`):
  ```typescript
  interface CallSession {
    callId: string;
    customerId?: string;
    accountId?: string;
    authStatus: 'pending' | 'verified' | 'failed';
    authAttempts: number;
    intent?: string;
    ptpData?: { date: string; amount: number; method?: string };
    createdAt: number;
    updatedAt: number;
  }
  ```
- **Tool Middleware** enforces: `get_account_details`, `log_promise_to_pay`, `send_payment_link` **require** `authStatus === 'verified'`

---

## F. Intents and Entities

### Intent Taxonomy

| Intent | Description | Typical Entities |
|--------|-------------|------------------|
| `Promise_To_Pay` | Customer commits to pay by date | `ptp_date`, `ptp_amount`, `payment_method` |
| `Already_Paid` | Claims payment already made | `payment_reference`, `payment_date`, `payment_amount` |
| `Hardship` | Cannot pay due to circumstances | `hardship_reason` (job_loss, medical, etc.), `supporting_docs` |
| `Dispute` | Disagrees with amount/validity | `dispute_reason`, `disputed_amount` |
| `Wrong_Person` | Not the account holder | — |
| `Do_Not_Call` | Requests no further contact | — |
| `Callback_Request` | Wants call at specific time | `callback_datetime`, `callback_timezone` |
| `Hostile` | Abusive, threatening, profane | — |
| `No_Response` | Silence, unintelligible, hangup | — |

### Entity Definitions

| Entity | Type | Validation |
|--------|------|------------|
| `ptp_date` | ISO 8601 date (YYYY-MM-DD) | Must be ≥ today, ≤ 30 days out |
| `ptp_amount` | Number (INR) | > 0, ≤ total_outstanding |
| `payment_method` | Enum | `upi`, `netbanking`, `card`, `cash`, `other` |
| `payment_reference` | String | Alphanumeric, 6–20 chars |
| `verification_code` | String | 4–6 digit OTP or DOB (DDMMYYYY) |
| `hardship_reason` | Enum | `job_loss`, `medical_emergency`, `business_loss`, `family_emergency`, `other` |
| `callback_datetime` | ISO 8601 datetime | Must be within calling window |

---

## G. Tool/API Contracts

### 1. verify_customer

**Purpose**: Authenticate customer before any debt disclosure.

**Inputs**:
```json
{
  "call_id": "string (required)",
  "verification_method": "enum: dob | otp | last4_phone | last4_loan (required)",
  "verification_value": "string (required)"
}
```

**Outputs (Success)**:
```json
{
  "verified": true,
  "customer_id": "string",
  "account_id": "string",
  "account_status": "active | closed | written_off"
}
```

**Outputs (Failure)**:
```json
{
  "verified": false,
  "reason": "enum: invalid_dob | invalid_otp | invalid_last4 | not_found | max_attempts",
  "attempts_remaining": "number"
}
```

**Auth Requirement**: None (this **is** the auth tool)

**Failure Behaviour**: Returns `verified: false`; increments `authAttempts` in session; LLM must retry or escalate per state machine.

---

### 2. get_account_details

**Purpose**: Retrieve debt/account details **only after authentication**.

**Inputs**:
```json
{
  "call_id": "string (required)"
}
```

**Outputs (Success)**:
```json
{
  "account_id": "string",
  "customer_name": "string",
  "loan_type": "string",
  "total_outstanding": "number",
  "emi_amount": "number",
  "due_date": "string (ISO 8601)",
  "days_past_due": "number",
  "last_payment_date": "string | null",
  "last_payment_amount": "number | null"
}
```

**Outputs (Failure)**:
```json
{
  "error": "enum: not_authenticated | account_not_found | internal_error"
}
```

**Auth Requirement**: **MUST have `authStatus === 'verified'` in session** — enforced by middleware.

---

### 3. log_promise_to_pay

**Purpose**: Record a Promise-to-Pay commitment.

**Inputs**:
```json
{
  "call_id": "string (required)",
  "ptp_date": "string (ISO 8601, required)",
  "ptp_amount": "number (required)",
  "payment_method": "string (optional)",
  "notes": "string (optional)"
}
```

**Outputs (Success)**:
```json
{
  "ptp_id": "string",
  "status": "recorded",
  "confirmation_message": "string"
}
```

**Outputs (Failure)**:
```json
{
  "error": "enum: not_authenticated | invalid_date | invalid_amount | account_not_found | internal_error"
}
```

**Auth Requirement**: **MUST have `authStatus === 'verified'`**

---

### 4. send_payment_link

**Purpose**: Send payment link via SMS/WhatsApp (mocked).

**Inputs**:
```json
{
  "call_id": "string (required)",
  "channel": "enum: sms | whatsapp (required)",
  "amount": "number (optional, defaults to total_outstanding)"
}
```

**Outputs (Success)**:
```json
{
  "link_id": "string",
  "channel": "string",
  "sent_to": "string (masked phone)",
  "expires_at": "string (ISO 8601)"
}
```

**Outputs (Failure)**:
```json
{
  "error": "enum: not_authenticated | channel_unavailable | internal_error"
}
```

**Auth Requirement**: **MUST have `authStatus === 'verified'`**

---

### 5. escalate_to_agent

**Purpose**: Transfer to human agent with context.

**Inputs**:
```json
{
  "call_id": "string (required)",
  "reason": "enum: dispute | hardship | hostile | auth_failed_max | customer_request | complex_case",
  "summary": "string (required)",
  "priority": "enum: normal | high | urgent (default: normal)"
}
```

**Outputs (Success)**:
```json
{
  "escalation_id": "string",
  "agent_assigned": "string | null",
  "estimated_wait_time": "number (seconds)"
}
```

**Outputs (Failure)**:
```json
{
  "error": "enum: no_agents_available | internal_error"
}
```

**Auth Requirement**: None (can escalate from any state)

---

### 6. mark_disposition

**Purpose**: Log final call outcome for reporting.

**Inputs**:
```json
{
  "call_id": "string (required)",
  "disposition": "enum: promise_to_pay | already_paid | disputed | hardship | wrong_person | do_not_call | callback_scheduled | auth_failed_max_retries | hostile | no_response | voicemail | escalated | other",
  "details": "string (optional)",
  "ptp_id": "string (optional)",
  "escalation_id": "string (optional)"
}
```

**Outputs (Success)**:
```json
{
  "disposition_id": "string",
  "logged_at": "string (ISO 8601)"
}
```

**Auth Requirement**: None

---

## H. Compliance / Guardrails

| Rule | Implementation |
|------|----------------|
| **Identity/Purpose Disclosure** | Mandatory in `INIT` state: "This is Maya from Kapture Finance calling regarding an overdue account." |
| **No Debt Disclosure Pre-Auth** | Enforced by tool middleware: `get_account_details` rejects if `authStatus !== 'verified'` |
| **Calling Window** | 8:00 AM – 7:00 PM local time (assignment requirement); backend validates before dial |
| **DNC Handling** | `Do_Not_Call` intent → `mark_disposition` with `do_not_call` → suppress future calls in mock datastore |
| **No Threats/Harassment** | System prompt forbids; `Hostile` intent triggers `escalate_to_agent` |
| **Respectful Tone** | System prompt: empathetic, professional, non-judgmental |
| **Hallucination Restrictions** | LLM must only use tool outputs; never invent amounts, dates, policies |
| **Unauthorized Waiver Restrictions** | LLM cannot promise waivers, settlements, or policy exceptions |
| **Off-Topic Handling** | Gently redirect: "I understand. Let me help you with your account..." |
| **Human Escalation Rules** | Mandatory for: dispute, hardship (complex), hostile, 3× auth failure, customer request |

---

## I. Edge Case Matrix

| Edge Case | Detection | Handling |
|-----------|-----------|----------|
| Wrong person | `Wrong_Person` intent | `mark_disposition(wrong_person)` → end call |
| Already paid | `Already_Paid` intent | Request reference → verify → `mark_disposition(already_paid)` |
| Disputed amount | `Dispute` intent | Log details → `escalate_to_agent(dispute)` |
| Hardship | `Hardship` intent | Document reason → `escalate_to_agent(hardship)` |
| DNC request | `Do_Not_Call` intent | `mark_disposition(do_not_call)` → add to DNC list |
| Callback request | `Callback_Request` intent | Collect time → `mark_disposition(callback_scheduled)` |
| Hostile/abusive | `Hostile` intent or profanity detection | De-escalate → `escalate_to_agent(hostile)` |
| Silence/no input | No speech > 5s | Reprompt → after 2× → `mark_disposition(no_response)` |
| Voicemail | Vapi voicemail detection | Leave message → `mark_disposition(voicemail)` |
| Failed authentication | `verify_customer` returns false | Retry (max 3) → then `escalate_to_agent(auth_failed_max)` |
| Mid-call language switch | Detect Hindi/English mix | Continue in detected language; tools language-agnostic |

---

## J. Observability

### Events to Capture

| Event | Fields |
|-------|--------|
| `call_started` | `call_id`, `customer_id`, `timestamp` |
| `auth_attempted` | `call_id`, `method`, `success`, `attempt_number` |
| `auth_succeeded` | `call_id`, `customer_id`, `account_id` |
| `auth_failed` | `call_id`, `reason`, `attempts_remaining` |
| `debt_disclosed` | `call_id`, `amount`, `days_past_due` |
| `intent_classified` | `call_id`, `intent`, `confidence` |
| `tool_called` | `call_id`, `tool_name`, `latency_ms`, `success` |
| `ptp_logged` | `call_id`, `ptp_id`, `date`, `amount` |
| `payment_link_sent` | `call_id`, `link_id`, `channel` |
| `escalated` | `call_id`, `escalation_id`, `reason` |
| `call_ended` | `call_id`, `disposition`, `duration_seconds` |

### Key Metrics

| Metric | Target |
|--------|--------|
| Containment Rate | > 70% |
| PTP Rate | > 25% of authenticated calls |
| First-Call Resolution | > 60% |
| Escalation Rate | < 20% |
| Authentication Success Rate | > 85% |
| Average Latency (P50) | < 1.2s |
| Drop/No-Response Rate | < 15% |
| Tool Failure Rate | < 1% |