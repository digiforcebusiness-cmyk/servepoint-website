# Multi-App Feedback Dashboard — Design

Date: 2026-08-10

## Problem

Feedback lives in one Firebase project per app. Today two of those projects have a
dashboard, and each dashboard reads exactly one project:

- `admin/feedback.html` → project `servepoint-16302`, collection `feedback`, French UI
- `spa/admin/feedback.html` → project `servepoint-spa`, collection `feedback`, English UI

The two files are near-duplicates. Every new app means another copy and another URL to
check. Goal: one page that shows feedback from all 5–10 Firebase projects at once, where
adding an app is a config edit.

## Approach

Client-side multi-project. The page holds a list of Firebase web configs and calls
`initializeApp(config, appId)` once per project, so N independent Firestore connections
run side by side in the browser. Feedback stays realtime, writes go directly to the
originating project, the site stays a static deploy with no build step and no secrets.

Approaches rejected:

- **Serverless aggregator** (Vercel functions + `firebase-admin` + one service account per
  project): turns a static repo into a Node project, adds 5–10 secrets to manage, and
  trades realtime for polling. More machinery than the problem needs.
- **Consolidating all apps into one Firebase project**: cleanest end state, but requires
  shipping a store release of every app and surfaces none of the existing feedback. Worth
  adopting for newly built apps; not the fix here.

## File layout

- `admin/feedback.html` — rewritten as the unified dashboard. Single self-contained file
  (inline CSS + one ES module), matching how the current admin pages are built.
- `spa/admin/feedback.html` — deleted. Its project becomes an entry in the config list.

No other files change.

## Configuration

One declarative list at the top of the module is the only thing edited when apps change:

```js
const APPS = [
  { id:'servepoint', name:'ServePoint', color:'#E94560', hub:true,
    collection:'feedback', firebase:{ /* servepoint-16302 web config */ } },
  { id:'spa', name:'ServePoint SPA', color:'#60A5FA',
    collection:'feedback', firebase:{ /* servepoint-spa web config */ } },
];
```

Fields:

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | Stable key. Used for the named Firebase instance, DOM `data-app`, and filter state. Must be unique. |
| `name` | yes | Display label on chips, tiles, and card badges. |
| `color` | yes | Hex colour for the app's badge, dot, and tile accent. |
| `collection` | yes | Firestore collection holding feedback in that project. |
| `hub` | exactly one app | The project the Google sign-in popup runs against. |
| `firebase` | yes | Standard Firebase web config object. |

Behaviour is defined for a list of any length ≥ 1. The two configs above are already known
from the existing files; the remaining app configs are supplied by the user by pasting web
config objects. No placeholder entries ship in the file — the list contains only real,
working apps, so the dashboard is never in a broken state on deploy.

## Auth

Google sign-in happens once and is replayed into the other projects.

1. User clicks sign-in → `signInWithPopup(hubAuth, new GoogleAuthProvider())`.
2. Email checked against `ADMIN_EMAILS`. Not on the list → `signOut`, show denial, stop.
3. `GoogleAuthProvider.credentialFromResult(result)` yields the Google ID token. For every
   non-hub app that has no existing session, `signInWithCredential(auth[id],
   GoogleAuthProvider.credential(idToken))`.
4. Each app tracks its own connection state: `connecting` → `connected`, or `error` with a
   reason.
5. On reload, no replay happens. Each project's session is persisted independently by the
   Firebase SDK and restores itself; `onAuthStateChanged` per app drives the state machine.
6. Any app whose replay fails renders a **Connect** button in the connection panel. Clicking
   it runs `signInWithPopup` against that one project. Because it is a direct user gesture
   the popup is not blocked, and the resulting session persists, so it is a one-time cost
   per browser.
7. Sign-out signs out of every project and tears down all listeners.

### Per-project console setup (one-time, manual)

For each project other than the hub:

- Enable the Google sign-in provider.
- Under the Google provider's Web SDK configuration, whitelist the **hub project's OAuth
  client ID** so it accepts ID tokens issued for the hub.
- Add the dashboard's domain to Authorized domains.

### Security boundary

