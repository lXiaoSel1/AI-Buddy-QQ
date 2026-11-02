import test from 'node:test';
import assert from 'node:assert/strict';
import {mountPage, ok, refuse} from '../../../test/page-harness.mjs';
import {createQqPage} from '../src/client/index.mjs';

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

test('甲11: with no QQ account the page opens on setup step 1, not on a red error', async t => {
  const page = mountPage(t, createQqPage, routes({status: ok(NO_ACCOUNT), 'choices.get': ok({characters: CATALOG, connections: []}), 'onboarding.open': ok({opened: true})}));
  await page.settle();
  const text = page.text();
  assert.ok(text.includes('用哪个 QQ 账号？'), text);
  assert.ok(text.includes('还没有已登录的 QQ 账号'));
  assert.ok(!text.includes('设置没读到') && !text.includes('操作未完成'));
  assert.equal(page.all(n => String(n.props.className ?? '').includes('qq-alert err')).length, 0);
  assert.equal(page.button('扫码连接').props.className, 'pri', 'connecting is the one main action');
  await page.click('扫码连接');
  assert.equal(page.count('onboarding.open'), 1);
});

test('甲11: an older backend that refuses with SOCIAL_ACCOUNT_REQUIRED still lands on step 1', async t => {
  const page = mountPage(t, createQqPage, routes({status: refuse('SOCIAL_ACCOUNT_REQUIRED'), 'choices.get': refuse('SOCIAL_ACCOUNT_REQUIRED')}));
  await page.settle();
  assert.ok(page.text().includes('用哪个 QQ 账号？'));
  assert.ok(!page.text().includes('操作未完成'));
});

test('甲11: any other read failure is a yellow card with the code in technical details', async t => {
  const page = mountPage(t, createQqPage, routes({status: refuse('PLUGIN_MANAGE_DENIED'), 'choices.get': ok({characters: [], connections: []})}), {lang: 'en'});
  await page.settle();
  const text = page.text();
  assert.ok(text.includes('Plugin status is unavailable'), text);
  assert.ok(text.includes('Technical details') && text.includes('PLUGIN_MANAGE_DENIED'));
  assert.equal(page.all(n => String(n.props.className ?? '').includes('qq-alert err')).length, 0, 'not red');
  assert.ok(!text.includes('操作未完成'));
});

test('C-2/C-1: the takeover card shows 「混元」 from the character list, never the id, with the portrait variable', async t => {
  const page = mountPage(t, createQqPage, routes({status: ok(RUNNING), 'choices.get': ok({characters: CATALOG, connections: [{ref: 'qq-ref', accountId: '10001', label: '我的QQ'}]})}));
  await page.settle();
  const text = page.text();
  assert.ok(text.includes('混元 正在接管「我的QQ」'), text);
  assert.ok(!text.includes('hunyuan'), 'no raw id anywhere in the page text');
  assert.match(text, /上次检查 \d\d:\d\d 通过/);
  const faces = page.all(n => n.type === 'i' && String(n.props.style?.backgroundImage ?? '').includes('--buddy-portrait-hunyuan'));
  assert.ok(faces.length >= 1);assert.equal(faces[0].props.style.backgroundImage, 'var(--buddy-portrait-hunyuan,none)');
  const face = page.all(n => String(n.props.className ?? '').startsWith('qq-portrait') && n.children.some(c => c.type === 'i'))[0];
  assert.equal(page.textOf(face.children[0]), '混', 'the letter stays under the picture');
});

test('C-2: a character missing from the list is 「当前角色」', async t => {
  const page = mountPage(t, createQqPage, routes({status: ok(RUNNING), 'choices.get': ok({characters: [{id: 'deepseek', label: 'DeepSeek'}], connections: []})}));
  await page.settle();
  assert.ok(page.text().includes('当前角色 正在接管'));assert.ok(!page.text().includes('hunyuan'));
});

