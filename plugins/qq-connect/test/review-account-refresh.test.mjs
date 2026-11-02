import test from 'node:test';
import assert from 'node:assert/strict';
import {mountPage, ok, refuse} from '../../../test/page-harness.mjs';
import {createQqPage} from '../src/client/index.mjs';

test('review C-4: switching accounts must discard the previous account chat view', async t => {
  let accountB = false;
  const oldHistory = structuredClone(HISTORY);
  oldHistory.messages[0].event.plainText = 'ONLY_ACCOUNT_A_PRIVATE_MESSAGE';
  const newHistory = {conversations: [], messages: [], outbox: []};
  const page = mountPage(t, createQqPage, routes({
    status: () => ok(accountB ? {...RUNNING, settings: settings({connectionRef:'qq-B', accountId:'10002', contacts:[]})} : RUNNING),
    'choices.get': () => ok({characters: CATALOG, connections: [{ref: accountB ? 'qq-B' : 'qq-ref', accountId: accountB ? '10002' : '10001', label: accountB ? 'Account B' : 'Account A'}]}),
    'history.list': () => ok(accountB ? newHistory : oldHistory),
    'onboarding.contacts': () => ok({accountRef: accountB ? 'qq-B' : 'qq-ref', contacts:[], groups:[]}),
  }));
  await page.settle();
  await page.click('聊天与工作');
  assert.ok(page.text().includes('ONLY_ACCOUNT_A_PRIVATE_MESSAGE'));
  accountB = true;
  await page.dispatch('ai-buddy:social-accounts-changed');
  assert.ok(!page.text().includes('ONLY_ACCOUNT_A_PRIVATE_MESSAGE'), 'the accounts-changed refresh must not retain account A history under B');
});

test('C-4: an old account history reply cannot write into the new account page',async t=>{
  let accountB=false,release,entered;const waiting=new Promise(resolve=>entered=resolve);
  const history=structuredClone(HISTORY);history.messages[0].event.plainText='LATE_PRIVATE_ACCOUNT_A';
  const page=mountPage(t,createQqPage,routes({
    status:()=>ok(accountB?{...RUNNING,settings:settings({connectionRef:'qq-B',accountId:'10002',contacts:[]})}:RUNNING),
    'choices.get':()=>ok({characters:CATALOG,connections:[{ref:accountB?'qq-B':'qq-ref',accountId:accountB?'10002':'10001',label:accountB?'B':'A'}]}),
    'history.list':payload=>{if(!accountB&&payload.limit===50){entered();return new Promise(resolve=>release=()=>resolve(ok(history)));}return ok({conversations:[],messages:[],outbox:[]});},
    'onboarding.contacts':()=>ok({accountRef:accountB?'qq-B':'qq-ref',contacts:[],groups:[]})
  }));
  await page.settle();await page.click('聊天与工作');await waiting;accountB=true;await page.dispatch('ai-buddy:social-accounts-changed');release();await page.settle();
  assert.ok(!page.text().includes('LATE_PRIVATE_ACCOUNT_A'));assert.ok(page.text().includes('还没有会话'));
});

test('C-4: an old directory reply is ignored and dirty allow-lists stay only on the same account',async t=>{
  let accountB=false,release,waitOld=true;const page=mountPage(t,createQqPage,routes({
    status:()=>ok(accountB?{...RUNNING,settings:settings({connectionRef:'qq-B',accountId:'10002',contacts:[]})}:RUNNING),
    'choices.get':()=>ok({characters:CATALOG,connections:[{ref:accountB?'qq-B':'qq-ref',accountId:accountB?'10002':'10001',label:accountB?'B':'A'}]}),
    'onboarding.contacts':()=>{if(!accountB&&waitOld){waitOld=false;return new Promise(resolve=>release=()=>resolve(ok({accountRef:'qq-ref',contacts:[{id:'29999',label:'OLD_ACCOUNT_DIRECTORY'}],groups:[]})));}return ok({accountRef:accountB?'qq-B':'qq-ref',contacts:[{id:'28888',label:'NEW_ACCOUNT_DIRECTORY'}],groups:[]});}
  }));
  await page.settle();await page.click('允许的联系人与群');await page.change('新增允许群的群号','39999');await page.click('添加群');
  await page.click('刷新');assert.ok(page.text().includes('39999'),'same-account refresh keeps unsaved edits');
  accountB=true;await page.dispatch('ai-buddy:social-accounts-changed');release();await page.settle();
  assert.ok(!page.text().includes('39999'),'old allow-list is not carried to B');assert.ok(!page.text().includes('OLD_ACCOUNT_DIRECTORY'));assert.ok(page.text().includes('NEW_ACCOUNT_DIRECTORY'));
});

const RUNTIME = {mode: 'runtime', blockers: []};
const CATALOG = [{id: 'hunyuan', label: '混元'}, {id: 'deepseek', label: 'DeepSeek'}];
const settings = (extra = {}) => ({enabled: true, connectionRef: 'qq-ref', accountId: '10001', contacts: ['20001'], groups: [], proactiveContacts: false, updatePolicy: 'manual', ...extra});
// What the 2.0.2 backend answers with no QQ account (QQ_UNCONNECTED in service.mjs).
const NO_ACCOUNT = {pluginId: '@ai-buddy/qq-connect', enabled: false, connected: false, operator: null, settings: {enabled: false, connectionRef: '', accountId: '', contacts: [], groups: [], proactiveContacts: false, updatePolicy: 'manual'}, startup: {autoResume: false}, accountRequired: true, storedAccountData: false, checkedAt: null};
// A takeover stored by 2.0.1 with the character id as its name; the real host never sends a display name.
const RUNNING = {pluginId: '@ai-buddy/qq-connect', enabled: true, connected: true, operator: {characterId: 'hunyuan', lifeId: 'l', operationId: 'o', displayName: 'hunyuan', generation: 1}, settings: settings(), startup: {autoResume: false}, checkedAt: Date.now() - 60000};
const HISTORY = {conversations: [{conversationId: 'private:20001', conversationType: 'private', peerId: '20001', lastActivity: Date.now()}], messages: [{message_key: 'm1', conversation_id: 'private:20001', received_at: Date.now() - 5000, sender_id: '20001', event: {plainText: '在吗'}}], outbox: [{request_id: 'r1', conversation_id: 'private:20001', created_at: Date.now() - 4000, text_value: '在的', status: 'sent'}, {request_id: 'r2', conversation_id: 'private:20001', created_at: Date.now() - 3000, text_value: '稍等', status: 'unknown'}]};
const routes = over => async (action, payload) => {
  const answer = over[action];
  if (typeof answer === 'function') return answer(payload);
  if (answer) return answer;
  if (action === 'readiness') return ok(RUNTIME);
  if (action === 'history.list') return ok({conversations: [], messages: [], outbox: []});
  return refuse('UNEXPECTED_' + action);
};
