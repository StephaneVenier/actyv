const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');
const source = fs.readFileSync('app/sessions/[id]/live/page.tsx', 'utf8');
const ast = ts.createSourceFile('live.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = new Map();
let persistEffect;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.initializer) declarations.set(node.name.getText(ast), node.initializer.getText(ast));
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' &&
      node.arguments[0]?.getText(ast).includes('completedSetsByBlockId: sanitizedCompletedSetsByBlockId')) {
    persistEffect = node.arguments[0].getText(ast);
  }
  ts.forEachChild(node, visit);
}
visit(ast);
function load(file) {
  const context = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, context);
  return context.exports;
}
const series = load('lib/live-workout-series.ts');
const snapshot = load('lib/live-workout-snapshot.ts');
const plain = value => JSON.parse(JSON.stringify(value));
function harness() {
  const original = { id: 'planned', session_id: 'session', position: 0, name: 'Press',
    exercise_id: 'canonical-press', block_type: 'reps', sets_count: 2, target_value: 10, charge_kg: 50, rest_seconds: 0 };
  const ctx = vm.createContext({ ...series, ...snapshot, crypto, Math, Date, console,
    normalizeSessionSetsCount: n => Math.max(Number(n) || 1, 1), DEFAULT_REST_SECONDS: 60,
    session: { id: 'session' }, blocks: [original], currentIndex: 0,
    performanceDraftsByBlockId: {}, actualPerformanceDraftsByBlockId: {}, actualPerformanceCarryForwardByBlockId: {},
    completedBlockIds: [], skippedBlockIds: [], completedSetsByBlockId: {}, setPerformances: [],
    historySaved: false, saveState: 'idle', isExerciseSwitchLocked: false, lastValidatedSeriesRef: { current: null },
    exerciseBlockId: null, exerciseSecondsLeft: 0, awaitingExerciseCompletion: false, startedSeriesKey: null,
    restAfterBlockId: null, restResumeIndex: null, restTotalSeconds: 0, restSecondsLeft: 0,
    openPerformanceLineIndex: null, isTimerPaused: false, isResting: false, isFinishReviewVisible: false,
    finishReviewOpen: false, elapsedSeconds: 0, storageReady: true, authUserId: 'owner', liveStorageKey: 'owned', runKey: 'run',
    triggerHaptic() {}, beginRest() {},
  });
  for (const node of ast.statements) {
    if (ts.isFunctionDeclaration(node) && node.name && !node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
      vm.runInContext(ts.transpile(node.getText(ast)), ctx);
    }
  }
  for (const key of ['blocks', 'currentIndex', 'performanceDraftsByBlockId', 'actualPerformanceDraftsByBlockId',
    'actualPerformanceCarryForwardByBlockId', 'completedBlockIds', 'skippedBlockIds', 'completedSetsByBlockId',
    'setPerformances', 'exerciseBlockId', 'exerciseSecondsLeft', 'awaitingExerciseCompletion', 'startedSeriesKey',
    'restAfterBlockId', 'restResumeIndex', 'restTotalSeconds', 'restSecondsLeft', 'openPerformanceLineIndex',
    'validationFeedback', 'isTimerPaused', 'finishReviewOpen', 'isAddExerciseOpen', 'newExerciseName',
    'newExerciseLibraryItem', 'newExerciseType', 'newExerciseSets', 'newExerciseTargetValue', 'newExerciseChargeKg',
    'newExerciseRestSeconds', 'newExerciseFreeText']) {
    ctx['set' + key[0].toUpperCase() + key.slice(1)] = value => {
      ctx[key] = typeof value === 'function' ? value(ctx[key]) : value;
    };
  }
  for (const name of ['addExerciseToLive', 'removeExerciseFromLive', 'clearExerciseState', 'clearRestState',
    'updateCurrentPerformanceLine', 'addCurrentPerformanceLine', 'upsertSetPerformanceEntries',
    'completeCurrentExercise', 'handleValidateCurrent', 'handleUncheckSeries']) {
    vm.runInContext(ts.transpile(`globalThis.${name} = ${declarations.get(name)};`), ctx);
  }
  ctx.performanceDraftsByBlockId.planned = ctx.createDefaultLivePerformanceDraft(original);
  function render() {
    ctx.currentBlock = ctx.blocks[ctx.currentIndex];
    const block = ctx.currentBlock;
    ctx.currentLivePerformanceDraft = ctx.performanceDraftsByBlockId[block.id];
    ctx.currentLivePerformanceLines = ctx.getLivePerformanceDraftLines(ctx.currentLivePerformanceDraft, block);
    ctx.currentLiveBlockSetsTotal = ctx.currentLivePerformanceLines.length;
    ctx.setPerformances = series.reconcileLiveSeries(ctx.setPerformances, block.id, ctx.currentLivePerformanceLines);
    ctx.currentCompletedSets = ctx.setPerformances.filter(row => row.block_id === block.id && row.status === 'completed').length;
    ctx.resolvedBlockIds = [...ctx.completedBlockIds, ...ctx.skippedBlockIds];
    ctx.currentPhase = 'ready';
    ctx.isDurationBlock = block.block_type === 'duration';
    ctx.usesSetBySetValidation = ctx.currentLiveBlockSetsTotal > 1;
    ctx.currentLineRestSeconds = 0;
    for (const name of ['firstPendingLineIndex', 'timedLineIndex', 'selectedPendingLineIndex', 'activeLineIndex',
      'currentSeriesKey', 'isSeriesStarted', 'isExercising', 'currentActivePerformanceLineIndex',
      'currentActivePerformanceLine', 'currentActualReps', 'currentActualChargeKg', 'currentActualText',
      'canValidateCurrentBlock', 'canAdjustCurrentPerformance']) {
      vm.runInContext(ts.transpile(`globalThis.${name} = ${declarations.get(name)};`), ctx);
    }
  }
  function invoke(name, ...args) { ctx[name](...args); render(); }
  function add(type = 'reps') {
    Object.assign(ctx, { newExerciseName: 'Rowing', newExerciseLibraryItem: { id: 'canonical-rowing' },
      newExerciseType: type, newExerciseSets: '1', newExerciseTargetValue: '', newExerciseChargeKg: '',
      newExerciseRestSeconds: '0', newExerciseFreeText: '' });
    invoke('addExerciseToLive');
    return ctx.blocks.at(-1);
  }
  function select(id) { ctx.currentIndex = ctx.blocks.findIndex(block => block.id === id); render(); }
  function restore() {
    let stored;
    ctx.window = { localStorage: { setItem(key, value) { assert.equal(key, 'owned'); stored = JSON.parse(value); } } };
    vm.runInContext(ts.transpile(`globalThis.persist = ${persistEffect};`), ctx);
    for (let i = 0; i < 12 && !stored; i++) ctx.persist();
    assert.ok(stored, 'real persistence effect writes snapshot');
    const before = plain(ctx.setPerformances);
    ctx.blocks = stored.blocks;
    ctx.currentIndex = stored.currentIndex;
    ctx.performanceDraftsByBlockId = Object.fromEntries(ctx.blocks.map(block =>
      [block.id, ctx.normalizeLivePerformanceDraft(stored.performanceDraftsByBlockId[block.id], block)]));
    ctx.setPerformances = snapshot.normalizeLiveSetPerformances(stored.setPerformances, ctx.blocks);
    render();
    assert.deepEqual(plain(ctx.setPerformances), before);
    assert.equal(stored.ownerUserId, 'owner');
    assert.equal(stored.runKey, 'run');
    return stored;
  }
  render();
  return { ctx, invoke, add, select, restore };
}

