# V1-2A: auth and account lifecycle

Local working tree only: no production SQL, staging, commit or push.
Production schema evidence remains untouched in security-audit/.
The schema-only fixture validates public columns, types, nullability and FKs
against the actual exported catalogue before applying V1-2A.

## Final deletion architecture

POST /api/account/delete verifies the current Bearer through Auth. The target
UUID is always the verified user, never a UUID from the request body.
First deletion requires password confirmation through a non-persisting Auth
client. Passwords and Bearers are never logged or saved by the deletion helper.
Service-role credentials remain server-only.

cleanup_account_data(uuid) is service-role-only, transactional, idempotent and
serialized per user. It removes business data and inserts account_deletion_state
(user_id, cleanup_completed_at) in the same transaction. Its Auth FK cascades
only after Auth deletion succeeds. Auth is never banned. If Admin deletion
fails, A can sign in later with a fresh token, even without a profile, and retry
without password re-confirmation because cleanup is already durable.

A private BEFORE-write guard freezes normal client business mutations while
pending deletion, including indirect SECURITY DEFINER reward writes. The guard
and cleanup take the same account advisory lock. The own-status RPC takes no
UUID and returns only whether auth.uid() has pending cleanup. AppShell checks
this before profile provisioning and displays finalization/logout instead of
normal page children. Live recovery performs the same check before native
recovery. Network uncertainty fails closed; normal GPS already running is not
stopped merely by a retryable Auth network failure.

## Lost response and local purge

Before POST, localStorage holds an owner-scoped marker with a random UUID proof
and a confirmation flag. Multiple owners' markers cannot overwrite each other.
The server stores only its SHA-256 hash and the verified Auth UUID in private
account_deletion_confirmations. Its FK uses SET NULL: a NULL UUID is the durable
acknowledgement of successful Auth deletion, including if the response is lost.
The GET endpoint accepts the random proof only to return that boolean. It cannot
authorize deletion, access a user's data or select a target UUID. There is no
15-minute limit. Anonymous hashes remain for lost-response confirmation; no
email, password, Bearer, GPS or user UUID remains after Auth deletion.

Server success persists confirmation BEFORE native/local purge. Boot rechecks
unconfirmed markers and replays confirmed incomplete purges before rendering
normal page children or recovering a GPS Live. An unavailable confirmation
service blocks that gate rather than exposing retained data. Markers are removed
only after purge succeeds. Purging A preserves B's WebView Auth, snapshots and
outbox. A's cached Auth session is signed out locally; no profile is required.

Native purge first waits for service stop, then removes ALL *.ndjson files in
the dedicated files/live-tracking directory and all tracking preferences.
This intentionally includes legacy ownerless/orphan GPS journals and any other
account's retained native GPS journal on this device, as explicitly authorized.
It does NOT remove other application files or B's WebView snapshots/outbox.
Failed file deletion/preferences commit rejects purge and retains the marker.
Late callbacks after service destruction cannot recreate a deleted journal.
Native owner transitions and cache reset prevent stale owner authorization.

## Daily sessions and collective data

daily_sessions.session_id becomes nullable with ON DELETE SET NULL.
A's training_session is removed, but the daily record and B's completion remain.
Completion loading precedes source-session lookup; NULL/missing sources display
Seance indisponible, with the saved completion still visible.
Production ensure_daily_session_for_date uses NOT EXISTS, so NULL source IDs
do not poison future selection. Existing daily records remain unchanged.

Personal activities are DELETE, including their route_trace.
Collective challenge contributions may remain with user_id/user_email/comment/
activity_name/exercise_type cleared and metadata emptied (including GPS).
Retained fields: activity/challenge IDs, sport, distance/duration, unit type/value,
elevation, source, timestamps and reaction counts, needed for collective records.
Challenges keep their voluntarily published free text; structured created_by
is cleared. No automatic rewriting or semantic anonymization of free text.
Membership, personal history, progress, rewards, programs, sessions and profile
are removed. B's owned records remain. Legacy program completions referencing
A's program/schedule are also detached through nullable SET NULL foreign keys;
their completion timestamps/history remain. Existing other SET NULL references
are retained. Normal owned-program completion rules and rewards do not change.

## Logout, reset and backups

Logout is different: stop native tracking and sign out, but retain owner-scoped
drafts. B cannot adopt A's draft; A can restore it after reconnecting.
Workout snapshots use both an owner namespace and checked owner field, and
saving rechecks the actual authenticated user. Legacy ownerless drafts are
not adopted. Existing Live UUID/finalization/outbox mechanics remain unchanged.
Android backup and device transfer are excluded for private app data.

Forgot/reset uses https://a-ctyv.fr in a browser. Redirect validation rejects
external/encoded hostile paths. PASSWORD_RECOVERY or validated PKCE recovery
is required; a forged type=recovery with an ordinary session is insufficient.
Capacitor server.url is unchanged, preserving the origin of existing drafts.
No Supabase Dashboard setting was changed. SMTP sender target is contact@a-ctyv.fr;
SPF/DKIM/DMARC and exact callback/reset redirect allowlists remain manual.

