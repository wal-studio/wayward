'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const root = process.cwd();
const source = fs.readFileSync(root + '/cloud-save/mod.js', 'utf8');

function section(text, start, end) {
  const a = text.indexOf(start);
  const b = text.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, 'missing section: ' + start);
  return text.slice(a, b);
}

function extractFunction(html, signature) {
  const start = html.indexOf(signature);
  const end = html.indexOf('function ', start + signature.length);
  assert.ok(start >= 0 && end > start, 'native formatter not found: ' + signature);
  return html.slice(start, end);
}

function jsxRuntime() {
  const make = (type, props) => ({ type, props });
  return { jsx: make, jsxs: make };
}

// Pin the exact Faith v3.0.0 source blob; WML core is read from this PR's source tree.
const faithHtml = execFileSync(
  'git',
  ['cat-file', 'blob', 'ac6b44ccb75584383ad2875f4f36a55138c228cf'],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
);
const faithRendererSource = extractFunction(faithHtml, 'function VF({meta:o})');
const faithCharacterSource = extractFunction(faithHtml, 'function vn(o,s)');
const waywardHtml = fs.readFileSync(root + '/Wayward_WML_ko.html', 'utf8');
const waywardRendererSource = extractFunction(waywardHtml, 'function zoe({meta:e})');
assert.ok(faithHtml.includes('u.jsx(VF,{meta:o})'), 'Faith save-slot row must use VF');
assert.ok(waywardHtml.includes('u.jsx(zoe,{meta:e})'), 'Wayward save-slot row must use zoe');
const faithMetadataSource = extractFunction(faithHtml, 'function sb(o)');
const waywardMetadataSource = extractFunction(waywardHtml, 'function J0(e)');
for (const marker of [
  'savedAt:l.savedAt',
  'day:h.day',
  'gold:(n=h.economy)==null?void 0:n.gold',
  'wifeName:(r=vn(h,h.primaryCharacterId))==null?void 0:r.name',
  'phase:h.phase',
  'playSeconds:h.wfPlaySeconds'
]) assert.ok(faithMetadataSource.includes(marker), 'Faith native metadata missing ' + marker);
for (const marker of [
  'savedAt:a.savedAt',
  'day:i.day',
  'gold:(s=i.economy)==null?void 0:s.gold',
  'wifeName:(r=$n(i,i.primaryCharacterId))==null?void 0:r.name',
  'phase:i.phase'
]) assert.ok(waywardMetadataSource.includes(marker), 'Wayward native metadata missing ' + marker);

assert.equal(faithRendererSource.length, 613, 'Faith VF renderer signature changed');
assert.equal(faithCharacterSource.length, 106, 'Faith vn resolver signature changed');
assert.equal(waywardRendererSource.length, 464, 'Wayward zoe renderer signature changed');
for (const marker of [
  '"손상된 데이터 — 불러올 수 없음"',
  'o.day??"?"',
  'prep:"집회 준비"',
  'wfPlayTimeText(o.playSeconds)',
  'q2(o.savedAt)'
]) assert.ok(faithRendererSource.includes(marker), 'Faith native renderer missing ' + marker);
for (const marker of [
  's===wfPrisonerId?o.wfPrisoner',
  's===wfTavernGuestId?o.wfTavernGuest',
  'o.characters[s]'
]) assert.ok(faithCharacterSource.includes(marker), 'Faith character resolver missing ' + marker);
for (const marker of ['"진행일: "', 'e.gold??"?"', 'e.phase??""', 'HD(e.savedAt)']) {
  assert.ok(waywardRendererSource.includes(marker), 'Wayward native renderer missing ' + marker);
}

assert.match(source, /"waywardNativeSaveSlotText"[\s\S]*?"len": 464/);
assert.match(source, /"faithNativeSaveSlotText"[\s\S]*?"len": 613/);
assert.match(source, /"faithNativeSaveCharacter"[\s\S]*?"len": 106/);

