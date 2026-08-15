# Compliance & Guardrails — Maya Collections Voice AI

## 1. Authentication Gate (Non-Negotiable)

### Rule
**No debt information shall be disclosed before successful customer verification.**

### Enforcement
- **Backend Tool Middleware**: `get_account_details`, `log_promise_to_pay`, `send_payment_link` **require** `session.authStatus === 'verified'`
- **Session Store Authority**: Authentication state lives in backend session store (keyed by `call_id`), not in LLM context
- **LLM Cannot Override**: Even if LLM claims "customer verified", tools will reject without backend confirmation

### What Is Protected (Pre-Auth)
| Category | Examples |
|----------|----------|
| Amounts | Overdue total, EMI amount, late fees, settlement amount |
| Account Existence | Loan type, account number, product name |
| Dates | Due date, last payment date, days past due |
| Status | Payment history, missed payments, default status |
| Identifiers | Internal account/customer IDs |

### What Is Permitted (Pre-Auth)
- Company name: "Kapture Finance"
- Call purpose: "This is a collections call regarding an overdue account"
- Verification requests: "For security, please confirm your date of birth"
- Generic empathy: "I understand this may be unexpected"

---

## 2. Mandatory Disclosures (Call Opening)

### Required in `INIT` State (First 15 Seconds)
1. **Identity**: "This is Maya from Kapture Finance"
2. **Purpose**: "I'm calling regarding an overdue account"
3. **Mini-Miranda** (if applicable): "This is an attempt to collect a debt. Any information obtained will be used for that purpose."
4. **Permission**: "May I continue?"

### Script Template
> "Hello, this is Maya calling from Kapture Finance. I'm reaching out regarding an overdue account. For your security, I need to verify your identity before discussing any details. May I continue?"

---

## 3. Calling Window Compliance

| Parameter | Value |
|-----------|-------|
| **Allowed Hours** | 8:00 AM – 7:00 PM customer local time |
| **Timezone Source** | Customer phone number area code / stored timezone |
| **Enforcement** | Backend validates before dial; Vapi scheduler respects window |
| **Violations** | Calls outside window → `disposition: other` with `details: "outside_calling_window"` |

---

## 4. Do Not Call (DNC) Handling

### Customer Request
- Intent: `Do_Not_Call` detected → immediate `mark_disposition(do_not_call)`
- Backend adds `phone_number` to `dnc_list` in mock datastore
- Future outbound calls filter against DNC list

### Registry Compliance
- Mock datastore includes `dnc_list` array
- Pre-dial check: `if (phone in dnc_list) skip`

---

## 5. Fair Collection Behaviour

### Prohibited Behaviours (Enforced via System Prompt + Monitoring)
| Behaviour | Example | Guardrail |
|-----------|---------|-----------|
| Threats | "We'll send legal notice tomorrow" | Prompt: "Never threaten legal action" |
| Harassment | Repeated calls same day | Max 1 call/day per account |
| Profanity | Any abusive language | `Hostile` intent → escalate |
| Misrepresentation | "I'm from the court" | Prompt: "Only identify as Kapture Finance" |
| Unauthorized disclosure | Telling family members | Only speak to account holder |

### Required Behaviours
- **Respectful Tone**: Empathetic, professional, non-judgmental
- **Active Listening**: Acknowledge customer situation before responding
- **Clear Options**: Present choices (pay now, PTP, callback, speak to agent)
- **No Pressure**: "Take your time to decide"

---

## 6. Hallucination Restrictions

### LLM Must Never:
- Invent amounts, dates, or policies not returned by tools
- Promise waivers, settlements, or fee removals
- State legal consequences not in policy
- Claim "supervisor approval" for anything
- Guarantee outcomes ("Your credit score will improve")

### Enforcement
- System prompt: "Only use information from tool results"
- Tool results are the **single source of truth**
- Post-call audit: Compare LLM statements vs tool outputs

---

## 7. Unauthorized Waiver Restrictions

