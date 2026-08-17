# Pinterest app submission pack (SPIRION)

**Date:** 2026-08-17  
**Portal:** https://developers.pinterest.com/apps/  
**Docs:** [Connect app](https://developers.pinterest.com/docs/getting-started/connect-app/) · [Access tiers](https://developers.pinterest.com/docs/key-concepts/access-tiers/) · [OAuth](https://developers.pinterest.com/docs/getting-started/set-up-authentication-and-authorization/) · [Developer guidelines](https://policy.pinterest.com/developer-guidelines/)  
**Product config:** `knowledge/paths.json` → `pinterest`  
**Implementation:** `knowledge/pinterest-board-import.md`

Copy the **English** blocks into the Pinterest form. Keep this file as the internal German briefing.

Pinterest reviews Trial requests each business day. Standard access needs a later video demo of the full OAuth flow.

---

## 0. Before you open the form

1. Use a **Pinterest Business** account (email verified). This account administers the app.
2. Accept Developer Terms of Service in [My apps](https://developers.pinterest.com/apps/).
3. Host the privacy policy on the same product domain as the website (required). After Island deploy:
   - Website: `https://spirion.projects-a.plygrnd.tech`
   - Privacy: `https://spirion.projects-a.plygrnd.tech/privacy`
4. In the form, set **company / business name to SPIRION** (not Plexon). The August 2026 Connect-app validator often rejects privacy URLs that do not contain the company string. `spirion` is already in the hostname.
5. Do **not** request write scopes. SPIRION only reads boards/pins the user owns.

Replace placeholders:

| Placeholder | Fill with |
|-------------|-----------|
| `[LEGAL ENTITY]` | Firmenname laut Impressum |
| `[CONTACT EMAIL]` | Öffentliche Support-/Datenschutz-Mail |
| `[COUNTRY]` | z.B. Germany |

---

## 1. Form fields (English, paste as-is)

### App name

```
SPIRION
```

### Company / business name (must match the privacy URL)

```
SPIRION
```

Do not use “Plexon” here. The privacy URL is on `spirion.projects-a.plygrnd.tech`; Pinterest currently rejects policies whose URL does not contain the company name.

### Website URL

```
https://spirion.projects-a.plygrnd.tech
```

### Privacy policy URL

```
https://spirion.projects-a.plygrnd.tech/privacy
```

Must load without login. Island middleware treats `/privacy` as public.

### Category / use case (if asked)

Choose the closest match to **Creative tools** (designing images / creative workflow). SPIRION is a design-library product, not an ads manager.

### Short description (~1–2 sentences)

```
SPIRION is a design-intelligence app for professional design teams. With the user's permission, it imports image Pins from Pinterest boards they own into their private design library so those references can be analyzed alongside captured websites.
```

### Detailed app description / use case (paste this)

```
SPIRION helps design teams build a private design library from two sources: (1) captures of public websites the team chooses, and (2) image Pins from Pinterest boards the same user owns.

How Pinterest is used
- The user clicks “Connect Pinterest” inside SPIRION Capture.
- SPIRION sends them through Pinterest OAuth 2.0 (no passwords, no cookies).
- Scopes requested: boards:read, pins:read, user_accounts:read.
- After approval, SPIRION lists the user's boards via GET /v5/boards.
- The user picks one board and clicks Import.
- SPIRION reads Pins on that board via GET /v5/boards/{board_id}/pins and downloads only image URLs returned by the API (hosts limited to pinimg.com / pinterest.com).
- Each imported image Pin is stored in that user's collection as a desktop design-library card, with a canonical link back to https://www.pinterest.com/pin/{pin_id}/.

What we do not do
- We do not scrape pinterest.com.
- We do not read other people's boards.
- We do not publish, schedule, or edit Pins (no pins:write / boards:write).
- We do not use Pinterest data for advertising, resale, or cross-account mixing.
- We do not collect Pinterest login credentials.

Who the user is
Professional designers and brand teams working in a Plexon Collection. Typical use: import a moodboard they already maintain on Pinterest, then use SPIRION to compare look/layout with captured marketing sites.

Data
OAuth tokens are stored server-side on the SPIRION API. Imported Pin images stay in the user's collection so the design pipeline (vision, library, prompt packs) can run. Users can revoke the app in Pinterest settings and can delete imported captures from the SPIRION library.

This integration is user-initiated and limited to boards the connected account can read.
```

### Scopes requested (justification)

| Scope | Why |
|-------|-----|
| `user_accounts:read` | Show which Pinterest account connected (username). |
| `boards:read` | List boards the user owns so they can pick one. |
| `pins:read` | Read Pins on the selected board and fetch API image URLs. |

Do **not** tick `boards:read_secret` / `pins:read_secret` unless you later need secret boards. Do **not** tick any `:write` or ads scopes.

### Redirect URIs (exact match)

Production / staging island:

```
https://spirion.projects-a.plygrnd.tech/api/pinterest/callback
```

Local development (optional, add after Trial approval on the Configure tab):

```
http://localhost:3010/api/pinterest/callback
```

Pinterest matches `redirect_uri` **exactly**. No trailing slash. The callback must not bounce to a second unknown URI before exchanging the code (our callback talks to dig-api server-side, then redirects the browser to `/capture?pinterest=connected`).

### Redirect URI notes (if a free-text field exists)

```
OAuth callback on the SPIRION island. The browser returns to this URI with ?code&state. The island exchanges the code server-side with api.pinterest.com and then sends the user to the Capture screen. We never collect Pinterest passwords.
```

---

## 2. Portal checklist

### Trial access (first submission)

1. Log in at pinterest.com with the **business** account.
2. Open https://developers.pinterest.com/apps/ → **Connect app**.
3. Paste App name, website, privacy URL, detailed description.
4. Submit Trial request.
5. Wait for the email (reviewed on business days).
6. After approval: **Manage** → **Configure** → add Redirect URI(s) → copy App ID + App secret.
7. Set on **dig-api** (Coolify, never git):
   - `PINTEREST_CLIENT_ID`
   - `PINTEREST_CLIENT_SECRET`
   - optional `PINTEREST_REDIRECT_URI=https://spirion.projects-a.plygrnd.tech/api/pinterest/callback`
8. Deploy island (privacy page + callback) and API (OAuth + import).
9. Test: Capture → Connect Pinterest → approve → boards list → import a small board.

### Standard access (later, after Trial works)

Required: video of the **full** OAuth flow plus a live API action (listing boards or imported pins). Wireframes are rejected.

Suggested title on the upgrade form:

```
SPIRION Pinterest board import — OAuth + read-only board ingest
```

---

## 3. Demo video script (Standard upgrade)

Record **one take**, no cuts, English voiceover or on-screen captions.

1. Open `https://spirion.projects-a.plygrnd.tech/capture` (show the URL bar).
2. Show the **Pinterest boards** panel. Click **Connect Pinterest**.
3. Show the Pinterest authorization screen with scopes `boards:read`, `pins:read`, `user_accounts:read`. Click Allow.
4. Show redirect back to SPIRION Capture with connected state / username.
5. Show the board dropdown populated from the API. Select a board.
6. Click **Import board**. Show “Queued N pins”.
7. Open **Library → Screens** and open one imported pin. Point to the pin URL `pinterest.com/pin/…` in the card/meta.
8. End card: “Read-only. User-owned boards only. No scraping. No pin create/edit.”

Length: 60–120 seconds.

---

## 4. Data / policy notes (internal)

Pinterest Developer Guidelines say apps should generally **call the API each time** rather than store API data (exception: campaign analytics). SPIRION **does** persist user-initiated Pin images as design-library captures, always linked back to the Pin URL, never mixed across customers, never sold.

If Trial/Standard is denied on storage grounds, fallback is: store only `pin_id` + OAuth token and re-fetch `media.images` on view. The current product stores the image so vision/enrichment can run offline.

We do **not** scrape. Image hosts are allowlisted (`pinimg.com`, `pinterest.com`).

---

## 5. Coolify env after approval

On **dig-v3:api**:

```
PINTEREST_CLIENT_ID=
PINTEREST_CLIENT_SECRET=
PINTEREST_REDIRECT_URI=https://spirion.projects-a.plygrnd.tech/api/pinterest/callback
```

Island needs no Pinterest secret. Callback is public (`/api/pinterest/*`).

---

## 6. Files in this repo

| File | Role |
|------|------|
| `apps/web/app/privacy/page.tsx` | Public privacy policy |
| `apps/web/app/api/pinterest/callback/route.ts` | OAuth redirect |
| `src/pinterest-*.ts` | OAuth + board import + ingest |
| `knowledge/pinterest-board-import.md` | Engineering notes |
