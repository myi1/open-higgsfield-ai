import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const generationCreate = vi.fn();
vi.mock('../lib/db.js', () => ({
  default: { generation: { create: generationCreate } },
}));

beforeEach(() => {
  process.env.MUAPI_API_KEY = 'company-key-123';
  process.env.KEY_ENCRYPTION_SECRET = 'test-secret-do-not-use-in-production';
  generationCreate.mockReset();
  generationCreate.mockResolvedValue({});
});
afterEach(() => { delete process.env.MUAPI_API_KEY; });

const { forwardToMuapi } = await import('../lib/muapiForward.js');

const COMPANY_USER = { clerkUserId: 'u_1', email: 'a@b.com', keyMode: 'COMPANY' };

function fakeFetch(responseBody, status = 200) {
  return vi.fn().mockResolvedValue({
    status,
    ok: status < 400,
    text: async () => JSON.stringify(responseBody),
  });
}

describe('forwardToMuapi', () => {
  it('attaches the company key and calls the right MuAPI url', async () => {
    const fetchImpl = fakeFetch({ request_id: 'req_1' });

    await forwardToMuapi({
      appUser: COMPANY_USER, path: 'nano-banana', method: 'POST',
      body: { prompt: 'a cat' }, via: 'WEB', origin: 'web:image', fetchImpl,
    });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.muapi.ai/api/v1/nano-banana');
    expect(init.headers['x-api-key']).toBe('company-key-123');
  });

  it('writes exactly one usage row for a submit', async () => {
    await forwardToMuapi({
      appUser: COMPANY_USER, path: 'nano-banana', method: 'POST',
      body: { prompt: 'a cat' }, via: 'WEB', origin: 'web:image',
      fetchImpl: fakeFetch({ request_id: 'req_1' }),
    });

    expect(generationCreate).toHaveBeenCalledTimes(1);
    expect(generationCreate.mock.calls[0][0].data).toMatchObject({
      id: 'req_1', clerkUserId: 'u_1', email: 'a@b.com',
      studio: 'IMAGE', model: 'nano-banana', via: 'WEB', paidBy: 'COMPANY',
    });
  });

  it('writes no usage row for a poll', async () => {
    await forwardToMuapi({
      appUser: COMPANY_USER, path: 'predictions/req_1/result', method: 'GET',
      via: 'WEB', fetchImpl: fakeFetch({ status: 'completed' }),
    });

    expect(generationCreate).not.toHaveBeenCalled();
  });

  it('records a SELF person as paying for themselves', async () => {
    const { encryptSecret } = await import('../lib/crypto.js');
    await forwardToMuapi({
      appUser: { ...COMPANY_USER, keyMode: 'SELF', ownKeyCiphertext: encryptSecret('their-key') },
      path: 'nano-banana', method: 'POST', body: { prompt: 'x' },
      via: 'WEB', origin: 'web:image', fetchImpl: fakeFetch({ request_id: 'req_2' }),
    });

    expect(generationCreate.mock.calls[0][0].data.paidBy).toBe('SELF');
  });

  it('still returns the generation when the database write fails', async () => {
    generationCreate.mockRejectedValue(new Error('database is down'));

    const out = await forwardToMuapi({
      appUser: COMPANY_USER, path: 'nano-banana', method: 'POST',
      body: { prompt: 'x' }, via: 'WEB', origin: 'web:image',
      fetchImpl: fakeFetch({ request_id: 'req_3' }),
    });

    expect(out.status).toBe(200);
    expect(out.body.request_id).toBe('req_3');
  });

  it('refuses a SELF person with no key, and never leaks the company key', async () => {
    const fetchImpl = fakeFetch({});
    const out = await forwardToMuapi({
      appUser: { ...COMPANY_USER, keyMode: 'SELF', ownKeyCiphertext: null },
      path: 'nano-banana', method: 'POST', body: { prompt: 'x' },
      via: 'WEB', origin: 'web:image', fetchImpl,
    });

    expect(out.status).toBe(400);
    expect(JSON.stringify(out.body)).not.toContain('company-key-123');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('passes a MuAPI error through without the key in it', async () => {
    const out = await forwardToMuapi({
      appUser: COMPANY_USER, path: 'nano-banana', method: 'POST',
      body: { prompt: 'x' }, via: 'WEB', origin: 'web:image',
      fetchImpl: fakeFetch({ error: 'insufficient credits' }, 402),
    });

    expect(out.status).toBe(402);
    expect(JSON.stringify(out.body)).not.toContain('company-key-123');
    expect(generationCreate).not.toHaveBeenCalled();
  });
});