// Evaluate the real native row components; only the game's date/play-time dependencies are stubbed.
const savedAt = Date.parse('2026-11-25T21:35:00.000Z'); // CloudSave snapshot time
const nativeSavedAt = Date.parse('2026-11-24T09:10:00.000Z'); // native game-save time
const state = {
  primaryCharacterId: 'mara',
  characters: { mara: { name: '마라' } },
  day: 1,
  economy: { gold: 50 },
  phase: 'prep',
  wfPlaySeconds: 60
};
let faithSeenSavedAt = '';
let faithSeenPlaySeconds = null;
const faithContext = vm.createContext({
  u: jsxRuntime(),
  wfPrisonerId: '__prisoner__',
  wfTavernGuestId: '__tavern__',
  wfPlayTimeText(seconds) {
    faithSeenPlaySeconds = seconds;
    return seconds === 60 ? '플레이 1분' : '';
  },
  q2(value) {
    faithSeenSavedAt = value;
    return '2026-11-26 오전 6:35';
  }
});
vm.runInContext(faithRendererSource + '\nthis.renderer = VF;', faithContext);
vm.runInContext(faithCharacterSource + '\nthis.character = vn;', faithContext);

let waywardSeenSavedAt = '';
const waywardContext = vm.createContext({
  u: jsxRuntime(),
  HD(value) {
    waywardSeenSavedAt = value;
    return '2026-11-26 오전 6:35';
  }
});
vm.runInContext(waywardRendererSource + '\nthis.renderer = zoe;', waywardContext);

const captureSource = section(
  source,
  '    function reactElementText(node) {',
  '    function truncateDriveProperty(value, maxBytes) {'
);
for (const marker of [
  'day: state.day',
  'gold: state.economy && state.economy.gold',
  'wifeName: primaryCharacter && primaryCharacter.name',
  'phase: state.phase',
  'playSeconds: state.wfPlaySeconds',
  'meta.savedAt = nativeSavedAt'
]) assert.ok(captureSource.includes(marker), 'native row adapter missing state field ' + marker);
function captureFunction(api) {
  const context = vm.createContext({ api });
  vm.runInContext(captureSource + '\nthis.capture = captureNativeSaveDisplay;', context);
  return context.capture;
}

const faithApi = {
  has(name) {
    return name === 'faithNativeSaveSlotText' || name === 'faithNativeSaveCharacter';
  },
  fn(name) {
    if (name === 'faithNativeSaveSlotText') return faithContext.renderer;
    if (name === 'faithNativeSaveCharacter') return faithContext.character;
    throw new Error('unexpected Faith symbol: ' + name);
  }
};
const faithDisplay = captureFunction(faithApi)(state, nativeSavedAt);
assert.equal(faithDisplay, '마라 · 1주째 · 50골드 · 집회 준비 · 플레이 1분 · 2026-11-26 오전 6:35');
assert.equal(faithSeenSavedAt, nativeSavedAt);
assert.equal(faithSeenPlaySeconds, 60);

const waywardApi = {
  has(name) { return name === 'waywardNativeSaveSlotText'; },
  fn(name) {
    if (name !== 'waywardNativeSaveSlotText') throw new Error('unexpected Wayward symbol: ' + name);
    return waywardContext.renderer;
  }
};
const waywardDisplay = captureFunction(waywardApi)(state, nativeSavedAt);
assert.equal(waywardDisplay, '마라 · 진행일: 1 · 50골드 · prep · 2026-11-26 오전 6:35');
assert.equal(waywardSeenSavedAt, nativeSavedAt);

faithSeenSavedAt = '';
const faithWithoutNativeTime = captureFunction(faithApi)(state, null);
assert.equal(faithWithoutNativeTime, '마라 · 1주째 · 50골드 · 집회 준비 · 플레이 1분');
assert.equal(faithSeenSavedAt, '', 'CloudSave snapshot time must not be substituted for native time');
waywardSeenSavedAt = '';
const waywardWithoutNativeTime = captureFunction(waywardApi)(state, null);
assert.equal(waywardWithoutNativeTime, '마라 · 진행일: 1 · 50골드 · prep');
assert.equal(waywardSeenSavedAt, '');

