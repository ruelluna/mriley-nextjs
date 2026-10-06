# Brand representative portal — plan

**Gerber Furniture · prepared 6 Oct 2026 · status: planning, nothing built yet**

Brand representatives (Sealy, Tempur-Pedic, Uttermost, Stearns & Foster, Flexsteel, A America, …)
need to update pricing and product information on **gerbersfurniture.com** themselves — without
being given a WordPress user account, and without an open-ended credential that lives forever.

This document is the design. It answers the authentication question, the management question and the
expiry question, and ends with the decisions we need from Gerber before building.

---

## 1. The ask

- Send a brand rep a **link**.
- The link lists **their** live products from the store.
- They update price and information themselves.
- **No WordPress account** is created for them.
- The link **expires**.

## 2. Recommendation

**Do not create accounts on the WordPress side at all.** Give each rep a secret, expiring
*capability link* into a portal we control, where:

1. the store credential stays **server-side** and is never handed to the rep;
2. the fields they may change are an explicit **allow-list**;
3. every edit lands in an **approval queue** with a full before/after audit trail;
4. the link is **scope-bound to their brand** and can be revoked instantly.

One line: **a link, not a login; a queue, not a direct write.**

## 3. What we deliberately did not choose

| Option | Why not |
|---|---|
| WordPress user / Shop Manager account for each rep | This is what we are trying to avoid. Field-level restriction needs extra plugins, so the rep ends up with more power than intended, and every rep becomes an account you must maintain, offboard and audit. |
| WC Vendors / Dokan / Product Vendors | The conventional route, but these *are* accounts, and they generally let a vendor **create** products. Wrong door for "correct our price and specs". |
| Signed link (JWT with an `exp` claim) | Cannot be shortened, revoked or re-scoped after it is sent. A code stored server-side can be. |
| One shared password for all reps | No attribution — you cannot tell who changed a price, and revocation means changing everyone's password. |
| A Google Sheet per brand fed into the existing sync | Cheapest to build (the update engine already exists), but no per-field locking, no typo guard, no audit, no expiry, and one bad paste can rewrite thousands of prices. Kept as a fallback, not as the product. |

## 4. Authentication model — no WordPress accounts

### 4.1 The credential is a stored code, not a signed token

Each invitation generates a **256-bit random code**. The code is stored in our database as a
**SHA-256 hash** together with everything that defines its authority:

```
token_id · code_hash · rep_name · rep_email · brand_ids[] · field_scope[]
issued_at · expires_at · last_used_at · revoked_at · created_by · notes
```

Because authority is data, not a signature, we can at any moment:

- **revoke** it (one click, effective on the next request),
- **shorten or extend** the expiry,
- **re-scope** it to more or fewer brands or fields,
- see **who** used it, when, from which IP, and what they changed.

### 4.2 The link itself never carries the secret in a readable place

`/r/<code>` is opened once and immediately exchanged for an `HttpOnly`, `Secure`, `SameSite=Lax`
session cookie; the browser is then redirected to the portal. Consequences:

- the code never sits in an address bar the rep can screenshot and forward,
- it is not leaked through referrer headers or the host's request logs,
- only the hashed code is at rest in our database.

### 4.3 Second factor without an account

On the first open from a new device, the portal mails a **6-digit code to the rep's address**; a
verified device is remembered for 30 days. This is the part that makes a forwarded link useless and
ties every change to a named human. It is **on by default for edit links and off for view-only
links**, so a "just look at this" link stays one click.

### 4.4 Scope is enforced server-side, per request

The token is bound to specific **brand term IDs**, and every product query is filtered by that
binding — never by a parameter the browser sends. A rep for Flexsteel editing the URL to
`brand=136` (Sealy) gets their own catalogue back, not Sealy's. Two reps never see each other's
pricing.

## 5. Link lifecycle and expiry

