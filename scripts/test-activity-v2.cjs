const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const cache = new Map();
const requests = [];
const mock = { from(table) {
  const request = { table, filters: [] }; requests.push(request);
  const query = { select() { return this; }, eq(key, value) { request.filters.push([key, value]); return this; },
    in() { return this; }, then(resolve) { return Promise.resolve({ data: table === 'mastery_entries'
      ? [{ id: 'entry', mastery_id: 'm', value: 0.59 }]
      : [{ id: 'm', slug: 'marche', name: 'Distance Marche', unit: 'km' }] }).then(resolve); } };
  return query;
}, rpc(name) { requests.push({ rpc: name }); return Promise.resolve({ data: [
  { mastery_id: 'm', current_level: 3, total_value: 7.8, next_threshold: 10, progress_percent: 78, is_max_level: false }] }); } };
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file);
  const loadedModule = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { module: loadedModule, exports: loadedModule.exports, Date, Intl, Math, Number,
    require: name => name === '@/lib/supabase' ? { supabase: mock } : load(name.startsWith('@/')
      ? name.slice(2) + '.ts' : path.resolve(path.dirname(file), name + '.ts')) });
  cache.set(file, loadedModule.exports); return loadedModule.exports;
}
const route = load('lib/activity-route.ts');
const contributions = load('lib/activity-contributions.ts');
const detail = load('lib/activity-detail.ts');
const { buildLiveActivityPayload } = load('lib/live-tracking/activity-sync.ts');
const id = '11111111-1111-4111-8111-111111111111', owner = 'owner', start = 100000;
function point(i, timestamp = start + i * 2000) {
  return { latitude: 45 + Math.sin(i / 25) * .001, longitude: 2 + i * .0001,
    timestamp, segmentDistanceM: i ? 10 : 0, trackingPaused: false, accuracy: 5, altitude: null,
    speed: null, heading: null };
}
function snapshot(points, extras = {}) {
  const finish = points.at(-1)?.timestamp || start;
  return { sessionId: id, ownerUserId: owner, sport: 'marche', startedAtMs: start, finishedAtMs: finish,
    distanceM: 590, activeDurationMs: 615000, elapsedDurationMs: finish - start, pausedDurationMs: 0,
    elevationGainM: 0, elevationLossM: 0, state: { acceptedPoints: points, pausePeriods: [], collectionGaps: [], ...extras } };
}
async function main() {
  const points = Array.from({ length: 35 }, (_, i) => point(i));
  const a = snapshot(points), payload = buildLiveActivityPayload(a, { id: owner });
  assert.equal(payload.source, 'live'); assert.equal(payload.challenge_id, null);
  assert.equal(payload.id, id); assert.ok(payload.metadata.route_trace);
  assert.equal(JSON.stringify(buildLiveActivityPayload(a, { id: owner })), JSON.stringify(payload));
  assert.equal(Object.keys(payload.metadata.route_trace.segments[0][0]).length, 2);
  console.log('A/I PASS: display-only coordinate tuples, personal Live, deterministic retry/same UUID');
  const splitPoints = [point(0), point(1), point(2, start + 12000), point(3, start + 14000)];
  for (const key of ['pausePeriods', 'collectionGaps']) {
    const b = route.buildActivityRoute(snapshot(splitPoints, { [key]: [{ startedAtMs: start + 4000, endedAtMs: start + 10000 }] }));
    assert.equal(b.segments.length, 2);
    assert.equal(JSON.stringify(b.segments[0].at(-1)), JSON.stringify([splitPoints[1].latitude, splitPoints[1].longitude]));
    assert.equal(JSON.stringify(b.segments[1][0]), JSON.stringify([splitPoints[2].latitude, splitPoints[2].longitude]));
  }
  assert.equal(route.buildActivityRoute(snapshot([point(0), point(1, start + 90000)])).segments.length, 2);
  assert.equal(route.buildActivityRoute(snapshot([point(0), { ...point(1), segmentDistanceM: 0 }])).segments.length, 2);
  console.log('B/C PASS: pauses, 5C interruptions, zero-distance rebase and 60s holes never joined');
  assert.equal(route.readActivityRoute('live', null, undefined), null);
  assert.equal(route.readActivityRoute('manual', null, payload.metadata.route_trace), null);
  assert.equal(route.readActivityRoute('live', 'challenge', payload.metadata.route_trace), null);
  assert.equal(route.readActivityRoute('live', null, { version: 1, segments: [[[91, 0]]] }), null);
  assert.equal(route.intervalDurationMs([{ startedAtMs: 0, endedAtMs: 10000 }, { startedAtMs: 5000, endedAtMs: 15000 }], 0, 20000), 15000);
  assert.equal(route.intervalDurationMs(undefined, 0, 20000), null);
  assert.equal(detail.buildActivityTimeDetails({ metadata: { paused_duration_ms: 615000 } })[0].label, 'Temps exclu (pause / interruption)');
  assert.equal(detail.formatActivityDurationMs(615000), '10 min 15 s');
  console.log('D/E/F PASS: legacy/manual/challenge/malformed traces safe, unknown times not fabricated');
  assert.equal(contributions.normalizeActivityContributions([], [], []).length, 0);
  const entries = [{ id: 'one', mastery_id: 'm', value: .59 }, { id: 'one', mastery_id: 'm', value: .59 },
    { id: 'two', mastery_id: 'n', value: 1 }];
  const list = contributions.normalizeActivityContributions(entries,
    [{ id: 'm', name: 'Distance', unit: 'km', slug: 'marche' }, { id: 'n', name: 'Sorties', unit: 'count', slug: 'sorties-marche' }], []);
  assert.equal(list.length, 2); assert.equal(list[0].value, .59);
  assert.equal(contributions.formatActivityContribution(10.25, 'minutes'), '10 min 15 s');
  const result = await contributions.loadActivityContributions('activity', owner);
  assert.equal(result.contributions[0].value, .59); assert.equal(result.contributions[0].progress.total, 7.8);
  assert.equal(JSON.stringify(requests[0].filters), JSON.stringify([['user_id', owner], ['source', 'activity'], ['source_ref_id', 'activity']]));
  assert.equal(requests.length, 3); assert.equal(requests[2].rpc, 'get_my_masteries_progress');
  console.log('G/H PASS: exact entry values, dedup, batched current progress, no unlock/XP attribution');
  const client = fs.readFileSync('app/activities/[id]/ActivityDetailClient.tsx', 'utf8');
  assert.ok(client.includes(".eq('id', activityId).eq('user_id', auth.user.id)"));
  assert.ok(client.indexOf('if (!data) throw') < client.indexOf('await loadActivityContributions'));
  assert.ok(fs.readFileSync('components/ActivityRouteMap.tsx', 'utf8').includes("void import('leaflet')"));
  assert.ok(!fs.readFileSync('lib/history.ts', 'utf8').includes('route_trace'));
  console.log('J PASS (structural): owner scoped detail, no contribution request for inaccessible activity');
  for (const count of [35, 1800, 18000]) {
    const original = Array.from({ length: count }, (_, i) => point(i));
    const trace = route.buildActivityRoute(snapshot(original));
    assert.ok(trace.point_count_stored <= route.ROUTE_MAX_POINTS);
    assert.equal(JSON.stringify(trace.segments[0][0]), JSON.stringify([original[0].latitude, original[0].longitude]));
    assert.equal(JSON.stringify(trace.segments[0].at(-1)), JSON.stringify([original.at(-1).latitude, original.at(-1).longitude]));
    console.log(JSON.stringify({ original: count, stored: trace.point_count_stored,
      raw_bytes: Buffer.byteLength(JSON.stringify(original)), trace_bytes: Buffer.byteLength(JSON.stringify(trace)), tolerance_m: trace.tolerance_m }));
  }
  const zigzag = Array.from({ length: 18000 }, (_, i) => ({ ...point(i), latitude: 45 + (i % 2) * .001 }));
  const zigzagTrace = route.buildActivityRoute(snapshot(zigzag));
  assert.ok(zigzagTrace.point_count_stored <= 4000); assert.ok(zigzagTrace.tolerance_m > 5);
  console.log(JSON.stringify({ fixture: 'zigzag', original: zigzag.length, stored: zigzagTrace.point_count_stored,
    trace_bytes: Buffer.byteLength(JSON.stringify(zigzagTrace)), tolerance_m: zigzagTrace.tolerance_m }));
  const pathological = route.buildActivityRoute(snapshot(Array.from({ length: 4001 }, (_, i) => ({ ...point(i), segmentDistanceM: 0 }))));
  assert.equal(pathological, null);
  console.log('PASS: bounded long/zigzag trace; excessive mandatory endpoints omit map, never merge segments');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
