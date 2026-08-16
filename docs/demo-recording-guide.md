# Demo Recording Guide — Kapture Finance Maya Voice AI

This guide outlines a concise 2–4 minute demo recording flow designed for evaluators to observe Maya's conversational capabilities, compliance controls, and real-time backend tool execution.

---

## 1. Live Pre-Call Checklist

Before starting the screen recording, verify the following configuration status:

- [ ] **Backend Running**: `npm run dev` running in `/mock-backend` on port `3000`.
- [ ] **Tunnel Running**: `ngrok http 3000` active and forwarding HTTPS traffic.
- [ ] **Server URL Configured**: Vapi Assistant Server URL set to `https://<your-ngrok-subdomain>.ngrok.app/vapi/webhook`.
- [ ] **Webhook Secret Configured**: Header `x-vapi-secret` added in Vapi settings matching local `.env`.
- [ ] **Tools Attached**: All 6 custom function tools registered (`verify_customer`, `get_account_details`, `log_promise_to_pay`, `send_payment_link`, `escalate_to_agent`, `mark_disposition`).
- [ ] **System Prompt Loaded**: Latest contents from `vapi/system-prompt.md` saved in Vapi Dashboard.
- [ ] **First Message Loaded**: Neutral opening set: *"Hello, this is Maya calling from Kapture Finance. May I speak with Rahul Sharma?"*

> ⚠️ **Security Warning**: Do not show `.env` or commit secrets to git during demo video capture.

---

## 2. Recommended Screen Layout

To provide maximum clarity to evaluators, split your screen into two side-by-side windows:
- **Left Window**: Vapi Web Call interface / Audio call.
- **Right Window**: Terminal running `mock-backend` with PII-masked logs visible (`[VAPI] Call: ... | Tool: ... | Success: true | Latency: ...ms`).

---

## 3. Recording Timeline (2–4 Minutes Total)

### Part 1: Happy-Path PTP Flow (approx. 90 seconds)
1. **Initiate Call**: Click "Test Web Call" in Vapi.
2. **Opening**: 
   - *Maya*: "Hello, this is Maya calling from Kapture Finance. May I speak with Rahul Sharma?"
   - *Tester*: "Yes, this is Rahul."
3. **Authentication Request**:
   - *Maya*: "For your security, I need to verify your identity before we continue. May I have your date of birth?"
   - *Tester*: "15th August 1990."
   - *(Point out terminal log showing `verify_customer` success followed by `get_account_details`)*
4. **Debt Disclosure**:
   - *Maya*: Discloses Personal Loan, ₹8,499 overdue, 12 days past due.
5. **Negotiation & Date Commitment**:
   - *Tester*: "I can pay on [valid future date within 30 days]."
   - *Maya*: Confirms exact amount (₹8,499) and date.
   - *Tester*: "Yes, that's correct."
   - *(Point out terminal log showing `log_promise_to_pay` success)*
6. **Payment Link & Closure**:
   - *Maya*: Offers SMS/WhatsApp payment link.
   - *Tester*: "SMS please."
   - *Maya*: Confirms SMS sent, reads polite closing.
   - *(Point out terminal log showing `send_payment_link` and `mark_disposition(promise_to_pay)`)*

---

### Part 2: "Already Paid" Edge Case (approx. 60 seconds)
1. **Initiate New Call**: Click "Test Web Call".
2. **Quick Auth**:
   - Confirm identity as Rahul Sharma and provide DOB `15081990`.
3. **Disclosure & Claim**:
   - After Maya discloses the ₹8,499 balance, say: "I already paid this last week via UPI."
4. **Empathetic Handling**:
   - Observe Maya acknowledging the claim politely without arguing or demanding proof.
5. **Call Closure**:
   - Maya notes that the payments team will verify, wishes a good day, and closes the call.
   - *(Point out terminal log showing `mark_disposition(already_paid)`)*

---

## 4. Key Talking Points for Evaluator Summary
During the recording audio or commentary, highlight:
- **Strict PII Security**: Zero debt data spoken before `verify_customer` returns `verified: true`.
- **Date Protection**: The assistant requires specific calendar dates and rejects outdated/hallucinated years.
- **Auditability**: Every call state transition is logged cleanly in the backend datastore with masked call IDs.
