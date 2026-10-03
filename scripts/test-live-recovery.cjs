const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const ts = require('typescript');
const { spawnSync } = require('node:child_process');
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file);
  const loaded = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(code, { module: loaded, exports: loaded.exports, Date, Math, Number,
    require: name => load(name.startsWith('@/') ? name.replace('@/', '') + '.ts' : path.resolve(path.dirname(file), name + '.ts')),
  });
  cache.set(file, loaded.exports); return loaded.exports;
}
const recovery = load('lib/live-tracking/recovery.ts');
const { getActiveDurationMs } = load('lib/live-tracking/timer.ts');
const { replayLivePoints, finalizeLiveActivity } = load('lib/live-tracking/finalization.ts');
const { synchronizeLiveActivity } = load('lib/live-tracking/activity-sync.ts');
const owner = '00000000-0000-0000-0000-000000000001';
const id = '11111111-1111-4111-8111-111111111111';
const start = 100000;
const event = (type, seconds, estimated = false) => ({ type, atMs: start + seconds * 1000, estimated });
const point = (sequence, seconds, longitude = sequence * 0.0001, altitude = 100) => ({
  sessionId: id, sequence, timestamp: start + seconds * 1000, latitude: 0, longitude,
  altitude, accuracy: 5, speed: null, heading: null,
});
const native = { sessionId: id, ownerUserId: owner, sport: 'marche', startedAtMs: start,
  trackingStatus: 'running', serviceRunning: true, lastSequence: 2, stoppedAtMs: 0,
  truncatedTail: false, events: [event('START', 0), event('COLLECTION_RESUME', 0)], points: [point(1, 0), point(2, 10)] };
