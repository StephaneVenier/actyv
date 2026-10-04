# V1-1B: bounded reward integrity

Local patch only. Do not apply without review. The production export in
security-audit/ is read-only and is not part of the patch.

## Trust boundary

- request_xp_reward(event_type, target_id) derives the caller from auth.uid().
  No amount or beneficiary is accepted. Whitelisted rewards require owned,
  coherent persisted evidence. add_user_xp is an internal primitive only.
- Activity/challenge creation and reactions remain trigger-driven.
- Reaction beneficiaries come from the activity. Only visible activities can
  be reacted to. The target is actor UUID + activity UUID + reaction type,
  independent of the interaction row UUID.
- Reward evaluation locks the beneficiary transactionally before deduplication
  and cap checks. An inserted event increments profiles.total_xp/level once.
- Activity/workout mastery processing and level rewards are not rewritten.
- refresh_own_badges evaluates criteria on the server. Legacy badge codes are
  canonicalized for matching without deleting or renaming historical rows.
- Direct writes to xp_events, user_xp_events and user_badges are removed.
  Their own-account reads remain available.

## Preserved rewards

Activity 25 XP (4/day), challenge creation 20 XP (2/day), challenge join 10 XP,
session creation 5 XP, session completion 10 XP, program creation 10 XP,
program sharing 15 XP, program completion 50 XP, daily completion uses the
server daily_sessions.bonus_xp. Likes: 1 XP, max 20/day; boosts: 3 XP, max 30/day.
Existing aliases share the same identity and caps.

Program completion requires each expected program session to have a coherent
completion linked to an owned completed workout. Daily completion must link
the correct session, day and owned workout. Client completion UPDATE is closed.
The bonus accepts a completed set with a real positive reps/duration/distance
value or a nonempty actual_text for a free block, never a planned fallback.

The 50 XP challenge_completed reward is disabled for V1: the current collective
threshold rule is frontend-only. Historical events and earned badges remain.
Activity/challenge creation and reaction award calls are removed from the
frontend; their triggers are authoritative.

## Intentional limits

- Activities, actual_sets, manual mastery entries and steps are declarations,
  not physical proof or device attestation. Health Connect source labels are
  not cryptographically verified. This patch validates reward rules, not effort.
- No historical ledger/profile reconciliation is performed. An existing offset
  between SUM(xp_amount) and profiles.total_xp is retained; future increments
  are coherent. Existing forged events/badges are not retroactively removed.
- Old interaction-ID rewards are matched while their interaction rows exist.
  Already-deleted historical reactions cannot be reconstructed. All new
  rewards use stable identities; deletion/recreation cannot award them twice.
- Creation/share bonuses use current persisted evidence, not an immutable
  action log. Eligible old objects with no prior reward can be evaluated once.
- Legacy workouts without actual_sets remain readable but cannot claim a new
  completion reward through the new RPC.
- Daily clients persist a local day without a timezone. Validation uses the
  legal UTC-12..UTC+14 window; creating daily selections is authenticated and
  bounded to UTC today +/- one day. Calendar UI boundary tests remain necessary.
- calculate_level's existing SQL level-20 ceiling versus the frontend's higher
  levels is unchanged. Daily streak/calendar UI behavior needs real-device QA.
- PGlite API calls are queued. Real PostgreSQL multi-connection contention and
  Android A/B acceptance remain production/staging tests, not locally proven.
- Existing program/daily completion flows can skip a bonus retry after a
  completion row already exists; the new RPC can safely reevaluate that proof,
  but a separate retry UX improvement is not included.

## Deployment

1. Review supabase/migrations/20261004_v1_1b_reward_integrity.sql in full.
2. Prepare the matching frontend release without publishing it.
3. Pause user acceptance tests during a coordinated short release window.
4. Apply the entire BEGIN/COMMIT migration in Supabase SQL Editor manually.
   Any preflight or SQL failure requires rollback and a complete corrected retry.
5. Publish the matching frontend immediately and wait for Vercel Ready.
6. Reload Android's Vercel WebView before testing. No native change/new APK.

Neither release order is fully compatible: the old frontend writes closed
reward tables; the new frontend requires new RPCs. During the short SQL-first
window, core inserts and trigger/mastery rewards work, but old client secondary
bonuses/badge requests fail. Do not use real workouts during that window.
Returning only to the old frontend is not a valid rollback. Do not reopen the
unsafe RPCs/table writes as an emergency workaround.

## Local validation

node scripts/test-v1-1b-rewards.cjs --runtime=tmp/v1a-sql-runtime/node_modules

The schema-only fixture reproduces production public columns, types,
constraints, indexes, relevant functions and policies; auth.users is a minimal
explicit stub. It contains no exported user data.
The suite executes the whole migration twice, exercises anon/A/B abuse,
legitimate rewards, aliases, caps, reactions, completions, badges, mastery XP,
and checks late-error rollback plus type-divergence preflight.

Also run existing V1-1A, Live 5B/5C, Activity V2, workout snapshot/actual-values/
exercise-history and activity-masteries tests, build, lint, TypeScript versus
HEAD and git diff --check.

## Immediate staging/production acceptance

- anon/A/B cannot call internal XP/badge primitives or write ledgers/badges.
- A cannot evaluate B's history, completion or badges; arbitrary amounts/types
  and nonexistent targets cannot grant rewards.
- Manual challenge activity and standalone Live each award creation once.
- Live offline/retry preserves its UUID and has no second creation award.
- Challenge create/join/invitation/leave and program editing/copying still work.
- Session completion with one real set plus skipped sets awards 10 XP once.
- Program and daily proofs are coherent; near-midnight local days work.
- Like/boost rewards the recipient, self-reactions do not, private activities
  are blocked, recreation is deduplicated, and daily caps hold concurrently.
- Merited badges unlock once; legacy aliases do not duplicate canonical badges.
- Workout/activity mastery retries do not duplicate level XP.
- Profile/leaderboard show new increments; compare pre/post offsets rather than
  expecting historical counters to have been repaired.

Never stage security-audit/, tmp/, datasets, tsconfig.tsbuildinfo or build outputs.
