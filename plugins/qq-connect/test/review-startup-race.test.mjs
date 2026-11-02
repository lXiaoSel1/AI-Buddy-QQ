import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createQqService} from '../src/service.mjs';
import {REQUIRED_BACKEND_CAPABILITIES} from '../src/normalizer.mjs';

test('review: a late switch-on must not override a completed switch-off', async t => {
  const f = fixture(t);
  await f.setup('hunyuan', false);
  const original = f.host.invoke.bind(f.host);
  let release;
  let entered;
  const seen = new Promise(resolve => {entered = resolve;});
  f.host.invoke = async (method, payload = {}) => {
    if (method === 'social.context.read' && payload.setupAction === 'complete' && payload.autoResume === true) {
      entered();
      await new Promise(resolve => {release = resolve;});
    }
    return original(method, payload);
  };
  const on = f.call('startup.update', {autoResume: true});
  const cancelled=assert.rejects(on,{code:'QQ_CONNECTION_REVOKED'});
  await seen;
  const off = await f.call('startup.update', {autoResume: false});
  assert.equal(off.startup.autoResume, false);
  release();
  await cancelled;
  assert.equal((await f.call('status')).startup.autoResume, false, 'switch-off must win over an earlier slow switch-on');
});

test('review: a late switch-on must not rearm restore after disconnect', async t => {
  const f = fixture(t);
  await f.setup('hunyuan', false);
  const original = f.host.invoke.bind(f.host);
  let release;
  let entered;
  const seen = new Promise(resolve => {entered = resolve;});
  f.host.invoke = async (method, payload = {}) => {
    if (method === 'social.context.read' && payload.setupAction === 'complete' && payload.autoResume === true) {
      entered();
      await new Promise(resolve => {release = resolve;});
    }
    return original(method, payload);
  };
  const on = f.call('startup.update', {autoResume: true});
  const cancelled=assert.rejects(on,{code:'QQ_CONNECTION_REVOKED'});
  await seen;
  await f.call('disconnect');
  release();
  await cancelled;
  const result = await f.service.onHostEvent({type: 'tick', principal: {contextToken: 'bg'}});
  assert.notEqual(result.status, 'restored', 'disconnect must invalidate an older startup update');
});

test('a later switch-off wins even when the earlier management read returns last',async t=>{
  const f=fixture(t);await f.setup('hunyuan',false);const original=f.host.invoke.bind(f.host);let release,entered,hold=true;const waiting=new Promise(resolve=>entered=resolve);
  f.host.invoke=async(method,payload={})=>{if(hold&&method==='social.context.read'&&payload.purpose==='manage-plugin'&&!payload.setupAction){hold=false;entered();await new Promise(resolve=>release=resolve);}return original(method,payload);};
  const on=f.call('startup.update',{autoResume:true}),cancelled=assert.rejects(on,{code:'QQ_CONNECTION_REVOKED'});await waiting;
  await f.call('startup.update',{autoResume:false});release();await cancelled;assert.equal((await f.call('status')).startup.autoResume,false);
});

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
