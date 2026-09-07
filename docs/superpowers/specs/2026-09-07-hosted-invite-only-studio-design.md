# Open Higgsfield AI — hosted, invite-only, company-funded

**Date:** 2026-09-07
**Owner:** Yahya Ismail
**Status:** design approved, awaiting implementation plan

---

## 1. Goal

Put the Open Higgsfield AI studio on the internet at a permanent address, let a
named group of people use it, and have the company pay for every generation —
without any of those people ever holding the MuAPI key that spends the money.
The same group must also be able to drive it from Claude over MCP, with setup
simple enough for someone non-technical to complete unaided. A per-person switch
in the admin decides whether someone spends the company's credits or their own.

### Non-goals

- Charging users. Nobody pays us; there is no billing, no plans, no credits UI.
  Someone put on their own key pays MuAPI directly, never us.
- Self-serve signup. Nobody gets in unless Yahya invites them.
- Spend caps in v1 (explicitly declined — see §7).
- Server-side storage of anyone's generation history. It stays in their browser,
  exactly as the upstream app does today.
- Any change to the Electron desktop build or the Vite standalone build. Only the
  Next.js app is deployed; the other two are left alone.

---

## 2. Why the app can't just be deployed as-is

The upstream app has **no back end and no accounts**. Every generation is fired
from the visitor's own browser straight at `api.muapi.ai`, authenticated with a
MuAPI key that the visitor types into a settings box and that lives in their
browser's local storage (`packages/studio/src/muapi.js`, `x-api-key` header).

So a plain deploy gives exactly two outcomes, both wrong:

- Users bring their own key → **they** pay, not the company.
- The company's key is shipped to the browser → anyone can read it out of
  dev-tools and spend the balance from their own scripts, forever, uncapped.

Closing that gap is what this project is.

---

## 3. Decisions

| Decision | Choice | Note |
|---|---|---|
| Login | **Clerk** | Invite-only. Off the shelf, no hand-rolled auth. |
| Admin UI | **shadcn dashboard block** | Installed via the shadcn CLI, not hand-drawn. |
| Hosting | **Vercel**, Hobby plan to start | Must move to Pro ($20/mo) for company use — see §9. |
| Uploads | **Vercel Blob** | Bypasses Vercel's ~4.5MB request cap. |
| Studios enabled | **All four** — Image, Video, Cinema, Lip Sync | Video-class studios are the expensive ones. |
| Spend limits | **None**, usage visible only | Meter still built, so caps are a later one-liner. |
| Database | **Neon Postgres** (Vercel integration) + Prisma | Free tier; Prisma matches existing tooling. |
| Repo | **Fork to `myi1`** | `Autom8AI/Open-Higgsfield-AI` is not ours (read-only). |
| MCP | **Hosted at `/mcp`**, personal bearer token | Everyone invited gets one. No install. |
| Who pays | **Per person, set in admin** — company key or their own | Everyone defaults to the company key. |

### On `geopopos/higgsfield_ai_mcp`

Not usable as a component. That server talks to the real, paid Higgsfield service
at `cloud.higgsfield.ai` using a Higgsfield API key and secret — a different
vendor, a different account, a different bill from the MuAPI engine this app runs
on. It is useful only as a reference for tool shape and naming. Our MCP server
points at our own deployment so that MCP generations are authenticated, metered
and attributed exactly like website generations.

---

## 4. Architecture

```
   invited person                        their Claude
        │                                     │
        │ browser (Clerk session)             │ MCP (bearer token)
        ▼                                     ▼
 ┌───────────────────────────────────────────────────────┐
 │  studio.<domain>                            (Vercel)  │
 │                                                       │
 │  ┌──────────────┐                  ┌───────────────┐  │
 │  │ Clerk gate   │                  │ /mcp          │  │
 │  │ no session,  │                  │ token → user  │  │
 │  │ no entry     │                  └───────┬───────┘  │
 │  └──────┬───────┘                          │          │
 │         │                                  │          │
 │   ┌─────▼──────┐  ┌──────────┐  ┌───────┐  │          │
 │   │ /studio    │  │ /connect │  │/admin │  │          │
 │   │ 4 studios  │  │ MCP setup│  │ usage │  │          │
 │   └─────┬──────┘  └────┬─────┘  └───▲───┘  │          │
 │         │              │            │      │          │
 │   ┌─────▼──────────────▼────────────┼──────▼───────┐  │
 │   │ THE CORE  — one place, two front doors         │  │
 │   │  • identify caller (session OR token)          │  │
 │   │  • attach MUAPI key                            │  │
 │   │  • forward to MuAPI                            │  │
 │   │  • log who / what ──────────► Neon Postgres    │  │
 │   └─────┬──────────────────────────────────────────┘  │
 │         │                    ┌──────────────────┐     │
 │         │                    │ Vercel Blob      │     │
 │         │                    │ user uploads     │     │
 │         │                    └────────┬─────────┘     │
 └─────────┼─────────────────────────────┼───────────────┘
           ▼                             │ public URL
     api.muapi.ai  ◄────────────────────-┘
```

