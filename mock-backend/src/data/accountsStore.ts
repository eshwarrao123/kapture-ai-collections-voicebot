import accountsData from './accounts.json';

export interface Account {
  account_id: string;
  customer_id: string;
  customer_name: string;
  phone_number: string;
  dob: string;
  otp: string;
  last4_phone: string;
  last4_loan: string;
  loan_type: string;
  total_outstanding: number;
  emi_amount: number;
  due_date: string;
  days_past_due: number;
  last_payment_date: string | null;
  last_payment_amount: number | null;
  account_status: 'active' | 'closed' | 'written_off';
  is_already_paid: boolean;
  is_dnc: boolean;
}

const accounts: Account[] = accountsData as Account[];

export function getAccountById(accountId: string): Account | undefined {
  return accounts.find((acc) => acc.account_id === accountId);
}

export function findAccountByVerification(
  method: 'dob' | 'otp' | 'last4_phone' | 'last4_loan',
  value: string,
  targetAccountId?: string
): Account | undefined {
  const cleanValue = value.trim();

  // If a target accountId is provided for the session, verify against that specific account
  if (targetAccountId) {
    const targetAccount = getAccountById(targetAccountId);
    if (!targetAccount) return undefined;
    if (targetAccount[method] === cleanValue) {
      return targetAccount;
    }
    return undefined;
  }

  // Otherwise, find the first account matching the verification criteria
  return accounts.find((acc) => acc[method] === cleanValue);
}

export function getAllAccounts(): Account[] {
  return [...accounts];
}
