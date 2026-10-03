const assert = require('node:assert/strict');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

const migrationPath = 'supabase/migrations/20261003_harden_activity_masteries.sql';
const sql = fs.readFileSync(migrationPath, 'utf8');
const old = fs.readFileSync('supabase/migrations/20260815_fix_activity_mastery_owner_resolution.sql', 'utf8').replace(/\r/g, '');
const current = sql.replace(/\r/g, '');
const candidates = current.slice(current.indexOf('with raw_candidates as ('), current.indexOf('  entry_candidates as ('));
const selections = [...candidates.matchAll(/select '([^']+)'(?:::text as mastery_slug)?, ([^\n]+)\n    where ([^\n]+)/g)];
assert.equal(selections.length, 31); // Includes the existing three swimming mappings.

function getCandidates(sport, distance = 0, duration = 0) {
  return selections.flatMap(([, slug, expression, condition]) => {
    const js = condition.replace(/\band\b/g, '&&').replace(/(?<![<>!])=(?!=)/g, '===');
    const accepted = new Function('v_normalized_sport', 'v_distance_km', 'v_duration_minutes', 'return ' + js)(
      sport, Math.max(distance ?? 0, 0), Math.max(duration ?? 0, 0)
    );
    if (!accepted) return [];
    const value = expression === 'v_distance_km as value' || expression === 'v_distance_km'
      ? distance : expression === 'v_duration_minutes' ? duration : Number(expression.replace('::numeric', ''));
    return [[slug, value]];
  });
}
const asMap = (...args) => Object.fromEntries(getCandidates(...args));
assert.equal(asMap('course-a-pied', 5, 60)['distance-cap'], 5);
console.log('A PASS: 5 km remains 5 km');
assert.equal(asMap('course-a-pied', 5, 60)['duree-cap'], 60);
console.log('B PASS: 60 min remains 60 min');
assert.equal(asMap('course-a-pied', 5, 60)['sorties-cap'], 1);
console.log('C PASS: one occurrence');
for (const sport of ['course-a-pied', 'trail', 'marche', 'velo', 'vtt']) {
  assert.ok(getCandidates(sport, 12, 90).every(([slug]) => !slug.startsWith('dplus-')));
}
assert.deepEqual(asMap('trail', 12, 90), { 'distance-trail': 12, 'duree-trail': 90, 'sorties-trail': 1 });
assert.ok(current.includes('activities.elevation_gain_m'));
assert.ok(current.includes("'elevation_gain_m', case"));
assert.ok(!/update\s+public\.activities|delete\s+from\s+public\.activities/i.test(current));
console.log('D PASS: no D+ candidate, activity elevation untouched');
assert.match(current, /on conflict \(user_id, mastery_id, source, source_ref_id\)[\s\S]+?do nothing/);
assert.ok(current.includes('if v_inserted_entries_count > 0 then'));
assert.ok(current.indexOf('pg_catalog.pg_advisory_xact_lock') < current.indexOf('into v_before_unlocks'));
assert.ok(current.includes("'actyv:activity-masteries:' || v_auth_user_id::text"));
assert.ok(current.includes("      'activity',\n      v_activity.id,"));
console.log('E/F PASS (static): uniqueness retained, transaction/user lock before snapshot, zero-insert guard');
assert.equal(getCandidates('unknown', 5, 60).length, 0);
console.log('G PASS: unsupported sport');
assert.deepEqual(asMap('course-a-pied', null, null), { 'sorties-cap': 1 });
assert.deepEqual(asMap('trail', 0, 0), { 'sorties-trail': 1 });
console.log('H PASS: no invented distance/duration');
assert.ok(current.includes("raise exception 'ACTIVITY_FORBIDDEN'"));
assert.ok(current.includes('v_owner_user_id is distinct from v_auth_user_id'));
assert.ok(current.includes("set search_path = ''"));
console.log('I PASS (static): ownership and authentication retained');

// Prove the migration differs only by D+ removal, serialization and retry guard.
let reconstructed = current.replace('-- Patch 5A: activity distance/duration/count only; no automatic elevation entries.\n', '');
reconstructed = reconstructed.replace(/  -- Shared by all activity mastery calls[\s\S]+?\n  \);\n\n/, '');
const guardStart = reconstructed.indexOf('  -- A pure retry cannot report XP from unrelated unlocks.\n');
const guardEnd = reconstructed.indexOf('\n  end if;', guardStart);
assert.ok(guardStart > 0 && guardEnd > guardStart);
const guard = reconstructed.slice(guardStart, guardEnd).split('\n').slice(2).map(line => line.slice(2)).join('\n');
reconstructed = reconstructed.slice(0, guardStart) + guard + reconstructed.slice(guardEnd + '\n  end if;'.length);
let expected = old;
for (const [suffix, sport] of [['cap', 'course-a-pied'], ['trail', 'trail'], ['marche', 'marche'], ['velo', 'velo'], ['vtt', 'vtt']]) {
  expected = expected.replace("    union all\n    select 'dplus-" + suffix + "', v_elevation_gain_m\n    where v_normalized_sport = '" + sport + "' and v_elevation_gain_m > 0\n\n", '');
}
assert.equal(reconstructed.trim(), expected.trim());
assert.equal(asMap('course-a-pied', 43, 60)['marathons-termines'], 1);
assert.equal(asMap('trail', 85, 90)['trails-80km'], 1);
assert.equal(asMap('marche', 31, 60)['randonnees-30km'], 1);
assert.equal(asMap('velo', 105, 60)['sorties-velo-100km'], 1);
assert.equal(asMap('course-a-pied', 0.7, 1.5)['distance-cap'], 0.7);
assert.equal(asMap('course-a-pied', 0.7, 1.5)['duree-cap'], 1.5);
console.log('PASS: all other SQL unchanged; thresholds and fractional values retained');

