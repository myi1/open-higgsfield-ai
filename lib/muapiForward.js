import { randomUUID } from 'node:crypto';
import prisma from './db.js';
import { resolveKeyForUser, MissingOwnKeyError, MissingCompanyKeyError } from './muapiKey.js';
import { resolveStudio, isPollPath } from './studios.js';

const MUAPI_BASE = 'https://api.muapi.ai/api/v1';

function parse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

export async function forwardToMuapi({
  appUser, path, method = 'POST', body, via = 'WEB', origin, signal, fetchImpl = fetch,
}) {
  let key;
  let paidBy;
  try {
    ({ key, paidBy } = resolveKeyForUser(appUser));
  } catch (err) {
    if (err instanceof MissingOwnKeyError) return { status: 400, body: { error: err.userMessage } };
    if (err instanceof MissingCompanyKeyError) return { status: 500, body: { error: err.userMessage } };
    throw err;
  }

  const init = {
    method,
    headers: { 'Content-Type': 'application/json', 'x-api-key': key },
  };
  if (signal) init.signal = signal;
  if (method !== 'GET' && body !== undefined) init.body = JSON.stringify(body);

  const response = await fetchImpl(`${MUAPI_BASE}/${path}`, init);
  const parsed = parse(await response.text());

  const isSubmit = !isPollPath(path) && response.status < 400;
  if (isSubmit) {
    // A lost log row must never cost someone their generation.
    try {
      await prisma.generation.create({
        data: {
          id: parsed.request_id ?? parsed.id ?? randomUUID(),
          clerkUserId: appUser.clerkUserId,
          email: appUser.email,
          studio: resolveStudio({ origin, endpoint: path }),
          model: path,
          via,
          paidBy,
        },
      });
    } catch (err) {
      console.error('[usage-log] failed to record a generation:', err.message);
    }
  }

  return { status: response.status, body: parsed };
}