## Files

Existing V1-2A files remain in the patch. Corrective additions:
lib/account-deletion.ts; lib/daily-sessions.ts; app/session-du-jour/page.tsx;
lib/training-programs.ts; lib/user-statistics.ts (nullable completion references).
The same single local migration is replaced:
supabase/migrations/20261004_v1_2a_account_cleanup.sql.
scripts/test-account-lifecycle.cjs covers corrected behavior, not the old refusal.
Never stage security-audit/, tmp/, exercise-dataset-main/, dataset/,
tsconfig.tsbuildinfo, APK or build output.

Final git status --short (nothing staged):
```text
 M android/app/src/main/AndroidManifest.xml
 M android/app/src/main/java/fr/actyv/app/tracking/LiveTrackingPlugin.java
 M android/app/src/main/java/fr/actyv/app/tracking/LiveTrackingService.java
 M app/(auth)/login/page.tsx
 M app/(auth)/signup/page.tsx
 M app/api/account/delete/route.ts
 M app/auth/callback/AuthCallbackClient.tsx
 M app/profile/page.tsx
 M app/session-du-jour/page.tsx
 M app/sessions/[id]/live/page.tsx
 M app/sessions/[id]/page.tsx
 M components/AppShell.tsx
 M hooks/useLiveTracking.ts
 M lib/daily-sessions.ts
 M lib/live-tracking/platform/index.ts
 M lib/live-tracking/platform/types.ts
 M lib/supabase.ts
 M lib/training-programs.ts
 M lib/user-statistics.ts
 M scripts/test-v1-1a-security.cjs
?? android/app/src/main/res/xml/account_data_extraction_rules.xml
?? app/forgot-password/
?? app/reset-password/
?? docs/security/v1-2a-account-lifecycle.md
?? exercise-dataset-main/
?? lib/account-deletion.ts
?? lib/account-lifecycle.ts
?? lib/account-storage.ts
?? lib/auth-navigation.ts
?? scripts/fixtures/v1-2a-production-schema.json
?? scripts/test-account-lifecycle.cjs
?? security-audit/
?? supabase/migrations/20261004_v1_2a_account_cleanup.sql
?? tmp/
?? tsconfig.tsbuildinfo
```

## Local validation

Run node scripts/test-account-lifecycle.cjs --runtime=tmp/v1a-sql-runtime/node_modules.
Uses a disposable PGlite database and frontend/API mocks, never production.
Checks twice-applied migration, production schema/FKs, service-only cleanup,
A/B/anon, pending write denial, daily preservation, personal GPS removal,
collective anonymization, retryable Auth failure, fresh-token retry without
profile/password, body UUID ignored, recovery flow, owner-isolated logout drafts,
lost response/restart and failed native purge with durable marker replay.
The remaining regressions cover V1-1A/B, challenge INSERT RETURNING, Live5B/C,
ActivityV2/detail, workout snapshots/actual values/history and activity masteries.
Existing arithmetic/static suites do not constitute live PostgreSQL concurrency
or physical Android tests.

Final validation: account lifecycle and all listed regression suites PASS;
web build PASS; lint 0 errors / 8 existing warnings; diff --check PASS;
Android assembleDebug BUILD SUCCESSFUL. TypeScript has 8 existing diagnostics,
versus 14 at HEAD, with no new file/code/message diagnostics. Compilation skips
Next type validation as configured by the existing project; tsc is checked
separately and is not claimed clean. Build/SDK sandbox read failures were resolved
by allowing only those local compilation commands outside the sandbox.

## Deployment and physical acceptance

1. Review and approve this local patch. Do not deploy it during this task.
2. Prepare the rebuilt APK and a coordinated maintenance/update window.
3. Manually run the COMPLETE final migration with BEGIN/COMMIT; do not extract
   individual statements. It has never been applied in production.
4. Deploy the corresponding web code only after the migration. Wait Vercel Ready.
5. Install the new APK with the same signing identity over the existing app.
   Old APKs must update: they lack the required owner/purge API or full orphan
   purge. Do not uninstall automatically; that destroys drafts.
6. Verify signup/login, real recovery emails and expired/reused recovery links.
7. Disposable A/B: A public daily source, B completes it, delete A; source gone,
   daily record still present with NULL source, B completion remains visible.
8. Simulate Admin failure in a controlled environment: A reconnects after >1 hour,
   no recreated profile/business access, finalizes; B cannot finalize A.
9. Kill app after server success before purge and after lost response; reopen,
   confirm marker replay before B Live access and no A GPS/outbox/snapshot.
10. Check orphan NDJSON removal and untouched non-GPS app files on Android.
11. Logout A -> B -> A: drafts retained but isolated; interruption rebase remains.
12. Recheck legitimate XP/Masteries, challenge invitations/programs, maps/history.

SMTP, Auth Admin failure, physical process kill and OEM backup behavior require
real acceptance testing. No production deletion or device installation was done.
SQL cleanup and Auth deletion are separate, irreversible transactions; rollback
of frontend cannot restore removed data. Do not restore the old ban/receipt
endpoint or relax owner checks for compatibility.
