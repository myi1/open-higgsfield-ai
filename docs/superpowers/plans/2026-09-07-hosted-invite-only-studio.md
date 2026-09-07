# Hosted Invite-Only Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the Open Higgsfield AI studio online at a private address where invited people generate on the company's MuAPI key — or their own, if switched — without anyone ever holding that key, reachable from both a browser and Claude over MCP.

**Architecture:** The existing Next.js app is kept intact and wrapped. Clerk gates every route. A single forwarding core attaches the correct MuAPI key server-side, forwards to `api.muapi.ai`, and writes one usage row per generation. Two front doors use that same core: the website (Clerk session) and a hosted MCP endpoint (personal bearer token). Uploads bypass the server entirely via Vercel Blob.

**Tech Stack:** Next.js 15, React 19, Clerk, Prisma + Neon Postgres, Vercel Blob, `mcp-handler`, shadcn/ui, Vitest.

**Spec:** [`docs/superpowers/specs/2026-09-07-hosted-invite-only-studio-design.md`](../specs/2026-09-07-hosted-invite-only-studio-design.md)

## Global Constraints

- **The MuAPI key never reaches a browser.** Not in HTML, not in a JS bundle, not in a network response, not in an error message, not in a log line. This constraint outranks every other consideration in this plan.
- **No silent fallback to the company key.** A person with `keyMode = SELF` and no saved key is refused. Never substitute the company key for them.
- **A saved personal key is write-only.** No route returns a saved MuAPI key to any browser — not to its owner, not to an admin.
- **Do not touch** `src/**` (the Vite/vanilla build), `electron/**`, `vite.config.js`, or `packages/studio/src/models.js`. Only the Next.js app is deployed.
- **Keep the patch to `packages/studio/src/muapi.js` minimal** — this is a fork of `Anil-matcha/Open-Generative-AI` and upstream changes must stay pullable.
- Node crypto only for encryption (`node:crypto`, AES-256-GCM). No new crypto dependency.
- Every generation writes exactly one usage row. Polling writes none.
- A database failure must never cost a user their generation.
- Environment variables, all set in Vercel, never committed: `MUAPI_API_KEY`, `KEY_ENCRYPTION_SECRET`, `DATABASE_URL`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `BLOB_READ_WRITE_TOKEN`, `ADMIN_EMAIL`.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` | `AppUser` and `Generation` models |
| `lib/db.js` | Prisma client singleton (survives hot reload) |
| `lib/crypto.js` | Encrypt/decrypt a personal MuAPI key |
| `lib/appUser.js` | Find or create the person's record; look one up by MCP token |
| `lib/muapiKey.js` | Decide which key a person spends. The security-critical unit |
| `lib/studios.js` | Work out which studio a generation belongs to |
| `lib/muapiForward.js` | The forwarding core: key + forward + log. Used by website and MCP |
| `middleware.js` | Clerk gate |
| `app/api/v1/[...path]/route.js` | The website's proxy |
| `app/api/settings/key/route.js` | Save/replace a personal key (write-only) |
| `app/api/admin/usage/route.js` | Usage data for the admin page |
| `app/api/admin/key-mode/route.js` | Flip a person between company and own key |
| `app/api/upload-token/route.js` | Issues Vercel Blob upload tokens |
| `app/mcp/route.js` | The hosted MCP server |
| `app/settings/page.js` | Where someone saves their own key |
| `app/admin/page.js` | Usage table and the who-pays switch |
| `app/connect/page.js` | Copy-paste MCP setup |
| `app/api/cron/daily-digest/route.js` | The daily email |

**Modified:**

| File | Change |
|---|---|
| `app/layout.js` | Wrap in `<ClerkProvider>` |
| `components/StandaloneShell.js` | Remove the API-key gate; pass an origin tag instead |
| `packages/studio/src/muapi.js` | Point at same-origin; send origin tag not key; Blob uploads |
| `package.json` | Dependencies and scripts |

**Deleted:** `components/ApiKeyModal.js`

---

## Task 1: Verify the three assumptions

Everything downstream is shaped by these answers. This is a spike — throwaway scripts, no production code.

**Files:**
- Create: `docs/superpowers/specs/2026-09-07-assumption-findings.md`
- Create (throwaway, deleted at the end): `/tmp/spike-blob.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: a findings document. Task 6 reads the Clerk answer; Task 13 reads the Blob answer; Task 15 reads the Claude Desktop answer.

- [ ] **Step 1: Create the MuAPI account**

