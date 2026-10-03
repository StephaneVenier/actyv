const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { webcrypto } = require('node:crypto');

const values = new Map();
const localStorage = {
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
  removeItem: key => values.delete(key),
};
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const loadedModule = { exports: {} };
  cache.set(file, loadedModule);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { module: loadedModule, exports: loadedModule.exports, Date, Math, Uint8Array,
    crypto: { getRandomValues: array => webcrypto.getRandomValues(array) }, window: { localStorage },
    require: name => name.startsWith('node:') ? require(name)
      : load(name.startsWith('@/') ? name.replace('@/', '') + '.ts' : path.resolve(path.dirname(file), name + '.ts')),
  }, { filename: file });
  return loadedModule.exports;
}
const { createInitialLiveTrackingState, createLiveSessionId } = load('lib/live-tracking/session.ts');
const { liveTrackingReducer } = load('lib/live-tracking/reducer.ts');
const { buildFinishedLiveActivity, finalizeLiveActivity, replayLivePoints, isLiveUuid } = load('lib/live-tracking/finalization.ts');
const { buildLiveActivityPayload, synchronizeLiveActivity } = load('lib/live-tracking/activity-sync.ts');
const storage = load('lib/live-tracking/storage.ts');
const user = { id: '00000000-0000-0000-0000-000000000001', email: 'test@example.invalid' };
const startedAtMs = 100000;
function running(sport = 'course-a-pied') {
  const state = liveTrackingReducer(createInitialLiveTrackingState(), {
    type: 'START', sport, nowMs: startedAtMs, sessionId: createLiveSessionId(),
  });
  return { ...state, ownerUserId: user.id };
}
function snapshot(sport, distanceM, activeMinutes, elevationGainM = 0) {
  const state = running(sport);
  return buildFinishedLiveActivity({ ...state, distanceM, elevationGainM,
    elevationState: { ...state.elevationState, totalGainM: elevationGainM } }, startedAtMs + activeMinutes * 60000);
}
function backend() {
  const activities = new Map();
  const mastered = new Set();
  let inserts = 0, rpcCalls = 0, bonusXpEvents = 0;
  let failRpc = false, offline = false;
  const dependencies = {
    getUser: async () => { if (offline) throw new Error('offline'); return user; },
    insert: async payload => {
      if (activities.has(payload.id)) throw { code: '23505' };
      activities.set(payload.id, payload); inserts++; bonusXpEvents++;
    },
    find: async id => activities.get(id) ?? null,
    processMasteries: async id => {
      rpcCalls++;
      if (failRpc) { failRpc = false; throw new Error('RPC failed'); }
      mastered.add(id);
    },
    persist: storage.saveFinishedLiveActivity,
  };
  return { activities, mastered, dependencies, setOffline: value => { offline = value; },
    failRpc: () => { failRpc = true; }, counts: () => ({ inserts, rpcCalls, bonusXpEvents }) };
}

