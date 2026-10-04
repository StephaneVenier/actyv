const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const read = file => fs.readFileSync(file, 'utf8');

function load(file) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require(name) {
    if (name === 'react/jsx-runtime') return require(name);
    if (name === 'next/link') return { default: props => React.createElement('a', props, props.children) };
    if (name === 'next/image') return { default: props => React.createElement('img', props) };
    throw new Error('Unexpected dependency in public legal page: ' + name);
  } });
  return exports;
}

const layout = load('app/legal/layout.tsx').default;
for (const name of ['confidentialite', 'mentions-legales', 'cookies', 'suppression-compte']) {
  const file = `app/legal/${name}/page.tsx`;
  assert.doesNotMatch(read(file), /AppShell|@\/lib\/supabase|localStorage|useEffect/);
  const html = renderToStaticMarkup(layout({ children: load(file).default() }));
  assert.match(html, /<main>/);
  assert.match(html, /contact@a-ctyv\.fr/);
  assert.match(html, /supprimer|suppression/i);
  assert.doesNotMatch(html, /A completer|À FOURNIR|Stefo|Stéphane|SUPABASE_SERVICE_ROLE_KEY/);
}
assert.match(read('app/legal/confidentialite/page.tsx'), /id="health-connect"/);
assert.match(read('app/legal/confidentialite/page.tsx'), /canonical: 'https:\/\/a-ctyv\.fr\/legal\/confidentialite'/);
console.log('PASS public server-rendered legal pages: no Auth/storage dependency, deletion/contact discoverable, no personal identity/secret');

const java = read('android/app/src/main/java/fr/actyv/app/HealthConnectRationaleActivity.java');
assert.match(java, /https:\/\/a-ctyv\.fr\/legal\/confidentialite#health-connect/);
assert.match(java, /Intent\.ACTION_VIEW/);
assert.match(java, /ActivityNotFoundException \| SecurityException/);
assert.match(java, /setContentView\(scroll\)/);
assert.doesNotMatch(java, /MainActivity\.class|requestPermissions/);
console.log('PASS Health Connect rationale and no-browser fallback (structural; device test remains manual)');

const blockModule = load('lib/session-blocks.ts');
const detail = read('app/sessions/[id]/page.tsx');
assert.match(detail, /formatSessionBlockSummary\(block\.block_type, block\.target_value, block\.sets_count, block\.charge_kg\)/);
assert.equal(blockModule.formatSessionBlockSummary('reps', 10, 4, 50), '4 series x 10 reps - 50 kg');
console.log('PASS set summary uses real type/target/sets/charge');

async function testManualSteps(fail) {
  const source = ts.createSourceFile('profile.tsx', read('app/profile/page.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let initializer;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'handleSaveTodaySteps') initializer = node.initializer.getText(source);
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(initializer);
  assert.doesNotMatch(initializer, /xpResult|awardXp/);
  const messages = [], saving = [], calls = [], exports = {};
  const context = { exports, console: { error() {} }, profile: { id: 'A' }, savingSteps: false, stepsInput: '6500',
    setSavingSteps: value => saving.push(value), setStepsMessage: value => messages.push(value),
    upsertTodaySteps: async (owner, count) => { calls.push([owner, count]); if (fail) throw new Error('offline'); return { steps_count: count, source: 'manual' }; },
    getWeeklySteps: async () => ({ totalSteps: 6500 }), getMonthlySteps: async () => ({ totalSteps: 6500, entries: [] }),
    getBestDailySteps: async () => ({ stepsCount: 6500 }), getActiveStepStreak: () => 1,
    setDailySteps() {}, setStepsInput() {}, refreshUserBadges: async () => { calls.push('badges'); return { awarded: [], error: null }; },
    supabase: { from: () => ({ select() { return this; }, eq: async () => ({ data: [], error: null }) }) }, setBadges() {},
  };
  vm.runInNewContext(ts.transpile(`exports.run = ${initializer};`, { target: ts.ScriptTarget.ES2020 }), context);
  await exports.run();
  assert.deepEqual(saving, [true, false]);
  assert.equal(messages.at(-1), fail ? "Impossible d'enregistrer les pas du jour." : 'Pas du jour mis a jour.');
  assert.equal(calls[0][0], 'A'); assert.equal(calls[0][1], 6500);
  if (!fail) assert.ok(calls.includes('badges'));
}
(async () => {
  await testManualSteps(false);
  await testManualSteps(true);
  console.log('PASS actual manual steps handler: saved values/badges retained, no client XP, network failure releases saving state');
})().catch(error => { console.error(error); process.exitCode = 1; });
