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

## 2. MuAPI accepts external image URLs — RESOLVED

**Accepted: YES.** Verified 2026-09-07 with a real generation: MuAPI fetched a
photo from an external host, edited it, and returned the result for $0.02.

Two things learned on the way:
- **Wikimedia blocks MuAPI's fetcher.** The first attempt failed with "failed to
  transfer the provided image", which reads like a rejection of external URLs but
  is that one host refusing bots. Any ordinary CDN works.
- The i2i endpoints take `images_list` (an array), not `image_url`. The app already
  handles this — every one of the 57 i2i and 61 i2v models declares its own
  `imageField` — so no change was needed.

## 3. Claude Desktop accepts a hosted MCP with a static bearer token — RESOLVED

**Accepted: YES.** Verified 2026-09-07 — the connector shows as connected.

But the setup is a **form, not a JSON file**, which `/connect` originally got wrong.
The four values Desktop asks for are:

| Field | Value |
|---|---|
| Name | Yahya AI Studio |
| Remote MCP server URL | `https://studio.yahya-ai.com/mcp` |
| Authentication | **None** — we use an API key, not OAuth |
| Additional request header | `Authorization` = `Bearer <their ohf_ token>` |

Claude's dialog auto-detects "Always required" because our endpoint returns 401
without a token. That detection is wrong for us: pick **None** and supply the
header. `/connect` now spells this out field by field.

## Also settled while building

- **MuAPI account funded** with $50 on 2026-09-07. Auto-top-up must be OFF — this
  balance is the hard ceiling that makes "no spend caps" safe.
