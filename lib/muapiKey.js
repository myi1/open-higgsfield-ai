import { decryptSecret } from './crypto.js';

export class MissingOwnKeyError extends Error {
  constructor() {
    super('User is set to their own key but has none usable');
    this.name = 'MissingOwnKeyError';
    this.userMessage =
      'You are set up to use your own MuAPI key, but none is saved. ' +
      'Open Settings and add your key to carry on.';
  }
}

export class MissingCompanyKeyError extends Error {
  constructor() {
    super('MUAPI_API_KEY is not configured');
    this.name = 'MissingCompanyKeyError';
    this.userMessage =
      'This service is not fully configured yet. Please tell the administrator.';
  }
}

export function resolveKeyForUser(appUser) {
  if (appUser?.keyMode === 'SELF') {
    if (!appUser.ownKeyCiphertext) throw new MissingOwnKeyError();
    try {
      return { key: decryptSecret(appUser.ownKeyCiphertext), paidBy: 'SELF' };
    } catch {
      // A key we cannot decrypt is a key the person must re-save.
      // Never quietly hand the bill back to the company.
      throw new MissingOwnKeyError();
    }
  }

  const companyKey = process.env.MUAPI_API_KEY;
  if (!companyKey) throw new MissingCompanyKeyError();
  return { key: companyKey, paidBy: 'COMPANY' };
}
