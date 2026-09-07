# Assumption findings — 2026-09-07

## 1. Clerk invitation-only on the free plan — RESOLVED

**Available: YES**, on the free plan, no upgrade prompt.

Clerk renamed it since the plan was written: it is **Configure → User &
authentication → Access mode**, not "Restrictions". Three choices — Waitlist,
Invite-only, Open. Set to **Invite-only** on 2026-09-07.

Consequence: the `ALLOWED_EMAILS` middleware fallback is **not needed**. The
variable stays documented in `.env.example` but should remain empty.

Note: the account is currently on Clerk's **Development** instance. That is fine
for building, but it carries a development banner and low limits. Switch to
**Production** at deploy time; it requires the live domain.

## 2. MuAPI accepts external (Vercel Blob) image URLs — OPEN

Not yet tested. Needs one real call with the MuAPI key, which only Yahya holds.
Command is in the handover notes.

Consequence if NO: uploads proxy through the server, capped at 4.5MB, and
`uploadFile` in `packages/studio/src/muapi.js` reverts to `/api/v1/upload_file`.

## 3. Claude Desktop accepts a hosted MCP with a static bearer token — OPEN

Not yet tested; needs the deployed URL. Low risk: Claude Code accepts the header,
and that path is proven working against a local server.

Consequence if NO: `/connect` shows Desktop users a small local wrapper instead.

## Also settled while building

- **MuAPI account funded** with $50 on 2026-09-07. Auto-top-up must be OFF — this
  balance is the hard ceiling that makes "no spend caps" safe.
