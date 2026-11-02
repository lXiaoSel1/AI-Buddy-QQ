import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createQqService} from '../src/service.mjs';
import {REQUIRED_BACKEND_CAPABILITIES} from '../src/normalizer.mjs';

const ROOT = resolve(process.env.AI_BUDDY_PLUGIN_TEST_ROOT ?? resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-data'));
const ACCOUNT = '10001', OWNER = '20001';
const principal = {contextToken: 'host-owned-app-principal'};

class FakeTransport {
  constructor() {this.sent = [];this.starts = 0;}
  async start(options) {this.options = options;this.starts++;const binding = {connectionId: 'c-' + this.starts, accountId: ACCOUNT, capabilities: [...REQUIRED_BACKEND_CAPABILITIES]};options.onEpoch(binding);return binding;}
  async close() {}
  async send(input) {this.sent.push(input);return {status: 'sent', messageId: 'sent-' + this.sent.length};}
  async resolveReply() {return null;}
}

// Shaped like the real host: the management context carries the catalog ({id,label}); operator binds and message
// contexts are publicContext() rows, which have no characterName or displayName (social-plugin-broker.mjs:42).
function fixture(t, {path = join(ROOT, 'qq-names-' + randomUUID()), catalog = [{id: 'hunyuan', label: '混元'}, {id: 'deepseek', label: 'DeepSeek'}]} = {}) {
  mkdirSync(path, {recursive: true});
  let instant = Date.UTC(2026, 9, 29, 14, 0, 0), seq = 0;
  const calls = [], contexts = new Map(), transport = new FakeTransport();
  const host = {calls, catalog, refuseComplete: false, bound: null,
    async invoke(method, payload = {}) {
      calls.push({method, payload});
      if (method === 'social.context.read') {
        if (payload.purpose === 'manage-plugin') {
          if (payload.setupAction === 'complete' && this.refuseComplete) throw Object.assign(Error('denied'), {code: 'SOCIAL_SETUP_DENIED'});
          return {contextToken: 'mgmt-' + ++seq, accountId: ACCOUNT, permissions: ['plugin.manage'], availableCharacters: this.catalog, managedConnections: [{ref: 'qq-ref', platform: 'qq', accountId: ACCOUNT, label: '我的QQ'}], ...(payload.setupAction ? {onboarding: {saved: true}} : {})};
        }
        if (payload.purpose === 'plugin-background') return {contextToken: 'bg-' + ++seq, accountId: ACCOUNT, permissions: ['plugin.activity'], availableCharacters: this.catalog, managedConnections: []};
        if (payload.purpose === 'qq-operator-bind') {this.bound = payload.characterId;return {contextToken: 'op-' + ++seq, characterId: payload.characterId, personaId: 'persona', lifeId: 'life-' + payload.characterId, operationId: 'op-' + payload.characterId, accountId: ACCOUNT, generation: 1, connectionRef: 'model', modelCapabilities: [], permissions: [], conversationId: 'restore-check', ownerVerified: false, operatorGeneration: ++seq};}
        const context = {contextToken: 'event-' + ++seq, characterId: payload.characterId, personaId: 'persona', lifeId: payload.lifeId, operationId: payload.operationId, accountId: payload.accountId, generation: 1, connectionRef: 'model', modelCapabilities: [], permissions: [], conversationId: payload.conversationId, conversationType: payload.conversationType, sourceMessageId: payload.sourceMessageId, senderId: payload.senderId, ownerVerified: false, operatorGeneration: payload.operatorGeneration};
        contexts.set(context.contextToken, context);return context;
      }
      if (method === 'activity.lease') return {leaseId: 'lease-' + ++seq, generation: 1};
      if (method === 'activity.check') {const c = contexts.get(payload.contextToken);return {valid: true, characterId: c.characterId, lifeId: c.lifeId, operationId: c.operationId, generation: 1};}
      if (method === 'models.request') return {text: '你好呀', requestId: 'model-' + ++seq, usageAccounting: 'core-model-router'};
      if (method === 'experience.append') return {eventId: payload.eventId, recorded: true};
      if (method === 'activity.finish') return {finished: true};
      throw new Error('Unexpected host method ' + method);
    }};
  let service = createQqService({databasePath: join(path, 'plugin.sqlite'), host, transport, now: () => instant});
  t.after(() => service.close());
  const message = (text = '在吗') => ({post_type: 'message', message_type: 'private', self_id: ACCOUNT, user_id: OWNER, sender: {user_id: OWNER}, message_id: 'm-' + ++seq, time: Math.floor(instant / 1000) + 5, message: [{type: 'text', data: {text}}]});
  const call = (action, payload = {}) => service.dispatch(action, payload, principal);
  return {host, calls, transport, call, message, path, advance(ms) {instant += ms;},
    get service() {return service;},
    async reopen() {await service.close();service = createQqService({databasePath: join(path, 'plugin.sqlite'), host, transport, now: () => instant});t.after(() => service.close());return service;},
    async setup(characterId = 'hunyuan', autoResume = false) {return call('setup.finish', {connectionRef: 'qq-ref', characterId, contacts: [OWNER], groups: [], autoResume});}};
}

test('C-2: the takeover card and the first QQ message use the character’s label, never its id', async t => {
  const f = fixture(t);
  const finished = await f.setup('hunyuan');
  assert.equal(finished.operator.displayName, '混元');
  assert.equal((await f.call('status')).operator.displayName, '混元');
  f.advance(10000);
  const result = await f.transport.options.onEvent(f.message());
  assert.equal(result.status, 'sent');
  assert.equal(f.transport.sent.length, 1);
  assert.ok(f.transport.sent[0].text.startsWith('现在由混元陪你聊天。\n'), f.transport.sent[0].text);
  assert.ok(!f.transport.sent[0].text.includes('hunyuan'), 'the id never reaches a real chat');
  await f.call('operator.select', {characterId: 'deepseek'});
  assert.equal((await f.call('status')).operator.displayName, 'DeepSeek');
});

test('C-2: an operator stored by 2.0.1 with the id as its name is corrected when read and in the next introduction', async t => {
  const f = fixture(t);
  await f.setup('hunyuan');
  await f.service.close();
  const db = new DatabaseSync(join(f.path, 'plugin.sqlite'));
  const stored = JSON.parse(db.prepare("SELECT value FROM a_plugin_kv WHERE key='operator'").get().value);
  db.prepare("UPDATE a_plugin_kv SET value=? WHERE key='operator'").run(JSON.stringify({...stored, displayName: 'hunyuan'}));db.close();
  await f.reopen();
  const status = await f.call('status');
  assert.equal(status.operator.displayName, '混元', 'corrected on read');
  const check = new DatabaseSync(join(f.path, 'plugin.sqlite'), {readOnly: true});
  assert.equal(JSON.parse(check.prepare("SELECT value FROM a_plugin_kv WHERE key='operator'").get().value).displayName, '混元', 'and the correction is kept');check.close();
  await f.call('connect');
  f.advance(10000);
  await f.transport.options.onEvent(f.message());
  assert.ok(f.transport.sent.at(-1).text.startsWith('现在由混元陪你聊天。'), f.transport.sent.at(-1).text);
});

test('C-2: a character missing from the list gets a neutral word, not its id', async t => {
  const f = fixture(t, {catalog: [{id: 'deepseek', label: 'DeepSeek'}, {id: 'hunyuan', label: 'hunyuan'}]});
  await f.setup('hunyuan');
  assert.equal((await f.call('status')).operator.displayName, null);
  assert.deepEqual((await f.call('choices.get')).characters, [{id: 'deepseek', label: 'DeepSeek'}, {id: 'hunyuan', label: null}]);
  f.advance(10000);
  await f.transport.options.onEvent(f.message());
  assert.ok(f.transport.sent[0].text.startsWith('现在由当前接管者陪你聊天。'), f.transport.sent[0].text);
  assert.ok(!f.transport.sent[0].text.includes('hunyuan'));
});

test('F1: the status carries the last connection check once connected', async t => {
  const f = fixture(t);
  assert.equal((await f.call('status')).checkedAt, null);
  await f.setup('hunyuan');
  const status = await f.call('status');
  assert.equal(status.connected, true);assert.equal(status.checkedAt, Date.UTC(2026, 9, 29, 14, 0, 0));
});

test('F1: resume-on-start can be switched on the status card; off never needs the host, on is recorded by the host first', async t => {
  const f = fixture(t);
  await assert.rejects(f.call('startup.update', {autoResume: true}), {code: 'QQ_OPERATOR_REQUIRED'}, 'not before setup');
  await f.setup('hunyuan', false);
  await assert.rejects(f.call('startup.update', {autoResume: 'yes'}), {code: 'QQ_STARTUP_INVALID'});
  const on = await f.call('startup.update', {autoResume: true});
  assert.equal(on.startup.autoResume, true);assert.equal(on.startup.characterId, 'hunyuan');assert.equal(on.startup.lifeId, 'life-hunyuan');
  const asked = f.calls.filter(c => c.payload.setupAction === 'complete');
  assert.deepEqual(asked.at(-1).payload.autoResume, true);
  f.host.refuseComplete = true;
  const off = await f.call('startup.update', {autoResume: false});
  assert.equal(off.startup.autoResume, false, 'a host that refuses cannot keep it on');
  await assert.rejects(f.call('startup.update', {autoResume: true}), {code: 'SOCIAL_SETUP_DENIED'});
  assert.equal((await f.call('status')).startup.autoResume, false, 'a refused switch-on changes nothing');
  await f.reopen();
  assert.equal((await f.service.onHostEvent({type: 'tick', principal: {contextToken: 'bg'}})).status, 'ignored', 'no restore after it was switched off');
});