async function main() {
  for (let i = 0; i < 20; i++) assert.ok(isLiveUuid(createLiveSessionId()));
  const cap = snapshot('course-a-pied', 5000, 60);
  const api = backend();
  const saved = await synchronizeLiveActivity(cap, api.dependencies);
  assert.equal(saved.syncStatus, 'synced');
  const payload = api.activities.get(cap.sessionId);
  assert.equal(payload.distance_km, 5);
  assert.equal(payload.duration_minutes, 60);
  assert.equal(payload.source, 'live');
  assert.equal(payload.challenge_id, null);
  assert.equal(payload.user_id, user.id);
  assert.equal(payload.metadata.live_session_id, cap.sessionId);
  assert.equal(payload.unit_type, null);
  assert.equal(payload.unit_value, null);
  // Existing monthly-statistics fallback must include BOTH distance and active time.
  const distance = (payload.unit_type || (payload.distance_km !== null ? 'distance' : null)) === 'distance'
    ? payload.unit_value ?? payload.distance_km : 0;
  const duration = (payload.unit_type || (payload.duration_minutes !== null ? 'duration' : null)) === 'duration'
    ? payload.unit_value ?? payload.duration_minutes : 0;
  assert.equal(distance, 5);
  assert.equal(duration, 60);
  assert.equal(api.counts().rpcCalls, 1);
  console.log('A PASS: CAP -> one activity, 5 km, 60 min, RPC');

  const trail = buildLiveActivityPayload(snapshot('trail', 12000, 90, 650), user);
  assert.equal(trail.elevation_gain_m, 650);
  assert.equal(trail.distance_km, 12);
  assert.equal(trail.duration_minutes, 90);
  console.log('B/L PASS: Trail elevation retained; no independent D+/XP processing');
  const bike = buildLiveActivityPayload(snapshot('velo', 25500, 75), user);
  assert.equal(bike.distance_km, 25.5);
  assert.equal(bike.duration_minutes, 75);
  console.log('C PASS: bike units');
  const short = buildLiveActivityPayload(snapshot('marche', 25, 0.5), user);
  assert.equal(short.distance_km, 0.025);
  assert.equal(short.duration_minutes, 0.5);
  console.log('D PASS: short valid activity, no arbitrary minimum');

  const concurrent = snapshot('vtt', 100, 1);
  await Promise.all([synchronizeLiveActivity(concurrent, api.dependencies), synchronizeLiveActivity(concurrent, api.dependencies)]);
  assert.equal(api.activities.size, 2);
  assert.equal(api.counts().bonusXpEvents, 2);
  console.log('E PASS: concurrent synchronization -> one PK, one insert bonus (mock backend)');

  const partial = snapshot('course-a-pied', 5250, 60);
  api.failRpc();
  await assert.rejects(synchronizeLiveActivity(partial, api.dependencies), /RPC failed/);
  assert.equal(storage.loadFinishedLiveActivities().find(row => row.sessionId === partial.sessionId).syncStatus, 'activity_saved');
  const insertCount = api.counts().inserts;
  await synchronizeLiveActivity(partial, api.dependencies);
  assert.equal(api.counts().inserts, insertCount);
  assert.equal(api.activities.get(partial.sessionId).distance_km, 5.25);
  console.log('F PASS: retry after INSERT/RPC failure, same activity, no overwrite/second bonus');

  const offline = snapshot('velo', 500, 60);
  storage.saveFinishedLiveActivity(offline);
  api.setOffline(true);
  await assert.rejects(synchronizeLiveActivity(offline, api.dependencies), /offline/);
  const restored = storage.loadFinishedLiveActivities().find(row => row.sessionId === offline.sessionId);
  assert.equal(restored.syncStatus, 'pending');
  assert.equal(restored.state.status, 'finished');
  assert.equal(restored.distanceM, 500);
  storage.clearLiveTrackingSession();
  assert.equal(storage.loadFinishedLiveActivities().find(row => row.sessionId === offline.sessionId).sessionId, offline.sessionId);
  api.setOffline(false);
  await synchronizeLiveActivity(restored, api.dependencies);
  assert.equal(api.activities.get(offline.sessionId).distance_km, 0.5);
  console.log('G/H/K PASS: durable outbox/reload, same UUID on retry, 500 m -> 0.5 km');

  const foreign = snapshot('trail', 100, 1);
  api.activities.set(foreign.sessionId, { ...buildLiveActivityPayload(foreign, user), user_id: 'other' });
  const calls = api.counts().rpcCalls;
  await assert.rejects(synchronizeLiveActivity(foreign, api.dependencies), /autre activite/);
  assert.equal(api.counts().rpcCalls, calls);
  assert.equal(api.activities.get(foreign.sessionId).user_id, 'other');
  assert.throws(() => buildLiveActivityPayload(foreign, { id: 'other' }), /compte/);
  console.log('I PASS: foreign owner or collision rejected');

  let state = running();
  const point = (sequence, seconds, offset) => ({ sessionId: state.sessionId, sequence,
    latitude: 0, longitude: offset, altitude: null, accuracy: 5, speed: null, heading: null,
    timestamp: startedAtMs + seconds * 1000 });
  const points = [point(1, 1, 0), point(2, 11, 0.00018), point(3, 21, 0.00036)];
  const order = [];
  const final = await finalizeLiveActivity({
    getState: () => state,
    stopCollection: async () => { order.push('stop'); },
    drainPoints: async () => { order.push('drain'); state = replayLivePoints(state, [points[2], points[0], points[1]]); },
    persist: row => { order.push('persist'); storage.saveFinishedLiveActivity(row); },
    cleanup: async () => { order.push('cleanup'); }, now: () => startedAtMs + 22000,
  });
  assert.deepEqual(order, ['stop', 'drain', 'persist', 'cleanup']);
  assert.ok(final.distanceM > 39 && final.distanceM < 41);
  assert.equal(final.state.lastSequence, 3);
  assert.equal(final.state.status, 'finished');
  assert.equal(replayLivePoints(final.state, points).distanceM, final.distanceM);
  assert.throws(() => replayLivePoints(running(), [{ ...points[2], sessionId: null }]), /points manquent/);
  console.log('J PASS: backlog sorted/integrated BEFORE finish, sequence dedup, missing points refused');

  let cleaned = false;
  await assert.rejects(finalizeLiveActivity({ getState: running,
    stopCollection: async () => {}, drainPoints: async () => {},
    persist: () => { throw new Error('quota'); }, cleanup: async () => { cleaned = true; }, now: Date.now,
  }), /quota/);
  assert.equal(cleaned, false);
  console.log('PASS: storage failure keeps native trace');
  const stoppedState = { ...running(), collectionStoppedAtMs: startedAtMs + 60000 };
  const retriedFinal = buildFinishedLiveActivity(stoppedState, startedAtMs + 900000);
  assert.equal(retriedFinal.activeDurationMs, 60000);
  assert.equal(retriedFinal.finishedAtMs, startedAtMs + 60000);
  console.log('PASS: finalization retries do not add time after native collection stopped');

  let paused = running();
  const id = paused.sessionId;
  const p = (seq, second, offset) => ({ ...points[0], sessionId: id, sequence: seq,
    timestamp: startedAtMs + second * 1000, longitude: offset });
  paused = replayLivePoints(paused, [p(1, 1, 0)]);
  paused = liveTrackingReducer(paused, { type: 'PAUSE', nowMs: startedAtMs + 12000 });
  // Last pre-pause point delivered while current state is already paused.
  paused = replayLivePoints(paused, [p(2, 11, 0.00018), p(3, 22, 0.0004)]);
  assert.ok(paused.distanceM > 19 && paused.distanceM < 21);
  paused = liveTrackingReducer(paused, { type: 'RESUME', nowMs: startedAtMs + 32000 });
  paused = replayLivePoints(paused, [p(4, 33, 0.0006), p(5, 43, 0.00078)]);
  assert.ok(paused.distanceM > 39 && paused.distanceM < 41);
  const pausedFinal = buildFinishedLiveActivity(paused, startedAtMs + 44000);
  assert.equal(pausedFinal.activeDurationMs, 24000);
  assert.equal(pausedFinal.pausedDurationMs, 20000);
  console.log('PASS: paused backlog excluded, pre-pause backlog retained, resume rebased, active timestamps');
  let withoutPausedPoints = liveTrackingReducer(running(), { type: 'PAUSE', nowMs: startedAtMs + 1000 });
  withoutPausedPoints = liveTrackingReducer(withoutPausedPoints, { type: 'RESUME', nowMs: startedAtMs + 2000 });
  withoutPausedPoints = { ...withoutPausedPoints, referencePoint: { ...points[0], timestamp: startedAtMs }, distanceM: 100 };
  withoutPausedPoints = replayLivePoints(withoutPausedPoints, [{ ...points[0], sessionId: withoutPausedPoints.sessionId,
    sequence: 1, timestamp: startedAtMs + 3000, longitude: 1 }]);
  assert.equal(withoutPausedPoints.distanceM, 100);
  assert.equal(withoutPausedPoints.referencePoint.longitude, 1);
  console.log('PASS: resume rebases even a huge paused movement without intermediate points');

  const hook = fs.readFileSync('hooks/useLiveTracking.ts', 'utf8');
  const start = hook.indexOf('  const finish = useCallback(async () => {');
  const end = hook.indexOf('\n  }, [persistCurrentState, reconcilePendingPoints', start);
  const body = hook.slice(start + '  const finish = useCallback(async () => {'.length, end);
  const refs = { current: running() }, lock = { current: false };
  let stopCount = 0, retryCount = 0, release;
  const wait = new Promise(resolve => { release = resolve; });
  const native = { isAvailable: () => true, stopTracking: async () => { stopCount++; await wait; return {}; }, clearSession: async () => {} };
  const finish = new Function('actionLockRef', 'stateRef', 'setNativeActionPending', 'finalizeLiveActivity',
    'liveTrackingPlatform', 'setPlatformStatus', 'reconcilePendingPoints', 'saveFinishedLiveActivity',
    'showFinishedActivity', 'persistCurrentState', 'refreshOutbox', 'retrySync', 'setPlatformError', 'getErrorMessage', 'replaceState',
    'return async function() {' + ts.transpile(body, { target: ts.ScriptTarget.ES2020 }) + '}')(
    lock, refs, () => {}, finalizeLiveActivity, native, () => {}, async () => {}, storage.saveFinishedLiveActivity,
    row => { refs.current = row.state; }, () => {}, () => {}, async () => { retryCount++; },
    error => { throw new Error(error); }, (error) => error.message, next => { refs.current = next; });
  const firstFinish = finish();
  await finish();
  assert.equal(stopCount, 1);
  release();
  await firstFinish;
  assert.equal(retryCount, 1);
  assert.equal(lock.current, false);
  console.log('E PASS: actual hook finish callback double-click guard');

  const policy = fs.readFileSync('supabase/migrations/20261003_allow_own_standalone_live_activities.sql', 'utf8');
  assert.match(policy, /auth\.uid\(\) = user_id\s+and challenge_id is null\s+and source = 'live'/);
  assert.ok(!policy.includes('Users can create own activities"'));
  const service = fs.readFileSync('android/app/src/main/java/fr/actyv/app/tracking/LiveTrackingService.java', 'utf8');
  assert.ok(!service.includes('LiveTrackingManager.clearSession'));
  assert.ok(service.indexOf('flushLocations()') < service.indexOf('private void completeStop()'));
  assert.ok(service.includes('return START_NOT_STICKY'));
  const activityApi = fs.readFileSync('lib/live-tracking/activity-api.ts', 'utf8');
  assert.ok(activityApi.includes("supabase.rpc('process_activity_masteries'"));
  assert.ok(!activityApi.includes('awardXp') && !activityApi.includes('dplus-'));
  assert.ok(!hook.slice(hook.indexOf("if (state.status === 'idle')"), hook.indexOf('persistTimeoutRef.current = setTimeout')).includes('clearLiveTrackingSession'));
  console.log('PASS: restrictive additional INSERT policy, native trace retention, no second XP/D+ engine, idle preserves restore');
  console.log('All tests use local helpers/mocks only: no Supabase writes or APK installation.');
  load('lib/live-tracking/calibration.test.ts');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