- **Expiry is set at issue.** Default **30 days**, editable per invitation.
- The portal shows the rep a countdown, so nobody is surprised.
- Optional **"expires N days after first open"** for campaign windows (the clock starts when they
  actually engage).
- **At expiry the portal goes read-only** rather than dead, with a "request a new link" button that
  emails the Gerber admin. A silent dead-end generates phone calls.
- **Reminders** to Gerber at T-7 and T-1 days; optional reminder to the rep at T-3.
- **Renew** extends the same token and logs the renewal, or **rotates** it to a brand-new link and
  kills the old one (useful if the link may have leaked).
- **Revoke** is immediate: a rep who moves on, or a link that was forwarded too widely, dies the
  moment you click it.

## 6. What the rep sees

- Their brand's **live** products read straight from the store: name, SKU, current price, stock
  status, image, short and full description, dimensions, weight, attributes.
- Search and filters (price range, missing image, missing description) so 3,381 Sealy SKUs are
  navigable rather than a wall.
- **Inline editing across rows** with a "changed" marker per row — a rep fixing 40 prices submits
  once, not 40 times.
- A **review screen** before submit: "you changed 12 products" with old → new per field.
- **Price guards**: must be greater than zero, at most two decimals, and inside ±30% of the current
  price unless explicitly flagged as a deliberate change (typo protection).
- Nothing is published by submitting. The screen says so plainly: *"Sent for approval."*

## 7. What Gerber sees

- **Invite console** — pick brand(s) → enter rep name and email → set expiry → choose field scope →
  OTP on/off → send. One link per rep, re-issuable at any time.
- **Approval queue** — every submission as a before/after diff, per field, with the rep's name.
  Approve individually or in bulk; reject with a note that the rep receives by email.
- **Audit trail** — who changed what, when, from which link and IP, what the previous value was, and
  whether it was applied, rejected, or reverted.
- **One-click revert** — the old value is stored with every applied change, so a bad price is one
  button away from being undone.
- **Notifications** — new submission, applied, rejected, expiring link.

## 8. Field ownership

Same principle the catalog sync already uses: everything the portal may write is named explicitly,
and nothing else is reachable.

| Editable by the rep | Locked — requires Gerber staff |
|---|---|
| `regular_price`, `sale_price` | `sku` |
| `short_description` | product `name` (proposed as a *suggestion* only) |
| `description` | status (`draft`/`publish`) |
| dimensions, weight | categories, brands, collections |
| attributes (colour, material, finish, size, style, …) | stock quantity and stock status |
| *(phase 2)* photos / media | slug / URL, tags, everything else |

A submitted change to a locked field is captured as a **suggestion** for staff, never applied
directly.

## 9. Where it runs

Two pieces, both already in place — no new infrastructure.

```
  rep's browser
      │  capability link  →  session cookie
      ▼
  Portal UI  ── Next.js app on Vercel  (mriley-nextjs — /products, /plan, /costs, /reports today)
      │  reads: public store API, brand-scoped (no credentials needed)
      │
      ├──▶  submission webhook  ──▶  n8n
      │                                 ├─ token store + expiry job (n8n data tables)
      │                                 ├─ submission queue + audit log
      │                                 ├─ approval / rejection emails
      │                                 └─ writes to the store via REST v3
      ▼
  gerbersfurniture.com  (WooCommerce)
```

- **The UI** is a new brand-scoped area on the app Gerber already reviews.
- **The token store, the queue, the audit log, the emails, the expiry job and the actual store
  writes all live in n8n** — which keeps the store credential **out of the public web app
  entirely**. Nothing in the portal can write to WooCommerce on its own.
