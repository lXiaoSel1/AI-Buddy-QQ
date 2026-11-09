import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {createQqService} from '../src/service.mjs';
import {REQUIRED_BACKEND_CAPABILITIES} from '../src/normalizer.mjs';

// Public service behavior with real isolated SQLite persistence. Only the external
// host authority/model and QQ transport are synthetic; no network/account is used.
const ROOT = resolve(process.env.AI_BUDDY_PLUGIN_TEST_ROOT ?? resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-data'));
const ACCOUNT = '10001', CONTACT = '20001';
const principal = {contextToken: 'synthetic-app-principal'};
const gate = () => {let resolve;const promise = new Promise(r => {resolve = r;});return {promise, resolve};};
const settle = task => task.then(value => ({status: 'fulfilled', value}), error => ({status: 'rejected', code: error.code}));

async function fixture(t) {
  const runRoot = join(ROOT, 'qq-settings-revocation-' + randomUUID());
  mkdirSync(runRoot, {recursive: true});
  const databasePath = join(runRoot, 'plugin.sqlite');
  const instant = Date.UTC(2026, 10, 7, 12), contexts = new Map(), sent = [], gates = new Set();
  let serial = 0, nextManagementGate = null, nextModelGate = null;
  let manageAllowed = true, characterLabel = 'Synthetic character';
  const host = {async invoke(method, payload = {}) {
    if (method === 'social.context.read') {
      if (payload.purpose === 'manage-plugin') {
        // Capture the external response before delaying it, including catalog metadata.
        const context = {contextToken: 'synthetic-manage', accountId: ACCOUNT, permissions: manageAllowed ? ['plugin.manage'] : [], availableCharacters: [{id: 'role', label: characterLabel}], managedConnections: [{ref: 'synthetic-qq', platform: 'qq', accountId: ACCOUNT}]};
        if (nextManagementGate) {const held = nextManagementGate;nextManagementGate = null;held.entered.resolve();await held.release.promise;}
        return context;
      }
      if (payload.purpose === 'qq-operator-bind') return {contextToken: 'synthetic-operator', accountId: ACCOUNT, characterId: 'role', lifeId: 'life-role', operationId: 'op-role', operatorGeneration: 1};
      if (payload.purpose === 'qq-message') {
        const value = {...payload, contextToken: 'event-' + ++serial, personaId: 'synthetic-persona', permissions: [], modelCapabilities: []};
        contexts.set(value.contextToken, value);return value;
      }
    }
    if (method === 'activity.lease') return {leaseId: 'lease-' + ++serial, generation: 1};
    if (method === 'activity.check') {const value = contexts.get(payload.contextToken);return {valid: true, characterId: value.characterId, lifeId: value.lifeId, operationId: value.operationId, generation: 1};}
    if (method === 'experience.append') return {recorded: true};
    if (method === 'models.request') {
      if (nextModelGate) {const held = nextModelGate;nextModelGate = null;held.entered.resolve();await held.release.promise;}
      return {text: 'Synthetic reply', requestId: 'synthetic-model-' + ++serial, usageAccounting: 'core-model-router'};
    }
    if (method === 'activity.finish') return {finished: true};
    throw Error('Unexpected external method: ' + method);
  }};
  const transport = {
    async start(options) {const binding = {connectionId: 'synthetic-connection', accountId: ACCOUNT, capabilities: [...REQUIRED_BACKEND_CAPABILITIES]};options.onEpoch(binding);return binding;},
    async close() {},
    async send(input) {sent.push(input);return {status: 'sent', messageId: 'synthetic-sent-' + sent.length};},
  };
  let service = createQqService({databasePath, host, transport, now: () => instant});
  t.after(async () => {for (const held of gates) held.release.resolve();await service.close();});
  await service.dispatch('settings.update', {settings: {enabled: true, connectionRef: 'synthetic-qq', accountId: ACCOUNT, contacts: [CONTACT], groups: []}}, principal);
  await service.dispatch('operator.select', {characterId: 'role'}, principal);
  await service.dispatch('connect', {}, principal);
  const hold = () => {const held = {entered: gate(), release: gate()};gates.add(held);return held;};
  return {get service() {return service;}, sent,
    holdNextManagement() {return nextManagementGate = hold();},
    holdNextModel() {return nextModelGate = hold();},
    setManagementAllowed(value) {manageAllowed = value;},
    setCharacterLabel(value) {characterLabel = value;},
    async reopen() {await service.close();service = createQqService({databasePath, host, transport, now: () => instant});return service;},
    event() {return {post_type: 'message', message_type: 'private', self_id: ACCOUNT, user_id: CONTACT, sender: {user_id: CONTACT}, message_id: 'synthetic-in-' + ++serial, time: instant / 1000, message: [{type: 'text', data: {text: 'Synthetic inbound after settings action'}}]};},
  };
}

test('QQ1: late earlier style save cannot restore a contact after a newer allow-list removal', async t => {
  const f = await fixture(t), before = f.service.status().settings, held = f.holdNextManagement();
  const earlier = settle(f.service.dispatch('settings.update', {settings: {...before, replyStyle: 'brief'}}, principal));
  await held.entered.promise;
  f.setCharacterLabel('Current synthetic character');
  await f.service.dispatch('settings.update', {settings: {...before, contacts: []}}, principal);
  held.release.resolve();const result = await earlier;
  const incoming = await f.service.receive(f.event()), state = f.service.status();
  assert.equal(f.sent.length, 0, 'an older settings completion must not authorize a QQ send after the newer contact removal');
  assert.deepEqual(state.settings.contacts, []);
  assert.equal(incoming.reason, 'QQ_NOT_ALLOWLISTED');
  assert.deepEqual(result, {status: 'rejected', code: 'QQ_CONNECTION_REVOKED'});
  assert.equal(state.settings.replyStyle, 'inherit');
  assert.equal(state.operator.displayName, 'Current synthetic character', 'a stale management response must not overwrite current operator metadata');
  await f.reopen();
  assert.deepEqual(f.service.status().settings, state.settings, 'the newer allow-list is retained after reopening SQLite');
  assert.equal(f.service.status().operator.displayName, 'Current synthetic character');
});

test('QQ1: late earlier style save cannot re-enable replies after a newer pause', async t => {
  const f = await fixture(t), before = f.service.status().settings, held = f.holdNextManagement();
  const earlier = settle(f.service.dispatch('settings.update', {settings: {...before, replyStyle: 'brief'}}, principal));
  await held.entered.promise;
  await f.service.dispatch('settings.update', {settings: {...before, enabled: false}}, principal);
  held.release.resolve();const result = await earlier;
  const state = f.service.status(), incoming = await f.service.receive(f.event());
  assert.equal(state.enabled, false, 'an older settings completion must not undo the newer pause');
  assert.equal(state.connected, false);
  assert.equal(f.sent.length, 0);
  assert.equal(incoming.status, 'inactive');
  assert.deepEqual(result, {status: 'rejected', code: 'QQ_CONNECTION_REVOKED'});
  await f.reopen();
  assert.deepEqual(f.service.status().settings, state.settings, 'the newer pause is retained after reopening SQLite');
});

test('QQ1 control: denied and invalid settings leave state and an unrelated waiting reply intact', async t => {
  const f = await fixture(t), before = f.service.status(), held = f.holdNextModel();
  const pending = f.service.receive(f.event());
  await held.entered.promise;
  f.setCharacterLabel('Uncommitted synthetic character');
  f.setManagementAllowed(false);
  await assert.rejects(f.service.dispatch('settings.update', {settings: {...before.settings, enabled: false}}, principal), {code: 'PLUGIN_MANAGE_DENIED'});
  assert.deepEqual(f.service.status(), before);
  f.setManagementAllowed(true);
  await assert.rejects(f.service.dispatch('settings.update', {settings: {...before.settings, replyStyle: 'unsupported'}}, principal), {code: 'QQ_REPLY_STYLE_INVALID'});
  assert.deepEqual(f.service.status(), before, 'a malformed settings action must not refresh metadata or change control state');
  held.release.resolve();
  assert.equal((await pending).status, 'sent');
  assert.equal(f.sent.length, 1, 'the previously allowed reply is not cancelled by a rejected settings action');
});

test('QQ1 control: a settings action awaiting management does not cancel an unrelated waiting reply', async t => {
  const f = await fixture(t), before = f.service.status().settings, model = f.holdNextModel();
  const pending = f.service.receive(f.event());
  await model.entered.promise;
  const management = f.holdNextManagement();
  const save = settle(f.service.dispatch('settings.update', {settings: {...before, replyStyle: 'brief'}}, principal));
  await management.entered.promise;
  model.release.resolve();
  assert.equal((await pending).status, 'sent');
  assert.equal(f.sent.length, 1);
  management.release.resolve();
  assert.equal((await save).status, 'fulfilled');
  assert.equal(f.service.status().settings.replyStyle, 'brief');
});
