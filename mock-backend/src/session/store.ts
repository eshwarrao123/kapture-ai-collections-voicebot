export type SessionState =
  | 'INIT'
  | 'AUTH_PENDING'
  | 'AUTHENTICATED'
  | 'NEGOTIATION'
  | 'ACTION'
  | 'ESCALATED'
  | 'CALL_ENDED';

export type AuthStatus = 'pending' | 'verified' | 'failed';

export interface CallSession {
  callId: string;
  accountId?: string;
  customerId?: string;
  authStatus: AuthStatus;
  verificationAttempts: number;
  verifiedAt?: string;
  currentState: SessionState;
  disposition?: string;
  dispositionDetails?: string;
  ptpData?: {
    ptpId: string;
    ptpDate: string;
    ptpAmount: number;
    paymentMethod?: string;
    notes?: string;
    recordedAt: string;
  };
  paymentLinkData?: {
    linkId: string;
    channel: string;
    amount: number;
    sentTo: string;
    expiresAt: string;
  };
  escalationData?: {
    escalationId: string;
    reason: string;
    summary: string;
    priority: string;
    escalatedAt: string;
  };
  createdAt: string;
  updatedAt: string;
}

const sessions = new Map<string, CallSession>();

/**
  * Create a new call session.
  */
export function createSession(callId: string, accountId?: string): CallSession {
  const now = new Date().toISOString();
  const session: CallSession = {
    callId,
    accountId,
    authStatus: 'pending',
    verificationAttempts: 0,
    currentState: 'INIT',
    createdAt: now,
    updatedAt: now,
  };
  sessions.set(callId, session);
  return session;
}

/**
  * Get an existing session by callId.
  */
export function getSession(callId: string): CallSession | undefined {
  return sessions.get(callId);
}

/**
  * Get an existing session or create a new one if it doesn't exist.
  */
export function getOrCreateSession(callId: string, accountId?: string): CallSession {
  const existing = sessions.get(callId);
  if (existing) {
    return existing;
  }
  return createSession(callId, accountId);
}

/**
  * Update an existing session with partial state updates.
  */
export function updateSession(callId: string, updates: Partial<CallSession>): CallSession {
  const session = sessions.get(callId);
  if (!session) {
    throw new Error(`Session not found for callId: ${callId}`);
  }
  const updatedSession: CallSession = {
    ...session,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  sessions.set(callId, updatedSession);
  return updatedSession;
}

/**
  * Delete a session by callId.
  */
export function deleteSession(callId: string): boolean {
  return sessions.delete(callId);
}

/**
  * Clear all sessions from store (useful for tests).
  */
export function clearAllSessions(): void {
  sessions.clear();
}