The website and MCP are two doors into the same room. Both identify a person,
both spend the same key, both write the same usage log, and revoking someone in
Clerk closes both at once.

The MuAPI key exists in exactly one place: a Vercel environment variable read by
the proxy. It is never sent to a browser, never committed, never logged.

---

## 5. Components

### 5.1 Clerk gate

- **What it does:** decides who may open any page.
- **How it's used:** `@clerk/nextjs` `clerkMiddleware` protects every route except
  Clerk's own sign-in pages. Sign-up is set to invitation-only in the Clerk
  dashboard; Yahya adds an email there and the person receives an invite.
- **Depends on:** Clerk (free tier, 10k monthly active users).
- **Admin identity:** Yahya's Clerk user gets `publicMetadata.role = "admin"`.
  `/admin` and the admin API refuse anyone without it.
- **Risk, must verify first:** whether invitation-only restriction is on Clerk's
  free plan. If it is not, the fallback is a `ALLOWED_EMAILS` environment list
  checked in middleware — a few lines, same outcome, no extra cost. Verify before
  building the admin.

### 5.2 The proxy — `app/api/v1/[...path]/route.js`

The only genuinely custom code in the project. One file.

- **What it does:** receives the studio's API calls, refuses them if there is no
  Clerk session, attaches the right `x-api-key` (see §5.8), forwards to
  `https://api.muapi.ai/api/v1/<path>`, and returns the response untouched.
- **How it's used:** the studio calls same-origin paths instead of MuAPI's domain.
  It is a drop-in — the URL shape `/api/v1/<endpoint>` is identical to upstream's.
- **Handles:** `POST /api/v1/<model-endpoint>` (submit) and
  `GET|POST /api/v1/predictions/<id>/result` (poll).
- **Logs:** on submit only — never on poll — one row per generation.
- **Depends on:** Clerk session, `MUAPI_API_KEY`, `KEY_ENCRYPTION_SECRET`, Prisma.

### 5.3 Usage log

- **What it does:** answers "who generated what, and how much of it".
- **Shape:** one row per submitted generation.

```
Generation
  id           string   (MuAPI request_id when available, else uuid)
  clerkUserId  string
  email        string   (denormalised so the table reads without a Clerk lookup)
  studio       enum     IMAGE | VIDEO | CINEMA | LIPSYNC
  model        string   (the endpoint slug, e.g. "flux-schnell-image")
  via          enum     WEB | MCP
  paidBy       enum     COMPANY | SELF
  createdAt    timestamp
```

- `studio` is derived server-side from the endpoint slug via the model tables the
  repo already ships (`packages/studio/src/models.js`). If an endpoint is not
  recognised, the row is still written with `studio = IMAGE` and the raw slug —
  never drop a row because of an unknown model.
- No prompt text is stored. Prompts can contain client and personal information;
  there is no reason for the server to keep them.

### 5.4 Admin — `/admin`

- **What it does:** shows Yahya the usage.
- **Screens:** one page. A summary row of this month's totals per person
  (generations, split image vs video-class), and beneath it the raw table —
  person, time, studio, model, and whether it came from the website or MCP —
  with a person filter and a month filter.
- **Built from:** the shadcn dashboard block plus its data-table block, installed
  by the shadcn CLI.
- **Not built:** user invite/revoke screens. Clerk's own dashboard does that, and
  the admin page links out to it.
- **Honest limitation:** this page reports **counts, not money**. MuAPI prices
  vary per model and are not published in machine-readable form, so the dirham
  figure lives on MuAPI's billing page. A manual price-per-model table can be
  added later to turn counts into an estimate.

### 5.5 Uploads — Vercel Blob

- **Why:** Vercel caps a request body passing through a serverless function at
  roughly 4.5MB. A phone photo or a lip-sync audio clip routinely exceeds that,
  so proxying uploads would fail for real users.