const unsupportedDisplay = captureFunction({
  has() { return false; },
  fn() { throw new Error('unsupported games must not guess a formatter'); }
})(state, savedAt);
assert.equal(unsupportedDisplay, '', 'unsupported game must not get a fabricated summary');

const snapshotSource = section(source, '    function buildSnapshot()', '    function defaultTitle(state)');
assert.match(snapshotSource, /nativeSave: native/);
assert.match(snapshotSource, /native\.format === 1/);
assert.match(snapshotSource, /state: stateToSave/);
assert.match(snapshotSource, /modData/);
assert.match(snapshotSource, /const savedAt = Date\.now\(\)/);
assert.match(snapshotSource, /captureNativeSaveDisplay\(stateToSave, native && native\.savedAt\)/);
assert.match(snapshotSource, /\.\.\.\(nativeDisplay \? \{ nativeDisplay \} : \{\}\)/);

const applySource = section(source, '    function applySnapshot(snapshot) {', '    function isConnected() {');
assert.doesNotMatch(applySource, /nativeDisplay/, 'display metadata must not enter game restore state');

const displaySource = section(
  source,
  '    function truncateDriveProperty(value, maxBytes) {',
  '    function defaultTitle(state) {'
);
const displayContext = vm.createContext({});
vm.runInContext(
  displaySource + '\nthis.__display = { buildDriveDisplayProperties, nativeSaveDisplay, splitDriveProperty, readNativeDisplayProperties };',
  displayContext
);
const helpers = displayContext.__display;

const snapshot = {
  savedAt,
  nativeSave: {
    savedAt: nativeSavedAt,
    display: 'unverified synthetic field must not be used'
  },
  nativeDisplay: faithDisplay,
  memo: '첫 줄\n둘째 줄은 암호화 본문'
};
const nativeDisplay = helpers.nativeSaveDisplay(snapshot);
assert.equal(nativeDisplay.display, faithDisplay);
assert.equal(nativeDisplay.savedAt, new Date(nativeSavedAt).toISOString());

const legacySnapshot = { nativeSave: { savedAt: '2026-11-25T15:26:00.000Z', display: 'fake' } };
assert.equal(helpers.nativeSaveDisplay(legacySnapshot).display, '');
assert.equal(helpers.nativeSaveDisplay(legacySnapshot).savedAt, '2026-11-25T15:26:00.000Z');
assert.equal(helpers.nativeSaveDisplay({ savedAt, nativeSave: {}, nativeDisplay: faithDisplay }).savedAt, '',
  'CloudSave snapshot timestamp must not be presented as native save time');

const properties = helpers.buildDriveDisplayProperties(snapshot);
assert.equal(properties.wmlDisplayVersion, '4');
assert.equal(properties.wmlNativeSavedAt, new Date(nativeSavedAt).toISOString());
assert.equal(properties.wmlNativeDisplayCount, '1');
assert.equal(properties.wmlNativeDisplay0, faithDisplay);
assert.equal(helpers.readNativeDisplayProperties(properties), faithDisplay);
assert.equal(helpers.readNativeDisplayProperties({
  wmlNativeDisplayCount: '2',
  wmlNativeDisplay0: 'partial only'
}), '', 'incomplete chunk sets must not display truncated native text');
assert.equal(properties.wmlMemoPreview, '첫 줄');
assert.equal(properties.wmlHasMemo, '1');
assert.equal(properties.wmlSummary, undefined);

const normalizeSource = section(
  source,
  '    function normalizeAppProperties(value, includeMemoPreview) {',
  '    function normalizeDriveSlotFiles(files) {'
);
const normalizeContext = vm.createContext({});
vm.runInContext(normalizeSource + '\nthis.normalizeAppProperties = normalizeAppProperties;', normalizeContext);
const cachedProperties = normalizeContext.normalizeAppProperties(properties, false);
assert.equal(cachedProperties.wmlNativeDisplayCount, properties.wmlNativeDisplayCount);
assert.equal(cachedProperties.wmlNativeDisplay0, faithDisplay);
assert.equal(cachedProperties.wmlNativeSavedAt, properties.wmlNativeSavedAt);
assert.equal(cachedProperties.wmlMemoPreview, undefined, 'plaintext memo preview must not enter persistent cache');