// Optional REAL PostgreSQL suite. Requires psql + local admin CREATEDB access.
// Creates and drops its own disposable database; never connects to Supabase.
async function postgresTests() {
  const raw = process.env.ACTYV_TEST_POSTGRES_URL;
  assert.ok(raw, 'Set ACTYV_TEST_POSTGRES_URL to a LOCAL PostgreSQL admin URL');
  const url = new URL(raw);
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Remote PostgreSQL forbidden');
  assert.ok(!url.search, 'Connection URL options are forbidden');
  const dbName = 'actyv_test_5a_' + process.pid + '_' + Date.now();
  const testUrl = new URL(url);
  testUrl.pathname = '/' + dbName;
  function query(connection, statement) {
    return new Promise((resolve, reject) => {
      const child = spawn('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-d', connection.toString()], { stdio: ['pipe', 'pipe', 'pipe'] });
      let out = '', error = '';
      child.stdout.on('data', chunk => { out += chunk; });
      child.stderr.on('data', chunk => { error += chunk; });
      child.on('error', reject);
      child.on('close', code => code === 0 ? resolve(out.trim()) : reject(new Error(error)));
      child.stdin.end(statement);
    });
  }
  let created = false;
  try {
    await query(url, 'create database ' + dbName + ';');
    created = true;
    await query(testUrl, fs.readFileSync('scripts/fixtures/activity-masteries.sql', 'utf8'));
    const engine = fs.readFileSync('supabase/migrations/20260810_add_mastery_progression_engine.sql', 'utf8');
    const unlocks = engine.slice(engine.indexOf('create or replace function public.process_mastery_unlocks('), engine.indexOf('drop trigger if exists mastery_entries_after_insert'));
    const resolver = fs.readFileSync('supabase/migrations/20260815_connect_activities_to_masteries.sql', 'utf8');
    const resolveFunction = resolver.slice(resolver.indexOf('create or replace function public.resolve_activity_mastery_sport'), resolver.indexOf('create or replace function public.process_activity_masteries'));
    const rpc = current.slice(current.indexOf('create or replace function'), current.indexOf('revoke all'));
    await query(testUrl, unlocks + resolveFunction + rpc + `
      create trigger mastery_entries_after_insert after insert on public.mastery_entries
      for each row execute function public.handle_mastery_entry_after_insert();
    `);
    const user = '00000000-0000-0000-0000-000000000001';
    const other = '00000000-0000-0000-0000-000000000002';
    function invoke(id, owner = user) {
      return query(testUrl, "set request.jwt.claim.sub = '" + owner + "'; select public.process_activity_masteries('" + id + "');").then(JSON.parse);
    }
    const firstId = '10000000-0000-0000-0000-000000000001';
    const first = await invoke(firstId);
    assert.equal(first.inserted_entries_count, 4); // distance/duration/count/5km
    assert.equal(first.xp_awarded_total, 15); // three actual engine unlocks
    assert.equal(first.processed_masteries.reduce((n, m) => n + m.unlocked_levels.length, 0), 3);
    const retry = await invoke(firstId);
    assert.equal(retry.inserted_entries_count, 0);
    assert.equal(retry.xp_awarded_total, 0);
    assert.ok(retry.processed_masteries.every(m => m.unlocked_levels.length === 0));
    const concurrentId = '10000000-0000-0000-0000-000000000002';
    const responses = await Promise.all([invoke(concurrentId), invoke(concurrentId)]);
    assert.deepEqual(responses.map(r => r.inserted_entries_count).sort(), [0, 3]);
    assert.deepEqual(responses.map(r => r.xp_awarded_total).sort((a, b) => a - b), [0, 15]);
    assert.equal(await query(testUrl, "select count(*) from public.mastery_entries where source_ref_id = '" + concurrentId + "';"), '3');
    assert.equal(await query(testUrl, "select count(*) from public.mastery_entries e join public.masteries m on m.id=e.mastery_id where m.slug like 'dplus-%';"), '0');
    assert.equal(await query(testUrl, "select elevation_gain_m from public.activities where id = '" + concurrentId + "';"), '650');
    assert.equal(await query(testUrl, 'select total_xp from public.profiles where id = ' + "'" + user + "';"), '30');
    assert.equal(await query(testUrl, 'select count(*) from public.xp_events;'), '6');
    const unknown = await invoke('10000000-0000-0000-0000-000000000003');
    assert.equal(unknown.inserted_entries_count, 0);
    assert.equal(unknown.unsupported_sport, true);
    const missing = await invoke('10000000-0000-0000-0000-000000000004');
    assert.equal(missing.inserted_entries_count, 1);
    await assert.rejects(invoke(firstId, other), /ACTIVITY_FORBIDDEN/);
    assert.equal(await query(testUrl, 'select count(*) from public.mastery_entries;'), '8');
    console.log('POSTGRES A-I PASS: real RPC, real unlock/XP engine, two concurrent connections, unchanged D+');
  } finally {
    if (created) await query(url, 'drop database ' + dbName + ';');
  }
}
if (process.argv.includes('--postgres')) {
  postgresTests().catch(error => { console.error(error.message); process.exitCode = 1; });
} else {
  console.log('PostgreSQL concurrency/ownership suite NOT RUN: use --postgres with local psql.');
}