- **What happens instead:** the browser uploads directly to Vercel Blob using a
  short-lived token issued by `app/api/upload-token/route.js` (Clerk session
  required). Blob returns a public URL. The studio passes that URL to MuAPI as
  `image_url` / `audio_url` / `video_url` — fields every relevant model already
  accepts, and exactly what upstream's own `uploadFile` produces today.
- **Consequence:** MuAPI's `/api/v1/upload_file` endpoint is no longer used at all.
- **Must verify first:** that MuAPI fetches Blob URLs successfully. Test with one
  image-to-image call before building anything else. If Blob URLs are rejected,
  the fallback is proxying uploads with the 4.5MB ceiling accepted and a clear
  "file too large" message.

### 5.6 MCP server — `app/[transport]/route.js`

- **What it does:** lets an invited person generate from inside Claude, using the
  same key, the same permissions and the same usage log as the website.
- **Built from:** `mcp-handler`, Vercel's official Next.js MCP adapter. Not
  hand-rolled protocol code.
- **Reached at:** `https://studio.<domain>/mcp` — hosted, nothing to install,
  nothing for users to update when it changes.
- **Depends on:** the same forwarding core as §5.2, plus token auth (§5.7).

**Tools exposed** — deliberately mirroring the six things the studio does:

| Tool | Does |
|---|---|
| `list_models` | Which models are available, per studio. Lets Claude pick sensibly. |
| `generate_image` | Text to image. |
| `edit_image` | Image plus prompt to image. |
| `generate_video` | Text to video. |
| `animate_image` | Image to video. |
| `lip_sync` | Portrait or video plus audio to talking video. |
| `check_generation` | Fetch the result of a submitted job. |

**Submit-and-check, not wait.** Video generations run for minutes; a hosted
function cannot hold a connection that long (60 seconds on Vercel Hobby, longer
but still finite on Pro). So the generate tools **submit and return a job id
immediately**, and `check_generation` fetches the result. Claude handles that
pattern naturally — it will poll on the user's behalf. Trying to make the tool
block until the video is ready would fail in production; this is not a detail to
optimise away later.

### 5.7 Personal tokens and the `/connect` page

The part that has to be genuinely easy, because the people using it are not
engineers.

- **No token creation step.** The first time someone opens `/connect`, a token is
  generated for them silently. They never see the words "generate an API token".
- **The page shows one thing:** a big **Copy** button next to a ready-made,
  fully-filled-in line — their address, their token, already in it. Plus a
  three-step, screenshotted "paste this here" guide for Claude Code and for
  Claude Desktop, and a "test it worked" line they can ask Claude to run.
- **Re-viewable, not show-once.** Standard practice is to show a token once and
  never again. That is the right call for engineers and the wrong call here — a
  lost token becomes a support request every time. The token stays visible on
  their own `/connect` page, with a **Regenerate** button if they think it leaked.
  The tradeoff is accepted knowingly: this token spends company credits and
  nothing more, it is the same power their website login already has, and it is
  visible only to them behind Clerk.
- **Revocation:** removing someone in Clerk kills their token on the next call,
  because every MCP request resolves the token to a live Clerk user.

The token lives on the person's record (§5.8), not in a table of its own — one
row per person holds everything we know about them.

**Uploads over MCP:** Claude will often have a local file. The MCP server accepts
either a public URL or a base64 payload; base64 is written to Vercel Blob
server-side and the resulting URL is passed on. Cap that path at 4.5MB and say so
in the tool description, so Claude gives the user a clear message rather than a
failure. Larger files go through the website.

### 5.8 Who pays — company key or their own

A switch in the admin, per person. Everything else about them is identical:
same login, same studios, same MCP, same usage table. Only the account the
generation is billed to changes.

**The person record** — one row per invited person, holding everything:

```
AppUser
  clerkUserId       string   (primary key)
  email             string
  keyMode           enum     COMPANY | SELF        (default COMPANY)
  ownKeyCiphertext  string?  (AES-256-GCM, with its iv and auth tag)
  ownKeyLast4       string?  (so they can recognise which key they saved)
  mcpToken          string   (unique, random, prefixed "ohf_")
  createdAt         timestamp
  lastUsedAt        timestamp
```

**Choosing the key**, in the one place every generation passes through:

1. Identify the caller — Clerk session (website) or `mcpToken` (MCP).
2. `keyMode = COMPANY` → attach `process.env.MUAPI_API_KEY`, log `paidBy = COMPANY`.
3. `keyMode = SELF` with a key saved → decrypt it, attach it, log `paidBy = SELF`.
4. `keyMode = SELF` with **no** key saved → refuse with a plain message telling them
   to add their key in Settings. Never quietly fall back to the company key; that
   would hand the bill back to the company without anyone noticing.