const h = harness();
const added = h.add();
assert.equal(added.exercise_id, 'canonical-rowing');
assert.equal(h.ctx.currentBlock.id, 'planned', 'append preserves active exercise');
assert.equal(added.target_value, null);
assert.equal(h.ctx.setPerformances.length, 0);
h.select(added.id);
h.invoke('updateCurrentPerformanceLine', { targetValue: 12, chargeKg: 60 });
h.invoke('handleValidateCurrent');
h.restore();
assert.equal(h.ctx.setPerformances[0].exercise_id, added.exercise_id);
assert.equal(h.ctx.setPerformances[0].actual_reps, 12);
assert.equal(h.ctx.setPerformances[0].actual_charge_kg, 60);
h.invoke('addCurrentPerformanceLine');
h.ctx.openPerformanceLineIndex = 1;
h.select(added.id);
h.invoke('updateCurrentPerformanceLine', { targetValue: 8, chargeKg: 70 });
const ids = h.ctx.currentLivePerformanceLines.map(line => line.id);
h.restore();
assert.deepEqual(plain(h.ctx.currentLivePerformanceLines.map(line => line.id)), plain(ids));
assert.equal(h.ctx.currentLivePerformanceLines[1].targetValue, 8);
assert.equal(h.ctx.setPerformances.length, 1);
console.log('PASS M2 1-3: canonical UUID, actual validation, M1 added series and real snapshot');

