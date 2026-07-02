# RLS & Privacy Checklist

The app uses the **anon/publishable key only** — Row Level Security is the
authorization layer. Every table has RLS enabled; the service role (Edge
Functions) bypasses it. Run this checklist against a real project before launch
and after any schema change.

## Privacy invariants (must always hold)
- [ ] **Exact location never leaks.** `profiles.home_location` is column-revoked
      from the app role (0013) — not selectable by anyone but the service role.
      Discovery returns **jittered** venue coords (~±150m, 0012); the real point
      is only used server-side for distance.
- [ ] **Phone numbers never leak.** Phone lives in `auth.users`, never in a
      public table; the app only reads its own via the auth session.
- [ ] **Blocked users disappear** from discovery, rosters, profiles and chat
      (every relevant policy calls `is_blocked(auth.uid(), …)`).
- [ ] **Third-party tokens never reach the client.** `strava_accounts` token
      columns are column-revoked (0010); written only by the Edge Function.

## Per-table policies
| Table | Select | Insert / Update / Delete |
|-------|--------|--------------------------|
| `profiles` | authenticated, row not blocked; **home_location column revoked** | owner only (`id = auth.uid()`) |
| `activities` | authenticated, host not blocked | insert/update/delete by host; insert requires `phone_verified` |
| `activity_participants` | visible activities, both parties unblocked | add/remove **self** only, must be `phone_verified`, **capacity-checked** (0015) |
| `activity_waitlist` | visible activities, both parties unblocked | queue/unqueue **self** only, verified + not suspended, game must be full; promotion is trigger-only (service definer) |
| `messages` | participants of the activity only (`is_participant`) | insert by participants only |
| `connections` | your side only | insert/delete your side only |
| `game_invites` | inviter or invitee | insert by a roster member; update by either party |
| `blocks` / `reports` | your own | insert your own |
| `push_tokens` | owner only | owner only |
| `strava_accounts` | owner only; **tokens column-revoked** | service role only (Edge Function) |
| `strava_activities` | authenticated, not blocked (stats only — no GPS) | service role only |
| `events` | all authenticated | (read-only catalogue) |
| `event_attendees` | all authenticated | add/remove self only |

## Manual verification (run as a second, unrelated user)
- [ ] `select home_location from profiles where id <> auth.uid()` → **permission denied**.
- [ ] `select * from messages where activity_id = <a game you're NOT in>` → **0 rows**.
- [ ] `select access_token from strava_accounts` → **permission denied**.
- [ ] Block user B as A; confirm A no longer sees B in discovery, rosters, or chat, and vice-versa.
- [ ] As an unverified user, try to insert into `activities` / `activity_participants` → **denied**.
- [ ] Try to join a **full** game directly (insert into `activity_participants`) → **denied**; join its waitlist → allowed; have someone leave → you're auto-promoted.
- [ ] `nearby_activities(...)` markers are offset from the true venue, but `distance_meters` is accurate.

## When the schema changes
- [ ] New table → enable RLS + add policies in the same migration (never ship a table without RLS).
- [ ] New column holding anything sensitive (location, tokens, contact) → column-revoke it from the app role.
- [ ] Re-run the manual checks above.
