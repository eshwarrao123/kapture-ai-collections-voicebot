import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/index';
import { clearAllSessions, getSession } from '../src/session/store';

describe('Vapi Webhook Adapter', () => {
  beforeEach(() => {
    clearAllSessions();
    process.env.VAPI_WEBHOOK_SECRET = 'secret123';
  });

  const makeVapiPayload = (toolName: string, args: any, callId: string = 'vapi_call_1') => ({
    message: {
      type: 'tool-calls',
      call: { id: callId },
      toolCalls: [
        {
          id: 'tc_123',
          type: 'function',
          function: {
            name: toolName,
            arguments: args,
          },
        },
      ],
    },
  });

  it('1 & 3 & 9 & 10. Valid verify_customer request succeeds, formats response correctly, propagates toolCallId', async () => {
    const payload = makeVapiPayload('verify_customer', {
      verification_method: 'dob',
      verification_value: '15081990',
    });

    const res = await request(app)
      .post('/vapi/webhook')
      .set('x-vapi-secret', 'secret123')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      results: [
        {
          toolCallId: 'tc_123',
          result: {
            verified: true,
            customer_id: 'cust_rahul_123',
            account_id: 'acc_rahul_001',
            account_status: 'active',
          },
        },
      ],
    });

    // Verify session was created
    const session = getSession('vapi_call_1');
    expect(session).toBeDefined();
    expect(session?.authStatus).toBe('verified');
  });

  it('2. Protected tool before authentication → rejected', async () => {
    const payload = makeVapiPayload('get_account_details', {});

    const res = await request(app)
      .post('/vapi/webhook')
      .set('x-vapi-secret', 'secret123')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.results[0].result).toEqual({
      error: 'not_authenticated',
      message: 'Customer not verified. Call verify_customer first.',
    });
  });

  it('4. Protected tool after authentication → succeeds', async () => {
    // Authenticate first
    await request(app)
      .post('/vapi/webhook')
      .set('x-vapi-secret', 'secret123')
      .send(
        makeVapiPayload('verify_customer', {
          verification_method: 'dob',
          verification_value: '15081990',
        })
      );

    // Call protected tool
    const payload = makeVapiPayload('get_account_details', {});
    const res = await request(app)
      .post('/vapi/webhook')
      .set('x-vapi-secret', 'secret123')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.results[0].result).toMatchObject({
      account_id: 'acc_rahul_001',
      total_outstanding: 8499,
    });
  });

  it('5. Unknown tool → rejected', async () => {
    const payload = makeVapiPayload('hack_the_mainframe', {});

    const res = await request(app)
      .post('/vapi/webhook')
      .set('x-vapi-secret', 'secret123')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.results[0].result).toEqual({
      error: 'unknown_tool',
      message: 'Tool hack_the_mainframe not supported',
    });
  });

  it('6. Missing call ID → rejected (400)', async () => {
    const payload = {
      message: {
        type: 'tool-calls',
        toolCalls: [
          {
            id: 'tc_123',
            type: 'function',
            function: { name: 'verify_customer', arguments: {} },
          },
        ],
      },
    };

    const res = await request(app)
      .post('/vapi/webhook')
      .set('x-vapi-secret', 'secret123')
      .send(payload);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_payload');
  });

  it('7. Malformed tool arguments → rejected (handled by internal Zod validation)', async () => {
    const payload = makeVapiPayload('verify_customer', {
      verification_method: 'invalid_enum',
    });

    const res = await request(app)
      .post('/vapi/webhook')
      .set('x-vapi-secret', 'secret123')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.results[0].result.error).toBe('validation_error');
  });

  it('8. Invalid webhook authentication/signature → rejected', async () => {
    const payload = makeVapiPayload('verify_customer', {
      verification_method: 'dob',
      verification_value: '15081990',
    });

    const res = await request(app)
      .post('/vapi/webhook')
      .set('x-vapi-secret', 'wrong_secret')
      .send(payload);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('unauthorized');
  });
});
