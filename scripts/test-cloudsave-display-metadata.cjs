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
vm.runInContext(summaryHelpers + '\nthis.__summary = { makeSummary, buildDriveDisplayProperties, truncateDriveProperty, nativeSaveDisplay, nativeSaveProfile, nativePlayTimeText };', context);
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

const overtime = context.__summary.nativeSaveDisplay({
  game: 'overtime-1.6.2',
  gameVersion: '1.6.2',
  savedAt: new Date('2026-11-26T01:00:00Z').getTime(),
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
assert.equal(overtime.profile, 'overtime');
assert.equal(overtime.day, '14');
assert.equal(overtime.gold, '123');
assert.equal(overtime.name, '피파');
assert.equal(overtime.phase, 'service');
assert.equal(overtime.playSeconds, '3661');
assert.match(overtime.summary, /피파/);
assert.match(overtime.summary, /14주째/);
assert.match(overtime.summary, /123만원/);
assert.match(overtime.summary, /집회 중/);
assert.match(overtime.summary, /플레이 1시간 1분/);

const blueblood = context.__summary.nativeSaveDisplay({
  game: 'blueblood-0.1.7',
  gameVersion: '0.1.7',
  savedAt: new Date('2026-11-26T01:00:00Z').getTime(),
  state: {
    now: { day: 8, clock: '08:30', place: '침실' },
    player: { name: '아리아' },
    cheated: true
  },
  modData: {}
});
assert.equal(blueblood.profile, 'blueblood');
assert.equal(blueblood.day, '8');
assert.equal(blueblood.clock, '08:30');
assert.equal(blueblood.place, '침실');
assert.equal(blueblood.cheated, true);
assert.equal(blueblood.now, '');
assert.match(blueblood.summary, /08:30/);
assert.match(blueblood.summary, /침실/);

const hunt = context.__summary.nativeSaveDisplay({
  game: 'hunt-0.3.0',
  gameVersion: '0.3.0',
  savedAt: new Date('2026-11-26T01:00:00Z').getTime(),
  state: {},
  modData: {
    'tutor-chaea': { day: 7, score: 82, lessons: 5, wins: 4, losses: 1, streak: 3, job: '교사' }
  }
});
assert.equal(hunt.profile, 'hunt');
assert.equal(hunt.day, '7');
assert.equal(hunt.score, '82');
assert.equal(hunt.lessons, '5');
assert.match(hunt.summary, /7일/);
assert.match(hunt.summary, /82점/);
assert.match(hunt.summary, /4승 1패/);

const display = context.__summary.buildDriveDisplayProperties({
  ...sample,
  memo: '첫 줄\n두 번째 줄 — 메모 전체 내용'
});
assert.equal(display.wmlHasMemo, '1');
assert.equal(display.wmlNativeProfile, 'wayward');
assert.ok(display.wmlNativeSavedAt, 'per-save native timestamp must be cached in Drive appProperties');
assert.equal(display.wmlMemoPreview, '첫 줄', 'save-list memo preview must contain only the first line');
assert.doesNotMatch(display.wmlMemoPreview, /두 번째 줄/, 'later memo lines must remain available only inside the encrypted snapshot');
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
assert.match(source, /wmlNativeProfile/);
assert.match(source, /wmlNativeSavedAt/);
assert.match(source, /wmlHasMemo/);
assert.doesNotMatch(source, /hina|히나/,
  'summary extraction must not hardcode a specific character or mod');

console.log('CloudSave dynamic save-summary and memo restoration tests passed');
