const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const loadedModule = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(code, { module: loadedModule, exports: loadedModule.exports, Date, Intl, Number,
    require: name => name === '@/lib/supabase' ? { supabase: {} } : load(name.replace('@/', '') + '.ts'),
  });
  cache.set(file, loadedModule.exports);
  return loadedModule.exports;
}
const { buildActivityDetailMetrics } = load('lib/activity-detail.ts');
const { buildActivityHistoryEvent } = load('lib/history.ts');
const base = { id: 'example', sport: 'marche', activity_name: 'Marche', source: 'live',
  challenge_id: null, distance_km: 5, duration_minutes: 60, elevation_gain_m: null,
  elevation_loss_m: null, occurred_at: '2026-10-03T08:00:00Z', created_at: null,
  unit_type: null, unit_value: null };
function metric(row, label) { return buildActivityDetailMetrics(row).find(item => item.label === label)?.value; }
// A/B: challenge and manual typed/legacy data remain readable.
assert.equal(metric({ ...base, source: 'manual', challenge_id: 'challenge', unit_type: 'distance', unit_value: 5 }, 'Distance'), '5,0 km');
assert.equal(metric({ ...base, source: 'manual', distance_km: null, unit_type: 'distance', unit_value: 5 }, 'Distance'), '5,0 km');
// C/D/E: standalone walking/running/cycling, no legacy units needed.
assert.equal(metric(base, 'Allure moyenne'), '12\'00" /km');
assert.equal(metric({ ...base, sport: 'course-a-pied', duration_minutes: 25 }, 'Allure moyenne'), '5\'00" /km');
assert.equal(metric({ ...base, sport: 'velo', distance_km: 20 }, 'Vitesse moyenne'), '20,0 km/h');
// F/G: null/zero altitude and partial metadata never gate the detail.
assert.equal(metric(base, 'D+'), undefined);
assert.equal(metric({ ...base, elevation_gain_m: 0, elevation_loss_m: 0 }, 'D-'), '0 m');
assert.equal(metric({ ...base, metadata: {} }, 'Distance'), '5,0 km');
assert.equal(metric({ ...base, distance_km: 0, unit_type: 'distance', unit_value: 99 }, 'Distance'), undefined);
assert.equal(buildActivityHistoryEvent(base).href, '/activities/example');
const client = fs.readFileSync('app/activities/[id]/ActivityDetailClient.tsx', 'utf8');
assert.ok(client.includes(".eq('user_id', auth.user.id)"));
assert.ok(!client.includes(".eq('challenge_id'"));
assert.ok(client.includes('role="alert"'));
console.log('PASS activity detail A-G, history link, ownership and error states');