**Storing someone else's key.** This is the part that carries real responsibility,
so it is spelled out rather than assumed:

- Encrypted at rest with AES-256-GCM using `KEY_ENCRYPTION_SECRET`, a Vercel
  environment variable separate from the MuAPI key. Node's built-in crypto; no
  new dependency.
- **Write-only from the browser.** Once saved, the settings page shows
  `•••• <last4>` and a **Replace** button. There is no route that returns a
  saved key to a browser, ever — not to the owner, not to the admin.
- Never logged, never included in an error message, never echoed in a response.
- One line on the settings page saying plainly what is stored and why.

**In the admin**, each person's row gets a *Who pays* control — Company or Own —
and the usage table separates the two totals, so "what this is costing me" stays
an honest number. Switching someone to Own when they have not saved a key will
stop them working, so the admin warns before the switch and shows an unmistakable
marker on anyone in that state.

**Why this exists.** Two real uses. Outside collaborators and agencies get the
tool without you funding their output. And if one person's usage gets
uncomfortable, you move them to their own key instead of cutting them off — the
gentle version of the spend cap declined in §7. Note that a person on their own
key needs their own MuAPI account with credits loaded, which someone
non-technical will not manage unaided; the company key remains the right default
for your own team.

---

## 6. The patch to the fork

Deliberately small, so upstream updates stay easy to pull. Four touch points:

1. `packages/studio/src/muapi.js` — `const BASE_URL = 'https://api.muapi.ai'`
   becomes `''`, making all six exported functions call same-origin `/api/v1/...`.
   Drop the `x-api-key` header from the three places it is set.
2. `packages/studio/src/muapi.js` — `uploadFile()` re-pointed at Vercel Blob.
3. The key-entry UI is removed from the signed-in flow: `components/ApiKeyModal.js`
   and the key section of the settings modal. Users must never see a key box.
4. `app/layout.js` — wrap in `<ClerkProvider>`; add `middleware.js`.

Everything else in the repo is untouched. The Vite build, the Electron build and
the `src/` vanilla version are left exactly as upstream ships them.

---

## 7. On having no spend limits

Yahya chose no caps: everyone generates freely, the dashboard reports it, and he
intervenes by hand. Building it that way. Two things stand in for a cap:

- **Prepaid credits with auto-top-up OFF.** The MuAPI balance becomes the real
  ceiling. It cannot overshoot; the worst case is the service stopping until
  topped up. This is the single most important safety measure and costs nothing.
- **A daily email** listing yesterday's generations per person, so a runaway is
  noticed within a day rather than at the end of the month.

Because the meter is built regardless, turning on a per-person monthly cap later
is a check in the proxy against a count that is already being kept — small, and
deliberately left easy.

---

## 8. Error handling

| Situation | Behaviour |
|---|---|
| Not signed in / session expired | Proxy returns 401; the studio shows "your session ended, sign in again" rather than a raw error. |
| `MUAPI_API_KEY` missing | The proxy fails loudly with a server-side message. It must never fall back to a browser-supplied key — that would silently reopen the hole this project exists to close. |
| MuAPI returns 4xx/5xx | Status and message passed through to the user, with the key stripped from anything echoed back. |
| MuAPI is down / times out | The studio's existing polling loop already handles this; unchanged. |
| Database write fails | The generation still proceeds. Losing a log row must never cost the user their generation. Failures are logged for Yahya. |
| Non-admin opens `/admin` | Redirected to the studio. The admin API returns 404, not 403 — no hint the page exists. |
| MCP token unknown, revoked, or belongs to a removed Clerk user | 401 with a plain-English message telling them to reopen `/connect` and copy the line again. Never a raw protocol error. |
| Person set to their own key but hasn't saved one | Refused with "add your MuAPI key in Settings", on both the website and MCP. Never falls back to the company key. |
| Someone's own key is invalid or out of credits | MuAPI's own message is passed through, prefixed so they know it is *their* account, not the company's. |
| `KEY_ENCRYPTION_SECRET` missing or rotated | Saved keys fail to decrypt; those people are refused with "re-save your key" rather than silently billed to the company. |
| MCP file over 4.5MB | Refused with a message naming the size limit and pointing at the website. |
| A video job is still running when `check_generation` is called | Returns "still working, try again shortly" rather than an error, so Claude waits instead of giving up. |