### LLM Cannot Offer/Promise:
- Full/partial debt forgiveness
- Late fee waivers
- Interest reductions
- Settlement discounts
- Payment plan modifications beyond standard options
- Credit bureau reporting changes

### Escalation Required For:
- Customer requests settlement → `escalate_to_agent(reason: "complex_case")`
- Customer asks for fee waiver → `escalate_to_agent(reason: "dispute")`

---

## 8. Off-Topic Handling

### Detection
- Customer discusses unrelated topics (products, complaints, personal life)
- Intent classifier returns low confidence for all collection intents

### Response Strategy
1. Acknowledge briefly: "I understand..."
2. Redirect: "Let me help you with your account today..."
3. If persistent: "I'm here to assist with your overdue payment. Would you like to discuss that?"

---

## 9. Human Escalation Rules

### Mandatory Escalation Triggers
| Trigger | Reason Code | Priority |
|---------|-------------|----------|
| 3 failed verification attempts | `auth_failed_max` | `high` |
| Customer disputes debt validity | `dispute` | `high` |
| Customer claims hardship (job loss, medical) | `hardship` | `normal` |
| Hostile/abusive/threatening behavior | `hostile` | `urgent` |
| Customer explicitly requests human | `customer_request` | `normal` |
| Complex case beyond AI scope | `complex_case` | `normal` |

### Escalation Context Package
Sent via `escalate_to_agent`:
- Full conversation transcript (Vapi provides)
- Authentication status & attempts
- Account details (if authenticated)
- Intent history
- Customer sentiment indicators

---

## 10. PII & Logging Safety

### What Is Logged (Structured Events)
| Event | PII Included | Masking |
|-------|--------------|---------|
| `call_started` | `call_id`, `customer_id` | Customer ID hashed |
| `auth_attempted` | `call_id`, `method` | No raw values |
| `debt_disclosed` | `call_id`, `amount` | Amount rounded to nearest 100 |
| `ptp_logged` | `call_id`, `ptp_id`, `date`, `amount` | |
| `call_ended` | `call_id`, `disposition`, `duration` | |

### What Is NEVER Logged
- Raw verification values (DOB, OTP, last4)
- Full phone numbers (masked to `+91 9XXX XXXX`)
- Full names in analytics (use `customer_id`)
- Payment references (hashed)
- Conversation audio/transcripts (Vapi retains per their policy)

### Data Retention
- Mock backend: In-memory only; cleared on restart
- Production: 7 years per RBI/collection regulations
- DNC list: Permanent until explicit opt-in

---

## 11. Language & Cultural Compliance

### Supported Languages
- Primary: English
- Secondary: Hindi (Devanagari + Hinglish)

### Requirements
- Detect language switch mid-call → continue in detected language
- No English-only assumptions
- Respectful address: "Aap" (formal) in Hindi
- Festival/holiday awareness (no calls on major holidays)

---

## 12. Compliance Checklist (Per Call)

| Checkpoint | Verification |
|------------|--------------|
| Opening disclosure delivered | `INIT` → `AUTH_PENDING` transition logged |
| Authentication attempted | `auth_attempted` event |
| Auth successful before debt disclosure | `get_account_details` only after `auth_succeeded` |
| DNC checked pre-dial | Backend pre-dial filter |
| Calling window respected | Scheduler validation |
| Disposition logged | `mark_disposition` called in `CALL_ENDED` |
| No prohibited statements | Post-call transcript review |
| Escalation context complete | `escalate_to_agent` includes summary |

---

## 13. Regulatory References (India Context)

| Regulation | Relevance |
|------------|-----------|
| RBI Fair Practices Code | Collections conduct, disclosure |
| TRAI DNC Registry | Do Not Call compliance |
| IT Act 2000 / DPDP Act 2023 | PII protection, consent |
| SARFAESI Act | Secured asset recovery (not applicable to unsecured) |
| IBC 2016 | Insolvency (escalation path) |

> **Note**: This assignment uses mocked endpoints. Production integration would require legal review.