test('F1: resume-on-start is a switch on the status card; a host that cannot switch it on says where to go', async t => {
  let mode = 'ok';
  const page = mountPage(t, createQqPage, routes({status: ok(RUNNING), 'choices.get': ok({characters: CATALOG, connections: []}), 'startup.update': payload => mode === 'ok' ? ok({...RUNNING, startup: {autoResume: payload.autoResume}}) : refuse('SOCIAL_SETUP_DENIED')}));
  await page.settle();
  const toggle = () => page.all(n => n.props.role === 'switch' && n.props['aria-label'] === 'AI 酱启动时自动恢复')[0];
  assert.equal(toggle().props['aria-checked'], false);
  await page.click(toggle());
  assert.deepEqual(page.calls.filter(c => c.action === 'startup.update').at(-1).payload, {autoResume: true});
  mode = 'denied';await page.click(toggle());
  assert.ok(page.text().includes('这个版本的 AI 酱还不能在这里打开'), page.text());
});

test('F3: send status has a tick or clock and its colour; tabs carry icons and the chat count', async t => {
  const page = mountPage(t, createQqPage, routes({status: ok(RUNNING), 'choices.get': ok({characters: CATALOG, connections: []}), 'history.list': ok(HISTORY), 'onboarding.contacts': ok({accountRef: 'qq-ref', contacts: [{id: '20001', label: '小林'}], groups: []})}));
  await page.settle();
  const tabs = page.all(n => n.props.role === 'tab');
  assert.ok(tabs.every(tab => tab.children[0].type === 'svg'), 'each tab starts with an icon');
  assert.equal(page.textOf(tabs[2]), '聊天与工作1');
  await page.click('聊天与工作');
  const states = page.all(n => String(n.props.className ?? '').startsWith('qq-st '));
  assert.deepEqual(states.map(n => [n.props.className, page.textOf(n)]), [['qq-st ok', '已发送'], ['qq-st warn', '需要核对'], ['qq-st warn', '结果未知，等待核对']]);
  const deliveryStates = states.filter(n => page.textOf(n) !== '需要核对');
  assert.equal(deliveryStates.length, 2);assert.ok(deliveryStates.every(n => n.children[0].type === 'svg'));
  assert.ok(page.text().includes('小林'), 'contact names load by themselves on the chats tab');
});

test('C-4: an accounts-changed event reads status and accounts again', async t => {
  let state = NO_ACCOUNT;
  const page = mountPage(t, createQqPage, routes({status: () => ok(state), 'choices.get': () => ok({characters: CATALOG, connections: state === NO_ACCOUNT ? [] : [{ref: 'qq-ref', accountId: '10001', label: '我的QQ'}]})}));
  await page.settle();
  const before = page.count('status');state = {...NO_ACCOUNT, accountRequired: false};
  await page.dispatch('ai-buddy:social-accounts-changed');
  assert.equal(page.count('status'), before + 1);assert.ok(page.text().includes('我的QQ'), 'the new account is offered');
});

test('F2: selected contacts say 「只回复」; a group already listed says so; groups have a people icon', async t => {
  const page = mountPage(t, createQqPage, routes({status: ok({...RUNNING, settings: settings({groups: [{id: '30001', naturalParticipation: false, quietOpener: false, highUsageAcknowledged: false}]})}), 'choices.get': ok({characters: CATALOG, connections: []}), 'onboarding.contacts': ok({accountRef: 'qq-ref', contacts: [{id: '20001', label: '小林'}, {id: '20002', label: '阿杰'}], groups: []})}));
  await page.settle();await page.click('允许的联系人与群');
  assert.ok(page.text().includes('小林20001只回复'), page.text());
  await page.change('新增允许群的群号', '30001');
  assert.ok(page.text().includes('这个群已经在名单里。'));
  const group = page.all(n => n.props.className === 'qq-face grp')[0];assert.equal(group.children[0].type, 'svg');
});

test('C-3: the page root scrolls itself and is not width-capped when embedded', async t => {
  const page = mountPage(t, createQqPage, routes({status: ok(NO_ACCOUNT), 'choices.get': ok({characters: [], connections: []})}));
  await page.settle();
  const css = page.styles.find(el => el.id === 'qq-style').textContent;
  assert.match(css, /\.qq\{[^}]*height:100%;min-height:0;overflow-y:auto/);
  assert.ok(!/\.qq\{[^}]*min-height:100%/.test(css));
  assert.ok(css.includes('html[data-buddy-embedded] .qq-wrap{max-width:none}'));
  assert.ok(css.includes('.qq-face>i{position:absolute;inset:0;background-size:cover'));
});