- Writes use a **dedicated Shop Manager application password** (not an administrator's), stored only
  as an n8n credential.

## 10. Security controls, in one list

- 256-bit random codes, stored **hashed at rest**; code exchanged for a session cookie, never left
  in the URL.
- Email OTP on new devices for edit links.
- Server-side brand scoping on every query.
- Field allow-list; locked fields become suggestions.
- Approval queue — nothing reaches the store unreviewed during the pilot.
- Per-token rate limiting; 3 failed OTP attempts locks the link and notifies Gerber.
- Expiry, revocation and rotation at any time.
- Full audit: token, rep, IP, user agent, field, old value, new value, timestamp.
- One-click revert of any applied change.
- Portal is `noindex`, unlisted, and holds no store credentials.

## 11. Verified facts this plan rests on (checked 6 Oct 2026)

- The store holds **6,856 published products** and exposes a public, keyless read API that filters by
  brand: `brand=136` (Sealy) → **3,381**, `brand=99` (Flexsteel) → **81**. Reads need no
  credentials at all.
- Those public product records already carry everything a rep edits: price, description, short
  description, dimensions, weight, attributes, images.
- The **write** path (`wc/v3`) returns **401** unauthenticated — which is exactly why writes are
  isolated in n8n behind one credential.
- Brand term counts on the store: Sealy 3,381 · Uttermost 2,255 · A America 315 · Stearns & Foster
  264 · American Leather 190 · Tempur-Pedic 156 · Aspenhome 130 · Flexsteel 81 · Best Home
  Furnishings 30 · Pulaski 12 · Whittier Wood 9 · England 8. A further ~30 brand terms exist with
  zero products.
- n8n is connected and has **no data tables yet** — the token/queue/audit tables would be created as
  part of phase 1.

## 12. Decisions required (recommended default in bold)

1. **Authentication** — link + emailed one-time code for edit links; link only for read-only links.
   **Recommended: yes.** *(If you want zero friction for the first pilot, we can run one link
   link-only and switch the second factor on for the wider rollout.)*
2. **Expiry** — 30 days from issue, reminders at 7 and 1 days out, read-only after expiry with a
   "request a new link" button. **Recommended: yes.**
3. **Apply policy** — nothing touches the store until Gerber staff approve it in the queue.
   **Recommended: approve everything during the pilot**, then enable per-brand auto-apply for
   non-price fields, and later for prices within a tolerance, once a rep has earned it.
4. **Editable fields** — the list in §8. **Recommended: as listed** (price, sale price, short and
   full description, dimensions, weight, attributes). Photos in phase 2.
5. **Pilot brand** — **Recommended: Flexsteel (81 SKUs)** — small enough to check by eye, real
   enough to test the workflow. Then Tempur-Pedic (156) and Stearns & Foster (264); Sealy (3,381)
   and Uttermost (2,255) last, since those are the ones where bulk editing has to be proven first.
6. **Store credential** — a dedicated **Shop Manager** WordPress user with an application password,
   stored only in n8n. **Recommended: yes** (never an administrator's password).

## 13. Delivery plan

| Phase | Deliverable | Effort |
|---|---|---|
| P0 | Decisions above; brand ↔ rep mapping | 0.5 day |
| P1 | Token service, invite console, expiry job, tables in n8n | 1 day |
| P2 | Brand-scoped live product list for the rep (search, filters, images) | 1 day |
| P3 | Inline editing, validation and price guards, submit to queue | 1 day |
| P4 | Approval queue, apply to store, audit log, one-click revert | 1 day |
| P5 | Emails: invite, receipt, approval/rejection, expiry reminders | 0.5 day |
| P6 | Pilot link to one rep, observed for a week, then roll out | 0.5 day + observation |

**≈ 4–5 working days to a pilot link in a rep's inbox.** Rolling out to the remaining brands is
then just issuing more invitations.

## 14. Open questions

- Who administers invitations day to day — Gerber staff, or us on their behalf?
- Do reps need to see **cost / MAP / MSRP** fields, or only the retail price they are correcting?
- Should a rep's price change be able to go **live immediately** for any brand, or is approval
  permanent policy?
- Do reps want a **CSV download → edit → upload** path in addition to the on-page editor? (Recommended
  as phase 2 for the high-volume brands.)
