'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const root = process.cwd();
const modPath = root + '/cloud-save/mod.js';
const cryptoPath = root + '/cloud-save/crypto.js';
const source = fs.readFileSync(modPath, 'utf8');
const BASELINE = 'e58c18c28e8ecf3daed809e3c8aee95e66a32c07';
const baseline = execFileSync('git', ['show', BASELINE + ':cloud-save/mod.js'], { encoding: 'utf8' });

function section(text, start, end) {
  const a = text.indexOf(start);
  const b = text.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, 'missing section: ' + start);
  return text.slice(a, b);
}

assert.match(source, /version:\s*'0\.6\.3'/, 'version must be 0.6.3');
assert.match(source, /https:\/\/jeiky224\.github\.io\/cloud\/auth-061\.html/);
assert.match(source, /window\.open\(bridgeUrl\.toString\(\)/, 'popup must be opened synchronously');
assert.match(source, /event\.origin !== AUTH_BRIDGE_ORIGIN/);
assert.match(source, /event\.source !== bridge/);
assert.match(source, /payload\.nonce !== nonce/);
assert.match(source, /payload\.version === undefined/);
assert.match(source, /hasNativeAuthBridge && isAuthResult/);
assert.match(source, /wayward-cloud-auth-061-hello/);
assert.match(source, /bridgeUrl\.searchParams\.set\('login', forceSelectAccount \? 'select_account' : 'remember'\)/);
assert.doesNotMatch(source, /function requestNativeGoogleToken\s*\(/,
  'CloudSave must not call the native auth API directly');
assert.doesNotMatch(source, /function attemptNativeSessionRestore\s*\(/,
  'opening the mod must not launch a background native auth request');
assert.doesNotMatch(source, /attemptNativeSessionRestore\s*\(/);
assert.doesNotMatch(source, /localStorage\.setItem\([^\n]*(?:accessToken|refreshToken)/i);
assert.doesNotMatch(source, /sessionStorage\.setItem\([^\n]*(?:accessToken|refreshToken)/i);
assert.doesNotMatch(source, /restore-pending/,
  'no misleading background restore state remains');

const acceptSource = section(source, '    function acceptAccessToken(payload, nonce) {', '    function requestGoogleToken(forceSelectAccount) {');
const requestSource = section(source, '    function requestGoogleToken(forceSelectAccount) {', '    async function ensureAccessToken() {');
assert.equal(acceptSource, section(baseline, '    function acceptAccessToken(payload, nonce) {', '    function requestNativeGoogleToken(nonce, forceSelectAccount) {'),
  'token acceptance and error classification must remain unchanged from 0.6.2');
assert.doesNotMatch(requestSource, /host\.startGoogleDriveAuth(?:WithPolicy)?\s*\(/,
  'CloudSave must not call the native start API directly');
assert.doesNotMatch(requestSource, /host\.takePendingStateForNonce\s*\(/,
  'CloudSave must not poll native auth results directly');

function makeHarness({ protocol = 'https:', origin = 'https://game.example', native = true } = {}) {
  const nonce = 'a'.repeat(48);
  const listeners = new Map();
  const posted = [];
  let opened = null;
  let accepted = null;
  let nativeStartCalls = 0;
  let nativeTakeCalls = 0;
  const popup = {
    closed: false,
    postMessage(message, targetOrigin) { posted.push({ message, targetOrigin }); },
    close() { this.closed = true; }
  };
  const window = {
    location: { protocol, origin },
    WMLHost: native ? {
      startGoogleDriveAuthWithPolicy() { nativeStartCalls += 1; },
      takePendingStateForNonce() { nativeTakeCalls += 1; return ''; }
    } : undefined,
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type, fn) { if (listeners.get(type) === fn) listeners.delete(type); },
    open(url, name, features) { opened = { url, name, features }; return popup; }
  };
  const context = {
    window,
    URL,
    Date,
    String,
    Number,
    AUTH_BRIDGE_URL: 'https://jeiky224.github.io/cloud/auth-061.html',
    AUTH_BRIDGE_ORIGIN: 'https://jeiky224.github.io',
    createAuthNonce: () => nonce,
    activeAuthCancel: null,
    setTimeout: () => 1,
    clearTimeout: () => {},
    setInterval: () => 2,
    clearInterval: () => {},
    acceptAccessToken(payload, expectedNonce) {
      if (!payload || payload.nonce !== expectedNonce) throw new Error('nonce mismatch');
      if (payload.type === 'wayward-cloud-auth-error') throw new Error(payload.message || 'auth error');
      if (payload.type !== 'wayward-cloud-auth-success' ||
          typeof payload.accessToken !== 'string' ||
          payload.accessToken.length < 16 ||
          !Number.isFinite(Number(payload.expiresIn)) ||
          Number(payload.expiresIn) < 60 ||
          Number(payload.expiresIn) > 7200) {
        throw new Error('invalid token response');
      }
      accepted = payload.accessToken;
    }
  };
  const factory = vm.runInNewContext('(function(){\n' + requestSource +
    '\n return requestGoogleToken; })()', context);
  const promise = factory(false);
  assert.ok(opened, 'window.open must be called synchronously');
  const bridgeUrl = new URL(opened.url);
  assert.equal(bridgeUrl.searchParams.get('origin'), protocol === 'file:' || origin === 'null' ? 'null' : origin);
  assert.equal(bridgeUrl.searchParams.get('nonce'), nonce);
  assert.equal(bridgeUrl.searchParams.get('login'), 'remember');
  assert.equal(nativeStartCalls, 0, 'module must not start native auth directly');
  assert.equal(nativeTakeCalls, 0, 'module must not poll native results directly');
  return {
    nonce, popup, posted, listeners, promise, bridgeUrl, window,
    get accepted() { return accepted; },
    get nativeStartCalls() { return nativeStartCalls; },
    get nativeTakeCalls() { return nativeTakeCalls; },
    send(data, overrides = {}) {
      const listener = listeners.get('message');
      assert.ok(listener, 'message listener must be registered');
      listener({
        origin: overrides.origin === undefined ? 'https://jeiky224.github.io' : overrides.origin,
        source: overrides.source === undefined ? popup : overrides.source,
        data
      });
    }
  };
}

(async () => {
  // Browser GIS path: versioned ready/hello handshake is mandatory.
  {
    const h = makeHarness({ native: false });
    h.send({ version: 1, nonce: h.nonce, type: 'wayward-cloud-auth-061-ready' });
    assert.equal(h.posted.length, 1);
    assert.equal(h.posted[0].message.type, 'wayward-cloud-auth-061-hello');
    assert.equal(h.posted[0].message.nonce, h.nonce);
    h.send({ version: 1, nonce: h.nonce, type: 'wayward-cloud-auth-success',
      accessToken: 'browser-access-token-123456', expiresIn: 3600 });
    await h.promise;
    assert.equal(h.accepted, 'browser-access-token-123456');
  }

  // Android launcher bridge path: the launcher emits an unversioned result.
  {
    const h = makeHarness({ native: true });
    h.send({ nonce: h.nonce, type: 'wayward-cloud-auth-success',
      accessToken: 'native-access-token-123456', expiresIn: 3600 });
    await h.promise;
    assert.equal(h.accepted, 'native-access-token-123456');
    assert.equal(h.nativeStartCalls, 0);
    assert.equal(h.nativeTakeCalls, 0);
  }

  // Unversioned native errors remain errors; they are never converted to success.
  {
    const h = makeHarness({ native: true });
    h.send({ nonce: h.nonce, type: 'wayward-cloud-auth-error',
      message: 'Google 계정 권한 승인이 취소되었습니다.' });
    await assert.rejects(h.promise, /Google 계정 권한 승인이 취소되었습니다/);
    assert.equal(h.accepted, null);
  }

  // The same unversioned payload is rejected when no native bridge exists.
  {
    const h = makeHarness({ native: false });
    h.send({ nonce: h.nonce, type: 'wayward-cloud-auth-success',
      accessToken: 'spoofed-access-token-123456', expiresIn: 3600 });
    h.send({ version: 1, nonce: h.nonce, type: 'wayward-cloud-auth-061-ready' });
    h.send({ version: 1, nonce: h.nonce, type: 'wayward-cloud-auth-success',
      accessToken: 'browser-access-token-abcdef', expiresIn: 3600 });
    await h.promise;
    assert.equal(h.accepted, 'browser-access-token-abcdef');
  }

  // Origin, WindowProxy source, and nonce are independently enforced.
  {
    const h = makeHarness({ native: true });
    const valid = { nonce: h.nonce, type: 'wayward-cloud-auth-success',
      accessToken: 'native-access-token-abcdef', expiresIn: 3600 };
    h.send(valid, { origin: 'https://attacker.example' });
    h.send(valid, { source: {} });
    h.send({ ...valid, nonce: 'b'.repeat(48) });
    assert.equal(h.accepted, null);
    h.send(valid);
    await h.promise;
    assert.equal(h.accepted, 'native-access-token-abcdef');
  }

  // file:// keeps the opaque Origin handoff and still requires a validated result.
  {
    const h = makeHarness({ protocol: 'file:', origin: 'null', native: false });
    assert.equal(h.bridgeUrl.searchParams.get('origin'), 'null');
    h.send({ version: 1, nonce: h.nonce, type: 'wayward-cloud-auth-061-ready' });
    h.send({ version: 1, nonce: h.nonce, type: 'wayward-cloud-auth-success',
      accessToken: 'file-access-token-123456789', expiresIn: 3600 });
    await h.promise;
    assert.equal(h.accepted, 'file-access-token-123456789');
  }

  // Protected save/restore and encrypted slot I/O must be byte-identical to 0.6.2.
  for (const [start, end] of [
    ['    function buildSnapshot()', '    function firstValue(root'],
    ['    function applySnapshot(snapshot)', '    function isConnected()'],
    ['    async function writeSlotEnvelope(slot, envelope)', '    async function deleteSlot(slot)'],
    ['    async function deleteSlot(slot)', '    function buildSnapshot()']
  ]) {
    assert.equal(section(source, start, end), section(baseline, start, end),
      'protected 0.6.2 logic changed: ' + start);
  }

  const cryptoBlob = execFileSync('git', ['rev-parse', BASELINE + ':cloud-save/crypto.js'], { encoding: 'utf8' }).trim();
  const currentCryptoBlob = execFileSync('git', ['hash-object', cryptoPath], { encoding: 'utf8' }).trim();
  assert.equal(currentCryptoBlob, cryptoBlob, 'crypto.js must remain byte-for-byte identical to 0.6.2');

  console.log('CloudSave 0.6.3 auth transport and protected-data tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