---

## 9. Costs

| Item | Cost | Note |
|---|---|---|
| Vercel Hobby | $0 | **Personal, non-commercial use only.** This is company use, so it must move to Pro before it is anything but a trial. Pro also lifts the function timeout, which matters for the video studios. |
| Vercel Pro | $20/mo | The correct plan once this is live for the team. |
| Clerk | $0 | Free to 10k monthly active users; this is a handful. |
| Neon Postgres | $0 | Free tier is far beyond this volume. |
| Vercel Blob | a few $/mo | Storage of user uploads. |
| Domain | $0 | Subdomain of an existing domain. |
| **MuAPI generations** | **the real cost, uncapped** | Images are cents; video, cinema and lip sync are 10–50x that per clip. All four are enabled. |

Hosting is a rounding error. MuAPI is the bill.

---

## 10. Testing

Proportionate — the repo ships no tests and this does not become a test project.

- **Proxy tests (automated):** an anonymous request is refused; a signed-in
  request reaches MuAPI with the key attached; a submit writes exactly one usage
  row; a poll writes none; a database failure does not fail the generation.
- **Admin test (automated):** a non-admin session cannot read the usage API.
- **Key-selection tests (automated):** a COMPANY person is billed to the company
  key; a SELF person with a saved key is billed to theirs and logged `paidBy=SELF`;
  a SELF person with no key is refused and **never** falls back to the company key;
  no route anywhere returns a saved key to a browser.
- **MCP tests (automated):** a request with no token is refused; a valid token
  resolves to the right person and writes a usage row marked `MCP`; a revoked
  token is refused; a generate tool returns a job id without blocking.
- **Manual smoke, once, before inviting anyone:** generate in each of the four
  studios; upload an image over 4.5MB and confirm it works; open dev-tools and
  confirm the MuAPI key appears nowhere in the page, the network tab, or storage.
- **MCP smoke, once:** follow the `/connect` instructions from scratch on a second
  machine as if you were a new user, generate an image and a video from Claude,
  and confirm both appear in the admin table under the right name.

That last check is the one that matters. It is the whole point of the project.

---

## 11. Risks

| Risk | Mitigation |
|---|---|
| Clerk's invitation-only mode may be a paid feature | Verify in step 1. Fallback: an email allowlist in middleware. |
| MuAPI may not accept Vercel Blob URLs | Verify in step 1 with a single real call, before any other work. |
| Fork drift — upstream changes `muapi.js` and conflicts with our patch | Patch confined to one file and four touch points; the diff stays readable. |
| Vercel Hobby terms | Flagged; move to Pro once past trial. |
| Claude Desktop may require OAuth for a hosted MCP rather than a pasted token | Verify early. Claude Code accepts a bearer token today. If Desktop cannot, the `/connect` page shows Desktop users a small local wrapper instead — the fallback declined in the design, kept in reserve. |
| We now hold other people's MuAPI keys | Encrypted at rest with a separate secret, write-only from the browser, never logged or returned. The blast radius of a leak is their MuAPI credits, and they can replace the key themselves. |
| A personal token leaks | It spends credits and nothing else, and Regenerate is one click. Usage attribution makes a leak visible in the admin table. |
| MuAPI result URLs may expire | Users should download what they want to keep. Confirm the expiry window and, if short, say so in the UI. |
| A user pastes confidential material into a prompt | Prompts are not stored server-side by design. Worth one line in the invite email about what this tool is and isn't for. |

---

## 12. Build order

1. **Verify three assumptions** (Clerk invite-only on the free plan; MuAPI accepts
   Vercel Blob URLs; Claude Desktop can use a hosted MCP with a pasted token).
   Everything else depends on them.
2. MuAPI account, credits loaded, auto-top-up off.
3. Fork to `myi1`, deploy the untouched app to Vercel, confirm it runs.
4. Clerk in front of it. Nobody but Yahya can open it.
5. The proxy + the `muapi.js` patch. Remove the key UI. Confirm the key is
   invisible in the browser.
6. Neon + the usage log.
7. Blob uploads.
8. The `/admin` page.
9. The who-pays switch: person records, encrypted key storage, the settings box,
   the admin control.
10. Personal tokens, the `/mcp` server, and the `/connect` page.
11. The daily email.
12. Smoke test all four studios and the MCP setup end to end, then invite people.

Steps 1–5 are the product. Step 9 is the second front door. The rest is
instrumentation.
