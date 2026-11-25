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
vm.runInContext(summaryHelpers + '\nthis.__summary = { makeSummary, buildDriveDisplayProperties, truncateDriveProperty };', context);
const normalizeHelpers = section(
  source,
  '    function normalizeAppProperties(value, includeMemoPreview) {',
  '    function normalizeDriveSlotFiles(files) {'
);
vm.runInContext(normalizeHelpers + '\nthis.__normalizeAppProperties = normalizeAppProperties;', context);

const sample = {
  savedAt: new Date('2026-11-26T00:26:00+09:00').getTime(),
  state: {
    day: 12,
    economy: { gold: 98 },
    primaryCharacterId: 'hina',
    characters: { hina: { name: '히나', phase: '하녀 출신' } }
  },
  modData: {}
};
const summary = context.__summary.makeSummary(sample);
assert.match(summary, /히나 진행일: 12/, 'active character and day must match the native local-save summary');
assert.match(summary, /98골드/, 'economy gold must be extracted from nested state');
assert.match(summary, /하녀 출신/, 'native phase/origin metadata must be preserved');

const alternateMod = {
  state: {
    progress: { daysPassed: 23, chapter: 4 },
    wallet: { coins: 450 },
    player: { displayName: '미라', occupation: '탐험가' }
  },
  modData: { storyExtension: { trust: 88 } }
};
const alternateSummary = context.__summary.makeSummary(alternateMod);
assert.match(alternateSummary, /미라 진행일: 23/);
assert.match(alternateSummary, /450골드/);
assert.match(alternateSummary, /탐험가/);
assert.match(alternateSummary, /챕터: 4|관계: 88/,
  'additional mod-specific save fields must be discovered without a mod-ID allowlist');

const display = context.__summary.buildDriveDisplayProperties({
  ...sample,
  memo: '첫 줄\n두 번째 줄 — 메모 전체 내용'
});
assert.equal(display.wmlHasMemo, '1');
assert.match(display.wmlMemoPreview, /첫 줄 두 번째 줄/);
assert.ok(Buffer.byteLength(display.wmlSummary, 'utf8') <= 120);
assert.ok(Buffer.byteLength(display.wmlMemoPreview, 'utf8') <= 100);

const cached = context.__normalizeAppProperties({
  wmlSummary: '요약',
  wmlMemoPreview: '비공개 메모 미리보기',
  wmlHasMemo: '1',
  unrelated: 'preserved'
}, false);
assert.equal(cached.wmlSummary, '요약');
assert.equal(cached.wmlHasMemo, '1');
assert.equal(cached.wmlMemoPreview, undefined,
  'persistent local metadata cache must not retain plaintext memo previews');
assert.equal(cached.unrelated, 'preserved');

assert.match(source, /fields: 'files\(id,name,mimeType,modifiedTime,size,appProperties\),nextPageToken'/,
  'Drive list must fetch appProperties without downloading encrypted save bodies');
assert.match(source, /function writeSlotDisplayMetadata\(slot, snapshot\)/);
assert.match(source, /method: 'PATCH'[\s\S]*JSON\.stringify\(\{ appProperties \}\)/);
assert.match(source, /function openMemoForSlot\(file\)/);
assert.match(source, /decryptSnapshotEmbedded\(envelope\)/);
assert.match(source, /memoChip\.addEventListener\('click', \(\) => runAction\(\(\) => openMemoForSlot\(file\)\)\)/);
assert.match(source, /showMemoPopup\(String\(snapshot\.memo \|\| ''\)/);
assert.match(source, /await writeSlotDisplayMetadata\(slot, snapshot\)/);
assert.match(source, /wmlMemoPreview/);
assert.match(source, /wmlHasMemo/);
assert.doesNotMatch(source, /hina|히나/,
  'summary extraction must not hardcode a specific character or mod');

console.log('CloudSave dynamic save-summary and memo restoration tests passed');