`ADMIN_EMAILS` in the page is presentation only — the file is public source. The real
control is Firestore rules in each project restricting read/write on the feedback
collection to those emails. Publishing Firebase web configs is expected and not a leak;
permissive rules would be. Auditing and tightening each project's rules is a manual step
performed alongside the console setup above, not a code change in this repo.

## Data flow

Per app, one listener:

```
onSnapshot(query(collection(db[id], cfg.collection), orderBy('createdAt','desc'), limit(200)))
```

- Results land in a per-app bucket, each doc tagged with its `appId`.
- Any snapshot recomputes the merged array (all buckets concatenated, sorted by `createdAt`
  descending) and re-renders.
- `limit(200)` per app bounds memory and render cost. Older feedback is not reachable from
  the dashboard; this is accepted.
- A doc whose `createdAt` is still a pending server timestamp has no `toDate()`. It sorts to
  the top of the feed and renders its date as `—`, rather than throwing.

### Actions

Mark-done and delete resolve the target project from the card's `data-app`:

```
updateDoc(doc(db[appId], APPS_BY_ID[appId].collection, docId), { status })
deleteDoc(doc(db[appId], APPS_BY_ID[appId].collection, docId))
```

Delete asks for confirmation. Both are wired through a single delegated click handler on the
feed container reading `data-app` / `data-id` / `data-action`, replacing the current
`onclick="toggleStatus('${id}')"` string interpolation, which breaks on ids or values
containing quotes.

## UI

Top to bottom:

- **Header** — logo, title, signed-in email, sign-out.
- **App overview row** — one tile per app: colour dot, name, count of `status === 'new'`.
  These counts are always that app's full new count, unaffected by the active filters or
  search, so the row stays a stable at-a-glance answer to "which app needs attention".
  Clicking a tile sets the app filter to that app.
- **Stats row** — Total / New / Bugs / Suggestions, computed over the visible set after the
  app filter, type/status filter, and search have been applied, so the numbers always
  describe what is on screen.
- **Filters** — an app chip row (All + one chip per configured app) plus the existing
  type/status chips (All, Bugs, Suggestions, New, Done). App filter and type/status filter
  are independent and combine.
- **Search** — debounced text input, case-insensitive substring match on the message body,
  applied across all apps and combined with the active filters.
- **Feed** — one merged chronological stream. Each card carries an app badge in the app's
  colour plus the existing type badge, status badge, message, date, locale, truncated uid,
  mark-done, and delete.
- **Connection panel** — one row per app with a green (connected) / amber (connecting) /
  red (error) dot. Red rows show the error message and, for auth failures, a Connect button.

UI language is English throughout. The two existing dashboards disagree (French and
English); the unified page picks one.

Visual language, colour tokens, dark background, card treatment, and the auth gate are
carried over from the current `admin/feedback.html` so the page still looks like the rest of
the site.

## Error handling

- Errors are per app and never global. A failing project turns its own row red; every other
  app keeps streaming and the feed keeps rendering.
- `permission-denied` → "Firestore rules deny access for this project."
- Auth errors (`auth/*`) → the reason plus a Connect button for that project.
- Any other error → the raw Firebase message, so the cause is diagnosable from the page.
- Popup blocked or closed on the initial sign-in → message on the auth gate, gate stays up.

## Verification

The repo has no test harness and this is a single static page against live Firestore, so
verification is a manual checklist run against the deployed page:

1. Page loads; auth gate shown when signed out.
2. Sign-in with an allowed account: every configured app reaches `connected`.
3. Sign-in with a non-allowed account: access denied, no data loads.
4. Per-app tile counts match that app's new-feedback count in the Firebase console.
5. App chips, type/status chips, and search each narrow the feed, and combine correctly.
6. Mark-done on a card from app X changes `status` on the right doc in project X only, and
   the change appears without a reload.
7. Delete removes the doc from project X after confirmation.
8. Reload while signed in: all apps reconnect with no popup.
9. Temporarily break one app's config or rules: that app goes red with a readable message,
   the others still work.

## Out of scope

- Migrating existing feedback between projects.
- Changing what the mobile apps write, or their feedback schema.
- A shared feedback project for future apps (a separate decision, revisit when shipping the
  next app).
- Pagination beyond the 200-per-app limit.
- Replying to feedback, or any write beyond `status` and delete.
