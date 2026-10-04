# V1-1A: local review before production

Migration: `supabase/migrations/20261004_v1_1a_account_isolation.sql`.
The first production attempt failed before COMMIT and was rolled back. This
corrected local version has NOT been applied. No production writes are part of testing.

## Production findings and app callers

The supplied catalog has 931 records. `profiles` and legacy `program_sessions`
have RLS disabled; activities/challenges/members have permissive ALL/true
policies. Shared training programs are enumerable without an invitation code.
The migration replaces the complete policy sets on the eight targeted tables,
including any older equivalent policies, because permissive policies combine
with OR. It does not change user data or any XP/badge/Mastery engine.

Current app writes memberships only through `challenge_participants` and the
existing `join_challenge_by_invite_code` RPC. Challenge creation inserts its
creator with role `admin`; direct community join inserts role `participant`.
There are no app readers/writers for the legacy table `program_sessions` (it
contains challenge plans, not the active `training_program_sessions`).
Challenge details/counters use activities, both membership tables and public
profile summaries. Leaderboard and bank already need only public profile fields.
Personal Live retry INSERTs then SELECTs the original activity UUID; no UPDATE
is required. Owner-scoped History and Activity V2 queries are unchanged.

## Policies and privileges

| Table | New policies / client rights |
| --- | --- |
| profiles | Authenticated own SELECT; own UPDATE with UPDATE(username) only. No client INSERT/DELETE or XP/level column writes. |
| activities | Authenticated own or visible-challenge SELECT; own INSERT for standalone live or visible challenge; own DELETE. No client UPDATE. |
| challenges | Authenticated community/owner/member SELECT; creator INSERT/UPDATE/DELETE. No anonymous challenge discovery. |
| challenge_members | Authorized challenge viewers SELECT; own/creator DELETE, including safe legacy self-email leave. No client INSERT/UPDATE. |
| challenge_participants | Authorized challenge viewers SELECT; self INSERT into visible challenge; participant role, or creator admin role; self/creator DELETE. |
| program_sessions | RLS enabled, no policies, no client grants; existing rows preserved. |
| training_programs | Owner CRUD; authenticated public catalog SELECT. No table access to another owner's shared program. |
| training_program_sessions | Parent-owner CRUD; authenticated public-parent SELECT. No blanket shared-parent SELECT. |

Removed production policies include `allow all activities`, `Activities are
viewable by authenticated users`, `allow all challenges`, `secure update
challenge`, `allow all members`, `Participants are viewable by authenticated
users`, both general shared-program read policies, and the old owner policies.
Safe owner policies are recreated under explicit `v1a_*` names.

Caller-scoped SECURITY DEFINER challenge helpers bypass the recursive
challenges/members/participants policy graph. They accept only challenge UUIDs,
never user UUIDs. Production challenge_members has no user_id: a legacy email matches only if both emails
are nonempty; the JWT, not profiles.email, supplies the caller email. Existing
legacy role strings do not grant challenge mutation rights. An is_deleted
challenge is not visible. The leaderboard's existing `community` visibility
remains readable by authenticated users only. The production visibility CHECK
allows private/community, not public. The separate is_public column does not
introduce a new sharing contract; anonymous challenge access is not enabled.
Choosing a challenge remains the explicit sharing context for its activities;
standalone personal GPS is never visible to another account.

Table and column grants are both reset on targeted tables. This removes old
column-level XP/level grants that survive a table-level REVOKE. Only required
rights are granted back, with no TRUNCATE/REFERENCES/TRIGGER privileges.
The same three unused privileges are removed on training_program_completions;
its existing owner CRUD policies and normal grants are untouched.

## Profile initialization and public display

`ensure_own_profile()` accepts no arguments, requires auth.uid(), and initializes
only that auth.users row with server-chosen XP=0/level=1. ON CONFLICT(id) DO
NOTHING leaves an existing profile and its XP intact. Existing server XP
functions and service-role writes retain their rights. The frontend signup
stores the requested username in auth user metadata; if email confirmation
means there is no session yet, initialization waits until authenticated login.
AppShell and the Profile loader call the idempotent provisioning RPC.
Provisioning takes a transaction advisory lock scoped to auth.uid(), returns
the actual profile as JSON, and leaves existing rows unchanged. If the requested
username conflicts with profiles_username_key, it retries with
Utilisateur_<12 random hex characters>. Only that specific unique violation is
handled; unrelated constraints still fail. Existing rules require a nonempty
username and uniqueness, with no discovered format restriction. The generated
suffix contains no email or account UUID. The unique constraint remains final
authority even in the unlikely event of a generated-name collision.
The loader no longer manufactures a profile when provisioning fails. Username
UPDATE requests only username, uses the freshly authenticated UID, and requires
a matching returned row before showing success. Empty results, unique/RLS
errors and network failures show errors and release the saving state.
The profile editor UPDATEs username only; it no longer upserts identity/email/XP.
Email changes are not part of the current profile editor.

`v1a_public_profiles` explicitly exposes id, username, level, total_xp, never
email. The four existing summary readers switch to it. Client rights on the
legacy public_profiles view are revoked only if it exists, without dropping it
or assuming its layout. The production export confirms that it is absent.
Existing private profile reads remain owner scoped.

