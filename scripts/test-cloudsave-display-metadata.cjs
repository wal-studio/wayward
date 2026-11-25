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

const context = vm.createContext({});
const summaryHelpers = section(
  source,
  '    function firstValue(root, patterns) {',
  '    function applySnapshot(snapshot) {'
);
vm.runInContext(summaryHelpers + '\nthis.__summary = { makeSummary, buildDriveDisplayProperties, nativeSaveDisplay };', context);

const savedAt = new Date('2026-11-26T00:26:00+09:00').getTime();
const sample = {
  savedAt,
  state: {
    day: 12,
    economy: { gold: 98 },
    primaryCharacterId: 'hina',
    characters: { hina: { name: '히나', phase: '하녀 출신' } }
  },
  modData: {}
};
const summary = context.__summary.makeSummary(sample);
assert.match(summary, /히나/);
assert.match(summary, /일 12/);
assert.match(summary, /재화 98/);
assert.match(summary, /하녀 출신/);
assert.doesNotMatch(summary, /골드|만원|주째|플레이/);

const blueblood = context.__summary.nativeSaveDisplay({
  game: 'blueblood-0.1.7',
  savedAt,
  nativeSave: { savedAt: '2026-11-26T00:26:00+09:00', game: { id: 'blueblood-0.1.7' } },
  state: { now: { day: 8, clock: '08:30', place: '침실' } },
  modData: {}
});
assert.match(blueblood.summary, /일 8/);
assert.match(blueblood.summary, /시간: 08:30/);
assert.match(blueblood.summary, /장소: 침실/);
assert.equal(blueblood.savedAt, '2026-11-25T15:26:00.000Z');

const overtime = context.__summary.nativeSaveDisplay({
  game: 'overtime-1.6.2',
  savedAt,
  state: {
    day: 14,
    economy: { gold: 123 },
    primaryCharacterId: 'wife',
    characters: { wife: { name: '피파' } },
    phase: 'service',
    wfPlaySeconds: 3661
  },
  modData: {}
});
assert.match(overtime.summary, /피파/);
assert.match(overtime.summary, /일 14/);
assert.match(overtime.summary, /재화 123/);
assert.doesNotMatch(overtime.summary, /만원|주째|집회 중|플레이 1시간/);

const empty = context.__summary.nativeSaveDisplay({ state: {}, modData: {} });
assert.equal(empty.summary, '', 'unknown or absent save fields must not produce synthetic game information');

const properties = context.__summary.buildDriveDisplayProperties({
  savedAt,
  state: { day: 2, player: { name: '주인공' } },
  memo: '첫 줄\n둘째 줄은 비공개 본문'
});
assert.equal(properties.wmlSummary, '주인공 · 일 2');
assert.equal(properties.wmlNativeSavedAt, '2026-11-25T15:26:00.000Z');
assert.equal(properties.wmlMemoPreview, '첫 줄');
assert.equal(properties.wmlHasMemo, '1');
assert.equal(properties.wmlNativeProfile, undefined);
assert.equal(properties.wmlNativeCheated, undefined);
assert.doesNotMatch(properties.wmlMemoPreview, /둘째 줄/);

const formatStart = source.indexOf('    function formatSlotMetadata(file) {');
const formatEnd = source.indexOf('    function showMemoPopup(memo) {', formatStart);
assert.ok(formatStart >= 0 && formatEnd > formatStart);
const formatContext = vm.createContext({});
vm.runInContext(source.slice(formatStart, formatEnd) + '\nthis.formatSlotMetadata = formatSlotMetadata;', formatContext);
const timestamp = formatContext.formatSlotMetadata({
  modifiedTime: '2026-11-25T00:00:00.000Z',
  appProperties: {
    wmlNativeSavedAt: '2026-11-26T00:26:00.000Z',
    wmlNativeProfile: 'blueblood',
    wmlNativeCheated: '1'
  }
});
assert.match(timestamp, /2026/);
assert.match(timestamp, /11/);
assert.doesNotMatch(timestamp, /치트|KB|MB/);
assert.equal(formatContext.formatSlotMetadata({ appProperties: {} }), '');

assert.match(source, /wml-gd-slot-timestamp/);
assert.match(source, /head\.append\(h\('div', \{ class: 'wml-gd-slot-timestamp' \}, timestamp\)\)/);
assert.doesNotMatch(source, /profile === 'blueblood'|profile === 'overtime'|profile === 'hunt'/);
assert.match(source, /function writeSlotDisplayMetadata\(slot, snapshot\)/);
assert.match(source, /await writeSlotDisplayMetadata\(slot, snapshot\)/);

console.log('CloudSave unified save-card metadata tests passed');