const longKoreanDisplay = '마라 · '.repeat(100);
const chunks = helpers.splitDriveProperty(longKoreanDisplay, 124, 16);
assert.ok(chunks.length > 1, 'long native display should use multiple Drive properties');
assert.ok(chunks.every(chunk => Buffer.byteLength(chunk, 'utf8') <= 124));
const chunkProperties = { wmlNativeDisplayCount: String(chunks.length) };
chunks.forEach((chunk, index) => { chunkProperties['wmlNativeDisplay' + index] = chunk; });
assert.equal(helpers.readNativeDisplayProperties(chunkProperties), longKoreanDisplay);

const overflowSnapshot = { savedAt, nativeDisplay: '가'.repeat(700), memo: '' };
const overflowProperties = helpers.buildDriveDisplayProperties(overflowSnapshot);
assert.equal(overflowProperties.wmlDisplayVersion, '3');
assert.equal(overflowProperties.wmlNativeDisplayCount, undefined);
assert.equal(helpers.readNativeDisplayProperties(overflowProperties), '');

const summarySource = section(source, '    function formatSlotSummary(file) {', '    function formatSlotMetadata(file) {');
const summaryContext = vm.createContext({
  readNativeDisplayProperties: helpers.readNativeDisplayProperties
});
vm.runInContext(summarySource + '\nthis.formatSlotSummary = formatSlotSummary;', summaryContext);
assert.equal(summaryContext.formatSlotSummary({ appProperties: properties }), faithDisplay);
assert.equal(summaryContext.formatSlotSummary({
  appProperties: { wmlDisplayVersion: '3', wmlSummary: '가짜 요약' }
}), '');
assert.equal(summaryContext.formatSlotSummary({
  appProperties: { wmlDisplayVersion: '2', wmlSummary: '가짜 요약' }
}), '');
assert.equal(summaryContext.formatSlotSummary({
  appProperties: { wmlNativeName: '마라', wmlNativeGold: '50' }
}), '');

const metadataSource = section(source, '    function formatSlotMetadata(file) {', '    function showMemoPopup(memo) {');
const metadataContext = vm.createContext({});
vm.runInContext(metadataSource + '\nthis.formatSlotMetadata = formatSlotMetadata;', metadataContext);
assert.equal(metadataContext.formatSlotMetadata({
  appProperties: {},
  modifiedTime: '2026-11-26T00:00:00.000Z'
}), '', 'Drive modifiedTime must never be treated as native game-save time');
assert.equal(metadataContext.formatSlotMetadata({
  appProperties: { wmlNativeSavedAt: new Date(nativeSavedAt).toISOString() },
  modifiedTime: '2026-11-26T00:00:00.000Z'
}), new Date(nativeSavedAt).toLocaleString(undefined, {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit'
}));

const memoSource = section(source, '    async function openMemoForSlot(file) {', '    function renderSlots(root) {');
assert.match(memoSource, /wmlDisplayVersion/);
assert.match(memoSource, /\['3', '4'\]\.includes/);
assert.match(memoSource, /const nativeSummary = formatSlotSummary\(file\)/);
assert.match(memoSource, /wmlDisplayVersion === '4' && !nativeSummary/);
assert.doesNotMatch(memoSource, /wmlSummary/);

const renderSource = section(source, '    function renderSlots(root) {', '    function renderView(root) {');
assert.match(renderSource, /const displayTitle = '저장 슬롯 ' \+ slot;/);
assert.match(renderSource, /class: 'wml-gd-summary'/);
assert.match(renderSource, /if \(savedSummary\) \{/);
assert.match(renderSource, /else if \(file\)/);
assert.doesNotMatch(renderSource, /savedSummary \|\| '저장 슬롯'/);
assert.match(source, /\.wml-gd-summary\{flex:0 0 100%;min-width:0;font-size:\.86em;opacity:\.82;white-space:normal;overflow-wrap:anywhere\}/);

console.log('CloudSave native save-row display metadata tests passed.');