async function main() {
  const a = recovery.reconstructNativeSession(native, owner);
  const b = recovery.reconstructNativeSession(native, owner);
  assert.equal(a.state.sessionId, id); assert.equal(b.state.sessionId, id);
  assert.equal(a.state.distanceM, b.state.distanceM);
  assert.ok(a.state.distanceM > 10 && a.state.distanceM < 12);
  assert.equal(replayLivePoints(a.state, native.points).distanceM, a.state.distanceM);
  console.log('A/B PASS: native-only reconstruction, same UUID/metrics, repeated replay deduplicated');
  const paused = recovery.reconstructNativeSession({ ...native, trackingStatus: 'paused',
    events: [...native.events, event('PAUSE', 15)] }, owner).state;
  assert.equal(paused.status, 'paused'); assert.equal(getActiveDurationMs(paused, start + 90000), 15000);
  console.log('E PASS: recovered pause remains paused, active time frozen');
  const interrupted = { ...native, lastSequence: 4, points: [...native.points, point(3, 40, 1, 900), point(4, 50, 1.0001, 900)],
    events: [...native.events, event('INTERRUPTION', 10, true), event('COLLECTION_RESUME', 40)] };
  const r = recovery.reconstructNativeSession(interrupted, owner).state;
  assert.equal(getActiveDurationMs(r, start + 50000), 20000);
  assert.ok(r.distanceM > 20 && r.distanceM < 24); assert.equal(r.elevationGainM, 0);
  assert.ok(r.recoveryWarning);
  const gapPaused = recovery.reconstructNativeSession({ ...interrupted,
    events: [...interrupted.events, event('PAUSE', 5), event('RESUME', 45)] }, owner).state;
  assert.equal(getActiveDurationMs(gapPaused, start + 50000), 10000);
  console.log('F/G/H PASS: gap excluded, no distant A-B segment or altitude jump, overlap not double-excluded');
  const stopped = recovery.reconstructNativeSession({ ...native, serviceRunning: false, trackingStatus: 'stopped',
    stoppedAtMs: start + 20000, events: [...native.events, event('STOP', 20)] }, owner).state;
  assert.equal(getActiveDurationMs(stopped, start + 90000), 20000);
  const local = recovery.recoverCheckpointOnly({ version: 1, state: a.state, updatedAtMs: start + 10000 }, owner);
  assert.equal(getActiveDurationMs(local.state, start + 90000), 10000);
  assert.equal(local.state.distanceM, a.state.distanceM);
  const dead = recovery.reconstructNativeSession({ ...native, serviceRunning: false }, owner).state;
  assert.equal(getActiveDurationMs(dead, start + 90000), 10000);
  console.log('PASS: stopped native/checkpoint-only/dead service do not fabricate later active time');
  assert.throws(() => recovery.reconstructNativeSession(native, 'other'));
  assert.throws(() => recovery.recoverCheckpointOnly(a, 'other'));
  assert.throws(() => recovery.reconstructNativeSession({ ...native, lastSequence: 3 }, owner));
  console.log('L PASS: owner mismatch refused and missing native points reported');
  let saved, cleanups = 0;
  const final = await finalizeLiveActivity({ getState: () => r, stopCollection: async () => {},
    drainPoints: async () => {}, persist: snapshot => { saved = snapshot; }, cleanup: async () => { cleanups++; }, now: () => start + 50000 });
  assert.equal(final.sessionId, id); assert.equal(saved.sessionId, id); assert.equal(cleanups, 1);
  assert.equal(final.activeDurationMs, 20000);
  console.log('I PASS: recovered state uses original 5B finalization');
  const rows = new Map(); let insertBonuses = 0, failRpc = true;
  const dependencies = { getUser: async () => ({ id: owner }),
    insert: async payload => { if (rows.has(payload.id)) throw { code: '23505' }; rows.set(payload.id, payload); insertBonuses++; },
    find: async key => rows.get(key), processMasteries: async () => { if (failRpc) { failRpc = false; throw new Error('network'); } }, persist: () => {} };
  await assert.rejects(() => synchronizeLiveActivity(final, dependencies));
  await Promise.all([synchronizeLiveActivity(final, dependencies), synchronizeLiveActivity(final, dependencies)]);
  assert.equal(rows.size, 1); assert.equal(insertBonuses, 1);
  console.log('J/K PASS: network retry/concurrent finish share UUID, one activity/insert bonus (mock DB)');
  const manager = fs.readFileSync('android/app/src/main/java/fr/actyv/app/tracking/LiveTrackingManager.java', 'utf8');
  const plugin = fs.readFileSync('android/app/src/main/java/fr/actyv/app/tracking/LiveTrackingPlugin.java', 'utf8');
  const hook = fs.readFileSync('hooks/useLiveTracking.ts', 'utf8');
  assert.ok(manager.includes('if (getSessionId(context) != null) throw'));
  assert.ok(!manager.slice(manager.indexOf('public static void beginSession'), manager.indexOf('public static void markPaused')).includes('deleteSessionFile'));
  assert.ok(plugin.includes('LIVE_SESSION_UNRESOLVED_OR_OWNER_MISSING'));
  assert.ok(plugin.includes('owner.equals(LiveTrackingManager.getOwner'));
  assert.ok(hook.includes("window.confirm('Abandonner cette activite"));
  const abandon = hook.slice(hook.indexOf('const discardSession'), hook.indexOf('const activeDurationMs'));
  assert.ok(abandon.indexOf('window.confirm') < abandon.indexOf('stopTracking'));
  assert.ok(abandon.indexOf('clearSession(sessionId)') < abandon.indexOf('clearLiveTrackingSession()'));
  console.log('M/N PASS: non-overwrite and confirmed, session-targeted abandon (structural guards)');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'actyv-recovery-'));
  const javaHome = process.env.JAVA_HOME || 'C:/Program Files/Android/Android Studio/jbr';
  const executable = name => path.join(javaHome, 'bin', name + (process.platform === 'win32' ? '.exe' : ''));
  function run(command, args) {
    const result = spawnSync(command, args, { encoding: 'utf8' });
    if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr || result.stdout);
    if (result.stdout) console.log(result.stdout.trim());
  }
  run(executable('javac'), ['-d', dir, 'android/app/src/main/java/fr/actyv/app/tracking/LiveTrackingFile.java', 'scripts/fixtures/LiveTrackingFileTest.java']);
  run(executable('java'), ['-cp', dir, 'LiveTrackingFileTest', dir]);
  console.log('O: run scripts/test-live-activity-persistence.cjs for the full unchanged 5B/GPS suite. No Supabase writes.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