const pending = h.add();
h.invoke('removeExerciseFromLive', pending.id);
h.restore();
assert.ok(!h.ctx.blocks.some(block => block.id === pending.id));
h.invoke('removeExerciseFromLive', 'planned');
h.restore();
assert.equal(h.ctx.currentBlock.id, added.id);
assert.equal(h.ctx.setPerformances[0].actual_reps, 12);
console.log('PASS M2 4-5/8: added/planned removal, refresh, active identity and neighbours intact');
h.add();
h.invoke('removeExerciseFromLive', added.id);
assert.ok(h.ctx.blocks.some(block => block.id === added.id));
assert.match(h.ctx.validationFeedback, /Decoche/);
h.invoke('handleUncheckSeries', 0);
h.invoke('removeExerciseFromLive', added.id);
h.restore();
assert.ok(!h.ctx.blocks.some(block => block.id === added.id));
assert.equal(h.ctx.setPerformances.length, 0);
console.log('PASS M2 6-7: completed removal refused, M1 uncheck authorizes removal');

for (const type of ['duration', 'distance', 'free']) {
  const typed = h.add(type);
  assert.equal(typed.block_type, type);
  assert.equal(typed.charge_kg, null);
  h.select(typed.id);
  h.restore();
  assert.equal(h.ctx.currentLivePerformanceLines.length, 1);
}
console.log('PASS M2 9-10: duration/distance/free editors retain type and neutral values');

const partial = harness();
const extra = partial.add();
partial.select(extra.id);
partial.invoke('updateCurrentPerformanceLine', { targetValue: 8, chargeKg: 55 });
partial.invoke('handleValidateCurrent');
partial.select('planned');
partial.invoke('updateCurrentPerformanceLine', { targetValue: 10, chargeKg: 50 });
partial.invoke('handleValidateCurrent');
const final = partial.restore();
assert.equal(final.setPerformances.filter(row => row.status === 'completed').length, 2);
assert.equal(final.setPerformances.reduce((sum, row) => sum + row.actual_reps * row.actual_charge_kg, 0), 940);
const duplicate = partial.add();
assert.notEqual(duplicate.id, extra.id);
assert.equal(duplicate.exercise_id, extra.exercise_id);
partial.restore();
console.log('PASS M2 11-12: partial completed values only, repeated movement has distinct live IDs');

const guards = harness();
guards.invoke('removeExerciseFromLive', 'planned');
assert.equal(guards.ctx.blocks.length, 1);
guards.ctx.isExerciseSwitchLocked = true;
guards.add();
assert.equal(guards.ctx.blocks.length, 1);
assert.match(source, /setBlocks\(\(current\) => hasHydratedLiveStateRef.current && current.length > 0 \? current : blockRows \|\| \[\]\)/);
console.log('PASS safeguards: last exercise, running timer/rest, late source fetch cannot overwrite restored blocks');