Sign up at [muapi.ai](https://muapi.ai), load credits, and **turn auto-top-up OFF** — this is the ceiling that makes "no spend limits" safe. Copy the API key into a password manager. Do not paste it into a chat, a file, or a commit.

- [ ] **Step 2: Check whether Clerk's invitation-only mode is on the free plan**

Create a free Clerk application. In the dashboard, open **Configure → Restrictions** and look for "Restricted" / invitation-only sign-up mode. Record whether it is available without upgrading.

- [ ] **Step 3: Check that MuAPI accepts an external image URL**

Upload any JPEG to a public URL (a Vercel Blob store created by hand, or any public bucket). Then:

```bash
curl -s -X POST https://api.muapi.ai/api/v1/flux-kontext-dev \
  -H "x-api-key: $MUAPI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"make it black and white","image_url":"<PUBLIC_URL>"}'
```

Expected: a JSON body containing `request_id`. Poll it:

```bash
curl -s https://api.muapi.ai/api/v1/predictions/<REQUEST_ID>/result \
  -H "x-api-key: $MUAPI_API_KEY"
```

Record whether it reaches `completed` with an output URL. If MuAPI rejects external URLs, Task 13 changes to proxied uploads with a 4.5MB ceiling.

- [ ] **Step 4: Check that Claude Desktop can use a hosted MCP with a pasted token**

In Claude Desktop, try adding a custom connector pointing at any HTTP MCP URL with an `Authorization: Bearer` header. Record whether Desktop accepts a static header or demands an OAuth sign-in flow. (Claude Code accepts the header — that part is settled.) If Desktop demands OAuth, Task 15 gains a fallback: `/connect` shows Desktop users a small local wrapper instead.

- [ ] **Step 5: Write the findings**

```markdown
# Assumption findings — 2026-09-07

## Clerk invitation-only on the free plan
Available: YES / NO
Evidence: <what the dashboard showed>
Consequence if NO: middleware checks an ALLOWED_EMAILS env list instead.

## MuAPI accepts external (Vercel Blob) image URLs
Accepted: YES / NO
Evidence: <request_id and final status>
Consequence if NO: uploads proxy through the server, capped at 4.5MB.

## Claude Desktop accepts a hosted MCP with a static bearer token
Accepted: YES / NO
Evidence: <what Desktop did>
Consequence if NO: /connect offers Desktop users a local wrapper.
```

- [ ] **Step 6: Commit**

```bash
rm -f /tmp/spike-blob.mjs
git add docs/superpowers/specs/2026-09-07-assumption-findings.md
git commit -m "docs: findings for the three design assumptions"
```

---

## Task 2: Fork, deploy the untouched app, confirm it runs

Prove the deployment pipeline before changing a line of the app. If the stock app won't deploy, that is a very different problem from anything else in this plan and you want to find it now.

**Files:**
- Create: `.env.example`
- Modify: `README.md` (append a "This fork" section)

**Interfaces:**
- Consumes: nothing.
- Produces: a live Vercel URL and a GitHub repo under `myi1` that later tasks push to.

- [ ] **Step 1: Fork to your own account**

```bash
gh repo fork Autom8AI/Open-Higgsfield-AI --org "" --fork-name open-higgsfield-ai --remote=false --clone=false
```

Then re-point this working copy:

```bash
cd ~/dev/open-higgsfield-ai
git remote set-url origin https://github.com/myi1/open-higgsfield-ai.git
git remote -v
```

Expected: `origin` is `myi1/open-higgsfield-ai`, `upstream` still `Anil-matcha/Open-Generative-AI`.

- [ ] **Step 2: Write `.env.example`**

```bash
# MuAPI — the engine that costs money. Server-side only, never NEXT_PUBLIC_.
MUAPI_API_KEY=

# Encrypts users' own MuAPI keys at rest. Any long random string.
# Generate with: openssl rand -base64 48
KEY_ENCRYPTION_SECRET=

# Neon Postgres, added by the Vercel integration
DATABASE_URL=

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

# Vercel Blob, added by the Vercel integration
BLOB_READ_WRITE_TOKEN=

# The one account allowed into /admin
ADMIN_EMAIL=
```

- [ ] **Step 3: Append to `README.md`**

```markdown
---

## This fork

This is a private fork of Open Higgsfield AI, deployed for one company's team.
It differs from upstream in four ways:

1. Sign-in is required (Clerk) and invitation-only.
2. Nobody enters a MuAPI key — the server holds it and attaches it per request.
3. Every generation is logged and visible in `/admin`.
4. A hosted MCP endpoint at `/mcp` lets invited people drive it from Claude.

Design: `docs/superpowers/specs/2026-09-07-hosted-invite-only-studio-design.md`
```

- [ ] **Step 4: Push and deploy**

```bash
git add .env.example README.md
git commit -m "chore: fork setup — env template and fork notes"
git push -u origin main
```

Import the repo at [vercel.com/new](https://vercel.com/new). Framework: Next.js. Deploy with no environment variables yet.

- [ ] **Step 5: Confirm the stock app runs**

Open the Vercel URL. Expected: the app loads and shows its API-key modal. Do **not** enter a key — this deployment is about to be gated. Record the URL; later tasks call it `<APP_URL>`.

- [ ] **Step 6: Commit**

Nothing further to commit. Confirm the deployment is green in Vercel before moving on.

---

## Task 3: Database schema and the person record

**Files:**
- Create: `prisma/schema.prisma`, `lib/db.js`, `vitest.config.js`, `test/appUser.test.js`
- Create: `lib/appUser.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `prisma` (default export of `lib/db.js`) — the Prisma client.
  - `getOrCreateAppUser({ clerkUserId, email })` → `Promise<AppUser>`
  - `findAppUserByMcpToken(token)` → `Promise<AppUser | null>`
  - `AppUser` fields: `clerkUserId`, `email`, `keyMode` (`'COMPANY'|'SELF'`), `ownKeyCiphertext`, `ownKeyLast4`, `mcpToken`, `createdAt`, `lastUsedAt`.
  - `Generation` fields: `id`, `clerkUserId`, `email`, `studio` (`'IMAGE'|'VIDEO'|'CINEMA'|'LIPSYNC'`), `model`, `via` (`'WEB'|'MCP'`), `paidBy` (`'COMPANY'|'SELF'`), `createdAt`.

- [ ] **Step 1: Install dependencies**

```bash
cd ~/dev/open-higgsfield-ai
npm install @prisma/client
npm install -D prisma vitest
```

- [ ] **Step 2: Add scripts to `package.json`**

Add to the `"scripts"` block:

```json
"test": "vitest run",
"test:watch": "vitest",
"db:push": "prisma db push",
"db:generate": "prisma generate",
"postinstall": "prisma generate"
```

- [ ] **Step 3: Write `vitest.config.js`**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
  },
});
```

- [ ] **Step 4: Write `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum KeyMode {
  COMPANY
  SELF
}

enum Studio {
  IMAGE
  VIDEO
  CINEMA
  LIPSYNC
}

enum Via {
  WEB
  MCP
}

enum PaidBy {
  COMPANY
  SELF
}

model AppUser {
  clerkUserId      String   @id
  email            String
  keyMode          KeyMode  @default(COMPANY)
  ownKeyCiphertext String?
  ownKeyLast4      String?
  mcpToken         String   @unique
  createdAt        DateTime @default(now())
  lastUsedAt       DateTime @default(now())

  generations Generation[]
}

model Generation {
  id          String   @id
  clerkUserId String
  email       String
  studio      Studio
  model       String
  via         Via
  paidBy      PaidBy
  createdAt   DateTime @default(now())

  user AppUser @relation(fields: [clerkUserId], references: [clerkUserId])

  @@index([clerkUserId, createdAt])
  @@index([createdAt])
}
```

- [ ] **Step 5: Write `lib/db.js`**

```js
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis;

const prisma = globalForPrisma.__ohfPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__ohfPrisma = prisma;
}

export default prisma;
```

- [ ] **Step 6: Write the failing test**

`test/appUser.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

const findUnique = vi.fn();
const create = vi.fn();
const update = vi.fn();

vi.mock('../lib/db.js', () => ({
  default: { appUser: { findUnique, create, update } },
}));

const { getOrCreateAppUser, findAppUserByMcpToken } = await import('../lib/appUser.js');

beforeEach(() => {
  findUnique.mockReset();
  create.mockReset();
  update.mockReset();
});

describe('getOrCreateAppUser', () => {
  it('creates a person with a company key mode and an mcp token on first sight', async () => {
    findUnique.mockResolvedValue(null);
    create.mockImplementation(({ data }) => Promise.resolve(data));

    const user = await getOrCreateAppUser({ clerkUserId: 'u_1', email: 'a@b.com' });

    expect(user.clerkUserId).toBe('u_1');
    expect(user.keyMode).toBe('COMPANY');
    expect(user.mcpToken).toMatch(/^ohf_[A-Za-z0-9_-]{32,}$/);
  });

  it('gives two people different tokens', async () => {
    findUnique.mockResolvedValue(null);
    create.mockImplementation(({ data }) => Promise.resolve(data));

    const a = await getOrCreateAppUser({ clerkUserId: 'u_1', email: 'a@b.com' });
    const b = await getOrCreateAppUser({ clerkUserId: 'u_2', email: 'b@b.com' });

    expect(a.mcpToken).not.toBe(b.mcpToken);
  });

  it('returns the existing person without creating a second record', async () => {
    findUnique.mockResolvedValue({ clerkUserId: 'u_1', email: 'a@b.com', mcpToken: 'ohf_existing' });

    const user = await getOrCreateAppUser({ clerkUserId: 'u_1', email: 'a@b.com' });

    expect(user.mcpToken).toBe('ohf_existing');
    expect(create).not.toHaveBeenCalled();
  });

  it('updates a stale email on an existing person', async () => {
    findUnique.mockResolvedValue({ clerkUserId: 'u_1', email: 'old@b.com', mcpToken: 'ohf_x' });
    update.mockImplementation(({ data }) => Promise.resolve({ clerkUserId: 'u_1', ...data }));

    const user = await getOrCreateAppUser({ clerkUserId: 'u_1', email: 'new@b.com' });

    expect(user.email).toBe('new@b.com');
  });
});

describe('findAppUserByMcpToken', () => {
  it('returns null for a blank token rather than querying', async () => {
    expect(await findAppUserByMcpToken('')).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('looks a person up by their token', async () => {
    findUnique.mockResolvedValue({ clerkUserId: 'u_1' });
    const user = await findAppUserByMcpToken('ohf_abc');
    expect(user.clerkUserId).toBe('u_1');
    expect(findUnique).toHaveBeenCalledWith({ where: { mcpToken: 'ohf_abc' } });
  });
});
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../lib/appUser.js'`

- [ ] **Step 8: Write `lib/appUser.js`**

```js
import { randomBytes } from 'node:crypto';
import prisma from './db.js';

export function newMcpToken() {
  return `ohf_${randomBytes(24).toString('base64url')}`;
}

export async function getOrCreateAppUser({ clerkUserId, email }) {
  const existing = await prisma.appUser.findUnique({ where: { clerkUserId } });

  if (existing) {
    if (existing.email !== email) {
      return prisma.appUser.update({ where: { clerkUserId }, data: { email } });
    }
    return existing;
  }

  return prisma.appUser.create({
    data: { clerkUserId, email, keyMode: 'COMPANY', mcpToken: newMcpToken() },
  });
}

export async function findAppUserByMcpToken(token) {
  if (!token) return null;
  return prisma.appUser.findUnique({ where: { mcpToken: token } });
}
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — 6 tests.

- [ ] **Step 10: Create the database and push the schema**

In Vercel: **Storage → Create Database → Neon Postgres**, connect it to the project. Pull the connection string locally:

```bash
npx vercel env pull .env.local
npm run db:push
```

Expected: "Your database is now in sync with your Prisma schema."

- [ ] **Step 11: Commit**

```bash
git add prisma lib/db.js lib/appUser.js test/appUser.test.js vitest.config.js package.json package-lock.json
git commit -m "feat: person records with per-person MCP tokens"
```

---

## Task 4: Encrypting someone else's key

**Files:**
- Create: `lib/crypto.js`, `test/crypto.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `encryptSecret(plaintext: string)` → `string` (packed `iv.tag.ciphertext`, base64url-joined by `.`)
  - `decryptSecret(packed: string)` → `string`
  - Both throw `Error('KEY_ENCRYPTION_SECRET is not set')` when the env var is missing.
  - `last4(plaintext: string)` → `string` — the final four characters, for display.

- [ ] **Step 1: Write the failing test**

`test/crypto.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const ORIGINAL = process.env.KEY_ENCRYPTION_SECRET;

beforeEach(() => {
  process.env.KEY_ENCRYPTION_SECRET = 'test-secret-do-not-use-in-production';
});
afterEach(() => {
  process.env.KEY_ENCRYPTION_SECRET = ORIGINAL;
});

const { encryptSecret, decryptSecret, last4 } = await import('../lib/crypto.js');

describe('encryptSecret / decryptSecret', () => {
  it('round-trips a key', () => {
    const key = 'muapi_live_abcdef123456';
    expect(decryptSecret(encryptSecret(key))).toBe(key);
  });

  it('never contains the plaintext', () => {
    const key = 'muapi_live_abcdef123456';
    expect(encryptSecret(key)).not.toContain(key);
  });

  it('produces a different ciphertext each time for the same input', () => {
    const key = 'muapi_live_abcdef123456';
    expect(encryptSecret(key)).not.toBe(encryptSecret(key));
  });

  it('refuses tampered ciphertext instead of returning garbage', () => {
    const packed = encryptSecret('muapi_live_abcdef123456');
    const [iv, tag, data] = packed.split('.');
    const flipped = data.slice(0, -2) + (data.slice(-2) === 'AA' ? 'BB' : 'AA');
    expect(() => decryptSecret([iv, tag, flipped].join('.'))).toThrow();
  });

  it('refuses a malformed packed value', () => {
    expect(() => decryptSecret('nonsense')).toThrow(/malformed/i);
  });

  it('refuses to work without a secret configured', () => {
    delete process.env.KEY_ENCRYPTION_SECRET;
    expect(() => encryptSecret('x')).toThrow(/KEY_ENCRYPTION_SECRET/);
  });
});

describe('last4', () => {
  it('returns the final four characters', () => {
    expect(last4('muapi_live_abcdef123456')).toBe('3456');
  });

  it('handles a short value without throwing', () => {
    expect(last4('ab')).toBe('ab');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/crypto.test.js`
Expected: FAIL — `Cannot find module '../lib/crypto.js'`

- [ ] **Step 3: Write `lib/crypto.js`**

```js
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

function encryptionKey() {
  const raw = process.env.KEY_ENCRYPTION_SECRET;
  if (!raw) throw new Error('KEY_ENCRYPTION_SECRET is not set');
  return createHash('sha256').update(raw).digest();
}

export function encryptSecret(plaintext) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  return [
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    data.toString('base64url'),
  ].join('.');
}

export function decryptSecret(packed) {
  const parts = String(packed).split('.');
  if (parts.length !== 3) throw new Error('Stored key is malformed');
  const [iv, tag, data] = parts;

  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(data, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export function last4(plaintext) {
  const s = String(plaintext);
  return s.length <= 4 ? s : s.slice(-4);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/crypto.test.js`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/crypto.js test/crypto.test.js
git commit -m "feat: encrypt personal MuAPI keys at rest"
```

---

## Task 5: Deciding whose key gets spent

The security-critical unit. If this is wrong, either the company pays for people it shouldn't, or a personal key leaks.

**Files:**
- Create: `lib/muapiKey.js`, `test/muapiKey.test.js`

**Interfaces:**
- Consumes: `decryptSecret` from `lib/crypto.js`.
- Produces:
  - `resolveKeyForUser(appUser)` → `{ key: string, paidBy: 'COMPANY' | 'SELF' }`
  - `class MissingOwnKeyError extends Error` — has `.userMessage` (plain English, safe to show a user).
  - `class MissingCompanyKeyError extends Error` — has `.userMessage`.

- [ ] **Step 1: Write the failing test**

`test/muapiKey.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

beforeEach(() => {
  process.env.KEY_ENCRYPTION_SECRET = 'test-secret-do-not-use-in-production';
  process.env.MUAPI_API_KEY = 'company-key-123';
});
afterEach(() => {
  delete process.env.MUAPI_API_KEY;
});

const { encryptSecret } = await import('../lib/crypto.js');
const { resolveKeyForUser, MissingOwnKeyError, MissingCompanyKeyError } =
  await import('../lib/muapiKey.js');

describe('resolveKeyForUser', () => {
  it('gives a COMPANY person the company key', () => {
    const out = resolveKeyForUser({ keyMode: 'COMPANY' });
    expect(out).toEqual({ key: 'company-key-123', paidBy: 'COMPANY' });
  });

  it('gives a SELF person their own key', () => {
    const out = resolveKeyForUser({
      keyMode: 'SELF',
      ownKeyCiphertext: encryptSecret('their-own-key-999'),
    });
    expect(out).toEqual({ key: 'their-own-key-999', paidBy: 'SELF' });
  });

  it('refuses a SELF person with no key saved — and does NOT fall back to the company key', () => {
    expect(() => resolveKeyForUser({ keyMode: 'SELF', ownKeyCiphertext: null }))
      .toThrow(MissingOwnKeyError);

    try {
      resolveKeyForUser({ keyMode: 'SELF', ownKeyCiphertext: null });
    } catch (err) {
      expect(err.userMessage).toMatch(/add your.*key/i);
      expect(JSON.stringify(err)).not.toContain('company-key-123');
    }
  });

  it('refuses a SELF person whose saved key cannot be decrypted', () => {
    expect(() => resolveKeyForUser({ keyMode: 'SELF', ownKeyCiphertext: 'garbage' }))
      .toThrow(MissingOwnKeyError);
  });

  it('refuses when the company key is not configured', () => {
    delete process.env.MUAPI_API_KEY;
    expect(() => resolveKeyForUser({ keyMode: 'COMPANY' })).toThrow(MissingCompanyKeyError);
  });

  it('treats an unknown key mode as COMPANY rather than failing open with no key', () => {
    const out = resolveKeyForUser({ keyMode: undefined });
    expect(out.paidBy).toBe('COMPANY');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/muapiKey.test.js`
Expected: FAIL — `Cannot find module '../lib/muapiKey.js'`

- [ ] **Step 3: Write `lib/muapiKey.js`**

```js
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/muapiKey.test.js`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/muapiKey.js test/muapiKey.test.js
git commit -m "feat: resolve which MuAPI key a person spends, with no silent fallback"
```

---

## Task 6: Clerk gate

**Files:**
- Create: `middleware.js`, `lib/admin.js`, `test/admin.test.js`
- Modify: `app/layout.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `isAdminEmail(email)` → `boolean` — compares against `ADMIN_EMAIL`, case-insensitively.
  - Every route except Clerk's own sign-in pages now requires a session.

- [ ] **Step 1: Install Clerk**

```bash
npm install @clerk/nextjs
```

- [ ] **Step 2: Write the failing test**

`test/admin.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

beforeEach(() => { process.env.ADMIN_EMAIL = 'Yahya@Example.com'; });
afterEach(() => { delete process.env.ADMIN_EMAIL; });

const { isAdminEmail } = await import('../lib/admin.js');

describe('isAdminEmail', () => {
  it('recognises the admin regardless of capitalisation', () => {
    expect(isAdminEmail('yahya@example.com')).toBe(true);
    expect(isAdminEmail('YAHYA@EXAMPLE.COM')).toBe(true);
  });

  it('rejects everyone else', () => {
    expect(isAdminEmail('someone@example.com')).toBe(false);
  });

  it('rejects an empty or missing email', () => {
    expect(isAdminEmail('')).toBe(false);
    expect(isAdminEmail(undefined)).toBe(false);
  });

  it('lets nobody in when no admin is configured', () => {
    delete process.env.ADMIN_EMAIL;
    expect(isAdminEmail('yahya@example.com')).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run test/admin.test.js`
Expected: FAIL — `Cannot find module '../lib/admin.js'`

- [ ] **Step 4: Write `lib/admin.js`**

```js
export function isAdminEmail(email) {
  const admin = process.env.ADMIN_EMAIL;
  if (!admin || !email) return false;
  return String(email).trim().toLowerCase() === admin.trim().toLowerCase();
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run test/admin.test.js`
Expected: PASS — 4 tests.

- [ ] **Step 6: Write `middleware.js`**

```js
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// The MCP endpoint authenticates with its own bearer token, not a browser
// session, so Clerk must not intercept it.
const isPublic = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/mcp(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublic(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)', '/(api|trpc)(.*)'],
};
```

- [ ] **Step 7: Wrap the app in `app/layout.js`**

Modify `app/layout.js` — import `ClerkProvider` and wrap whatever the component currently returns:

```js
import { ClerkProvider } from '@clerk/nextjs';
```

Wrap the returned `<html>` element:

```jsx
<ClerkProvider>
  <html lang="en">
    {/* existing body untouched */}
  </html>
</ClerkProvider>
```

- [ ] **Step 8: Configure Clerk and deploy**

In the Clerk dashboard: enable Google and email-code sign-in; set sign-up to **Restricted / invitation only** if Task 1 found it available. If Task 1 found it is *not* available, add to `middleware.js` inside the `clerkMiddleware` callback, after `auth.protect()`:

```js
const { sessionClaims } = await auth();
const email = sessionClaims?.email;
const allowed = (process.env.ALLOWED_EMAILS ?? '')
  .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
if (allowed.length && !allowed.includes(String(email).toLowerCase())) {
  return Response.redirect(new URL('/sign-in?denied=1', req.url));
}
```

Add all Clerk, database and `ADMIN_EMAIL` variables in Vercel, then push.

- [ ] **Step 9: Verify the gate holds**

Open `<APP_URL>` in a private window. Expected: redirected to Clerk sign-in, not the studio. Sign in as yourself. Expected: the studio loads (still showing its own API-key modal — Task 8 removes that).

- [ ] **Step 10: Commit**

```bash
git add middleware.js lib/admin.js test/admin.test.js app/layout.js package.json package-lock.json
git commit -m "feat: gate the whole app behind Clerk sign-in"
```

---

## Task 7: The forwarding core

The single place every generation passes through, from either front door. Both the website proxy (Task 8) and the MCP server (Task 15) call this.

**Files:**
- Create: `lib/studios.js`, `lib/muapiForward.js`, `test/studios.test.js`, `test/muapiForward.test.js`

**Interfaces:**
- Consumes: `resolveKeyForUser`, `MissingOwnKeyError`, `MissingCompanyKeyError` from `lib/muapiKey.js`; `prisma` from `lib/db.js`.
- Produces:
  - `resolveStudio({ origin, endpoint })` → `'IMAGE' | 'VIDEO' | 'CINEMA' | 'LIPSYNC'`
  - `isPollPath(path)` → `boolean`
  - `forwardToMuapi({ appUser, path, method, body, via, origin, fetchImpl })` → `Promise<{ status: number, body: any }>`

- [ ] **Step 1: Write the failing test for studio classification**

`test/studios.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { resolveStudio, isPollPath } from '../lib/studios.js';

describe('resolveStudio', () => {
  it('trusts the origin tag the caller declares', () => {
    expect(resolveStudio({ origin: 'web:cinema', endpoint: 'nano-banana' })).toBe('CINEMA');
    expect(resolveStudio({ origin: 'web:image', endpoint: 'nano-banana' })).toBe('IMAGE');
    expect(resolveStudio({ origin: 'mcp:video', endpoint: 'kling-video' })).toBe('VIDEO');
  });

  it('falls back to the model lists when no origin is declared', () => {
    expect(resolveStudio({ endpoint: 'nano-banana' })).toBe('IMAGE');
  });

  it('classifies an unknown endpoint as IMAGE rather than dropping it', () => {
    expect(resolveStudio({ endpoint: 'something-brand-new' })).toBe('IMAGE');
  });

  it('ignores a nonsense origin tag and falls back', () => {
    expect(resolveStudio({ origin: 'garbage', endpoint: 'nano-banana' })).toBe('IMAGE');
  });
});

describe('isPollPath', () => {
  it('recognises a result poll', () => {
    expect(isPollPath('predictions/abc-123/result')).toBe(true);
  });

  it('does not mistake a generation submit for a poll', () => {
    expect(isPollPath('nano-banana')).toBe(false);
    expect(isPollPath('flux-schnell-image')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/studios.test.js`
Expected: FAIL — `Cannot find module '../lib/studios.js'`

- [ ] **Step 3: Write `lib/studios.js`**

```js
import {
  t2vModels,
  i2vModels,
  v2vModels,
  lipsyncModels,
} from '../packages/studio/src/models.js';

const VALID = new Set(['IMAGE', 'VIDEO', 'CINEMA', 'LIPSYNC']);

const endpointsOf = (models) => new Set(models.map((m) => m.endpoint || m.id));

const VIDEO_ENDPOINTS = new Set([
  ...endpointsOf(t2vModels),
  ...endpointsOf(i2vModels),
  ...endpointsOf(v2vModels),
]);
const LIPSYNC_ENDPOINTS = endpointsOf(lipsyncModels);

export function isPollPath(path) {
  return String(path).startsWith('predictions/');
}

export function resolveStudio({ origin, endpoint } = {}) {
  const declared = String(origin ?? '').split(':')[1]?.toUpperCase();
  if (declared && VALID.has(declared)) return declared;

  if (LIPSYNC_ENDPOINTS.has(endpoint)) return 'LIPSYNC';
  if (VIDEO_ENDPOINTS.has(endpoint)) return 'VIDEO';
  return 'IMAGE';
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run test/studios.test.js`
Expected: PASS — 6 tests.

- [ ] **Step 5: Write the failing test for the forwarding core**

`test/muapiForward.test.js`:

```js
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
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run test/muapiForward.test.js`
Expected: FAIL — `Cannot find module '../lib/muapiForward.js'`

- [ ] **Step 7: Write `lib/muapiForward.js`**

```js
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
  appUser, path, method = 'POST', body, via = 'WEB', origin, fetchImpl = fetch,
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
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npx vitest run test/muapiForward.test.js`
Expected: PASS — 7 tests.

- [ ] **Step 9: Commit**

```bash
git add lib/studios.js lib/muapiForward.js test/studios.test.js test/muapiForward.test.js
git commit -m "feat: forwarding core — attaches the key, forwards, logs once"
```

---

## Task 8: The website proxy, and cutting the key out of the browser

After this task the app works end to end with nobody entering a key. This is the milestone that makes the project real.

**Files:**
- Create: `app/api/v1/[...path]/route.js`, `test/proxyRoute.test.js`
- Modify: `packages/studio/src/muapi.js:3`, `components/StandaloneShell.js`
- Delete: `components/ApiKeyModal.js`

**Interfaces:**
- Consumes: `forwardToMuapi` from `lib/muapiForward.js`; `getOrCreateAppUser` from `lib/appUser.js`.
- Produces: `POST|GET /api/v1/<path>` — same URL shape MuAPI uses, so the studio client needs only its base URL changed.

- [ ] **Step 1: Write the failing test**

`test/proxyRoute.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

const auth = vi.fn();
const currentUser = vi.fn();
vi.mock('@clerk/nextjs/server', () => ({ auth, currentUser }));

const getOrCreateAppUser = vi.fn();
vi.mock('../lib/appUser.js', () => ({ getOrCreateAppUser }));

const forwardToMuapi = vi.fn();
vi.mock('../lib/muapiForward.js', () => ({ forwardToMuapi }));

const { POST } = await import('../app/api/v1/[...path]/route.js');

function request(body, headers = {}) {
  return new Request('https://example.com/api/v1/nano-banana', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  auth.mockReset(); currentUser.mockReset();
  getOrCreateAppUser.mockReset(); forwardToMuapi.mockReset();
});

describe('POST /api/v1/[...path]', () => {
  it('refuses an anonymous request without calling MuAPI', async () => {
    auth.mockResolvedValue({ userId: null });

    const res = await POST(request({ prompt: 'x' }), { params: Promise.resolve({ path: ['nano-banana'] }) });

    expect(res.status).toBe(401);
    expect(forwardToMuapi).not.toHaveBeenCalled();
  });

  it('forwards a signed-in request with the caller and origin tag', async () => {
    auth.mockResolvedValue({ userId: 'u_1' });
    currentUser.mockResolvedValue({
      id: 'u_1', primaryEmailAddress: { emailAddress: 'a@b.com' },
    });
    getOrCreateAppUser.mockResolvedValue({ clerkUserId: 'u_1', email: 'a@b.com', keyMode: 'COMPANY' });
    forwardToMuapi.mockResolvedValue({ status: 200, body: { request_id: 'req_1' } });

    const res = await POST(
      request({ prompt: 'a cat' }, { 'x-ohf-origin': 'web:cinema' }),
      { params: Promise.resolve({ path: ['nano-banana'] }) },
    );

    expect(res.status).toBe(200);
    expect(forwardToMuapi).toHaveBeenCalledWith(expect.objectContaining({
      path: 'nano-banana', via: 'WEB', origin: 'web:cinema',
      appUser: expect.objectContaining({ clerkUserId: 'u_1' }),
    }));
  });

  it('joins a multi-segment path back together for polling', async () => {
    auth.mockResolvedValue({ userId: 'u_1' });
    currentUser.mockResolvedValue({ id: 'u_1', primaryEmailAddress: { emailAddress: 'a@b.com' } });
    getOrCreateAppUser.mockResolvedValue({ clerkUserId: 'u_1', email: 'a@b.com', keyMode: 'COMPANY' });
    forwardToMuapi.mockResolvedValue({ status: 200, body: { status: 'completed' } });

    await POST(request({}), { params: Promise.resolve({ path: ['predictions', 'req_1', 'result'] }) });

    expect(forwardToMuapi.mock.calls[0][0].path).toBe('predictions/req_1/result');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/proxyRoute.test.js`
Expected: FAIL — cannot find the route module.

- [ ] **Step 3: Write `app/api/v1/[...path]/route.js`**

```js
import { auth, currentUser } from '@clerk/nextjs/server';
import { getOrCreateAppUser } from '@/lib/appUser';
import { forwardToMuapi } from '@/lib/muapiForward';

async function handle(request, context, method) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: 'Your session has ended. Please sign in again.' }, { status: 401 });
  }

  const clerkUser = await currentUser();
  const appUser = await getOrCreateAppUser({
    clerkUserId: userId,
    email: clerkUser?.primaryEmailAddress?.emailAddress ?? '',
  });

  const { path } = await context.params;
  let body;
  if (method !== 'GET') {
    body = await request.json().catch(() => undefined);
  }

  const result = await forwardToMuapi({
    appUser,
    path: path.join('/'),
    method,
    body,
    via: 'WEB',
    origin: request.headers.get('x-ohf-origin') ?? undefined,
  });

  return Response.json(result.body, { status: result.status });
}

export async function POST(request, context) {
  return handle(request, context, 'POST');
}

export async function GET(request, context) {
  return handle(request, context, 'GET');
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run test/proxyRoute.test.js`
Expected: PASS — 3 tests.

- [ ] **Step 5: Point the studio client at our own server**

In `packages/studio/src/muapi.js`, change line 3:

```js
const BASE_URL = 'https://api.muapi.ai';
```

to:

```js
// Calls go to our own server, which attaches the MuAPI key. The `key` argument
// threaded through every function below is now an origin tag ("web:image"),
// not a secret — see docs/superpowers/specs/2026-09-07-*-design.md.
const BASE_URL = '';
```

Then replace all three occurrences of the auth header. Lines 11 and 33 currently read:

```js
headers: { 'Content-Type': 'application/json', 'x-api-key': key }
```

Change both to:

```js
headers: { 'Content-Type': 'application/json', 'x-ohf-origin': key }
```

Line 132 currently reads:

```js
xhr.setRequestHeader('x-api-key', apiKey);
```

Change to:

```js
xhr.setRequestHeader('x-ohf-origin', apiKey);
```

- [ ] **Step 6: Verify no key header survives in the Next.js path**

```bash
grep -rn "x-api-key" packages/studio/src/ components/ app/
```

Expected: no output.

- [ ] **Step 7: Remove the key gate from the shell**

In `components/StandaloneShell.js`, delete the `ApiKeyModal` import, the `STORAGE_KEY` constant, the `apiKey` state, the `useEffect` that reads local storage, `handleKeySave`, `handleKeyChange`, the `if (!apiKey)` early return, and the "Current API key" line in the settings panel. Replace the four studio mounts:

```jsx
{activeTab === 'image'   && <ImageStudio   apiKey="web:image" />}
{activeTab === 'video'   && <VideoStudio   apiKey="web:video" />}
{activeTab === 'lipsync' && <LipSyncStudio apiKey="web:lipsync" />}
{activeTab === 'cinema'  && <CinemaStudio  apiKey="web:cinema" />}
```

The studio components are untouched — they still take an `apiKey` prop and pass it down. It now carries an origin tag rather than a secret, which is what lets the Cinema tab be told apart from the Image tab in the usage log.

In the settings panel, replace the key section with a link:

```jsx
<a href="/settings" className="text-[#d9ff00] text-sm hover:underline">
  Account settings
</a>
```

- [ ] **Step 8: Delete the modal**

```bash
git rm components/ApiKeyModal.js
```

- [ ] **Step 9: Run everything and deploy**

```bash
npm test && npm run build
```

Expected: all tests pass, build succeeds.

Add `MUAPI_API_KEY` and `KEY_ENCRYPTION_SECRET` in Vercel, then push.

- [ ] **Step 10: Verify the key is invisible — the check this project exists for**

On the deployed site, sign in and generate one image. Then, with dev-tools open:

- **Network tab:** every generation request goes to `<APP_URL>/api/v1/...`, never to `api.muapi.ai`. No request carries an `x-api-key` header.
- **Application → Local Storage:** no `muapi_key` entry.
- **Sources:** search the loaded bundles for the first six characters of your MuAPI key. Expected: no match.

If any of these fail, stop and fix before continuing. Nothing downstream matters if this does not hold.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: route all generation through our server; remove the API-key box"
```

---

## Task 9: Somewhere to save your own key

**Files:**
- Create: `app/api/settings/key/route.js`, `app/settings/page.js`, `test/settingsKeyRoute.test.js`

**Interfaces:**
- Consumes: `getOrCreateAppUser` from `lib/appUser.js`; `encryptSecret`, `last4` from `lib/crypto.js`; `prisma` from `lib/db.js`.
- Produces: `PUT /api/settings/key` (body `{ key: string }`) → `{ ok: true, last4: string }`; `DELETE /api/settings/key` → `{ ok: true }`. Neither ever returns a stored key.

- [ ] **Step 1: Write the failing test**

`test/settingsKeyRoute.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

const auth = vi.fn();
vi.mock('@clerk/nextjs/server', () => ({ auth, currentUser: vi.fn() }));

const update = vi.fn();
vi.mock('../lib/db.js', () => ({ default: { appUser: { update } } }));

beforeEach(() => {
  process.env.KEY_ENCRYPTION_SECRET = 'test-secret-do-not-use-in-production';
  auth.mockReset(); update.mockReset();
  update.mockResolvedValue({});
});

const { PUT, DELETE } = await import('../app/api/settings/key/route.js');

const put = (body) => new Request('https://example.com/api/settings/key', {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

describe('PUT /api/settings/key', () => {
  it('refuses an anonymous caller', async () => {
    auth.mockResolvedValue({ userId: null });
    expect((await PUT(put({ key: 'muapi_abc1234' }))).status).toBe(401);
    expect(update).not.toHaveBeenCalled();
  });

  it('stores the key encrypted, never in plain text', async () => {
    auth.mockResolvedValue({ userId: 'u_1' });
    await PUT(put({ key: 'muapi_abc1234' }));

    const stored = update.mock.calls[0][0].data;
    expect(stored.ownKeyCiphertext).not.toContain('muapi_abc1234');
    expect(stored.ownKeyLast4).toBe('1234');
  });

  it('never returns the key it just stored', async () => {
    auth.mockResolvedValue({ userId: 'u_1' });
    const res = await PUT(put({ key: 'muapi_abc1234' }));
    const body = await res.json();

    expect(JSON.stringify(body)).not.toContain('muapi_abc1234');
    expect(body).toEqual({ ok: true, last4: '1234' });
  });

  it('rejects an empty key', async () => {
    auth.mockResolvedValue({ userId: 'u_1' });
    expect((await PUT(put({ key: '   ' }))).status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/settings/key', () => {
  it('clears both the ciphertext and the last four', async () => {
    auth.mockResolvedValue({ userId: 'u_1' });
    await DELETE();

    expect(update.mock.calls[0][0].data)
      .toEqual({ ownKeyCiphertext: null, ownKeyLast4: null });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/settingsKeyRoute.test.js`
Expected: FAIL — cannot find the route module.

- [ ] **Step 3: Write `app/api/settings/key/route.js`**

```js
import { auth } from '@clerk/nextjs/server';
import prisma from '@/lib/db';
import { encryptSecret, last4 } from '@/lib/crypto';

export async function PUT(request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Not signed in' }, { status: 401 });

  const { key } = await request.json().catch(() => ({}));
  const trimmed = String(key ?? '').trim();
  if (!trimmed) return Response.json({ error: 'Enter your MuAPI key.' }, { status: 400 });

  await prisma.appUser.update({
    where: { clerkUserId: userId },
    data: { ownKeyCiphertext: encryptSecret(trimmed), ownKeyLast4: last4(trimmed) },
  });

  return Response.json({ ok: true, last4: last4(trimmed) });
}

export async function DELETE() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Not signed in' }, { status: 401 });

  await prisma.appUser.update({
    where: { clerkUserId: userId },
    data: { ownKeyCiphertext: null, ownKeyLast4: null },
  });

  return Response.json({ ok: true });
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run test/settingsKeyRoute.test.js`
Expected: PASS — 5 tests.

- [ ] **Step 5: Write `app/settings/page.js`**

```jsx
import { auth, currentUser } from '@clerk/nextjs/server';
import { getOrCreateAppUser } from '@/lib/appUser';
import KeyForm from './KeyForm';

export const metadata = { title: 'Settings — Open Higgsfield AI' };

export default async function SettingsPage() {
  const { userId } = await auth();
  const clerkUser = await currentUser();
  const appUser = await getOrCreateAppUser({
    clerkUserId: userId,
    email: clerkUser?.primaryEmailAddress?.emailAddress ?? '',
  });

  return (
    <main className="min-h-screen bg-[#050505] text-white px-6 py-12">
      <div className="mx-auto max-w-2xl space-y-8">
        <h1 className="text-2xl font-black uppercase tracking-wider">Settings</h1>

        <section className="rounded-xl border border-white/10 bg-white/5 p-6 space-y-3">
          <h2 className="font-semibold">Who pays for your generations</h2>
          {appUser.keyMode === 'COMPANY' ? (
            <p className="text-white/60 text-sm">
              The company is covering your generations. There is nothing for you to set up.
            </p>
          ) : (
            <>
              <p className="text-white/60 text-sm">
                You are set up to use your own MuAPI account, so your generations are billed to you.
              </p>
              <KeyForm initialLast4={appUser.ownKeyLast4} />
            </>
          )}
        </section>

        <a href="/studio" className="text-[#d9ff00] text-sm hover:underline">← Back to the studio</a>
      </div>
    </main>
  );
}
```

- [ ] **Step 6: Write `app/settings/KeyForm.js`**

```jsx
'use client';

import { useState } from 'react';

export default function KeyForm({ initialLast4 }) {
  const [last4, setLast4] = useState(initialLast4);
  const [value, setValue] = useState('');
  const [status, setStatus] = useState(null);

  async function save(e) {
    e.preventDefault();
    setStatus('saving');
    const res = await fetch('/api/settings/key', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: value }),
    });
    const body = await res.json();
    if (res.ok) {
      setLast4(body.last4);
      setValue('');
      setStatus('saved');
    } else {
      setStatus(body.error ?? 'Could not save that key.');
    }
  }

  return (
    <form onSubmit={save} className="space-y-3">
      {last4 && (
        <p className="text-sm text-white/70">
          Saved key: <span className="font-mono">••••{last4}</span>
        </p>
      )}
      <input
        type="password"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={last4 ? 'Enter a new key to replace it' : 'Your MuAPI key'}
        className="w-full rounded-lg bg-black/60 border border-white/15 px-3 py-2 font-mono text-sm"
      />
      <button
        type="submit"
        className="rounded-lg bg-[#d9ff00] px-4 py-2 text-black text-sm font-semibold"
      >
        {last4 ? 'Replace key' : 'Save key'}
      </button>
      {status === 'saved' && <p className="text-sm text-[#d9ff00]">Saved.</p>}
      {status && status !== 'saved' && status !== 'saving' && (
        <p className="text-sm text-red-400">{status}</p>
      )}
      <p className="text-xs text-white/40">
        Your key is encrypted before it is stored and is never shown again — not to you, not to
        an administrator. Replace it any time. It is used only to bill your own generations.
      </p>
    </form>
  );
}
```

- [ ] **Step 7: Run the suite and commit**

```bash
npm test && npm run build
git add app/settings app/api/settings test/settingsKeyRoute.test.js
git commit -m "feat: let a person save their own MuAPI key, write-only"
```

---

## Task 10: The admin — who pays

**Files:**
- Create: `app/api/admin/key-mode/route.js`, `test/adminKeyMode.test.js`

**Interfaces:**
- Consumes: `isAdminEmail` from `lib/admin.js`; `prisma` from `lib/db.js`.
- Produces: `POST /api/admin/key-mode` (body `{ clerkUserId: string, keyMode: 'COMPANY'|'SELF' }`) → `{ ok: true, keyMode, warning?: string }`.

- [ ] **Step 1: Write the failing test**

`test/adminKeyMode.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

const currentUser = vi.fn();
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(), currentUser }));

const update = vi.fn();
const findUnique = vi.fn();
vi.mock('../lib/db.js', () => ({ default: { appUser: { update, findUnique } } }));

beforeEach(() => {
  process.env.ADMIN_EMAIL = 'boss@example.com';
  currentUser.mockReset(); update.mockReset(); findUnique.mockReset();
  update.mockResolvedValue({});
});

const { POST } = await import('../app/api/admin/key-mode/route.js');

const req = (body) => new Request('https://example.com/api/admin/key-mode', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

describe('POST /api/admin/key-mode', () => {
  it('hides itself from a non-admin with a 404, not a 403', async () => {
    currentUser.mockResolvedValue({ primaryEmailAddress: { emailAddress: 'someone@example.com' } });
    const res = await POST(req({ clerkUserId: 'u_2', keyMode: 'SELF' }));

    expect(res.status).toBe(404);
    expect(update).not.toHaveBeenCalled();
  });

  it('lets the admin switch someone to their own key', async () => {
    currentUser.mockResolvedValue({ primaryEmailAddress: { emailAddress: 'boss@example.com' } });
    findUnique.mockResolvedValue({ clerkUserId: 'u_2', ownKeyCiphertext: 'ciphertext' });

    const res = await POST(req({ clerkUserId: 'u_2', keyMode: 'SELF' }));

    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ where: { clerkUserId: 'u_2' }, data: { keyMode: 'SELF' } });
  });

  it('warns when switching someone who has no key saved', async () => {
    currentUser.mockResolvedValue({ primaryEmailAddress: { emailAddress: 'boss@example.com' } });
    findUnique.mockResolvedValue({ clerkUserId: 'u_2', ownKeyCiphertext: null });

    const body = await (await POST(req({ clerkUserId: 'u_2', keyMode: 'SELF' }))).json();

    expect(body.warning).toMatch(/no key saved/i);
  });

  it('rejects a key mode that is not COMPANY or SELF', async () => {
    currentUser.mockResolvedValue({ primaryEmailAddress: { emailAddress: 'boss@example.com' } });
    const res = await POST(req({ clerkUserId: 'u_2', keyMode: 'FREE_MONEY' }));

    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/adminKeyMode.test.js`
Expected: FAIL — cannot find the route module.

- [ ] **Step 3: Write `app/api/admin/key-mode/route.js`**

```js
import { currentUser } from '@clerk/nextjs/server';
import prisma from '@/lib/db';
import { isAdminEmail } from '@/lib/admin';

const MODES = new Set(['COMPANY', 'SELF']);

export async function POST(request) {
  const me = await currentUser();
  if (!isAdminEmail(me?.primaryEmailAddress?.emailAddress)) {
    // 404, not 403 — no hint that this route exists.
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const { clerkUserId, keyMode } = await request.json().catch(() => ({}));
  if (!clerkUserId || !MODES.has(keyMode)) {
    return Response.json({ error: 'Bad request' }, { status: 400 });
  }

  const target = await prisma.appUser.findUnique({ where: { clerkUserId } });
  await prisma.appUser.update({ where: { clerkUserId }, data: { keyMode } });

  const warning =
    keyMode === 'SELF' && !target?.ownKeyCiphertext
      ? 'This person has no key saved, so they cannot generate until they add one in Settings.'
      : undefined;

  return Response.json({ ok: true, keyMode, warning });
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run test/adminKeyMode.test.js`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/key-mode test/adminKeyMode.test.js
git commit -m "feat: admin can switch a person between the company key and their own"
```

---

## Task 11: The admin — usage

**Files:**
- Create: `app/api/admin/usage/route.js`, `app/admin/page.js`, `app/admin/PeopleTable.js`, `test/adminUsage.test.js`
- Modify: `package.json` (shadcn dependencies)

**Interfaces:**
- Consumes: `isAdminEmail` from `lib/admin.js`; `prisma` from `lib/db.js`.
- Produces: `GET /api/admin/usage?month=YYYY-MM` → `{ month, people: Array<{ clerkUserId, email, keyMode, ownKeyLast4, total, images, videos, paidByCompany, paidBySelf }>, recent: Array<{ id, email, studio, model, via, paidBy, createdAt }> }`.

- [ ] **Step 1: Install shadcn/ui**

```bash
npx shadcn@latest init -d
npx shadcn@latest add table badge button select card
```

If init offers to overwrite `app/globals.css`, accept — then verify in Step 8 that the studio still looks right. Its styling is class-based and self-contained, so a shadcn base layer should not disturb it.

- [ ] **Step 2: Write the failing test**

`test/adminUsage.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

const currentUser = vi.fn();
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(), currentUser }));

const findMany = vi.fn();
const generationFindMany = vi.fn();
vi.mock('../lib/db.js', () => ({
  default: { appUser: { findMany }, generation: { findMany: generationFindMany } },
}));

beforeEach(() => {
  process.env.ADMIN_EMAIL = 'boss@example.com';
  currentUser.mockReset(); findMany.mockReset(); generationFindMany.mockReset();
});

const { GET } = await import('../app/api/admin/usage/route.js');

const req = (url = 'https://example.com/api/admin/usage?month=2026-09') => new Request(url);

describe('GET /api/admin/usage', () => {
  it('hides itself from a non-admin with a 404', async () => {
    currentUser.mockResolvedValue({ primaryEmailAddress: { emailAddress: 'nobody@example.com' } });
    expect((await GET(req())).status).toBe(404);
    expect(generationFindMany).not.toHaveBeenCalled();
  });

  it('counts each person\'s generations, split by studio kind and who paid', async () => {
    currentUser.mockResolvedValue({ primaryEmailAddress: { emailAddress: 'boss@example.com' } });
    findMany.mockResolvedValue([
      { clerkUserId: 'u_1', email: 'a@b.com', keyMode: 'COMPANY', ownKeyLast4: null },
      { clerkUserId: 'u_2', email: 'c@d.com', keyMode: 'SELF', ownKeyLast4: '9876' },
    ]);
    generationFindMany.mockResolvedValue([
      { id: 'g1', clerkUserId: 'u_1', email: 'a@b.com', studio: 'IMAGE',  model: 'nano-banana', via: 'WEB', paidBy: 'COMPANY', createdAt: new Date() },
      { id: 'g2', clerkUserId: 'u_1', email: 'a@b.com', studio: 'CINEMA', model: 'nano-banana', via: 'MCP', paidBy: 'COMPANY', createdAt: new Date() },
      { id: 'g3', clerkUserId: 'u_1', email: 'a@b.com', studio: 'VIDEO',  model: 'kling-video', via: 'WEB', paidBy: 'COMPANY', createdAt: new Date() },
      { id: 'g4', clerkUserId: 'u_2', email: 'c@d.com', studio: 'LIPSYNC', model: 'ltx-lipsync', via: 'WEB', paidBy: 'SELF', createdAt: new Date() },
    ]);

    const body = await (await GET(req())).json();
    const first = body.people.find((p) => p.clerkUserId === 'u_1');
    const second = body.people.find((p) => p.clerkUserId === 'u_2');

    expect(first).toMatchObject({ total: 3, images: 2, videos: 1, paidByCompany: 3, paidBySelf: 0 });
    expect(second).toMatchObject({ total: 1, images: 0, videos: 1, paidBySelf: 1, paidByCompany: 0 });
  });

  it('includes a person with no generations at all', async () => {
    currentUser.mockResolvedValue({ primaryEmailAddress: { emailAddress: 'boss@example.com' } });
    findMany.mockResolvedValue([{ clerkUserId: 'u_9', email: 'quiet@b.com', keyMode: 'COMPANY', ownKeyLast4: null }]);
    generationFindMany.mockResolvedValue([]);

    const body = await (await GET(req())).json();
    expect(body.people[0]).toMatchObject({ email: 'quiet@b.com', total: 0 });
  });

  it('queries the month asked for, not always today', async () => {
    currentUser.mockResolvedValue({ primaryEmailAddress: { emailAddress: 'boss@example.com' } });
    findMany.mockResolvedValue([]); generationFindMany.mockResolvedValue([]);

    await GET(req('https://example.com/api/admin/usage?month=2026-03'));

    const where = generationFindMany.mock.calls[0][0].where;
    expect(where.createdAt.gte.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(where.createdAt.lt.toISOString()).toBe('2026-04-01T00:00:00.000Z');
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run test/adminUsage.test.js`
Expected: FAIL — cannot find the route module.

- [ ] **Step 4: Write `app/api/admin/usage/route.js`**

```js
import { currentUser } from '@clerk/nextjs/server';
import prisma from '@/lib/db';
import { isAdminEmail } from '@/lib/admin';

const VIDEO_STUDIOS = new Set(['VIDEO', 'LIPSYNC']);

function monthRange(month) {
  const [year, mon] = (month ?? '').split('-').map(Number);
  const start = year && mon
    ? new Date(Date.UTC(year, mon - 1, 1))
    : new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  return { start, end };
}

export async function GET(request) {
  const me = await currentUser();
  if (!isAdminEmail(me?.primaryEmailAddress?.emailAddress)) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const month = new URL(request.url).searchParams.get('month');
  const { start, end } = monthRange(month);

  const [people, generations] = await Promise.all([
    prisma.appUser.findMany({ orderBy: { email: 'asc' } }),
    prisma.generation.findMany({
      where: { createdAt: { gte: start, lt: end } },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const summary = people.map((person) => {
    const mine = generations.filter((g) => g.clerkUserId === person.clerkUserId);
    return {
      clerkUserId: person.clerkUserId,
      email: person.email,
      keyMode: person.keyMode,
      ownKeyLast4: person.ownKeyLast4,
      total: mine.length,
      images: mine.filter((g) => !VIDEO_STUDIOS.has(g.studio)).length,
      videos: mine.filter((g) => VIDEO_STUDIOS.has(g.studio)).length,
      paidByCompany: mine.filter((g) => g.paidBy === 'COMPANY').length,
      paidBySelf: mine.filter((g) => g.paidBy === 'SELF').length,
    };
  });

  return Response.json({
    month: start.toISOString().slice(0, 7),
    people: summary,
    recent: generations.slice(0, 200),
  });
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run test/adminUsage.test.js`
Expected: PASS — 4 tests.

- [ ] **Step 6: Write `app/admin/page.js`**

```jsx
import { redirect } from 'next/navigation';
import { currentUser } from '@clerk/nextjs/server';
import { isAdminEmail } from '@/lib/admin';
import PeopleTable from './PeopleTable';

export const metadata = { title: 'Admin — Open Higgsfield AI' };

export default async function AdminPage() {
  const me = await currentUser();
  if (!isAdminEmail(me?.primaryEmailAddress?.emailAddress)) redirect('/studio');

  return (
    <main className="min-h-screen bg-[#050505] text-white px-6 py-12">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex items-baseline justify-between">
          <h1 className="text-2xl font-black uppercase tracking-wider">Usage</h1>
          <a
            href="https://dashboard.clerk.com"
            target="_blank"
            rel="noreferrer"
            className="text-[#d9ff00] text-sm hover:underline"
          >
            Invite or remove people in Clerk ↗
          </a>
        </header>

        <p className="text-white/50 text-sm max-w-2xl">
          These are generation counts, not money. The bill itself lives on your MuAPI billing page —
          images cost cents, video and lip sync cost considerably more.
        </p>

        <PeopleTable />
      </div>
    </main>
  );
}
```

- [ ] **Step 7: Write `app/admin/PeopleTable.js`**

```jsx
'use client';

import { useEffect, useState } from 'react';

function thisMonth() {
  return new Date().toISOString().slice(0, 7);
}

export default function PeopleTable() {
  const [month, setMonth] = useState(thisMonth());
  const [data, setData] = useState(null);
  const [notice, setNotice] = useState(null);

  async function load(m) {
    const res = await fetch(`/api/admin/usage?month=${m}`);
    setData(await res.json());
  }

  useEffect(() => { load(month); }, [month]);

  async function setKeyMode(clerkUserId, keyMode) {
    const res = await fetch('/api/admin/key-mode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clerkUserId, keyMode }),
    });
    const body = await res.json();
    setNotice(body.warning ?? null);
    await load(month);
  }

  if (!data) return <p className="text-white/40">Loading…</p>;

  return (
    <div className="space-y-6">
      <input
        type="month"
        value={month}
        onChange={(e) => setMonth(e.target.value)}
        className="rounded-lg bg-black/60 border border-white/15 px-3 py-2 text-sm"
      />

      {notice && (
        <p className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
          {notice}
        </p>
      )}

      <table className="w-full text-sm">
        <thead className="text-white/40 text-left">
          <tr>
            <th className="py-2">Person</th>
            <th>Images</th>
            <th>Video &amp; lip sync</th>
            <th>Total</th>
            <th>Who pays</th>
          </tr>
        </thead>
        <tbody>
          {data.people.map((p) => (
            <tr key={p.clerkUserId} className="border-t border-white/10">
              <td className="py-3">{p.email}</td>
              <td>{p.images}</td>
              <td>{p.videos}</td>
              <td>{p.total}</td>
              <td>
                <select
                  value={p.keyMode}
                  onChange={(e) => setKeyMode(p.clerkUserId, e.target.value)}
                  className="rounded bg-black/60 border border-white/15 px-2 py-1"
                >
                  <option value="COMPANY">Company</option>
                  <option value="SELF">Their own key</option>
                </select>
                {p.keyMode === 'SELF' && !p.ownKeyLast4 && (
                  <span className="ml-2 text-yellow-400" title="No key saved — they cannot generate">
                    ⚠ no key
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="text-sm uppercase tracking-wider text-white/40">Recent generations</h2>
      <table className="w-full text-sm">
        <thead className="text-white/40 text-left">
          <tr>
            <th className="py-2">When</th><th>Person</th><th>Studio</th>
            <th>Model</th><th>From</th><th>Paid by</th>
          </tr>
        </thead>
        <tbody>
          {data.recent.map((g) => (
            <tr key={g.id} className="border-t border-white/10">
              <td className="py-2">{new Date(g.createdAt).toLocaleString('en-GB')}</td>
              <td>{g.email}</td>
              <td>{g.studio}</td>
              <td className="font-mono text-xs">{g.model}</td>
              <td>{g.via === 'MCP' ? 'Claude' : 'Website'}</td>
              <td>{g.paidBy === 'SELF' ? 'Themselves' : 'Company'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 8: Verify the studio still looks right**

```bash
npm run build && npm test
```

Deploy, then open `/studio` and confirm the dark theme, the neon accent and the layout are unchanged after the shadcn base layer was added. Then open `/admin` as yourself and as a second (non-admin) account — the second should land on `/studio`.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: admin usage dashboard with the who-pays switch"
```

---

## Task 12: Uploads that don't hit the size wall

Gated on Task 1's finding. If MuAPI rejected external URLs, skip to Step 7 of this task and implement the proxied fallback instead.

**Files:**
- Create: `app/api/upload-token/route.js`, `test/uploadToken.test.js`
- Modify: `packages/studio/src/muapi.js` (the `uploadFile` function, around line 124)

**Interfaces:**
- Consumes: `auth` from Clerk.
- Produces: `POST /api/upload-token` — the Vercel Blob client-upload handshake. `uploadFile(originTag, file, onProgress)` keeps its existing signature and still resolves to a public URL string, so the four studio components need no changes.

- [ ] **Step 1: Install the Blob client**

```bash
npm install @vercel/blob
```

In Vercel: **Storage → Create → Blob**, connect it to the project, then `npx vercel env pull .env.local`.

- [ ] **Step 2: Write the failing test**

`test/uploadToken.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

const auth = vi.fn();
vi.mock('@clerk/nextjs/server', () => ({ auth }));

const handleUpload = vi.fn();
vi.mock('@vercel/blob/client', () => ({ handleUpload }));

beforeEach(() => { auth.mockReset(); handleUpload.mockReset(); });

const { POST } = await import('../app/api/upload-token/route.js');

const req = () => new Request('https://example.com/api/upload-token', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
});

describe('POST /api/upload-token', () => {
  it('refuses an anonymous caller — no free file hosting', async () => {
    auth.mockResolvedValue({ userId: null });

    const res = await POST(req());

    expect(res.status).toBe(401);
    expect(handleUpload).not.toHaveBeenCalled();
  });

  it('issues a token for a signed-in caller', async () => {
    auth.mockResolvedValue({ userId: 'u_1' });
    handleUpload.mockResolvedValue({ type: 'blob.generate-client-token', clientToken: 'tok' });

    const res = await POST(req());

    expect(res.status).toBe(200);
    expect(handleUpload).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run test/uploadToken.test.js`
Expected: FAIL — cannot find the route module.

- [ ] **Step 4: Write `app/api/upload-token/route.js`**

```js
import { auth } from '@clerk/nextjs/server';
import { handleUpload } from '@vercel/blob/client';

export async function POST(request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Not signed in' }, { status: 401 });

  const body = await request.json();

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ['image/*', 'audio/*', 'video/*'],
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ userId }),
      }),
      onUploadCompleted: async () => {},
    });
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 400 });
  }
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run test/uploadToken.test.js`
Expected: PASS — 2 tests.

- [ ] **Step 6: Re-point `uploadFile` in `packages/studio/src/muapi.js`**

Replace the whole `uploadFile` function (starting at line 124) with:

```js
export async function uploadFile(originTag, file, onProgress) {
    // Files go straight to storage, so they are not limited by what a serverless
    // function will accept in a request body. MuAPI then fetches the public URL.
    const { upload } = await import('@vercel/blob/client');

    const blob = await upload(file.name, file, {
        access: 'public',
        handleUploadUrl: '/api/upload-token',
        onUploadProgress: onProgress
            ? ({ percentage }) => onProgress(Math.round(percentage))
            : undefined,
    });

    return blob.url;
}
```

- [ ] **Step 7: If Task 1 found MuAPI rejects external URLs**

Skip Step 6 entirely. Instead, add to `app/api/v1/[...path]/route.js` a `multipart/form-data` branch that streams the body to `https://api.muapi.ai/api/v1/upload_file` with the resolved key, and leave `uploadFile` pointing at `/api/v1/upload_file`. Add a size guard that returns a clear message above 4.5MB:

```js
if (Number(request.headers.get('content-length')) > 4_500_000) {
  return Response.json(
    { error: 'That file is too large to upload here — please use one under 4.5MB.' },
    { status: 413 },
  );
}
```

- [ ] **Step 8: Verify with a real large file**

Deploy. In the Image Studio, upload a photo over 5MB as a reference image and run an image-to-image generation. Expected: the upload completes, the generation succeeds, and a row appears in `/admin`.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: upload straight to blob storage, past the request size cap"
```

---

## Task 13: The MCP server

**Files:**
- Create: `app/mcp/route.js`, `lib/mcpTools.js`, `test/mcpTools.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `findAppUserByMcpToken` from `lib/appUser.js`; `forwardToMuapi` from `lib/muapiForward.js`; the model arrays from `packages/studio/src/models.js`.
- Produces:
  - `authenticateMcp(request)` → `Promise<AppUser | null>` — resolves the bearer token to a person.
  - `runTool({ appUser, tool, args })` → `Promise<{ content: Array<{ type: 'text', text: string }> }>`
  - Tools: `list_models`, `generate_image`, `edit_image`, `generate_video`, `animate_image`, `lip_sync`, `check_generation`.

- [ ] **Step 1: Install the adapter**

```bash
npm install mcp-handler @modelcontextprotocol/sdk zod
```

- [ ] **Step 2: Write the failing test**

`test/mcpTools.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

const findAppUserByMcpToken = vi.fn();
vi.mock('../lib/appUser.js', () => ({ findAppUserByMcpToken }));

const forwardToMuapi = vi.fn();
vi.mock('../lib/muapiForward.js', () => ({ forwardToMuapi }));

beforeEach(() => { findAppUserByMcpToken.mockReset(); forwardToMuapi.mockReset(); });

const { authenticateMcp, runTool } = await import('../lib/mcpTools.js');

const USER = { clerkUserId: 'u_1', email: 'a@b.com', keyMode: 'COMPANY' };
const withAuth = (header) =>
  new Request('https://example.com/mcp', { headers: header ? { authorization: header } : {} });

describe('authenticateMcp', () => {
  it('rejects a request with no token', async () => {
    expect(await authenticateMcp(withAuth())).toBeNull();
    expect(findAppUserByMcpToken).not.toHaveBeenCalled();
  });

  it('rejects an unknown token', async () => {
    findAppUserByMcpToken.mockResolvedValue(null);
    expect(await authenticateMcp(withAuth('Bearer ohf_nope'))).toBeNull();
  });

  it('resolves a valid token to its person', async () => {
    findAppUserByMcpToken.mockResolvedValue(USER);
    const user = await authenticateMcp(withAuth('Bearer ohf_good'));
    expect(user.clerkUserId).toBe('u_1');
    expect(findAppUserByMcpToken).toHaveBeenCalledWith('ohf_good');
  });
});

describe('runTool', () => {
  it('generate_image submits and returns a job id without waiting', async () => {
    forwardToMuapi.mockResolvedValue({ status: 200, body: { request_id: 'req_1' } });

    const out = await runTool({
      appUser: USER, tool: 'generate_image',
      args: { prompt: 'a cat', model: 'nano-banana' },
    });

    expect(forwardToMuapi).toHaveBeenCalledWith(expect.objectContaining({
      path: 'nano-banana', via: 'MCP', origin: 'mcp:image',
    }));
    expect(out.content[0].text).toContain('req_1');
  });

  it('generate_video is tagged as coming from the video studio', async () => {
    forwardToMuapi.mockResolvedValue({ status: 200, body: { request_id: 'req_2' } });

    await runTool({ appUser: USER, tool: 'generate_video', args: { prompt: 'a car', model: 'kling-video' } });

    expect(forwardToMuapi.mock.calls[0][0].origin).toBe('mcp:video');
  });

  it('check_generation reports "still working" rather than failing', async () => {
    forwardToMuapi.mockResolvedValue({ status: 200, body: { status: 'processing' } });

    const out = await runTool({ appUser: USER, tool: 'check_generation', args: { request_id: 'req_1' } });

    expect(out.content[0].text).toMatch(/still working/i);
  });

  it('check_generation returns the result url when it is done', async () => {
    forwardToMuapi.mockResolvedValue({
      status: 200, body: { status: 'completed', outputs: [{ url: 'https://cdn/x.png' }] },
    });

    const out = await runTool({ appUser: USER, tool: 'check_generation', args: { request_id: 'req_1' } });

    expect(out.content[0].text).toContain('https://cdn/x.png');
  });

  it('passes a refusal through in plain language', async () => {
    forwardToMuapi.mockResolvedValue({
      status: 400, body: { error: 'You are set up to use your own MuAPI key, but none is saved.' },
    });

    const out = await runTool({ appUser: USER, tool: 'generate_image', args: { prompt: 'x', model: 'nano-banana' } });

    expect(out.content[0].text).toMatch(/own MuAPI key/);
  });

  it('list_models names models for each studio without calling MuAPI', async () => {
    const out = await runTool({ appUser: USER, tool: 'list_models', args: {} });

    expect(forwardToMuapi).not.toHaveBeenCalled();
    expect(out.content[0].text).toMatch(/image/i);
    expect(out.content[0].text).toMatch(/video/i);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run test/mcpTools.test.js`
Expected: FAIL — `Cannot find module '../lib/mcpTools.js'`

- [ ] **Step 4: Write `lib/mcpTools.js`**

```js
import { findAppUserByMcpToken } from './appUser.js';
import { forwardToMuapi } from './muapiForward.js';
import { t2iModels, i2iModels, t2vModels, i2vModels, lipsyncModels }
  from '../packages/studio/src/models.js';

export async function authenticateMcp(request) {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;
  return (await findAppUserByMcpToken(token)) ?? null;
}

const text = (t) => ({ content: [{ type: 'text', text: t }] });

const names = (models, limit = 12) =>
  models.slice(0, limit).map((m) => `${m.id} — ${m.name}`).join('\n');

async function submit({ appUser, endpoint, payload, origin }) {
  const result = await forwardToMuapi({
    appUser, path: endpoint, method: 'POST', body: payload, via: 'MCP', origin,
  });

  if (result.status >= 400) {
    return text(result.body?.error ?? `That did not work (status ${result.status}).`);
  }

  const id = result.body.request_id ?? result.body.id;
  return text(
    `Submitted. Job id: ${id}\n\n` +
    `This runs in the background — call check_generation with this id in about ` +
    `10 seconds for an image, or a minute or two for video.`,
  );
}

export async function runTool({ appUser, tool, args }) {
  switch (tool) {
    case 'list_models':
      return text(
        `Image (text to image):\n${names(t2iModels)}\n\n` +
        `Image editing (image + prompt):\n${names(i2iModels)}\n\n` +
        `Video (text to video):\n${names(t2vModels)}\n\n` +
        `Video (image to video):\n${names(i2vModels)}\n\n` +
        `Lip sync:\n${names(lipsyncModels)}`,
      );

    case 'generate_image':
      return submit({
        appUser, endpoint: args.model, origin: 'mcp:image',
        payload: { prompt: args.prompt, aspect_ratio: args.aspect_ratio ?? '1:1' },
      });

    case 'edit_image':
      return submit({
        appUser, endpoint: args.model, origin: 'mcp:image',
        payload: { prompt: args.prompt, image_url: args.image_url },
      });

    case 'generate_video':
      return submit({
        appUser, endpoint: args.model, origin: 'mcp:video',
        payload: { prompt: args.prompt, aspect_ratio: args.aspect_ratio ?? '16:9' },
      });

    case 'animate_image':
      return submit({
        appUser, endpoint: args.model, origin: 'mcp:video',
        payload: { prompt: args.prompt ?? '', image_url: args.image_url },
      });

    case 'lip_sync':
      return submit({
        appUser, endpoint: args.model, origin: 'mcp:lipsync',
        payload: {
          audio_url: args.audio_url,
          image_url: args.image_url,
          video_url: args.video_url,
        },
      });

    case 'check_generation': {
      const result = await forwardToMuapi({
        appUser, path: `predictions/${args.request_id}/result`, method: 'GET', via: 'MCP',
      });

      const status = String(result.body?.status ?? '').toLowerCase();
      if (['completed', 'succeeded', 'success'].includes(status)) {
        const url = result.body.outputs?.[0]?.url ?? result.body.url;
        return text(url ? `Done: ${url}` : `Done, but no output url came back.`);
      }
      if (['failed', 'error'].includes(status)) {
        return text(`That generation failed: ${result.body.error ?? 'no reason given'}`);
      }
      return text('Still working — check again in a few seconds.');
    }

    default:
      return text(`Unknown tool: ${tool}`);
  }
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run test/mcpTools.test.js`
Expected: PASS — 9 tests.

- [ ] **Step 6: Write `app/mcp/route.js`**

```js
import { createMcpHandler } from 'mcp-handler';
import { z } from 'zod';
import { authenticateMcp, runTool } from '@/lib/mcpTools';

const TOOLS = {
  list_models: {
    description: 'List the models available for each studio. Call this before generating.',
    schema: {},
  },
  generate_image: {
    description: 'Create an image from a text prompt. Returns a job id — then call check_generation.',
    schema: {
      prompt: z.string().describe('What the image should show'),
      model: z.string().describe('A model id from list_models, e.g. nano-banana'),
      aspect_ratio: z.string().optional().describe('e.g. 1:1, 16:9, 9:16'),
    },
  },
  edit_image: {
    description: 'Change an existing image using a prompt. The image must be a public URL.',
    schema: {
      prompt: z.string(),
      image_url: z.string().describe('A publicly reachable image URL'),
      model: z.string(),
    },
  },
  generate_video: {
    description: 'Create a video from a text prompt. Video takes minutes — poll check_generation.',
    schema: {
      prompt: z.string(),
      model: z.string(),
      aspect_ratio: z.string().optional(),
    },
  },
  animate_image: {
    description: 'Turn a still image into a video. The image must be a public URL.',
    schema: {
      image_url: z.string(),
      model: z.string(),
      prompt: z.string().optional(),
    },
  },
  lip_sync: {
    description: 'Sync a face to audio. Give either image_url or video_url, plus audio_url.',
    schema: {
      audio_url: z.string(),
      model: z.string(),
      image_url: z.string().optional(),
      video_url: z.string().optional(),
    },
  },
  check_generation: {
    description: 'Check whether a submitted job has finished and get its result URL.',
    schema: { request_id: z.string() },
  },
};

// The handler is built per request with the caller closed over. Do not hoist this
// to module scope and try to pass the user in on the Request object — concurrent
// requests would read each other's caller.
function handlerFor(appUser) {
  return createMcpHandler((server) => {
    for (const [name, { description, schema }] of Object.entries(TOOLS)) {
      server.tool(name, description, schema, async (args) =>
        runTool({ appUser, tool: name, args }),
      );
    }
  });
}

async function authed(request) {
  const appUser = await authenticateMcp(request);
  if (!appUser) {
    return Response.json(
      { error: 'That token is not valid. Open /connect on the studio and copy the line again.' },
      { status: 401 },
    );
  }
  return handlerFor(appUser)(request);
}

export { authed as GET, authed as POST, authed as DELETE };
```

If `createMcpHandler` requires the transport to appear in the path, move this file to `app/[transport]/route.js` — Next.js gives static routes such as `/studio` and `/admin` precedence over a root dynamic segment, so nothing else breaks. Update the `middleware.js` public matcher to `'/(mcp|sse)(.*)'` to match.

- [ ] **Step 7: Verify it works from Claude Code**

```bash
claude mcp add --transport http ohf <APP_URL>/mcp \
  --header "Authorization: Bearer <your ohf_ token from the database>"
```

Then ask Claude to list the models and generate one image. Expected: a job id comes back, `check_generation` returns a URL, and a row tagged `MCP` appears in `/admin`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: hosted MCP endpoint with per-person token auth"
```

---

## Task 14: The `/connect` page

The one screen a non-technical person has to get through unaided. It should require reading nothing and typing nothing.

**Files:**
- Create: `app/connect/page.js`, `app/connect/CopyBox.js`

**Interfaces:**
- Consumes: `getOrCreateAppUser` from `lib/appUser.js`.
- Produces: nothing other tasks consume.

- [ ] **Step 1: Write `app/connect/page.js`**

```jsx
import { auth, currentUser } from '@clerk/nextjs/server';
import { getOrCreateAppUser } from '@/lib/appUser';
import CopyBox from './CopyBox';

export const metadata = { title: 'Connect to Claude — Open Higgsfield AI' };

export default async function ConnectPage() {
  const { userId } = await auth();
  const clerkUser = await currentUser();
  // Their token is created here, silently, the first time they visit.
  const appUser = await getOrCreateAppUser({
    clerkUserId: userId,
    email: clerkUser?.primaryEmailAddress?.emailAddress ?? '',
  });

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const cliLine =
    `claude mcp add --transport http higgsfield ${origin}/mcp ` +
    `--header "Authorization: Bearer ${appUser.mcpToken}"`;

  const desktopJson = JSON.stringify(
    { mcpServers: { higgsfield: { url: `${origin}/mcp`,
      headers: { Authorization: `Bearer ${appUser.mcpToken}` } } } },
    null, 2,
  );

  return (
    <main className="min-h-screen bg-[#050505] text-white px-6 py-12">
      <div className="mx-auto max-w-2xl space-y-10">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-wider">Use this from Claude</h1>
          <p className="mt-2 text-white/60">
            Once connected, you can ask Claude to make images and videos for you and they will
            appear here in your history. Takes about a minute to set up.
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="font-semibold">If you use Claude Code (the terminal)</h2>
          <ol className="text-sm text-white/60 space-y-1 list-decimal list-inside">
            <li>Copy the line below.</li>
            <li>Paste it into your terminal and press Enter.</li>
            <li>Ask Claude: <em>&ldquo;list the higgsfield models&rdquo;</em>. If it answers, you are done.</li>
          </ol>
          <CopyBox value={cliLine} />
        </section>

        <section className="space-y-3">
          <h2 className="font-semibold">If you use the Claude desktop app</h2>
          <ol className="text-sm text-white/60 space-y-1 list-decimal list-inside">
            <li>Open Settings, then Connectors, then Add custom connector.</li>
            <li>Paste the details below.</li>
            <li>Ask Claude: <em>&ldquo;list the higgsfield models&rdquo;</em>.</li>
          </ol>
          <CopyBox value={desktopJson} multiline />
        </section>

        <section className="rounded-xl border border-white/10 bg-white/5 p-5 text-sm text-white/50">
          <p>
            The line above contains your personal token. Do not share it — anyone who has it can
            generate as you. If you think it has got out, ask the administrator to reset it.
          </p>
        </section>

        <a href="/studio" className="text-[#d9ff00] text-sm hover:underline">← Back to the studio</a>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Write `app/connect/CopyBox.js`**

```jsx
'use client';

import { useState } from 'react';

export default function CopyBox({ value, multiline = false }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="relative">
      <pre className={`rounded-lg bg-black/60 border border-white/15 p-4 pr-28 text-xs font-mono ${
        multiline ? 'whitespace-pre overflow-x-auto' : 'whitespace-pre-wrap break-all'
      }`}>
        {value}
      </pre>
      <button
        onClick={copy}
        className="absolute top-3 right-3 rounded-lg bg-[#d9ff00] px-3 py-1.5 text-black text-xs font-semibold"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Add a link to it from the studio**

In `components/StandaloneShell.js`, beside the "Account settings" link added in Task 8:

```jsx
<a href="/connect" className="text-[#d9ff00] text-sm hover:underline">
  Use from Claude
</a>
```

- [ ] **Step 4: Set the app URL**

In Vercel, add `NEXT_PUBLIC_APP_URL` set to `<APP_URL>` (no trailing slash). Redeploy.

- [ ] **Step 5: Verify as a genuine newcomer**

On a machine that has never touched this project, sign in as a second test account, open `/connect`, follow only what the page says, and get to a working generation from Claude. If you had to explain anything out loud, the page needs that explanation written on it.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: one-click Claude setup page"
```

---

## Task 15: The daily digest email

**Files:**
- Create: `app/api/cron/daily-digest/route.js`, `test/dailyDigest.test.js`, `vercel.json`
- Modify: `package.json`

**Interfaces:**
- Consumes: `prisma` from `lib/db.js`.
- Produces: `buildDigest(generations)` → `{ subject: string, text: string }`; `GET /api/cron/daily-digest` guarded by `CRON_SECRET`.

- [ ] **Step 1: Install the mail client**

```bash
npm install resend
```

Create a [Resend](https://resend.com) account (free tier), verify a sending domain, and add `RESEND_API_KEY` and `DIGEST_TO` in Vercel. Also add `CRON_SECRET` — any long random string.

- [ ] **Step 2: Write the failing test**

`test/dailyDigest.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { buildDigest } from '../app/api/cron/daily-digest/route.js';

const gen = (email, studio, paidBy = 'COMPANY') => ({ email, studio, paidBy });

describe('buildDigest', () => {
  it('says plainly when nothing happened', () => {
    const { subject, text } = buildDigest([]);
    expect(subject).toMatch(/no generations/i);
    expect(text).toMatch(/nobody generated anything/i);
  });

  it('counts per person, heaviest first', () => {
    const { text } = buildDigest([
      gen('quiet@b.com', 'IMAGE'),
      gen('busy@b.com', 'IMAGE'),
      gen('busy@b.com', 'VIDEO'),
      gen('busy@b.com', 'VIDEO'),
    ]);

    expect(text.indexOf('busy@b.com')).toBeLessThan(text.indexOf('quiet@b.com'));
    expect(text).toMatch(/busy@b\.com.*3/);
  });

  it('calls out video separately, since that is where the money goes', () => {
    const { text } = buildDigest([gen('a@b.com', 'VIDEO'), gen('a@b.com', 'LIPSYNC')]);
    expect(text).toMatch(/2 video/i);
  });

  it('excludes people paying for themselves from the company total', () => {
    const { text } = buildDigest([
      gen('a@b.com', 'IMAGE', 'COMPANY'),
      gen('c@d.com', 'IMAGE', 'SELF'),
    ]);
    expect(text).toMatch(/1 on the company/i);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run test/dailyDigest.test.js`
Expected: FAIL — cannot find the route module.

- [ ] **Step 4: Write `app/api/cron/daily-digest/route.js`**

```js
import prisma from '@/lib/db';

const VIDEO_STUDIOS = new Set(['VIDEO', 'LIPSYNC']);

export function buildDigest(generations) {
  if (generations.length === 0) {
    return {
      subject: 'Higgsfield studio — no generations yesterday',
      text: 'Nobody generated anything yesterday.',
    };
  }

  const byPerson = new Map();
  for (const g of generations) {
    const row = byPerson.get(g.email) ?? { total: 0, videos: 0 };
    row.total += 1;
    if (VIDEO_STUDIOS.has(g.studio)) row.videos += 1;
    byPerson.set(g.email, row);
  }

  const ranked = [...byPerson.entries()].sort((a, b) => b[1].total - a[1].total);
  const onCompany = generations.filter((g) => g.paidBy === 'COMPANY').length;
  const videos = generations.filter((g) => VIDEO_STUDIOS.has(g.studio)).length;

  const lines = ranked.map(
    ([email, r]) => `  ${email}: ${r.total}${r.videos ? ` (${r.videos} video)` : ''}`,
  );

  return {
    subject: `Higgsfield studio — ${generations.length} generations yesterday`,
    text: [
      `${generations.length} generations yesterday, ${videos} video, ` +
      `${onCompany} on the company key.`,
      '',
      ...lines,
    ].join('\n'),
  };
}

export async function GET(request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const generations = await prisma.generation.findMany({
    where: { createdAt: { gte: start, lt: end } },
  });

  const { subject, text } = buildDigest(generations);

  const { Resend } = await import('resend');
  await new Resend(process.env.RESEND_API_KEY).emails.send({
    from: 'studio@' + (process.env.DIGEST_FROM_DOMAIN ?? 'example.com'),
    to: process.env.DIGEST_TO,
    subject,
    text,
  });

  return Response.json({ ok: true, counted: generations.length });
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run test/dailyDigest.test.js`
Expected: PASS — 4 tests.

- [ ] **Step 6: Schedule it — `vercel.json`**

```json
{
  "crons": [
    { "path": "/api/cron/daily-digest", "schedule": "0 5 * * *" }
  ]
}
```

Add `/api/cron/(.*)` to the public matcher in `middleware.js` — Vercel's scheduler has no Clerk session, and the route guards itself with `CRON_SECRET`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: daily usage digest email"
```

---

## Task 16: Full smoke test, then invite people

Nothing here is code. It is the gate between "it builds" and "other people depend on it".

**Files:**
- Create: `docs/superpowers/specs/2026-09-07-launch-checklist.md`

**Interfaces:**
- Consumes: everything.
- Produces: a signed-off checklist.

- [ ] **Step 1: Run the whole suite**

```bash
npm test && npm run build
```

Expected: every test passes; the build succeeds.

- [ ] **Step 2: The security check, once more, on production**

Sign in on the live site. With dev-tools open, generate one image and confirm:

- No request goes to `api.muapi.ai` from the browser.
- No request carries an `x-api-key` header.
- Local storage holds no `muapi_key`.
- Searching the loaded bundles for the first six characters of the MuAPI key returns nothing.

- [ ] **Step 3: All four studios**

Generate one of each: an image, an image edit using an uploaded photo over 5MB, a video, a cinema shot, and a lip sync. Confirm five rows appear in `/admin` with the right studio names.

- [ ] **Step 4: The who-pays switch**

With a second test account: confirm it can generate on the company key; switch it to SELF in `/admin` and confirm generation is refused with the "add your MuAPI key" message and **not** billed to the company; save a key in Settings and confirm it generates again with `paidBy = Themselves`; switch it back to COMPANY.

- [ ] **Step 5: MCP, from scratch**

On the second account, follow `/connect` and generate an image and a video from Claude. Confirm both appear in `/admin` marked as coming from Claude.

- [ ] **Step 6: Access control**

Confirm the second account is redirected away from `/admin`. Remove that account in Clerk and confirm both the website and its MCP token stop working.

- [ ] **Step 7: Write the checklist result and invite**

Record each check above as passed or failed with a date. Then, in Clerk, invite the real users. Send them the address, the `/connect` link, and one line on what the tool is and is not for — prompts are not stored, but the generations are billed to the company and logged by name.

- [ ] **Step 8: Commit**

```bash
git add docs/superpowers/specs/2026-09-07-launch-checklist.md
git commit -m "docs: launch checklist, signed off"
```

---

## Deferred, deliberately

Written down so they are decisions rather than oversights:

- **Per-person spend caps.** Declined in the design. The meter exists, so enforcement is a count check in `lib/muapiForward.js` when it is wanted.
- **Money in the admin, not counts.** Needs a hand-maintained price-per-model table; MuAPI publishes none.
- **Moving to Vercel Pro.** Required before this is anything but a trial — the free plan is for non-commercial use, and its 60-second function limit is what forces the submit-then-check MCP pattern.
- **Resetting someone's MCP token from the admin.** Today it needs a database edit. Worth adding the first time somebody leaks one.

---

## Execution notes (2026-09-07)

Reality differed from the plan in three places. Recorded so nobody re-derives them.

**Vitest must be pinned to v3.** Vitest 5 (current) requires Vite 6+; this repo pins
Vite 5 for the Electron build, which the constraints forbid touching. `vitest@^3`
peers Vite 5 and works. Task 3 Step 1 should read `npm install -D prisma "vitest@^3"`.

**Prisma's `latest` npm tag is a release candidate** (8.0.0-rc.13 as of today). A plain
`npm install -D prisma` installs an RC and mismatches `@prisma/client`. Pin both:
`prisma@^7` and `@prisma/client@^7`.

**Prisma 7 restructured the schema.** Three changes from what Task 3 Step 4 shows:
- generator is `provider = "prisma-client"` (no `-js`) with a **required** `output`.
  Using `output = "../lib/generated/prisma"` and `moduleFormat = "esm"`.
- `url = env("DATABASE_URL")` is **no longer allowed** in the datasource block. The URL
  moves to `prisma.config.mjs` for the CLI, and the running app supplies a driver
  adapter (`@prisma/adapter-pg` + `pg`) to the `PrismaClient` constructor.
- The generated client is **TypeScript**, so `typescript` and `@types/node` are now
  devDependencies. Verified with a real `next build` that this compiles cleanly before
  committing — the app's own code stays plain JavaScript.

`lib/db.js` therefore imports from `./generated/prisma/client`, not `@prisma/client`,
and `lib/generated/` is gitignored and rebuilt by `postinstall`.
