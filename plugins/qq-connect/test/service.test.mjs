import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {getEventListeners} from 'node:events';
import {createQqService} from '../src/service.mjs';
import {normalizeOneBotEvent, REQUIRED_BACKEND_CAPABILITIES} from '../src/normalizer.mjs';
import {DirectOneBotTransport, HostOneBotTransport} from '../src/onebot.mjs';

const ROOT = resolve(process.env.AI_BUDDY_PLUGIN_TEST_ROOT ?? resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-data'));
const ACCOUNT = '10001', OWNER = '20001', OTHER = '20002', GROUP = '30001';
const principal = {contextToken: 'host-owned-app-principal'};
const capabilities = [...REQUIRED_BACKEND_CAPABILITIES, 'image', 'face', 'mface', 'json', 'xml', 'reply'];

test('QR setup failure cannot leave an enabled receiver or startup authorization',async t=>{
 const f=fixture(t),invoke=f.host.invoke.bind(f.host);f.host.invoke=async(method,payload,options)=>{if(payload.setupAction==='complete')throw Object.assign(Error('confirmation failed'),{code:'SOCIAL_SETUP_DENIED'});return invoke(method,payload,options);};
 await assert.rejects(f.service.dispatch('setup.finish',{connectionRef:'fixture-qq',characterId:'whale',contacts:[],groups:[],autoResume:true},principal),{code:'SOCIAL_SETUP_DENIED'});
 const value=await f.service.dispatch('status',{},principal);assert.equal(value.enabled,false);assert.equal(value.connected,false);assert.equal(value.startup.autoResume,false);assert.equal(f.transport.closed,true);assert.equal(f.transport.sent.length,0);
});
const pause = () => {let release;const promise = new Promise(resolve => release = resolve);return {promise, release};};

class FakeTransport {
  constructor() {this.sent = [];this.originals = new Map();this.starts = 0;this.closed = false;}
  async start(options) {this.options = options;this.closed = false;this.starts++;this.binding = {connectionId: 'fixture-connection-' + this.starts, accountId: ACCOUNT, capabilities};options.onEpoch(this.binding);return this.binding;}
  async close() {this.closed = true;}
  async send(input) {this.sent.push(input);return this.sendHook ? this.sendHook(input) : {status: 'sent', messageId: 'sent-' + this.sent.length};}
  async resolveReply({messageId}) {return this.originals.get(messageId) ?? null;}
}

function fixture(t, {path = null} = {}) {
  const runRoot = path ?? join(ROOT, 'qq-' + randomUUID()); mkdirSync(runRoot, {recursive: true});
  let instant = Date.UTC(2026, 9, 25, 22, 0, 0), seq = 0;
  const calls = [], contexts = new Map(), transport = new FakeTransport();
  const host = {calls, manageAllowed: true, workEnabled: true,
    async invoke(method, payload = {}, options = {}) {
      calls.push({method, payload});
      if (method === 'social.context.read') {
        if (payload.purpose === 'manage-plugin') return {contextToken: 'app', accountId: ACCOUNT, permissions: this.manageAllowed ? ['plugin.manage'] : [], availableCharacters: [{id: 'whale', label: '鲸鱼娘'}, {id: 'claude', label: 'Claude娘'}], managedConnections: [{ref: 'fixture-qq', platform: 'qq', accountId: ACCOUNT, label: '测试连接'}]};
        if (payload.purpose === 'qq-operator-bind') {this.boundCharacter = payload.characterId;return {contextToken: 'operator', accountId: ACCOUNT, characterId: payload.characterId, characterName: payload.characterId === 'whale' ? '鲸鱼娘' : 'Claude娘', lifeId: 'life-' + payload.characterId, operationId: 'op-' + payload.characterId, personaId: 'persona', senderId: OWNER, conversationType: 'private'};}
        const context = {contextToken: 'event-' + ++seq, characterId: payload.characterId, characterName: payload.characterId === 'whale' ? '鲸鱼娘' : 'Claude娘', lifeId: payload.lifeId, operationId: payload.operationId, personaId: payload.senderId === OWNER ? 'owner-persona' : 'other-persona', accountId: payload.accountId, senderId: payload.senderId, conversationType: payload.conversationType, conversationId: payload.conversationId, sourceMessageId: payload.sourceMessageId, ownerVerified: payload.senderId === OWNER, permissions: [], modelCapabilities: ['text', 'image']};
        if (this.contextHook) Object.assign(context, this.contextHook(context)); contexts.set(context.contextToken, context);return context;
      }
      if (method === 'activity.lease') return {leaseId: 'lease-' + ++seq, generation: 1};
      if (method === 'activity.check') {const context = contexts.get(payload.contextToken);return {valid: this.leaseValid !== false, characterId: context.characterId, lifeId: context.lifeId, operationId: context.operationId, generation: 1};}
      if (method === 'models.request') {if (this.modelHook) return this.modelHook(payload, options);return {text: '这是按真实消息生成的模拟回复。', requestId: 'model-' + ++seq, usageAccounting: 'core-model-router'};}
      if (method === 'experience.append') return {eventId: payload.eventId, recorded: true, stored: true};
      if (method === 'activity.finish') return {finished: true};
      if (method === 'proactive.offer') return {offerId: 'offer-fixture', admitted: false};
      if (method === 'proactive.claim') {
        const characterId = this.boundCharacter, recipient = this.claimRecipient ?? {conversationType: 'private', peerId: OWNER, conversationId: 'private:' + OWNER};
        const context = {contextToken: 'proactive-' + ++seq, characterId, characterName: characterId === 'whale' ? '鲸鱼娘' : 'Claude娘', lifeId: 'life-' + characterId, operationId: 'op-' + characterId, personaId: 'owner-persona', accountId: ACCOUNT, senderId: OWNER, conversationType: recipient.conversationType, conversationId: recipient.conversationId};contexts.set(context.contextToken, context);
        const claim = {admitted: true, offerId: payload.offerId, operatorGeneration: payload.operatorGeneration, sourceEventId: 'real-event', text: '这是来自真实经历候选的模拟分享。', recipient, context, lease: {leaseId: 'proactive-lease', generation: 1}};
        return this.claimHook ? this.claimHook(claim) : claim;
      }
      if (method.startsWith('owner.work.')) {if (!this.workEnabled) throw Object.assign(new Error('work unavailable'), {code: 'WORK_PLUGIN_DISABLED'});return {text: '计划已保存，等待主人批准。', taskId: payload.taskId ?? 'task-fixture', planVersion: payload.planVersion ?? 1};}
      throw new Error('Unexpected host method ' + method);
    },
  };
  const service = createQqService({databasePath: join(runRoot, 'plugin.sqlite'), host, transport, now: () => instant});
  t.after(() => service.close());
  const event = (text = '你好', overrides = {}) => ({post_type: 'message', message_type: 'private', self_id: ACCOUNT, user_id: OWNER, sender: {user_id: OWNER}, message_id: 'message-' + ++seq, time: Math.floor(instant / 1000), message: [{type: 'text', data: {text}}], ...overrides});
  async function activate({groups = [], contacts = [OWNER, OTHER]} = {}) {
    await service.dispatch('settings.update', {settings: {enabled: true, connectionRef: 'fixture-qq', accountId: ACCOUNT, contacts, groups}}, principal);
    await service.dispatch('operator.select', {characterId: 'whale'}, principal);await service.dispatch('connect', {}, principal);
  }
  return {service, host, calls, transport, event, activate, runRoot, advance(ms) {instant += ms;}, now: () => instant};
}

test('MOCK Q02/Q04: default inert and UI authority is host-validated', async t => {
  const f = fixture(t);assert.equal(f.service.status().enabled, false);assert.equal(f.transport.starts, 0);
  f.host.manageAllowed = false;
  await assert.rejects(f.service.dispatch('settings.update', {enabled: true}, {ownerVerified: true}), {code: 'PLUGIN_MANAGE_DENIED'});
  assert.equal((await f.service.receive(f.event())).status, 'inactive');
});
test('MOCK QR setup enables only the explicitly selected account, character and allowlist',async t=>{
 const f=fixture(t);await f.service.dispatch('setup.finish',{connectionRef:'fixture-qq',characterId:'whale',contacts:[OWNER],groups:[{id:GROUP}],autoResume:true},principal);
 assert.equal(f.transport.starts,1);assert.equal(f.transport.sent.length,0);const state=await f.service.dispatch('status',{},principal);assert.equal(state.startup.autoResume,true);assert.deepEqual(state.settings.contacts,[OWNER]);assert.equal(state.settings.proactiveContacts,false);assert.equal(state.settings.groups[0].quietOpener,false);assert.equal(f.calls.some(c=>c.method==='models.request'),false);
 assert.equal(f.calls.some(c=>c.payload.setupAction==='complete'&&c.payload.autoResume===true),true);
});
test('MOCK QR setup cannot choose an unverified connection or auto-enable by tick alone',async t=>{
 const f=fixture(t);await f.service.onHostEvent({type:'tick',principal});assert.equal(f.transport.starts,0);await assert.rejects(f.service.dispatch('setup.finish',{connectionRef:'untrusted',characterId:'whale',contacts:[],groups:[],autoResume:true},principal),{code:'QQ_SETUP_SELECTION_REQUIRED'});assert.equal(f.transport.starts,0);
});

test('MOCK Q01: real OneBot segment shapes preserve media; no voice understanding claim', t => {
  const f = fixture(t), binding = {connectionId: 'c', accountId: ACCOUNT, capabilities};
  const event = normalizeOneBotEvent(f.event('hi', {message: [{type: 'text', data: {text: 'https://example.org'}}, {type: 'image', data: {file: 'cache.jpg', url: 'https://example.org/i.jpg'}}, {type: 'face', data: {id: 1}}, {type: 'mface', data: {emoji_id: 2}}, {type: 'json', data: {data: '{"app":"card"}'}}, {type: 'record', data: {url: 'voice'}}]}), binding, {epochSeconds: Math.floor(f.now() / 1000), receivedAt: f.now()});
  assert.equal(event.parts.length, 6);assert.deepEqual(event.unsupported, ['record']);assert.equal(event.links[0], 'https://example.org');assert.equal(event.commandEligible, false);
});

test('MOCK Q02: allowlists and verified reply target control group admission separately', async t => {
  const f = fixture(t);await f.activate({groups: [{id: GROUP}]});
  assert.equal((await f.service.receive(f.event('hello', {user_id: '99999', sender: {user_id: '99999'}}))).reason, 'QQ_NOT_ALLOWLISTED');
  const groupEvent = more => f.event('普通话题', {message_type: 'group', group_id: GROUP, ...more});
  assert.equal((await f.service.receive(groupEvent())).status, 'observed');
  assert.equal((await f.service.receive(groupEvent({message: [{type: 'reply', data: {id: 'stranger'}}, {type: 'text', data: {text: 'hi'}}]}))).status, 'observed');
  f.transport.originals.set('mine', {message_id: 'mine', sender: {user_id: ACCOUNT}, group_id: GROUP});
  assert.equal((await f.service.receive(groupEvent({message: [{type: 'reply', data: {id: 'mine'}}, {type: 'text', data: {text: 'hi'}}]}))).status, 'sent');
  assert.equal((await f.service.receive(groupEvent({message: [{type: 'at', data: {qq: ACCOUNT}}, {type: 'text', data: {text: 'hi'}}]}))).status, 'sent');
  assert.equal(f.transport.sent.length, 2);
});

test('MOCK Q02: natural participation does not enable quiet opener; warning acknowledgment is required', async t => {
  const f = fixture(t);await f.activate({groups: [{id: GROUP, naturalParticipation: true}]});
  assert.equal((await f.service.receive(f.event('话题', {message_type: 'group', group_id: GROUP}))).status, 'sent');
  await assert.rejects(f.service.dispatch('proactive.offer', {conversationType: 'group', peerId: GROUP, sourceEventId: 'real-source'}, principal), {code: 'QQ_PROACTIVE_DISABLED'});
  await assert.rejects(f.service.dispatch('settings.update', {groups: [{id: GROUP, quietOpener: true}]}, principal), {code: 'QQ_USAGE_ACK_REQUIRED'});
  await f.service.dispatch('settings.update', {groups: [{id: GROUP, quietOpener: true, highUsageAcknowledged: true}]}, principal);
  const result = await f.service.dispatch('proactive.offer', {conversationType: 'group', peerId: GROUP, sourceEventId: 'real-source'}, principal);assert.equal(result.sent, false);
});

test('MOCK Q03/Q04: introduction once per conversation generation; APP is independent', async t => {
  const f = fixture(t);await f.activate();
  await f.service.receive(f.event());await f.service.receive(f.event());
  assert.match(f.transport.sent[0].text, /鲸鱼娘/);assert.doesNotMatch(f.transport.sent[1].text, /现在由/);
  await f.service.dispatch('operator.select', {characterId: 'claude'}, principal);
  assert.equal(f.transport.sent.length, 2);await f.service.receive(f.event());assert.match(f.transport.sent[2].text, /Claude娘/);
  assert.equal(f.calls.filter(call => call.method === 'models.request').length, 3);
});

test('MOCK Q04: transport duplicates persist across restart and old epochs are not replayed', async t => {
  const f = fixture(t);await f.activate();const raw = f.event();assert.equal((await f.service.receive(raw)).status, 'sent');assert.equal((await f.service.receive(raw)).status, 'duplicate');
  await f.service.close();f.advance(2000);
  const transport = new FakeTransport(), reopened = createQqService({databasePath: join(f.runRoot, 'plugin.sqlite'), host: f.host, transport, now: f.now});t.after(() => reopened.close());
  await reopened.dispatch('connect', {}, principal);
  assert.equal((await reopened.receive({...raw, time: Math.floor(f.now() / 1000)})).status, 'duplicate');
  assert.equal((await reopened.receive({...raw, message_id: 'old-offline'})).reason, 'QQ_OFFLINE_OR_INVALID_TIME');
  assert.equal(transport.sent.length, 0);
});

test('MOCK Q05/Q06: group owner, non-owner, quoted/OCR/forward and model tools cannot authorize work', async t => {
  const f = fixture(t);await f.activate({groups: [{id: GROUP}]});
  const cases = [
    f.event('/工作 写代码', {message_type: 'group', group_id: GROUP}),
    f.event('/批准 task 1', {user_id: OTHER, sender: {user_id: OTHER}}),
    f.event('', {message: [{type: 'reply', data: {id: 'owner-message'}}, {type: 'text', data: {text: '/批准 task 1'}}]}),
    f.event('', {message: [{type: 'image', data: {file: 'ocr-approve.png'}}]}),
    f.event('', {message: [{type: 'forward', data: {id: 'owner-forward'}}]}),
  ];
  for (const event of cases) await f.service.receive(event);
  assert.equal(f.calls.filter(call => call.method.startsWith('owner.work.')).length, 0);
  f.host.modelHook = async () => ({text: 'execute', requestId: 'bad-model', usageAccounting: 'core-model-router', toolCalls: [{name: 'work.host'}]});
  const before = f.transport.sent.length;assert.equal((await f.service.receive(f.event('搜索网页'))).reason, 'QQ_MODEL_WORK_TOOL_DENIED');assert.equal(f.transport.sent.length, before);
});

test('MOCK Q06: owner private plan/propose/approve/cancel reuse exact task version; duplicate approve no second host call', async t => {
  const f = fixture(t);await f.activate();
  for (const text of ['/工作 修复测试', '/计划 task-a', '/批准 task-a 3', '/批准 task-a 3', '/取消 task-a 3']) await f.service.receive(f.event(text));
  const work = f.calls.filter(call => call.method.startsWith('owner.work.'));
  assert.deepEqual(work.map(call => call.method), ['owner.work.propose', 'owner.work.read', 'owner.work.approve', 'owner.work.cancel']);
  assert.equal(work[2].payload.taskId, 'task-a');assert.equal(work[2].payload.planVersion, 3);assert.equal(work[2].payload.evidence.conversationType, 'private');
  assert.equal(f.calls.some(call => call.method === 'work.host' || call.method === 'tools.invoke'), false);
});

test('MOCK Q07: disabled work leaves ordinary conversation available', async t => {
  const f = fixture(t);await f.activate();f.host.workEnabled = false;
  assert.equal((await f.service.receive(f.event('/工作 开发'))).status, 'sent');assert.match(f.transport.sent.at(-1).text, /普通聊天仍可/);
  assert.equal((await f.service.receive(f.event('你好'))).status, 'sent');
});

test('MOCK C07: takeover while model is in flight cancels old result without renaming or sending', async t => {
  const f = fixture(t);await f.activate();const gate = pause(), entered = pause();
  f.host.modelHook = async () => {entered.release();await gate.promise;return {text: '旧角色回复', requestId: 'model-old', usageAccounting: 'core-model-router'};};
  const pending = f.service.receive(f.event());await entered.promise;
  await f.service.dispatch('operator.select', {characterId: 'claude'}, principal);gate.release();
  assert.equal((await pending).status, 'cancelled');assert.equal(f.transport.sent.length, 0);
});

test('MOCK C07: removing contact while model is in flight revokes pending send', async t => {
  const f = fixture(t);await f.activate();const gate = pause(), entered = pause();
  f.host.modelHook = async () => {entered.release();await gate.promise;return {text: '迟到回复', requestId: 'late', usageAccounting: 'core-model-router'};};
  const pending = f.service.receive(f.event());await entered.promise;
  await f.service.dispatch('settings.update', {contacts: []}, principal);gate.release();
  assert.equal((await pending).status, 'cancelled');assert.equal(f.transport.sent.length, 0);
});

test('MOCK C03/C05: same sender in wrong conversation scope cannot receive model or private memory', async t => {
  const f = fixture(t);await f.activate({groups: [{id: GROUP, naturalParticipation: true}]});
  f.host.contextHook = () => ({conversationId: 'private:' + OWNER});
  const result = await f.service.receive(f.event('群问题', {message_type: 'group', group_id: GROUP}));
  assert.equal(result.reason, 'QQ_TRUSTED_CONTEXT_MISMATCH');assert.equal(f.calls.filter(call => call.method === 'models.request').length, 0);assert.equal(f.transport.sent.length, 0);
});

test('MOCK C07: lease valid=false blocks final send', async t => {
  const f = fixture(t);await f.activate();f.host.leaseValid = false;
  assert.equal((await f.service.receive(f.event())).reason, 'QQ_LEASE_REVOKED');assert.equal(f.transport.sent.length, 0);
});

test('MOCK C07/Q04: unknown sends remain unknown and are never automatically resent', async t => {
  const f = fixture(t);await f.activate();f.transport.sendHook = async () => {throw new Error('timeout after external acceptance');};
  const raw = f.event();assert.equal((await f.service.receive(raw)).status, 'unknown');assert.equal((await f.service.receive(raw)).status, 'duplicate');
  const history = await f.service.dispatch('history.list', {}, principal);assert.equal(history.outbox[0].status, 'unknown');assert.equal(f.transport.sent.length, 1);
});

test('MOCK C07: proven not-submitted failure is failed, not unknown', async t => {
  const f = fixture(t);await f.activate();f.transport.sendHook = async () => {throw Object.assign(new Error('disconnected before submission'), {notSubmitted: true});};
  assert.equal((await f.service.receive(f.event())).status, 'failed');
  assert.equal((await f.service.dispatch('history.list', {}, principal)).outbox[0].status, 'failed');
});

test('MOCK Q04: host queue failure disconnects service and allows explicit new-epoch reconnect', async t => {
  const f = fixture(t);await f.activate();const before = f.service.status().epoch;
  f.transport.options.onDisconnect('fixture-failure');assert.equal(f.service.status().connected, false);
  await f.service.dispatch('connect', {}, principal);assert.equal(f.service.status().connected, true);assert.equal(f.service.status().epoch, before + 1);
});

test('MOCK Q01: direct adapter uses only login, WS new events and send receipt; no QQ history or real network', async () => {
  const requests = [], sockets = [];
  class Socket {
    constructor(url) {this.url = url;this.listeners = new Map();sockets.push(this);queueMicrotask(() => this.emit('open', {}));}
    addEventListener(name, callback) {this.listeners.set(name, callback);}
    emit(name, value) {this.listeners.get(name)?.(value);}
    close() {this.emit('close', {});}
  }
  const transport = new DirectOneBotTransport({httpUrl: 'http://127.0.0.1:3000', webSocketUrl: 'ws://127.0.0.1:3001', capabilities, WebSocketImpl: Socket, fetchImpl: async (url, options) => {requests.push({url: String(url), options});return {ok: true, json: async () => ({status: 'ok', retcode: 0, data: String(url).endsWith('get_login_info') ? {user_id: ACCOUNT} : {message_id: 'real-shape-fixture'}})};}});
  const events = [];await transport.start({accountId: ACCOUNT, onEpoch() {}, onEvent: event => events.push(event)});
  sockets[0].emit('message', {data: JSON.stringify({post_type: 'message', message_id: 'fixture'})});
  const result = await transport.send({conversationType: 'private', peerId: OWNER, text: 'fixture only'});await transport.close();
  assert.equal(result.status, 'sent');assert.equal(events.length, 1);assert.deepEqual(requests.map(row => new URL(row.url).pathname), ['/get_login_info', '/send_private_msg']);
  assert.throws(() => new DirectOneBotTransport({httpUrl: 'http://remote.example', webSocketUrl: 'ws://127.0.0.1'}), {code: 'QQ_ENDPOINT_DENIED'});
});

test('MOCK S03: native search permission off removes tool; on exposes only search.native', async t => {
  const f = fixture(t);await f.activate();await f.service.receive(f.event('联网查一下'));
  assert.deepEqual(f.calls.find(call => call.method === 'models.request').payload.toolPolicy.allowed, []);
  f.host.contextHook = () => ({permissions: ['search.native']});await f.service.receive(f.event('联网查一下'));
  assert.deepEqual(f.calls.filter(call => call.method === 'models.request').at(-1).payload.toolPolicy.allowed, ['search.native']);
});

test('MOCK Q01: backend image support without current model vision is explicitly unsupported', async t => {
  const f = fixture(t);await f.activate();f.host.contextHook = () => ({modelCapabilities: ['text']});
  const result = await f.service.receive(f.event('', {message: [{type: 'image', data: {file: 'real-shape-fixture.jpg'}}]}));
  assert.equal(result.status, 'sent');assert.match(f.transport.sent[0].text, /还没有识别/);assert.equal(f.calls.filter(call => call.method === 'models.request').length, 0);
});

test('MOCK C07: already accepted send keeps original role during takeover and is not claimed withdrawn', async t => {
  const f = fixture(t);await f.activate();const gate = pause(), entered = pause();
  f.transport.sendHook = async () => {entered.release();await gate.promise;return {status: 'sent', messageId: 'accepted-before-takeover'};};
  const pending = f.service.receive(f.event());await entered.promise;await f.service.dispatch('operator.select', {characterId: 'claude'}, principal);gate.release();
  const result = await pending;assert.equal(result.status, 'sent');assert.equal(result.memoryPending, true);
  const row = (await f.service.dispatch('history.list', {}, principal)).outbox[0];assert.equal(row.character_id, 'whale');assert.equal(row.platform_message_id, 'accepted-before-takeover');assert.doesNotMatch(row.text_value, /Claude娘/);
});

test('MOCK C07: queued old-role inbound message is not reassigned to the new operator', async t => {
  const f = fixture(t);await f.activate();const gate = pause(), entered = pause();
  f.host.modelHook = async () => {entered.release();await gate.promise;return {text: 'old', requestId: 'old', usageAccounting: 'core-model-router'};};
  const first = f.service.receive(f.event());await entered.promise;const second = f.service.receive(f.event('队列中的旧角色消息'));
  await f.service.dispatch('operator.select', {characterId: 'claude'}, principal);gate.release();
  await first;assert.equal((await second).reason, 'QQ_QUEUED_GENERATION_CHANGED');assert.equal(f.calls.filter(call => call.method === 'models.request').length, 1);
});

test('MOCK Q02/C07: core-approved proactive candidate is delivered once and unknown is not retried', async t => {
  const f = fixture(t);await f.activate();await f.service.dispatch('settings.update', {proactiveContacts: true}, principal);
  const first = await f.service.onHostEvent({type: 'proactive.deliver', offerId: 'offer-1', text: 'untrusted replacement'});assert.equal(first.status, 'sent');assert.match(f.transport.sent[0].text, /真实经历候选/);assert.doesNotMatch(f.transport.sent[0].text, /untrusted/);
  assert.equal((await f.service.deliverProactive('offer-1')).replayed, true);assert.equal(f.transport.sent.length, 1);
  f.transport.sendHook = async () => ({status: 'unknown'});assert.equal((await f.service.deliverProactive('offer-2')).status, 'unknown');assert.equal((await f.service.deliverProactive('offer-2')).replayed, true);assert.equal(f.transport.sent.length, 2);
});

test('MOCK Q02/C07: proactive host admission cannot bypass local target switch or stale life', async t => {
  const f = fixture(t);await f.activate({groups: [{id: GROUP}]});
  f.host.claimRecipient = {conversationType: 'group', peerId: GROUP, conversationId: 'group:' + GROUP};
  assert.equal((await f.service.deliverProactive('blocked-target')).reason, 'QQ_PROACTIVE_DISABLED');
  await f.service.dispatch('settings.update', {groups: [{id: GROUP, quietOpener: true, highUsageAcknowledged: true}]}, principal);
  f.host.claimHook = claim => ({...claim, context: {...claim.context, lifeId: 'wrong-life'}});
  assert.equal((await f.service.deliverProactive('bad-life')).reason, 'QQ_PROACTIVE_CONTEXT_MISMATCH');assert.equal(f.transport.sent.length, 0);
});

test('MOCK C07: trusted lifecycle revoke disconnects and retains history without permanently closing service', async t => {
  const f = fixture(t);await f.activate();await f.service.receive(f.event());
  assert.equal((await f.service.onHostEvent({type: 'lifecycle.revoke'})).status, 'revoked');assert.equal(f.service.status().connected, false);
  assert.equal((await f.service.dispatch('history.list', {}, principal)).messages.length, 1);
  await f.service.dispatch('connect', {}, principal);assert.equal(f.service.status().connected, true);
});

test('MOCK Q04: host pump failure signals disconnect; idle wait listeners are removed', async () => {
  const disconnected = pause();let signal, count = 0, listeners = 0;
  const transport = new HostOneBotTransport({async invoke(method, payload, options) {
    if (method === 'connections.open') return {connectionId: 'managed-queue', accountId: ACCOUNT, capabilities};
    if (method === 'connections.close') return {closed: true};
    if (method === 'connections.events') {signal = options.signal;listeners = Math.max(listeners, getEventListeners(signal, 'abort').length);if (++count >= 4) throw Object.assign(new Error('queue failed'), {code: 'FIXTURE_QUEUE_DISCONNECTED'});return {events: [], cursor: count};}
    throw new Error(method);
  }});
  await transport.start({connectionRef: 'fixture', accountId: ACCOUNT, onEvent() {}, onEpoch() {}, onDisconnect: reason => disconnected.release(reason)});
  assert.equal(await disconnected.promise, 'FIXTURE_QUEUE_DISCONNECTED');await transport.close();assert.equal(listeners, 0);assert.equal(getEventListeners(signal, 'abort').length, 0);
});

test('MOCK C07: takeover during reply-author resolution cannot reassign old input', async t => {
  const f = fixture(t);await f.activate({groups: [{id: GROUP}]});const gate = pause(), entered = pause();
  f.transport.resolveReply = async () => {entered.release();await gate.promise;return {message_id: 'mine', sender: {user_id: ACCOUNT}, group_id: GROUP};};
  const pending = f.service.receive(f.event('', {message_type: 'group', group_id: GROUP, message: [{type: 'reply', data: {id: 'mine'}}, {type: 'text', data: {text: '旧角色消息'}}]}));
  await entered.promise;await f.service.dispatch('operator.select', {characterId: 'claude'}, principal);gate.release();
  assert.equal((await pending).reason, 'QQ_QUEUED_GENERATION_CHANGED');assert.equal(f.calls.filter(call => call.method === 'models.request').length, 0);
});

test('MOCK C07/Q04: concurrent connect shares one start and disable during handshake cannot reopen', async t => {
  const f = fixture(t);
  await f.service.dispatch('settings.update', {enabled: true, connectionRef: 'fixture-qq', accountId: ACCOUNT, contacts: [OWNER]}, principal);
  await f.service.dispatch('operator.select', {characterId: 'whale'}, principal);
  const originalStart = f.transport.start.bind(f.transport), gate = pause(), entered = pause();let starts = 0;
  f.transport.start = async options => {starts++;entered.release();await gate.promise;return originalStart(options);};
  const first = f.service.dispatch('connect', {}, principal), second = f.service.dispatch('connect', {}, principal);await entered.promise;
  await f.service.dispatch('settings.update', {enabled: false}, principal);gate.release();
  const results = await Promise.allSettled([first, second]);assert.equal(starts, 1);assert.equal(results.every(row => row.status === 'rejected' && row.reason.code === 'QQ_CONNECTION_REVOKED'), true);assert.equal(f.service.status().connected, false);
});

test('MOCK C04/C05/Q02: quiet allowlisted group records received-only experience in original scope without model or reply', async t => {
  const f = fixture(t);await f.activate({groups: [{id: GROUP}]});
  const result = await f.service.receive(f.event('普通群消息', {message_type: 'group', group_id: GROUP}));
  assert.equal(result.status, 'observed');assert.equal(result.experienceRecorded, true);
  const experiences = f.calls.filter(call => call.method === 'experience.append');assert.equal(experiences.length, 1);
  assert.equal(experiences[0].payload.sourceKind, 'qq-received');assert.equal(experiences[0].payload.visibilityScope.conversationId, 'group:' + GROUP);
  assert.equal(experiences[0].payload.understandingState, 'not-understood');assert.equal(experiences[0].payload.presentationState, 'not-presented');assert.equal(experiences[0].payload.userReadState, 'unknown');assert.equal(experiences[0].payload.attention, false);
  assert.equal(f.calls.filter(call => call.method === 'activity.lease').at(-1).payload.purpose, 'qq-observe');
  assert.equal(f.calls.filter(call => call.method === 'models.request' || call.method.startsWith('owner.work.')).length, 0);assert.equal(f.transport.sent.length, 0);
});

test('MOCK C04/C05/Q05: quiet group work command is received-only and never executes; host refusal remains local pending', async t => {
  const f = fixture(t);await f.activate({groups: [{id: GROUP}]});
  const first = await f.service.receive(f.event('/批准 task-a 1', {message_type: 'group', group_id: GROUP}));assert.equal(first.status, 'work-denied');
  assert.equal(f.calls.filter(call => call.method === 'experience.append').length, 1);assert.equal(f.calls.filter(call => call.method.startsWith('owner.work.') || call.method === 'models.request').length, 0);assert.equal(f.transport.sent.length, 0);
  const invoke = f.host.invoke.bind(f.host);f.host.invoke = async (method, ...args) => {if (method === 'experience.append') throw Object.assign(new Error('Host rejected append'), {code: 'EXPERIENCE_HOST_UNAVAILABLE'});return invoke(method, ...args);};
  const result = await f.service.receive(f.event('另一条安静群消息', {message_type: 'group', group_id: GROUP}));assert.equal(result.status, 'experience-pending');assert.equal(result.reason, 'EXPERIENCE_HOST_UNAVAILABLE');
  const messages = (await f.service.dispatch('history.list', {conversationId: 'group:' + GROUP}, principal)).messages;
  const pending = messages.find(row => row.status === 'experience-pending');assert.equal(pending.event.conversationId, 'group:' + GROUP);assert.equal(pending.error_code, 'EXPERIENCE_HOST_UNAVAILABLE');
});

test('MOCK S03/Q04: APP retains complete sources by model request while QQ sends only three brief links', async t => {
  const f = fixture(t);await f.activate();const sources = Array.from({length: 5}, (_, index) => ({title: '来源' + (index + 1), url: 'https://example.org/source-' + (index + 1), retrievedAt: '2026-10-25T22:00:00Z', snippet: '可见资料摘录' + index}));
  f.host.modelHook = async () => ({text: '角色自然回答。', requestId: 'provider-request-sources', usageAccounting: 'core-model-router', sources});
  const raw = f.event('原始收到正文不能改');await f.service.receive(raw);
  const history = await f.service.dispatch('history.list', {conversationId: 'private:' + OWNER}, principal), row = history.messages[0], sent = history.outbox[0];
  assert.equal(row.event.plainText, '原始收到正文不能改');assert.equal(row.sourceGroups[0].providerRequestId, 'provider-request-sources');assert.deepEqual(row.sourceGroups[0].sources, sources);
  assert.equal(sent.sourceGroups[0].sources.length, 5);assert.match(sent.text_value, /source-3/);assert.doesNotMatch(sent.text_value, /source-4/);assert.doesNotMatch(sent.display_text_value, /https?:\/\//);assert.match(sent.display_text_value, /角色自然回答/);
});

test('MOCK C05/S03/Q04: private and group conversation filters retain their own source attribution', async t => {
  const f = fixture(t);await f.activate({groups: [{id: GROUP, naturalParticipation: true}]});
  f.host.modelHook = async payload => ({text: '已依据当前会话资料回答。', requestId: 'model-' + payload.conversationId, usageAccounting: 'core-model-router', sources: [{title: payload.conversationId, url: payload.conversationId.startsWith('group:') ? 'https://example.org/group' : 'https://example.org/private'}]});
  await f.service.receive(f.event('私聊问题'));await f.service.receive(f.event('群问题', {message_type: 'group', group_id: GROUP}));
  const privateHistory = await f.service.dispatch('history.list', {conversationId: 'private:' + OWNER}, principal), groupHistory = await f.service.dispatch('history.list', {conversationId: 'group:' + GROUP}, principal);
  assert.equal(privateHistory.messages.length, 1);assert.equal(privateHistory.outbox.length, 1);assert.equal(privateHistory.messages[0].sourceGroups[0].sources[0].url, 'https://example.org/private');
  assert.equal(groupHistory.messages.length, 1);assert.equal(groupHistory.outbox.length, 1);assert.equal(groupHistory.outbox[0].sourceGroups[0].sources[0].url, 'https://example.org/group');
  assert.deepEqual(new Set(groupHistory.conversations.map(row => row.conversationType)), new Set(['private', 'group']));
});

test('MOCK S03/Q04: absent sources stay absent; unknown delivery retains sources without claiming read', async t => {
  const f = fixture(t);await f.activate();await f.service.receive(f.event('普通问候'));
  let history = await f.service.dispatch('history.list', {}, principal);assert.deepEqual(history.messages[0].sourceGroups, []);assert.deepEqual(history.outbox[0].sourceGroups, []);
  f.host.modelHook = async () => ({text: '有真实来源的模拟回答。', requestId: 'model-unknown-send', usageAccounting: 'core-model-router', sources: [{title: '资料', url: 'https://example.org/actual-source'}]});
  f.transport.sendHook = async () => ({status: 'unknown'});await f.service.receive(f.event('查询'));
  history = await f.service.dispatch('history.list', {}, principal);const uncertain = history.outbox.find(row => row.status === 'unknown');assert.equal(uncertain.sourceGroups[0].providerRequestId, 'model-unknown-send');
  assert.equal(Object.hasOwn(uncertain, 'readAt'), false);assert.equal(Object.hasOwn(uncertain, 'isRead'), false);assert.equal(f.calls.filter(call => call.method === 'experience.append').every(call => call.payload.presentationState === 'not-user-read' || call.payload.presentationState === 'not-presented'), true);
});

test('MOCK Q06/Q07: new owner command may retry a proven unavailable approval after work installation, then submits only once', async t => {
  const f = fixture(t);await f.activate();f.host.workEnabled = false;
  const first = f.event('/批准 task-recovery 2');assert.equal((await f.service.receive(first)).status, 'sent');assert.match(f.transport.sent.at(-1).text, /普通聊天仍可/);
  assert.equal((await f.service.receive(f.event('普通聊天继续'))).status, 'sent');
  f.host.workEnabled = true;
  assert.equal((await f.service.receive(first)).status, 'duplicate');
  assert.equal((await f.service.receive(f.event('/批准 task-recovery 2'))).status, 'sent');
  assert.equal((await f.service.receive(f.event('/批准 task-recovery 2'))).replayed, true);
  const approvals = f.calls.filter(call => call.method === 'owner.work.approve');assert.equal(approvals.length, 2);assert.equal(approvals[0].payload.requestId, approvals[1].payload.requestId);
});

test('MOCK Q06/Q07: uncertain prior approval remains non-replayable even after a new explicit owner message', async t => {
  const f = fixture(t);await f.activate();const invoke = f.host.invoke.bind(f.host);
  f.host.invoke = async (method, payload, options) => {const result = await invoke(method, payload, options);if (method === 'owner.work.approve') throw Object.assign(new Error('outcome unknown after submission'), {code: 'WORK_RESULT_UNKNOWN'});return result;};
  assert.equal((await f.service.receive(f.event('/批准 task-unknown 1'))).reason, 'WORK_RESULT_UNKNOWN');
  f.host.invoke = invoke;
  const again = await f.service.receive(f.event('/批准 task-unknown 1'));assert.equal(again.replayed, true);assert.equal(again.status, 'unknown');
  assert.equal(f.calls.filter(call => call.method === 'owner.work.approve').length, 1);
});

function revokeAfterLeaseCheck(f) {
  const invoke = f.host.invoke.bind(f.host);let revocation = Promise.resolve();
  f.host.invoke = async (method, payload, options) => {
    const result = await invoke(method, payload, options);
    if (method === 'activity.check') queueMicrotask(() => queueMicrotask(() => {revocation = f.service.onHostEvent({type: 'lifecycle.revoke'});}));
    return result;
  };
  return () => revocation;
}

test('AUDIT MOCK C07: revoke in final lease-check microtask gap prevents transport submission', async t => {
  const f = fixture(t);await f.activate();const revoked = revokeAfterLeaseCheck(f);
  await f.service.receive(f.event('撤销窗口里的回复'));await revoked();
  assert.equal(f.transport.sent.length, 0, 'must not call transport after trusted lifecycle revocation');
});

test('AUDIT MOCK Q06/C07: revoke in final lease-check microtask gap prevents owner work dispatch', async t => {
  const f = fixture(t);await f.activate();const revoked = revokeAfterLeaseCheck(f);
  await f.service.receive(f.event('/批准 task-revoke-gap 1'));await revoked();
  assert.equal(f.calls.filter(call => call.method === 'owner.work.approve').length, 0, 'must not submit work after lease check was superseded');
});

test('AUDIT MOCK Q06: proven pre-submission lease denial does not permanently consume a plan approval', async t => {
  const f = fixture(t);await f.activate();f.host.leaseValid = false;
  assert.equal((await f.service.receive(f.event('/批准 task-lease-retry 1'))).reason, 'QQ_LEASE_REVOKED');
  assert.equal(f.calls.filter(call => call.method === 'owner.work.approve').length, 0);
  f.host.leaseValid = true;
  assert.equal((await f.service.receive(f.event('/批准 task-lease-retry 1'))).status, 'sent');
  assert.equal(f.calls.filter(call => call.method === 'owner.work.approve').length, 1);
  await f.service.receive(f.event('/批准 task-lease-retry 1'));
  assert.equal(f.calls.filter(call => call.method === 'owner.work.approve').length, 1);
});

test('AUDIT MOCK Q01/C07: malformed sent message IDs stay unknown rather than fabricating a successful receipt', async t => {
  const f = fixture(t);await f.activate();
  for (const messageId of ['', {}, Number.NaN, ' malformed id ']) {
    f.transport.sendHook = async () => ({status: 'sent', messageId});
    assert.equal((await f.service.receive(f.event('模拟不合法回执'))).status, 'unknown');
  }
  const rows = (await f.service.dispatch('history.list', {}, principal)).outbox;
  assert.equal(rows.every(row => row.platform_message_id === null && row.status === 'unknown'), true);
});

test('AUDIT MOCK Q04: delayed events from an old OneBot socket cannot contaminate a new connection epoch', async () => {
  const sockets = [], events = [], disconnections = [];
  class Socket {
    constructor() {this.listeners = new Map();sockets.push(this);queueMicrotask(() => this.emit('open', {}));}
    addEventListener(name, callback) {this.listeners.set(name, callback);}
    emit(name, value) {this.listeners.get(name)?.(value);}
    close() {this.closeRequested = true;}
  }
  const transport = new DirectOneBotTransport({httpUrl: 'http://127.0.0.1:3000', webSocketUrl: 'ws://127.0.0.1:3001', capabilities, WebSocketImpl: Socket, fetchImpl: async () => ({ok: true, json: async () => ({status: 'ok', retcode: 0, data: {user_id: ACCOUNT}})})});
  const options = {accountId: ACCOUNT, onEpoch() {}, onEvent: event => events.push(event), onDisconnect: reason => disconnections.push(reason)};
  try {
    await transport.start(options);await transport.close();await transport.start(options);
    sockets[0].emit('message', {data: JSON.stringify({post_type: 'message', message_id: 'late-old-socket'})});sockets[0].emit('close', {});
    assert.equal(events.length, 0);assert.equal(disconnections.length, 0);assert.equal(sockets.length, 2);
  } finally {await transport.close();}
});

test('AUDIT MOCK C07/Q04: stopping during login discovery cannot later create a WebSocket', async () => {
  const sockets = [], gate = pause(), entered = pause();
  class Socket {
    constructor() {this.listeners = new Map();sockets.push(this);queueMicrotask(() => this.listeners.get('open')?.({}));}
    addEventListener(name, callback) {this.listeners.set(name, callback);}
    close() {}
  }
  const transport = new DirectOneBotTransport({httpUrl: 'http://127.0.0.1:3000', webSocketUrl: 'ws://127.0.0.1:3001', capabilities, WebSocketImpl: Socket, fetchImpl: async () => {entered.release();await gate.promise;return {ok: true, json: async () => ({status: 'ok', retcode: 0, data: {user_id: ACCOUNT}})};}});
  try {
    const opening = transport.start({accountId: ACCOUNT, onEvent() {}, onEpoch() {}});await entered.promise;await transport.close();gate.release();
    const result = await Promise.allSettled([opening]);assert.equal(result[0].status, 'rejected');assert.equal(sockets.length, 0);
  } finally {await transport.close();}
});

test('AUDIT MOCK C07: host adapter reports a proven disconnected preflight as not submitted', async () => {
  const transport = new HostOneBotTransport({async invoke() {throw new Error('must never reach host');}});
  await assert.rejects(transport.send({conversationType: 'private', peerId: OWNER, text: 'not submitted'}), error => error.code === 'QQ_DISCONNECTED' && error.notSubmitted === true);
});

test('AUDIT MOCK Q02/C07: proactive delivery also stops at final lease-check microtask revocation', async t => {
  const f = fixture(t);await f.activate();await f.service.dispatch('settings.update', {proactiveContacts: true}, principal);const revoked = revokeAfterLeaseCheck(f);
  await f.service.deliverProactive('offer-final-gap');await revoked();assert.equal(f.transport.sent.length, 0);
});

test('AUDIT2 MOCK C07: close during managed connection open cannot publish a stale epoch or leave a connection allocated', async () => {
  const gate = pause(), entered = pause(), calls = [], epochs = [];
  const transport = new HostOneBotTransport({async invoke(method, payload) {
    calls.push({method, payload});
    if (method === 'connections.open') {entered.release();await gate.promise;return {connectionId: 'late-managed', accountId: ACCOUNT, capabilities};}
    if (method === 'connections.close') return {closed: true};
    throw new Error('must not pump a closed connection');
  }});
  try {
    const opening = transport.start({connectionRef: 'fixture', accountId: ACCOUNT, onEvent() {}, onEpoch: binding => epochs.push(binding)});
    await entered.promise;await transport.close();gate.release();
    const result = await Promise.allSettled([opening]);assert.equal(result[0].status, 'rejected');assert.equal(epochs.length, 0);
    assert.equal(calls.filter(call => call.method === 'connections.close' && call.payload.connectionId === 'late-managed').length, 1);
  } finally {await transport.close();}
});

test('AUDIT2 MOCK Q06: host receipt for a different task or plan cannot be presented as this approval succeeding', async t => {
  const f = fixture(t);await f.activate();const invoke = f.host.invoke.bind(f.host);
  f.host.invoke = async (method, payload, options) => {const result = await invoke(method, payload, options);return method === 'owner.work.approve' ? {...result, taskId: 'wrong-task', planVersion: 9} : result;};
  const result = await f.service.receive(f.event('/批准 expected-task 1'));assert.equal(result.reason, 'QQ_WORK_RECEIPT_MISMATCH');assert.equal(f.transport.sent.length, 0);
  f.host.invoke = invoke;const repeated = await f.service.receive(f.event('/批准 expected-task 1'));assert.equal(repeated.status, 'unknown');assert.equal(repeated.replayed, true);
  assert.equal(f.calls.filter(call => call.method === 'owner.work.approve').length, 1);
});

test('AUDIT2 MOCK C04/C05: explicit negative experience receipt stays pending and is not claimed in core memory', async t => {
  const f = fixture(t);await f.activate({groups: [{id: GROUP}]});const invoke = f.host.invoke.bind(f.host);
  f.host.invoke = async (method, payload, options) => {const result = await invoke(method, payload, options);return method === 'experience.append' ? {stored: false, accepted: false} : result;};
  const result = await f.service.receive(f.event('安静群真实收到但本体未收录', {message_type: 'group', group_id: GROUP}));
  assert.equal(result.status, 'experience-pending');assert.equal(result.reason, 'QQ_EXPERIENCE_NOT_ACCEPTED');assert.equal(result.experienceRecorded, undefined);
  assert.equal(f.calls.filter(call => call.method === 'models.request').length, 0);assert.equal(f.transport.sent.length, 0);
});

test('AUDIT3 MOCK Q02/C07: quote lookup and send carry original host-issued scope and duplicates do not query the backend again', async t => {
  const f = fixture(t);await f.activate({groups: [{id: GROUP}]});const lookups = [];
  f.transport.resolveReply = async input => {lookups.push(input);return {message_id: input.messageId, sender: {user_id: ACCOUNT}, group_id: GROUP};};
  const raw = f.event('', {message_type: 'group', group_id: GROUP, message: [{type: 'reply', data: {id: 'own-message'}}, {type: 'text', data: {text: '引用当前账号的消息'}}]});
  assert.equal((await f.service.receive(raw)).status, 'sent');assert.equal((await f.service.receive(raw)).status, 'duplicate');assert.equal(lookups.length, 1);
  const lookup = lookups[0], sent = f.transport.sent[0];
  for (const scope of [lookup, sent]) {assert.ok(scope.contextToken);assert.ok(scope.leaseId);assert.equal(scope.generation, 1);assert.equal(scope.accountId, ACCOUNT);assert.equal(scope.characterId, 'whale');assert.equal(scope.lifeId, 'life-whale');assert.equal(scope.operationId, 'op-whale');assert.equal(scope.senderId, OWNER);assert.equal(scope.conversationId, 'group:' + GROUP);}
});

test('AUDIT3 MOCK Q05/Q06: non-owner cannot reclaim another owner unavailable approval', async t => {
  const f = fixture(t);await f.activate({groups: [{id: GROUP, naturalParticipation: true}]});f.host.workEnabled = false;
  await f.service.receive(f.event('/批准 owner-unavailable 1'));f.host.workEnabled = true;
  await f.service.receive(f.event('/批准 owner-unavailable 1', {user_id: OTHER, sender: {user_id: OTHER}}));
  await f.service.receive(f.event('/批准 owner-unavailable 1', {message_type: 'group', group_id: GROUP}));
  assert.equal(f.calls.filter(call => call.method === 'owner.work.approve').length, 1);
  await f.service.receive(f.event('/批准 owner-unavailable 1'));assert.equal(f.calls.filter(call => call.method === 'owner.work.approve').length, 2);
});

for (const [receiptName, receipt] of [['recorded:false', {recorded: false}], ['empty-object', {}], ['undefined', undefined]]) {
  test('ACK-STRICT MOCK C04/C05: ' + receiptName + ' is not a positive core experience receipt', async t => {
    const f = fixture(t);await f.activate({groups: [{id: GROUP}]});const invoke = f.host.invoke.bind(f.host);
    f.host.invoke = async (method, payload, options) => {const result = await invoke(method, payload, options);return method === 'experience.append' ? receipt : result;};
    const result = await f.service.receive(f.event('未经本体确认的经历', {message_type: 'group', group_id: GROUP}));
    assert.equal(result.status, 'experience-pending');assert.equal(result.experienceRecorded, undefined);
    assert.equal(f.transport.sent.length, 0);assert.equal(f.calls.filter(call => call.method === 'models.request').length, 0);
  });
}

test('ACK-STRICT MOCK C07: negative outbound memory ACK preserves external sent fact and never retries the send', async t => {
  const f = fixture(t);await f.activate();const invoke = f.host.invoke.bind(f.host);
  f.host.invoke = async (method, payload, options) => {const result = await invoke(method, payload, options);return method === 'experience.append' ? payload.sourceKind === 'qq-received' ? {recorded: true} : {recorded: false} : result;};
  const raw = f.event('实际已发，但记忆尚未确认');const result = await f.service.receive(raw);
  assert.equal(result.status, 'sent');assert.equal(result.memoryPending, true);assert.equal((await f.service.receive(raw)).status, 'duplicate');assert.equal(f.transport.sent.length, 1);
  const history = await f.service.dispatch('history.list', {}, principal);assert.equal(history.outbox[0].status, 'sent');assert.equal(history.outbox[0].error_code, 'QQ_EXPERIENCE_RECONCILIATION_REQUIRED');
});

test('ACK-STRICT MOCK C04/C05: recorded true cannot override another explicit false acknowledgement flag', async t => {
  const f = fixture(t);await f.activate({groups: [{id: GROUP}]});const invoke = f.host.invoke.bind(f.host);let falseField;
  f.host.invoke = async (method, payload, options) => {const result = await invoke(method, payload, options);return method === 'experience.append' ? {recorded: true, [falseField]: false} : result;};
  for (const field of ['stored', 'accepted', 'ok']) {falseField = field;const result = await f.service.receive(f.event('明确拒绝 ' + field, {message_type: 'group', group_id: GROUP}));assert.equal(result.status, 'experience-pending');assert.equal(result.reason, 'QQ_EXPERIENCE_NOT_ACCEPTED');}
});

test('ACK-STRICT MOCK C04: private inbound without a positive recorded ACK also remains pending before model generation', async t => {
  const f = fixture(t);await f.activate();const invoke = f.host.invoke.bind(f.host);
  f.host.invoke = async (method, payload, options) => {const result = await invoke(method, payload, options);return method === 'experience.append' ? {} : result;};
  const result = await f.service.receive(f.event('私聊经历仍待确认'));assert.equal(result.status, 'experience-pending');assert.equal(result.reason, 'QQ_EXPERIENCE_RECEIPT_REQUIRED');
  assert.equal(f.calls.filter(call => call.method === 'models.request').length, 0);assert.equal(f.transport.sent.length, 0);
});