## Production schema reconciliation (2026-10-04)

The complete supplied export contains 11 inspected relations (10 present,
public.public_profiles absent), 127 columns, 43 constraints and 37 indexes.
Its local filename is security-audit/actyv-production-schema-v1a.csv.csv.
No source audit files are changed or intended for Git.
scripts/fixtures/v1-1a-production-schema.json contains schema metadata only,
not user data. The SQL fixture reproduces every exported column, type, default,
nullability, generated expression, constraint and index. Only FK targets outside
the export (training_sessions and workout_sessions_history) use minimal stubs.
Auth functions/roles and initial permissions are local test infrastructure.
PostgreSQL 18 NOT NULL catalog constraints are normalized out because production
represents them through column nullability, which is compared separately.

All 39 referenced business columns across the 10 required relations are listed
in a deployment preflight, compared against the schema snapshot, and audited
in the actual function/policy SQL. A missing relation/column fails before any
policy replacement. Program preview columns all exist; extra legacy program
columns (workout_id/day_number/position) are preserved unchanged.
The frontend no longer selects or filters challenge_members.user_id; UUID
membership stays in challenge_participants and legacy membership uses email.
The account deletion path likewise keeps only the existing email-based cleanup.
No column is added to challenge_members and no membership data is converted.

## Shared programs

`get_shared_program_preview(code)` returns the same minimal preview fields and
scheduled sessions for an exact nonempty active shared code. It returns NULL
for invalid/nonshared codes and does not expose other codes or private profile
fields. Anonymous preview remains available before login. The existing join
page uses this RPC instead of direct shared-table reads; its copy workflow is
unchanged. A copy stays private and belongs to the authenticated user.

## Local validation

Static checks:

```powershell
node scripts/test-v1-1a-security.cjs
```

Executable PostgreSQL tests use a disposable PGlite runtime installed only
under tmp (no application dependency or package/lockfile changes):

```powershell
npm install --prefix tmp/v1a-sql-runtime --cache tmp/v1a-npm-cache --no-package-lock --ignore-scripts --no-audit --no-fund @electric-sql/pglite
node scripts/test-v1-1a-security.cjs --runtime=tmp/v1a-sql-runtime/node_modules
```

The runner creates an in-memory PostgreSQL with production-matched tables and synthetic roles/data;
applies the COMPLETE migration twice; checks stable policies and preserved
rows; exercises real SET ROLE/JWT/RLS/column-grant behavior for A/B/anon;
tests personal GPS, challenge reads/writes/join/leave, legacy emails, shared
code preview, profile provisioning/editing, TRUNCATE denial, owner/public
programs and copied schedules. It never loads production credentials and
cannot execute these fixtures against a remote database.
New tests cover free/taken metadata usernames, fallback creation, returned
profiles, retries, unique conflicts, email/foreign writes and the actual frontend
save handler. PGlite queues concurrent requests on one connection; genuine
multi-connection contention must also be checked on staging. The SQL advisory
transaction lock provides that serialization in PostgreSQL.
The fixture is ONLY for local tests, never for production. Constraint/index and
column equality checks prevent it silently introducing a nonexistent user_id
or permissive visibility values. The existing repository invitation RPC is
executed unchanged with local reward-call stubs; its production definition and
server XP triggers are not supplied in the schema export. Manual production
smoke tests remain mandatory. Missing-column preflight and late-statement
failure tests verify transactional rollback of policy changes.

## Application procedure (manual, after review)

1. Review the complete migration, this document and diff. Do not commit tmp,
   security-audit, dataset or build outputs.
2. Test on a Supabase staging clone first, including existing invitation RPCs,
   public profile view dependencies, signup with/without email confirmation,
   usernames already used, and references to private sessions in shared copies.
3. Coordinate a maintenance window: the old web version sends forbidden profile
   fields and the new version needs the new RPCs/view. Do not leave these
   versions mismatched. Apply the WHOLE migration in the SQL Editor as postgres
   and immediately release the matching web code; then wait for Vercel Ready.
4. Re-export policies/RLS/grants to verify no ALL/true policies survive on these
   tables and profiles XP/level have no client INSERT/UPDATE privileges.
5. Test two accounts and anon: own username works; foreign profiles/GPS/writes
   denied; explicit public profile summaries work; private challenge inaccessible
   until valid invitation; community join and own leave work; owner soft-delete
   works; stranger mutations and admin-role spoof rejected.
6. Test Live 5B online/offline/retry and 5C recovery with the same UUID, History
   entry and Activity V2 owner map, workout completion/Masteries, public bank,
   own programs, invalid/valid shared code, private copy and session launch.
7. Recheck legitimate XP/badge flows, whose engines are unchanged. Their older
   RPC vulnerabilities and direct xp_events/user_badges writes are NOT fixed by
   V1-1A; the follow-up V1-1B remains required before claiming full security.

No Android native changes: no APK rebuild or Android sync is needed.
The file applies no data corrections and does not repair previously falsified
memberships/profiles or historical ownership; cleanup requires a separate audit.
