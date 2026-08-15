import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/index';
import { clearAllSessions } from '../src/session/store';

describe('Maya Mock Backend API Tests', () => {
  beforeEach(() => {
    clearAllSessions();
  });

  describe('Authentication Enforcement', () => {
    it('1. get_account_details without a session → fails with 403', async () => {
      const res = await request(app)
        .post('/tools/get_account_details')
        .send({ call_id: 'non_existent_call_id' });

      expect(res.status).toBe(403);
      expect(res.body).toEqual({
        error: 'not_authenticated',
        message: 'Customer not verified. Call verify_customer first.',
      });
    });

    it('2. get_account_details with unauthenticated session → fails with 403', async () => {
      // First attempt verification with wrong value to create an unauthenticated session
      await request(app)
        .post('/tools/verify_customer')
        .send({
          call_id: 'call_unauth_123',
          verification_method: 'dob',
          verification_value: '00000000',
        });

      // Now request account details
      const res = await request(app)
        .post('/tools/get_account_details')
        .send({ call_id: 'call_unauth_123' });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('not_authenticated');
    });

    it('3. verify_customer with incorrect verification → remains unauthenticated', async () => {
      const res = await request(app)
        .post('/tools/verify_customer')
        .send({
          call_id: 'call_wrong_dob',
          verification_method: 'dob',
          verification_value: '01011900',
        });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        verified: false,
        reason: 'invalid_dob',
        attempts_remaining: 2,
      });

      // Verify session status via session debug endpoint
      const sessionRes = await request(app).get('/session/call_wrong_dob');
      expect(sessionRes.body.authStatus).toBe('pending');
      expect(sessionRes.body.verificationAttempts).toBe(1);
    });

    it('4. verify_customer with correct verification → authenticated', async () => {
      const res = await request(app)
        .post('/tools/verify_customer')
        .send({
          call_id: 'call_correct_auth',
          verification_method: 'dob',
          verification_value: '15081990', // Rahul Sharma DOB
        });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        verified: true,
        customer_id: 'cust_rahul_123',
        account_id: 'acc_rahul_001',
        account_status: 'active',
      });

      const sessionRes = await request(app).get('/session/call_correct_auth');
      expect(sessionRes.body.authStatus).toBe('verified');
      expect(sessionRes.body.currentState).toBe('AUTHENTICATED');
    });

    it('5. get_account_details after successful verification → succeeds', async () => {
      // 1. Authenticate
      await request(app)
        .post('/tools/verify_customer')
        .send({
          call_id: 'call_valid_auth',
          verification_method: 'dob',
          verification_value: '15081990',
        });

      // 2. Fetch account details
      const res = await request(app)
        .post('/tools/get_account_details')
        .send({ call_id: 'call_valid_auth' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        account_id: 'acc_rahul_001',
        customer_name: 'Rahul Sharma',
        loan_type: 'Personal Loan',
        total_outstanding: 8499,
        emi_amount: 8499,
        due_date: '2024-08-03',
        days_past_due: 12,
        last_payment_date: '2024-07-03',
        last_payment_amount: 8499,
      });

      const sessionRes = await request(app).get('/session/call_valid_auth');
      expect(sessionRes.body.currentState).toBe('NEGOTIATION');
    });
  });

  describe('Security Protections', () => {
    it('6. Attempt to access another account through an arbitrary accountId → fails or is ignored', async () => {
      // Authenticate as Rahul (acc_rahul_001)
      await request(app)
        .post('/tools/verify_customer')
        .send({
          call_id: 'call_tamper_attempt',
          verification_method: 'dob',
          verification_value: '15081990',
        });

      // Attempt to request Priya's account (acc_priya_002) in request body
      const res = await request(app)
        .post('/tools/get_account_details')
        .send({
          call_id: 'call_tamper_attempt',
          account_id: 'acc_priya_002',
        });

      expect(res.status).toBe(200);
      // MUST return Rahul's account data, not Priya's!
      expect(res.body.account_id).toBe('acc_rahul_001');
      expect(res.body.customer_name).toBe('Rahul Sharma');
    });

    it('7. Failed verification response contains no debt information', async () => {
      const res = await request(app)
        .post('/tools/verify_customer')
        .send({
          call_id: 'call_failed_sec_check',
          verification_method: 'otp',
          verification_value: '0000',
        });

      expect(res.status).toBe(200);
      expect(res.body.total_outstanding).toBeUndefined();
      expect(res.body.emi_amount).toBeUndefined();
      expect(res.body.due_date).toBeUndefined();
      expect(res.body.days_past_due).toBeUndefined();
      expect(res.body.loan_type).toBeUndefined();
      expect(res.body.customer_name).toBeUndefined();
    });

    it('8. Unauthenticated request cannot retrieve debt information', async () => {
      const res = await request(app)
        .post('/tools/get_account_details')
        .send({ call_id: 'unauthenticated_call_id' });

      expect(res.status).toBe(403);
      expect(res.body.total_outstanding).toBeUndefined();
      expect(res.body.emi_amount).toBeUndefined();
    });
  });

  describe('Promise to Pay (PTP)', () => {
    it('9. Authenticated user can log a valid PTP', async () => {
      // Authenticate
      await request(app)
        .post('/tools/verify_customer')
        .send({
          call_id: 'call_ptp_valid',
          verification_method: 'dob',
          verification_value: '15081990',
        });

      const res = await request(app)
        .post('/tools/log_promise_to_pay')
        .send({
          call_id: 'call_ptp_valid',
          ptp_date: '2026-08-20',
          ptp_amount: 8499,
          payment_method: 'upi',
          notes: 'Customer will pay via PhonePe',
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('recorded');
      expect(res.body.ptp_id).toMatch(/^ptp_/);
      expect(res.body.confirmation_message).toContain('8,499');

      const sessionRes = await request(app).get('/session/call_ptp_valid');
      expect(sessionRes.body.currentState).toBe('ACTION');
    });

    it('10. Invalid PTP amount/date is rejected', async () => {
      // Authenticate
      await request(app)
        .post('/tools/verify_customer')
        .send({
          call_id: 'call_ptp_invalid',
          verification_method: 'dob',
          verification_value: '15081990',
        });

      // a. Invalid amount (exceeds outstanding of 8499)
      const resAmount = await request(app)
        .post('/tools/log_promise_to_pay')
        .send({
          call_id: 'call_ptp_invalid',
          ptp_date: '2026-08-20',
          ptp_amount: 50000,
        });

      expect(resAmount.status).toBe(400);
      expect(resAmount.body.error).toBe('invalid_amount');

      // b. Invalid date (far in future beyond 30 days)
      const resDate = await request(app)
        .post('/tools/log_promise_to_pay')
        .send({
          call_id: 'call_ptp_invalid',
          ptp_date: '2026-11-20',
          ptp_amount: 5000,
        });

      expect(resDate.status).toBe(400);
      expect(resDate.body.error).toBe('invalid_date');
    });
  });

  describe('Payment Link', () => {
    it('11. Authenticated user can request a mock payment link', async () => {
      // Authenticate
      await request(app)
        .post('/tools/verify_customer')
        .send({
          call_id: 'call_pay_link',
          verification_method: 'dob',
          verification_value: '15081990',
        });

      const res = await request(app)
        .post('/tools/send_payment_link')
        .send({
          call_id: 'call_pay_link',
          channel: 'sms',
          amount: 24500,
        });

      expect(res.status).toBe(200);
      expect(res.body.link_id).toMatch(/^link_/);
      expect(res.body.channel).toBe('sms');
      expect(res.body.sent_to).toBe('+91 9XXXX 3210');
      expect(res.body.expires_at).toBeDefined();

      const sessionRes = await request(app).get('/session/call_pay_link');
      expect(sessionRes.body.currentState).toBe('ACTION');
    });

    it('12. Invalid channel is rejected', async () => {
      // Authenticate
      await request(app)
        .post('/tools/verify_customer')
        .send({
          call_id: 'call_invalid_chan',
          verification_method: 'dob',
          verification_value: '15081990',
        });

      const res = await request(app)
        .post('/tools/send_payment_link')
        .send({
          call_id: 'call_invalid_chan',
          channel: 'telegram',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('validation_error');
    });
  });

  describe('Disposition Logging', () => {
    it('13. mark_disposition records the expected status', async () => {
      const res = await request(app)
        .post('/tools/mark_disposition')
        .send({
          call_id: 'call_disp_test',
          disposition: 'promise_to_pay',
          details: 'PTP logged for 2026-08-20',
          ptp_id: 'ptp_123',
        });

      expect(res.status).toBe(200);
      expect(res.body.disposition_id).toMatch(/^disp_/);
      expect(res.body.logged_at).toBeDefined();

      const sessionRes = await request(app).get('/session/call_disp_test');
      expect(sessionRes.body.disposition).toBe('promise_to_pay');
      expect(sessionRes.body.currentState).toBe('CALL_ENDED');
    });
  });

  describe('Escalation', () => {
    it('14. escalate_to_agent records an escalation', async () => {
      const res = await request(app)
        .post('/tools/escalate_to_agent')
        .send({
          call_id: 'call_esc_test',
          reason: 'dispute',
          summary: 'Customer disputes late fee of ₹500 on their loan account.',
          priority: 'high',
        });

      expect(res.status).toBe(200);
      expect(res.body.escalation_id).toMatch(/^esc_/);
      expect(res.body.agent_assigned).toBe('agent_smith');
      expect(res.body.estimated_wait_time).toBe(45);

      const sessionRes = await request(app).get('/session/call_esc_test');
      expect(sessionRes.body.currentState).toBe('ESCALATED');
    });
  });

  describe('Maximum Verification Attempts Enforcement', () => {
    it('15. Enforces max 3 failed verification attempts', async () => {
      const callId = 'call_max_attempts';

      // Attempt 1
      const res1 = await request(app).post('/tools/verify_customer').send({
        call_id: callId,
        verification_method: 'dob',
        verification_value: '00000000',
      });
      expect(res1.body.attempts_remaining).toBe(2);

      // Attempt 2
      const res2 = await request(app).post('/tools/verify_customer').send({
        call_id: callId,
        verification_method: 'dob',
        verification_value: '00000000',
      });
      expect(res2.body.attempts_remaining).toBe(1);

      // Attempt 3
      const res3 = await request(app).post('/tools/verify_customer').send({
        call_id: callId,
        verification_method: 'dob',
        verification_value: '00000000',
      });
      expect(res3.body.verified).toBe(false);
      expect(res3.body.reason).toBe('max_attempts');
      expect(res3.body.attempts_remaining).toBe(0);

      // Attempt 4 after max reached
      const res4 = await request(app).post('/tools/verify_customer').send({
        call_id: callId,
        verification_method: 'dob',
        verification_value: '15081990', // even if valid DOB sent now
      });
      expect(res4.body.verified).toBe(false);
      expect(res4.body.reason).toBe('max_attempts');
      expect(res4.body.attempts_remaining).toBe(0);
    });
  });
});
