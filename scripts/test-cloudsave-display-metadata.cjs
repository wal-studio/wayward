'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(process.cwd() + '/cloud-save/mod.js', 'utf8');

function section(text, start, end) {
  const a = text.indexOf(start);
  const b = text.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, 'missing section: ' + start);
  return text.slice(a, b);
}

// The native serializer envelope is retained as an opaque object. CloudSave
// must not infer character, currency, relationship, phase, or other labels.
const snapshotSource = section(source, '    function buildSnapshot()', '    function defaultTitle(state)');
assert.match(snapshotSource, /nativeSave: native/);
assert.match(snapshotSource, /native\.format === 1/);
assert.match(snapshotSource, /state: stateToSave/);
assert.match(snapshotSource, /modData/);

const displaySource = section(
  source,
  '    function truncateDriveProperty(value, maxBytes) {',
  '    function defaultTitle(state) {'
);
const context = vm.createContext({});
vm.runInContext(displaySource + '\nthis.__display = { buildDriveDisplayProperties, nativeSaveDisplay };', context);

const nativeSave = {
  format: 1,
  savedAt: '2026-11-26T00:26:00+09:00',
  state: { day: 12, economy: { gold: 98 }, phase: 'prep' },
  display: '마라 1주째 50골드 집회 준비 플레이 1분 11월 26일 오전 4:24'
};
const display = context.__display.nativeSaveDisplay({ nativeSave, savedAt: 123 });
assert.equal(display.savedAt, '2026-11-25T15:26:00.000Z');
assert.equal(Object.prototype.hasOwnProperty.call(display, 'summary'), false);

const properties = context.__display.buildDriveDisplayProperties({
  nativeSave,
  savedAt: 123,
  memo: '첫 줄\n둘째 줄은 비공개 본문'
});
assert.equal(properties.wmlDisplayVersion, '3');
assert.equal(properties.wmlSummary, undefined);
assert.equal(properties.wmlNativeSavedAt, '2026-11-25T15:26:00.000Z');
assert.equal(properties.wmlMemoPreview, '첫 줄');
assert.equal(properties.wmlHasMemo, '1');
assert.doesNotMatch(JSON.stringify(properties), /재화|관계|상태|prep|골드|마라/);
assert.doesNotMatch(properties.wmlMemoPreview, /둘째 줄/);

// Version 3 intentionally shows no invented card summary. Native time is
// displayed only when the native serializer supplied it; Drive upload time
// must not be presented as the game's save time.
const summaryStart = source.indexOf('    function formatSlotSummary(file) {');
const summaryEnd = source.indexOf('    function formatSlotMetadata(file) {', summaryStart);
assert.ok(summaryStart >= 0 && summaryEnd > summaryStart);
const summaryContext = vm.createContext({});
vm.runInContext(source.slice(summaryStart, summaryEnd) + '\nthis.formatSlotSummary = formatSlotSummary;', summaryContext);
assert.equal(summaryContext.formatSlotSummary({
  appProperties: { wmlDisplayVersion: '3', wmlSummary: 'stale guessed summary' }
}), '');

const formatStart = source.indexOf('    function formatSlotMetadata(file) {');
const formatEnd = source.indexOf('    function showMemoPopup(memo) {', formatStart);
assert.ok(formatStart >= 0 && formatEnd > formatStart);
const formatContext = vm.createContext({});
vm.runInContext(source.slice(formatStart, formatEnd) + '\nthis.formatSlotMetadata = formatSlotMetadata;', formatContext);
assert.equal(formatContext.formatSlotMetadata({
  modifiedTime: '2026-11-25T00:00:00.000Z',
  appProperties: { wmlDisplayVersion: '3' }
}), '');
assert.match(formatContext.formatSlotMetadata({
  modifiedTime: '2026-11-25T00:00:00.000Z',
  appProperties: { wmlDisplayVersion: '3', wmlNativeSavedAt: '2026-11-26T00:26:00.000Z' }
}), /2026/);

assert.match(source, /wml-gd-slot-timestamp/);
assert.match(source, /head\.append\(h\('div', \{ class: 'wml-gd-slot-timestamp' \}, timestamp\)\)/);
assert.doesNotMatch(source, /profile === 'blueblood'|profile === 'overtime'|profile === 'hunt'/);
assert.match(source, /function writeSlotDisplayMetadata\(slot, snapshot\)/);
assert.match(source, /await writeSlotDisplayMetadata\(slot, snapshot\)/);

console.log('CloudSave native-envelope and non-inferred display metadata tests passed');
