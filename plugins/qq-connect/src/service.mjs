import {readStoredQqSettings,writeStoredQqSettings} from './settings-store.mjs';
import {createHash} from 'node:crypto';
import {openStore} from '../../../shared/store.mjs';
import {assert, fail} from '../../../shared/errors.mjs';
import {QQ_DEFAULTS, normalizeSettings, SETTINGS_SCHEMA} from './settings.mjs';
import {normalizeOneBotEvent, parseWorkCommand, platformMessageId} from './normalizer.mjs';
import {HostOneBotTransport, assertBackendCapabilities} from './onebot.mjs';
const VERSION = '2.0.6';

export const PLUGIN_ID = '@ai-buddy/qq-connect';
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const json = value => JSON.stringify(value);
const replyText = value => typeof value === 'string' ? value : typeof value?.text === 'string' ? value.text : '';
// A character id is never a name. Names come from the host's character list (availableCharacters label); a value
// equal to the id (what older bindings stored) is treated as no name, and the caller falls back to a neutral word.
const nameOk = (value, id) => typeof value === 'string' && value.trim() && value !== id ? value : null;
const labelOf = (context, id) => {const row = (context?.availableCharacters ?? []).find(value => value?.id === id);return nameOk(row?.label, id) ?? nameOk(row?.name, id);};
const choicesOf = context => ({
  ...(['brief','natural','detailed'].includes(context.globalReplyStyle) ? {globalReplyStyle: context.globalReplyStyle} : {}),
  characters: (context.availableCharacters ?? []).filter(row => typeof row?.id === 'string' && row.id).map(row => ({id: row.id, label: labelOf(context, row.id)})),
  connections: (context.managedConnections ?? []).filter(row => row.platform === 'qq').map(row => ({ref: row.ref, accountId: row.accountId, label: row.label ?? row.accountId})),
});
// No QQ account is connected: there is no account database yet. The page still reads a status (nothing set up, so it
// opens on setup step 1), the character and account choices, and empty history; anything else is refused upstream.
export const QQ_UNCONNECTED = Object.freeze({actions: Object.freeze(['status', 'choices.get', 'settings.get', 'history.list']), read(action, payload, context, {storedAccountData = false} = {}) {
  if (action === 'status') return {pluginId: PLUGIN_ID, schemaVersion: 1, version: VERSION, enabled: false, connected: false, operator: null, epoch: 0, settings: structuredClone(QQ_DEFAULTS), capabilities: [], transportError: null, checkedAt: null, historyRetained: true, offlineReplay: false, startup: {autoResume: false}, accountRequired: true, storedAccountData};
  if (action === 'choices.get') return choicesOf(context);
  if (action === 'settings.get') return {settings: structuredClone(QQ_DEFAULTS), schema: SETTINGS_SCHEMA};
  return {conversations: [], messages: [], outbox: []};
}});

export function createQqService({databasePath, host, transport = null, now = Date.now, timeZone = 'America/New_York'} = {}) {
  assert(host?.invoke, 'QQ_HOST_REQUIRED', '需要公共社交合同服务');
  // Validate the configured zone without converting it to a machine-local date.
  new Intl.DateTimeFormat('en', {timeZone}).format(now());
  const store = openStore({databasePath, pluginId: PLUGIN_ID, schemaVersion: 1, minimumWriter: '0.1.0-dev.2'}), db = store.db;
  db.exec(`CREATE TABLE IF NOT EXISTS qq_messages (
    message_key TEXT PRIMARY KEY,account_id TEXT NOT NULL,conversation_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,source_message_id TEXT NOT NULL,character_id TEXT,life_id TEXT,
    operator_generation INTEGER NOT NULL,epoch INTEGER NOT NULL,received_at INTEGER NOT NULL,
    event_json TEXT NOT NULL,status TEXT NOT NULL,error_code TEXT);
    CREATE TABLE IF NOT EXISTS qq_outbox (
    request_id TEXT PRIMARY KEY,message_key TEXT NOT NULL,account_id TEXT NOT NULL,
    conversation_id TEXT NOT NULL,character_id TEXT NOT NULL,life_id TEXT NOT NULL,
    operator_generation INTEGER NOT NULL,text_value TEXT NOT NULL,status TEXT NOT NULL,
    platform_message_id TEXT,created_at INTEGER NOT NULL,error_code TEXT);
    CREATE TABLE IF NOT EXISTS qq_introductions (
    account_id TEXT NOT NULL,conversation_id TEXT NOT NULL,operator_generation INTEGER NOT NULL,
    status TEXT NOT NULL,PRIMARY KEY(account_id,conversation_id,operator_generation));
    CREATE TABLE IF NOT EXISTS qq_work_commands (
    request_id TEXT PRIMARY KEY,action TEXT NOT NULL,task_id TEXT,plan_version INTEGER,
    status TEXT NOT NULL,result_json TEXT,error_code TEXT);
    CREATE TABLE IF NOT EXISTS qq_proactive_offers (
    offer_key TEXT PRIMARY KEY,offer_id TEXT NOT NULL,account_id TEXT NOT NULL,
    operator_generation INTEGER NOT NULL,status TEXT NOT NULL,request_id TEXT,error_code TEXT);
    CREATE TABLE IF NOT EXISTS qq_sources (
    message_key TEXT NOT NULL,provider_request_id TEXT NOT NULL,account_id TEXT NOT NULL,
    conversation_id TEXT NOT NULL,character_id TEXT NOT NULL,life_id TEXT NOT NULL,
    sources_json TEXT NOT NULL,created_at INTEGER NOT NULL,
    PRIMARY KEY(message_key,provider_request_id));`);
  if (!db.prepare('PRAGMA table_info(qq_outbox)').all().some(column => column.name === 'display_text_value')) db.exec('ALTER TABLE qq_outbox ADD COLUMN display_text_value TEXT');
  // A crash never makes a previously submitted send eligible for blind retry.
  db.prepare("UPDATE qq_outbox SET status='unknown',error_code='QQ_RESTART_RECONCILIATION_REQUIRED' WHERE status='sending'").run();
  db.prepare("UPDATE qq_outbox SET status='cancelled',error_code='QQ_RESTART_CANCELLED_UNSENT' WHERE status='pending'").run();
  db.prepare("UPDATE qq_messages SET status='cancelled',error_code='QQ_RESTART_NO_REPLAY' WHERE status='processing'").run();
  db.prepare("UPDATE qq_work_commands SET status='unknown',error_code='QQ_RESTART_NO_APPROVAL_REPLAY' WHERE status='pending'").run();
  db.prepare("UPDATE qq_proactive_offers SET status='unknown',error_code='QQ_RESTART_OFFER_RECONCILIATION_REQUIRED' WHERE status='pending'").run();
  let settings = readStoredQqSettings(store), operator = store.get('operator', null);
  let startup=store.get('qr-startup-v1',{autoResume:false}),restoreAttempted=false;
  let checkedAt = null, binding = null, connected = false, closed = false, epoch = store.get('epoch', 0), epochSeconds = Math.ceil(now() / 1000), connectionGeneration = 0, policyGeneration = 0;
  let adapter = transport ?? new HostOneBotTransport(host), connecting = null, connectionAttempt = 0;
  const active = new Set(), pending = new Set(), controls = new Set();
  let controlGeneration=0,controlAbort=null,startupGeneration=0,startupIssued=0,startupAccepted=0,startupAbort=null,closingTransport=null,closePromise=null;
  let inboundQueue = Promise.resolve();

  function status() { return {pluginId: PLUGIN_ID, schemaVersion: 1, version: VERSION, enabled: settings.enabled, connected, operator: operator ? {...operator} : null, epoch, settings: structuredClone(settings), capabilities: binding?.capabilities ?? [], transportError: adapter.lastError ?? null, checkedAt: Math.max(checkedAt ?? 0, adapter.lastCheckedAt ?? 0) || null, historyRetained: true, offlineReplay: false}; }
  function invalidateStartup(){startupGeneration++;startupAbort?.abort();startupAbort=null;}
  function invalidateControl(){controlGeneration++;controlAbort?.abort();controlAbort=null;invalidateStartup();}
  function beginStartup(){invalidateStartup();const controller=new AbortController();startupAbort=controller;return {generation:startupGeneration,controlGeneration,controller};}
  function checkStartup(control){assert(!closed&&control.generation===startupGeneration&&control.controlGeneration===controlGeneration&&!control.controller.signal.aborted,'QQ_CONNECTION_REVOKED','启动恢复设置已撤销');}
  function beginControl(){invalidateControl();const controller=new AbortController();controlAbort=controller;return {generation:controlGeneration,controller};}
  function currentControl(control){return !closed&&control.generation===controlGeneration&&!control.controller.signal.aborted;}
  function checkControl(control){assert(currentControl(control),'QQ_CONNECTION_REVOKED','连接设置期间的操作已撤销');}
  function trackControl(task){controls.add(task);task.finally(()=>controls.delete(task)).catch(()=>{});return task;}
  async function bindControl(control,payload){checkControl(control);const result=await host.invoke('social.context.read',payload,{signal:control.controller.signal});checkControl(control);return result;}
  function closeTransport(){if(closingTransport)return closingTransport;const task=Promise.resolve().then(()=>adapter.close());closingTransport=task;task.finally(()=>{if(closingTransport===task)closingTransport=null;}).catch(()=>{});return task;}
  function isCurrent(snapshot) { return !closed && connected && settings.enabled && connectionGeneration === snapshot.connectionGeneration && policyGeneration === snapshot.policyGeneration && operator?.generation === snapshot.operator.generation && operator.characterId === snapshot.operator.characterId && operator.lifeId === snapshot.operator.lifeId; }
  function requireCurrent(snapshot) { assert(isCurrent(snapshot), 'QQ_ACTIVITY_REVOKED', 'QQ 接管或活动许可已变更'); snapshot.controller.signal.throwIfAborted(); }
  function cancelActive() { for (const controller of active) controller.abort(fail('QQ_ACTIVITY_REVOKED', 'QQ 活动已撤销')); }
  function startEpoch(nextBinding) {
    assert(nextBinding.accountId === settings.accountId, 'QQ_CONNECTION_ACCOUNT_MISMATCH', '重连不能更换账号');
    binding = assertBackendCapabilities(nextBinding); epoch++; store.set('epoch', epoch);
    // OneBot timestamps have second precision. Conservatively skip the partial
    // connecting second so queued offline events cannot slip through that gap.
    epochSeconds = Math.ceil(now() / 1000); checkedAt = now(); connectionGeneration++; cancelActive(); connected = true;
  }
  async function management(principal,{allowAccountChange=false}={}) {
    assert(!closed, 'QQ_CLOSED', '插件已退出');
    const context = await host.invoke('social.context.read', {purpose: 'manage-plugin', pluginId: PLUGIN_ID, principal});
    assert(context?.contextToken && context.permissions?.includes('plugin.manage'), 'PLUGIN_MANAGE_DENIED', '需要宿主验证的插件管理权限');
    if (settings.accountId&&!allowAccountChange) assert(context.accountId === settings.accountId, 'QQ_MANAGEMENT_ACCOUNT_MISMATCH', '管理主体与账号不匹配');
    nameOperator(context);
    return context;
  }
  // Older bindings stored the character id as the name; every host context read corrects it from the character list.
  function nameOperator(context) {
    if (!operator) return;
    const name = labelOf(context, operator.characterId) ?? nameOk(operator.displayName, operator.characterId);
    if (name !== (operator.displayName ?? null)) {operator.displayName = name;store.set('operator', operator);}
  }
  async function stopConnection({invalidate=true}={}) {
    if(invalidate)invalidateControl();
    connected = false; connectionAttempt++; connectionGeneration++; cancelActive();
    const attempt=connectionAttempt;
    db.prepare("UPDATE qq_outbox SET status='cancelled',error_code='QQ_ACTIVITY_REVOKED' WHERE status='pending'").run();
    await closeTransport();if(attempt===connectionAttempt)binding = null;
  }
  async function connectImpl(managementContext) {
    assert(settings.enabled && settings.accountId && settings.connectionRef, 'QQ_CONNECTION_REQUIRED', '请先配置并启用连接');
    assert(operator, 'QQ_OPERATOR_REQUIRED', '请选择 QQ 接管者');
    if (connected) return status();
    const attempt = ++connectionAttempt, policy = policyGeneration, controlAtStart=controlGeneration, accountAtStart = settings.accountId, connectionAtStart = settings.connectionRef;
    let currentOperator = operator;
    const stillAllowed = () => !closed && settings.enabled && controlAtStart===controlGeneration && attempt === connectionAttempt && policy === policyGeneration && currentOperator === operator && settings.accountId === accountAtStart && settings.connectionRef === connectionAtStart;
    let epochCalled = false, established = false;
    try {
      // Persisted selection is not a live host binding. Explicit reconnect must
      // restore the managed runtime and revalidate the same life before opening
      // OneBot; setup and approved background restore already bind separately.
      if (managementContext) {
        const selected = await host.invoke('social.context.read', {purpose: 'qq-operator-bind', contextToken: managementContext.contextToken, accountId: accountAtStart, characterId: currentOperator.characterId, expectedLifeId: currentOperator.lifeId, expectedOperationId: currentOperator.operationId});
        assert(stillAllowed(), 'QQ_CONNECTION_REVOKED', '连接启动期间的授权已撤销');
        assert(selected?.contextToken && selected.accountId === accountAtStart && ['characterId', 'lifeId', 'operationId'].every(key => selected[key] === currentOperator[key]), 'QQ_RECONNECT_OPERATOR_CHANGED', '接管角色或人生已变化，请重新选择角色后连接');
        operator = {...currentOperator, generation: selected.operatorGeneration ?? currentOperator.generation};currentOperator = operator;store.set('operator', operator);
      }
      await closeTransport();
      assert(stillAllowed(), 'QQ_CONNECTION_REVOKED', '连接启动期间的授权已撤销');
      const result = await adapter.start({connectionRef: settings.connectionRef, accountId: settings.accountId, onEpoch: value => {if (closed || !settings.enabled || attempt !== connectionAttempt || settings.accountId !== accountAtStart || !established && !stillAllowed()) return;epochCalled = true;startEpoch(value);}, onEvent: raw => receive(raw), onDisconnect: () => {connected = false;connectionGeneration++;cancelActive();}});
      assert(stillAllowed(), 'QQ_CONNECTION_REVOKED', '连接启动期间的授权已撤销');
      assertBackendCapabilities(result);
      assert(result.accountId === settings.accountId, 'QQ_CONNECTION_ACCOUNT_MISMATCH', '后端账号不匹配');
      if (!epochCalled) startEpoch(result); established = true; connected = true; return status();
    } catch (error) { if(attempt===connectionAttempt){await closeTransport().catch(() => {});if(attempt===connectionAttempt){connected = false; binding = null;}}throw error; }
  }
  async function connect(managementContext) {
    if (connecting) return connecting;
    connecting = connectImpl(managementContext);
    try {return await connecting;} finally {connecting = null;}
  }
  async function eventContext(event, snapshot) {
    const context = await host.invoke('social.context.read', {purpose: 'qq-message', pluginId: PLUGIN_ID, connectionId: event.connectionId, accountId: event.accountId, senderId: event.senderId, conversationType: event.conversationType, conversationId: event.conversationId, sourceMessageId: event.sourceMessageId, characterId: snapshot.operator.characterId, lifeId: snapshot.operator.lifeId, operationId: snapshot.operator.operationId, operatorGeneration: snapshot.operator.generation}, {signal: snapshot.controller.signal});
    assert(context?.contextToken && context.personaId && context.accountId === event.accountId && context.senderId === event.senderId && context.conversationType === event.conversationType && context.conversationId === event.conversationId && context.sourceMessageId === event.sourceMessageId && context.characterId === snapshot.operator.characterId && context.lifeId === snapshot.operator.lifeId && context.operationId === snapshot.operator.operationId, 'QQ_TRUSTED_CONTEXT_MISMATCH', '宿主上下文与真实入站事件不匹配');
    requireCurrent(snapshot); return context;
  }
  async function leaseActivity(context, event, snapshot, purpose) {
    const lease = await host.invoke('activity.lease', {contextToken: context.contextToken, purpose, channel: 'qq', conversationId: event.conversationId, sourceMessageId: event.sourceMessageId, operatorGeneration: snapshot.operator.generation}, {signal: snapshot.controller.signal});
    assert(lease?.leaseId && Number.isSafeInteger(lease.generation), 'QQ_LEASE_REQUIRED', '宿主没有签发活动租约');
    requireCurrent(snapshot); return lease;
  }
  async function checkActivity(context, lease, snapshot) {
    requireCurrent(snapshot);
    const checked = await host.invoke('activity.check', {contextToken: context.contextToken, leaseId: lease.leaseId, generation: lease.generation, characterId: context.characterId, lifeId: context.lifeId, operationId: context.operationId, operatorGeneration: snapshot.operator.generation}, {signal: snapshot.controller.signal});
    assert(checked?.valid === true && checked.characterId === context.characterId && checked.lifeId === context.lifeId && checked.operationId === context.operationId && checked.generation === lease.generation, 'QQ_LEASE_REVOKED', '发送前租约验证失败');
    requireCurrent(snapshot);
  }
  async function experience(context, event, snapshot, lease, kind, extra = {}) {
    const receipt = await host.invoke('experience.append', {contextToken: context.contextToken, leaseId: lease.leaseId, eventId: digest([PLUGIN_ID, event.accountId, event.conversationId, event.sourceMessageId, snapshot.operator.generation, kind]), schemaVersion: 1, sourcePluginId: PLUGIN_ID, sourceKind: kind, channel: 'qq', conversationId: event.conversationId, sourceMessageId: event.sourceMessageId, occurredAt: event.occurredAt, receivedAt: event.receivedAt, visibilityScope: {channel: 'qq', conversationId: event.conversationId}, evidenceRefs: [{kind: 'qq-message', connectionId: event.connectionId, sourceMessageId: event.sourceMessageId}], deliveryState: 'received', presentationState: 'not-user-read', ...extra}, {signal: snapshot.controller.signal});
    assert(receipt && typeof receipt === 'object' && !Array.isArray(receipt), 'QQ_EXPERIENCE_RECEIPT_REQUIRED', '经历写入尚未获得可核对回执');
    assert(receipt.recorded !== false && receipt.stored !== false && receipt.accepted !== false && receipt.ok !== false, 'QQ_EXPERIENCE_NOT_ACCEPTED', '本体尚未接纳本条经历');
    assert(receipt.recorded === true, 'QQ_EXPERIENCE_RECEIPT_REQUIRED', '本体尚未确认记录本条经历');
    return receipt;
  }
  function requireRecipient(event) {
    const group = settings.groups.find(value => value.id === event.peerId);
    assert(event.conversationType === 'private' ? settings.contacts.includes(event.peerId) : !!group, 'QQ_RECIPIENT_REVOKED', '会话授权已撤销');
    if (event.proactive) assert(event.conversationType === 'private' ? settings.proactiveContacts : group?.quietOpener, 'QQ_PROACTIVE_DISABLED', '主动会话许可已撤销');
  }
  async function sendText(event, text, context, lease, snapshot, messageKey, {displayText = text} = {}) {
    assert(typeof text === 'string' && text.trim() && text.length <= 30000, 'QQ_REPLY_INVALID', '回复正文为空或过长');
    const requestId = digest([messageKey, 'reply', snapshot.operator.generation]);
    const existing = db.prepare('SELECT status,platform_message_id FROM qq_outbox WHERE request_id=?').get(requestId);
    if (existing) return {status: existing.status, messageId: existing.platform_message_id, replayed: true};
    const intro = !db.prepare("SELECT status FROM qq_introductions WHERE account_id=? AND conversation_id=? AND operator_generation=? AND status IN ('sent','unknown')").get(event.accountId, event.conversationId, snapshot.operator.generation);
    const displayName = [context.characterName, context.displayName, snapshot.operator.displayName].map(value => nameOk(value, snapshot.operator.characterId)).find(Boolean);
    const outgoing = intro ? `现在由${displayName || '当前接管者'}陪你聊天。\n${text}` : text;
    const displayOutgoing = intro ? `现在由${displayName || '当前接管者'}陪你聊天。\n${displayText}` : displayText;
    requireCurrent(snapshot);
    requireRecipient(event);
    db.prepare('INSERT INTO qq_outbox(request_id,message_key,account_id,conversation_id,character_id,life_id,operator_generation,text_value,status,created_at,display_text_value) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(requestId, messageKey, event.accountId, event.conversationId, context.characterId, context.lifeId, snapshot.operator.generation, outgoing, 'pending', now(), displayOutgoing);
    try { await checkActivity(context, lease, snapshot);requireCurrent(snapshot);requireRecipient(event); }
    catch (error) { db.prepare("UPDATE qq_outbox SET status='cancelled',error_code=? WHERE request_id=?").run(error.code ?? 'QQ_LEASE_REVOKED', requestId);throw error; }
    db.prepare("UPDATE qq_outbox SET status='sending' WHERE request_id=?").run(requestId);
    let result;
    try { result = await adapter.send({conversationType: event.conversationType, peerId: event.peerId, text: outgoing, requestId, contextToken: context.contextToken, leaseId: lease.leaseId, generation: lease.generation, accountId: context.accountId, characterId: context.characterId, lifeId: context.lifeId, operationId: context.operationId, senderId: context.senderId, conversationId: event.conversationId, signal: snapshot.controller.signal}); }
    catch (error) { result = {status: error.notSubmitted === true ? 'failed' : 'unknown', notSubmitted: error.notSubmitted === true, errorCode: error.code ?? 'QQ_SEND_UNCERTAIN'}; }
    const messageId = platformMessageId(result?.messageId);
    const actualStatus = result?.status === 'sent' && messageId ? 'sent' : result?.status === 'failed' && result.notSubmitted === true ? 'failed' : 'unknown';
    // Record the actual sender even if takeover changed while the external
    // backend was accepting the message. No attribution to the new operator.
    store.transaction(() => {
      db.prepare('UPDATE qq_outbox SET status=?,platform_message_id=?,error_code=? WHERE request_id=?').run(actualStatus, messageId, actualStatus === 'unknown' ? 'QQ_SEND_RECONCILIATION_REQUIRED' : result?.errorCode ?? null, requestId);
      if (intro && ['sent', 'unknown'].includes(actualStatus)) db.prepare('INSERT OR REPLACE INTO qq_introductions VALUES(?,?,?,?)').run(event.accountId, event.conversationId, snapshot.operator.generation, actualStatus);
    });
    // A cancelled old lease is not reused to manufacture a memory event. The
    // durable outbox remains available to B's reconciliation path.
    let memoryPending = false;
    if (actualStatus === 'sent' && isCurrent(snapshot)) {
      try {await experience(context, event, snapshot, lease, 'qq-send-' + actualStatus, {deliveryState: actualStatus, status: actualStatus, sourceMessageId: messageId, causalParentId: event.sourceEventId ?? event.sourceMessageId, providerRequestId: requestId, content: outgoing, evidenceRefs: [{kind: 'qq-send', requestId, platformMessageId: messageId}]});}
      catch {memoryPending = true;db.prepare('UPDATE qq_outbox SET error_code=? WHERE request_id=?').run('QQ_EXPERIENCE_RECONCILIATION_REQUIRED', requestId);}
    } else {memoryPending = actualStatus === 'sent';}
    return {status: actualStatus, requestId, messageId, memoryPending};
  }
  async function work(event, command, context, lease, snapshot, messageKey) {
    if (event.conversationType !== 'private' || command.action === 'deny' || context.ownerVerified !== true) {
      const reason = event.conversationType === 'group' ? 'QQ_GROUP_WORK_DENIED' : command.action === 'deny' ? 'QQ_UNTRUSTED_WORK_COMMAND' : 'QQ_OWNER_REQUIRED';
      db.prepare("UPDATE qq_messages SET status='work-denied',error_code=? WHERE message_key=?").run(reason, messageKey);
      return sendText(event, event.conversationType === 'group' ? '工作任务请主人转到私聊或 APP 提交和批准。' : '这项工作操作需要已验证主人的私聊或 APP 入口，并使用明确的任务和计划版本。', context, lease, snapshot, messageKey);
    }
    const requestId = ['approve', 'cancel'].includes(command.action)
      ? digest([event.accountId, event.senderId, 'work', command.action, command.taskId, command.planVersion])
      : digest([messageKey, 'work', command.action]);
    const previous = db.prepare('SELECT * FROM qq_work_commands WHERE request_id=?').get(requestId);
    if (previous) {
      // Only an explicit new, verified owner command may retry a request that
      // the host proved was never submitted because the work service was absent.
      // A processed platform message is already rejected by qq_messages; pending,
      // submitted and uncertain outcomes must never be replayed here.
      if (!['unavailable', 'not-submitted'].includes(previous.status)) return {status: previous.status, replayed: true};
      const reclaimed = db.prepare("UPDATE qq_work_commands SET status='pending',result_json=NULL,error_code=NULL WHERE request_id=? AND status IN ('unavailable','not-submitted')").run(requestId);
      if (!reclaimed.changes) return {status: db.prepare('SELECT status FROM qq_work_commands WHERE request_id=?').get(requestId).status, replayed: true};
    } else db.prepare('INSERT INTO qq_work_commands(request_id,action,task_id,plan_version,status) VALUES(?,?,?,?,?)').run(requestId, command.action, command.taskId ?? null, command.planVersion ?? null, 'pending');
    try {await checkActivity(context, lease, snapshot);requireCurrent(snapshot);}
    catch (error) {db.prepare("UPDATE qq_work_commands SET status='not-submitted',error_code=? WHERE request_id=?").run(error.code ?? 'QQ_WORK_PREFLIGHT_REJECTED', requestId);throw error;}
    let result;
    try {
      result = await host.invoke('owner.work.' + command.action, {contextToken: context.contextToken, leaseId: lease.leaseId, requestId, taskId: command.taskId, planVersion: command.planVersion, text: command.text, evidence: {connectionId: event.connectionId, accountId: event.accountId, senderId: event.senderId, conversationType: 'private', sourceMessageId: event.sourceMessageId}}, {signal: snapshot.controller.signal});
      if (result !== undefined) db.prepare('UPDATE qq_work_commands SET result_json=? WHERE request_id=?').run(json(result), requestId);
      assert(result && typeof result === 'object' && !Array.isArray(result), 'QQ_WORK_RECEIPT_INVALID', '工作操作尚未取得可核对回执');
      assert((command.taskId === undefined || !Object.hasOwn(result, 'taskId') || result.taskId === command.taskId) && (command.planVersion === undefined || !Object.hasOwn(result, 'planVersion') || result.planVersion === command.planVersion), 'QQ_WORK_RECEIPT_MISMATCH', '工作回执与本次任务或计划版本不一致');
      db.prepare("UPDATE qq_work_commands SET status='submitted',result_json=? WHERE request_id=?").run(json(result), requestId);
    } catch (error) {
      db.prepare("UPDATE qq_work_commands SET status=?,error_code=? WHERE request_id=?").run(['WORK_PLUGIN_UNAVAILABLE', 'WORK_PLUGIN_DISABLED', 'SOCIAL_CAPABILITY_UNAVAILABLE'].includes(error.code) ? 'unavailable' : 'unknown', error.code ?? 'QQ_WORK_OUTCOME_UNKNOWN', requestId);
      requireCurrent(snapshot);
      if (['WORK_PLUGIN_UNAVAILABLE', 'WORK_PLUGIN_DISABLED', 'SOCIAL_CAPABILITY_UNAVAILABLE'].includes(error.code)) return sendText(event, '工作与协作插件未安装、未启用或主人工作接口未就绪。普通聊天仍可使用；请在 APP 插件社区查看工作与协作。', context, lease, snapshot, messageKey);
      throw error;
    }
    requireCurrent(snapshot);
    // The host renders only the authorized plan/result. The QQ plugin never
    // executes tools and never invents a successful approval/execution result.
    const text = replyText(result) || `工作请求已交给工作与协作。${result?.taskId ? '\n任务：' + result.taskId : ''}${result?.planVersion ? '；计划版本：' + result.planVersion : ''}\n以 APP 和私聊中的同一计划状态为准。`;
    return sendText(event, text, context, lease, snapshot, messageKey);
  }
  async function processIncoming(raw, arrival) {
    if (closed || !settings.enabled || !connected || !operator || !binding) return {status: 'inactive'};
    if (arrival.epoch !== epoch || arrival.operatorGeneration !== operator.generation || arrival.connectionGeneration !== connectionGeneration || arrival.policyGeneration !== policyGeneration) return {status: 'cancelled', reason: 'QQ_QUEUED_GENERATION_CHANGED'};
    let event;
    try {event = normalizeOneBotEvent(raw, binding, {epochSeconds, receivedAt: now()});}
    catch (error) {return {status: 'ignored', reason: error.code};}
    const group = settings.groups.find(value => value.id === event.peerId);
    if (event.conversationType === 'private' ? !settings.contacts.includes(event.peerId) : !group) return {status: 'ignored', reason: 'QQ_NOT_ALLOWLISTED'};
    const messageKey = digest([event.accountId, event.conversationId, event.sourceMessageId]);
    if (db.prepare('SELECT message_key FROM qq_messages WHERE message_key=?').get(messageKey)) return {status: 'duplicate'};
    const command = parseWorkCommand(event);
    // One observed inbound identity owns one trusted context. Quoted-message
    // observation and the later reply use separate, freshly checked leases.
    // Re-reading context here would mint a different authority/session for the
    // same immutable inbound evidence. Never cache a failure or a lease.
    let messageContext;
    async function trustedMessageContext(snapshot) {
      requireCurrent(snapshot);
      if (!messageContext) {
        const admitted = await eventContext(event, snapshot);
        requireCurrent(snapshot);
        messageContext = admitted;
      }
      requireCurrent(snapshot);
      return messageContext;
    }
    let quoteTargetSelf = false;
    if (event.quoted) {
      const controller = new AbortController(), quoteSnapshot = {controller, operator: {...operator}, connectionGeneration, policyGeneration};active.add(controller);
      let quoteContext, quoteLease;
      try {
      quoteContext = await trustedMessageContext(quoteSnapshot);
      quoteLease = await leaseActivity(quoteContext, event, quoteSnapshot, 'qq-observe');
      for (const part of event.parts.filter(part => part.type === 'reply')) {
        if (!part.messageId || typeof adapter.resolveReply !== 'function') continue;
        try {
          await checkActivity(quoteContext, quoteLease, quoteSnapshot);requireCurrent(quoteSnapshot);
          const response = await adapter.resolveReply({messageId: part.messageId, conversationId: event.conversationId, contextToken: quoteContext.contextToken, leaseId: quoteLease.leaseId, generation: quoteLease.generation, accountId: quoteContext.accountId, characterId: quoteContext.characterId, lifeId: quoteContext.lifeId, operationId: quoteContext.operationId, senderId: quoteContext.senderId, signal: controller.signal});
          requireCurrent(quoteSnapshot);
          const original = response?.status === 'ok' ? response.data : response;
          const originalId = String(original?.message_id ?? original?.messageId ?? '');
          const originalSender = String(original?.sender?.user_id ?? original?.senderId ?? '');
          const sameConversation = original?.conversationId === event.conversationId || (event.conversationType === 'group' && String(original?.group_id ?? '') === event.peerId) || (event.conversationType === 'private' && original?.message_type === 'private' && String(original?.target_id ?? original?.peerId ?? '') === event.peerId);
          if (originalId === part.messageId && originalSender === event.accountId && sameConversation) quoteTargetSelf = true;
        } catch { /* Unknown original author is not an @ equivalent. */ }
      }
      } catch { /* Failed observe admission never grants quoted-message privileges. */ }
      finally {active.delete(controller);if (quoteContext && quoteLease) await host.invoke('activity.finish', {contextToken: quoteContext.contextToken, leaseId: quoteLease.leaseId, status: 'observed'}).catch(() => {});}
    }
    if (arrival.epoch !== epoch || arrival.operatorGeneration !== operator.generation || arrival.connectionGeneration !== connectionGeneration || arrival.policyGeneration !== policyGeneration) return {status: 'cancelled', reason: 'QQ_QUEUED_GENERATION_CHANGED'};
    // Commands are denied before ordinary group admission as well; the response
    // still requires an allowed conversation and an admitted host lease.
    const shouldRespond = event.conversationType === 'private' || event.mentioned || quoteTargetSelf || group?.naturalParticipation === true;
    const inserted = db.prepare('INSERT OR IGNORE INTO qq_messages VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(messageKey, event.accountId, event.conversationId, event.senderId, event.sourceMessageId, operator.characterId, operator.lifeId, operator.generation, epoch, now(), json(event), shouldRespond ? 'processing' : 'observed', null);
    if (!inserted.changes) return {status: 'duplicate'};
    const recordOnly = !shouldRespond;
    const controller = new AbortController(), snapshot = {controller, operator: {...operator}, connectionGeneration, policyGeneration}; active.add(controller);
    let context, lease, outcome = 'failed';
    try {
      context = await trustedMessageContext(snapshot);
      lease = await leaseActivity(context, event, snapshot, recordOnly ? 'qq-observe' : 'qq-reply');
      await experience(context, event, snapshot, lease, 'qq-received', {status: 'received', content: event.parts, understandingState: 'not-understood', presentationState: 'not-presented', userReadState: 'unknown', attention: false});
      requireCurrent(snapshot);
      if (recordOnly) {
        outcome = command ? 'work-denied' : 'observed';
        db.prepare('UPDATE qq_messages SET status=?,error_code=? WHERE message_key=?').run(outcome, command ? 'QQ_GROUP_WORK_DENIED' : null, messageKey);
        return {status: outcome, experienceRecorded: true, modelRequested: false, sent: false};
      }
      const missingMedia = event.parts.some(part => ['image', 'mface'].includes(part.type)) && !context.modelCapabilities?.includes('image');
      let result;
      if (command) result = await work(event, command, context, lease, snapshot, messageKey);
      else if (event.unsupported.length || missingMedia) result = await sendText(event, `这条消息包含当前连接或角色模型未支持的附件（${[...event.unsupported, ...(missingMedia ? ['图片理解'] : [])].join('、')}），我还没有识别其中内容。可以改用文字或受支持的图片。`, context, lease, snapshot, messageKey);
      else {
        const allowedTools = context.permissions?.includes('search.native') ? ['search.native'] : [];
        const model = await host.invoke('models.request', {contextToken: context.contextToken, leaseId: lease.leaseId, requestId: digest([messageKey, 'model']), purpose: 'qq-reply', replyStylePolicy: {defaultStyle: settings.replyStyle ?? 'inherit', conversationStyle: settings.conversationReplyStyles?.[event.conversationId] ?? 'inherit'}, connectionSelection: 'character-bound', channel: 'qq', conversationId: event.conversationId, input: {parts: event.parts, links: event.links}, toolPolicy: {allowed: allowedTools, workAllowed: false}, sourceMessageId: event.sourceMessageId}, {signal: controller.signal});
        requireCurrent(snapshot);
        assert(model?.requestId && model.usageAccounting === 'core-model-router', 'QQ_MODEL_RECEIPT_REQUIRED', '模型请求缺少真实宿主用量归属');
        assert(!model.toolCalls?.some(call => !allowedTools.includes(call.name)), 'QQ_MODEL_WORK_TOOL_DENIED', '普通 QQ 对话不能调用未授权工具');
        if (model.sources !== undefined) {
          assert(Array.isArray(model.sources), 'QQ_MODEL_SOURCES_INVALID', '模型来源格式无效');
          for (const source of model.sources) {
            assert(source && typeof source === 'object' && typeof source.url === 'string', 'QQ_MODEL_SOURCES_INVALID', '来源必须含真实链接');
            let url;try {url = new URL(source.url);} catch {throw fail('QQ_MODEL_SOURCES_INVALID', '来源链接无效');}
            assert(['https:', 'http:'].includes(url.protocol) && !url.username && !url.password, 'QQ_MODEL_SOURCES_INVALID', '来源链接协议无效');
          }
          if (model.sources.length) db.prepare('INSERT OR REPLACE INTO qq_sources VALUES(?,?,?,?,?,?,?,?)').run(messageKey, model.requestId, event.accountId, event.conversationId, context.characterId, context.lifeId, json(model.sources), now());
        }
        let text = replyText(model);const displayText = text;
        if (model.sources?.length) text += '\n来源：' + model.sources.slice(0, 3).filter(source => /^https?:\/\//.test(source.url ?? '')).map(source => `${source.title || '来源'} ${source.url}`).join('；');
        result = await sendText(event, text, context, lease, snapshot, messageKey, {displayText});
      }
      outcome = result.status;
      db.prepare('UPDATE qq_messages SET status=? WHERE message_key=? AND status=\'processing\'').run(result.status, messageKey);
      return result;
    } catch (error) {
      const acknowledgementPending = ['QQ_EXPERIENCE_RECEIPT_REQUIRED', 'QQ_EXPERIENCE_NOT_ACCEPTED'].includes(error.code);
      outcome = controller.signal.aborted ? 'cancelled' : recordOnly || acknowledgementPending ? 'experience-pending' : 'failed';
      db.prepare('UPDATE qq_messages SET status=?,error_code=? WHERE message_key=?').run(outcome, error.code ?? 'QQ_PROCESSING_FAILED', messageKey);
      return {status: outcome, reason: error.code ?? 'QQ_PROCESSING_FAILED'};
    } finally {
      active.delete(controller);
      if (lease) await host.invoke('activity.finish', {contextToken: context.contextToken, leaseId: lease.leaseId, status: outcome}).catch(() => {});
    }
  }
  function receive(raw) {
    const arrival = {epoch, operatorGeneration: operator?.generation, connectionGeneration, policyGeneration};
    const task = inboundQueue.then(() => processIncoming(raw, arrival));
    inboundQueue = task.catch(() => {}); pending.add(task); task.finally(() => pending.delete(task)).catch(() => {});
    return task;
  }
  async function proactive(payload, context) {
    assert(connected && settings.enabled && operator, 'QQ_INACTIVE', 'QQ 当前不可发送主动消息');
    assert(['private', 'group'].includes(payload.conversationType), 'QQ_TARGET_INVALID', '会话类型无效');
    const group = settings.groups.find(group => group.id === payload.peerId);
    assert(payload.conversationType === 'private' ? settings.proactiveContacts && settings.contacts.includes(payload.peerId) : group?.quietOpener, 'QQ_PROACTIVE_DISABLED', '此会话未允许主动开话题');
    assert(typeof payload.sourceEventId === 'string' && payload.sourceEventId, 'QQ_PROACTIVE_SOURCE_REQUIRED', '主动候选需要真实来源');
    const offer = await host.invoke('proactive.offer', {contextToken: context.contextToken, channel: 'qq', conversationId: payload.conversationType + ':' + payload.peerId, sourceEventId: payload.sourceEventId, characterId: operator.characterId, lifeId: operator.lifeId, operatorGeneration: operator.generation});
    // This action only offers a candidate. The core owns timing and the second
    // admission; no locally generated text can bypass it by calling this route.
    return {status: 'offered', offerId: offer?.offerId ?? null, sent: false};
  }
  async function runProactive(offerId, arrival) {
    assert(typeof offerId === 'string' && offerId && offerId.length <= 256, 'QQ_OFFER_ID_REQUIRED', '主动候选 ID 无效');
    assert(!closed && connected && settings.enabled && operator, 'QQ_INACTIVE', 'QQ 当前不可主动发言');
    assert(arrival.operatorGeneration === operator.generation && arrival.connectionGeneration === connectionGeneration && arrival.policyGeneration === policyGeneration, 'QQ_ACTIVITY_REVOKED', '主动候选所属代次已失效');
    const offerKey = digest([settings.accountId, offerId]);
    const existing = db.prepare('SELECT status,request_id FROM qq_proactive_offers WHERE offer_key=?').get(offerKey);
    if (existing && !['deferred', 'failed-before-send'].includes(existing.status)) return {status: existing.status, requestId: existing.request_id, replayed: true};
    db.prepare("INSERT INTO qq_proactive_offers(offer_key,offer_id,account_id,operator_generation,status) VALUES(?,?,?,?,'pending') ON CONFLICT(offer_key) DO UPDATE SET status='pending',error_code=NULL").run(offerKey, offerId, settings.accountId, operator.generation);
    const controller = new AbortController(), snapshot = {controller, operator: {...operator}, connectionGeneration, policyGeneration}; active.add(controller);
    let context, lease, outcome = 'failed-before-send';
    try {
      const claim = await host.invoke('proactive.claim', {offerId, accountId: settings.accountId, operatorGeneration: snapshot.operator.generation, pluginId: PLUGIN_ID}, {signal: controller.signal});
      requireCurrent(snapshot);
      if (claim?.admitted !== true) {outcome = 'deferred';db.prepare('UPDATE qq_proactive_offers SET status=? WHERE offer_key=?').run(outcome, offerKey);return {status: outcome, sent: false};}
      context = claim.context; lease = claim.lease;
      const recipient = claim.recipient;
      assert(claim.offerId === offerId && claim.operatorGeneration === snapshot.operator.generation && claim.sourceEventId && typeof claim.text === 'string', 'QQ_PROACTIVE_CLAIM_INVALID', '主动候选未经当前宿主批准');
      assert(recipient && ['private', 'group'].includes(recipient.conversationType) && /^[1-9]\d{0,19}$/.test(recipient.peerId) && recipient.conversationId === recipient.conversationType + ':' + recipient.peerId, 'QQ_PROACTIVE_CLAIM_INVALID', '主动候选目标无效');
      assert(context?.contextToken && context.personaId && context.accountId === settings.accountId && context.characterId === snapshot.operator.characterId && context.lifeId === snapshot.operator.lifeId && context.operationId === snapshot.operator.operationId && context.conversationId === recipient.conversationId, 'QQ_PROACTIVE_CONTEXT_MISMATCH', '主动候选角色或会话范围不匹配');
      assert(lease?.leaseId && Number.isSafeInteger(lease.generation), 'QQ_LEASE_REQUIRED', '主动候选缺少宿主租约');
      const group = settings.groups.find(group => group.id === recipient.peerId);
      assert(recipient.conversationType === 'private' ? settings.proactiveContacts && settings.contacts.includes(recipient.peerId) : group?.quietOpener, 'QQ_PROACTIVE_DISABLED', '目标未允许主动私聊或群开题');
      const event = {connectionId: binding.connectionId, accountId: settings.accountId, ...recipient, senderId: context.senderId, sourceMessageId: 'proactive:' + offerId, occurredAt: new Date(now()).toISOString(), receivedAt: new Date(now()).toISOString(), proactive: true, sourceEventId: claim.sourceEventId};
      const result = await sendText(event, claim.text, context, lease, snapshot, digest([offerKey, 'proactive-send']));
      outcome = result.status;
      db.prepare('UPDATE qq_proactive_offers SET status=?,request_id=? WHERE offer_key=?').run(result.status, result.requestId ?? null, offerKey);
      return result;
    } catch (error) {
      const outbox = db.prepare('SELECT status,request_id FROM qq_outbox WHERE message_key=?').get(digest([offerKey, 'proactive-send']));
      outcome = outbox?.status ?? (controller.signal.aborted ? 'cancelled' : 'failed-before-send');
      db.prepare('UPDATE qq_proactive_offers SET status=?,request_id=?,error_code=? WHERE offer_key=?').run(outcome, outbox?.request_id ?? null, error.code ?? 'QQ_PROACTIVE_FAILED', offerKey);
      return {status: outcome, reason: error.code ?? 'QQ_PROACTIVE_FAILED'};
    } finally {
      active.delete(controller);
      if (context && lease) await host.invoke('activity.finish', {contextToken: context.contextToken, leaseId: lease.leaseId, status: outcome}).catch(() => {});
    }
  }
  function deliverProactive(offerId) {
    const arrival = {operatorGeneration: operator?.generation, connectionGeneration, policyGeneration};
    const task = inboundQueue.then(() => runProactive(offerId, arrival));
    inboundQueue = task.catch(() => {});pending.add(task);task.finally(() => pending.delete(task)).catch(() => {});return task;
  }
  async function dispatchInternal(action, payload = {}, principal) {
    const arrivalControl=controlGeneration,arrivalStartup=action==='startup.update'?++startupIssued:0;
    const context = await management(principal,{allowAccountChange:['status','choices.get','settings.update','setup.finish'].includes(action)});
    assert(!closed,'QQ_CLOSED','插件已退出');
    if(['setup.finish','operator.select','connect','startup.update'].includes(action))assert(arrivalControl===controlGeneration,'QQ_CONNECTION_REVOKED','连接设置期间的操作已撤销');
    switch (action) {
      case 'status': return {...status(),startup:structuredClone(startup)};
      case 'choices.get': return choicesOf(context);
      case 'settings.get': return {settings: structuredClone(settings), schema: SETTINGS_SCHEMA};
      case 'settings.update': {
        const next = normalizeSettings(payload.settings ?? payload, settings);
        const changedConnection=next.accountId!==settings.accountId||next.connectionRef!==settings.connectionRef;
        if(changedConnection)assert(next.accountId===context.accountId&&(!Array.isArray(context.managedConnections)||context.managedConnections.some(row=>row.platform==='qq'&&row.ref===next.connectionRef&&row.accountId===next.accountId)),'QQ_CONNECTION_ACCOUNT_MISMATCH','请选择当前已登录的账号连接');
        assert(!connected || (next.accountId === settings.accountId && next.connectionRef === settings.connectionRef), 'QQ_DISCONNECT_BEFORE_ACCOUNT_CHANGE', '更换账号前请断开连接');
        const control=beginControl();
        if (!next.enabled && connected) await stopConnection({invalidate:false});
        checkControl(control);
        const nextStartup=changedConnection?{autoResume:false}:startup;store.transaction(()=>{if(changedConnection)store.set('qr-startup-v1',nextStartup);writeStoredQqSettings(store,next);});settings=next;startup=nextStartup;
        policyGeneration++; cancelActive(); return status();
      }
      case 'operator.select': {
        assert(typeof payload.characterId === 'string' && payload.characterId, 'QQ_OPERATOR_REQUIRED', '请选择角色');
        const control=beginControl();
        const selected = await bindControl(control,{purpose: 'qq-operator-bind', contextToken: context.contextToken, accountId: settings.accountId, characterId: payload.characterId});
        assert(selected?.contextToken && selected.accountId === settings.accountId && selected.characterId === payload.characterId && selected.lifeId && selected.operationId, 'QQ_OPERATOR_BINDING_INVALID', '宿主未验证接管角色的人生');
        cancelActive(); operator = {characterId: selected.characterId, lifeId: selected.lifeId, operationId: selected.operationId, displayName: labelOf(context, selected.characterId) ?? nameOk(selected.characterName, selected.characterId) ?? nameOk(selected.displayName, selected.characterId), generation: selected.operatorGeneration ?? (operator?.generation ?? 0) + 1};
        store.set('operator', operator); return status();
      }
      case 'connect': return connect(context);
      case 'disconnect': await stopConnection(); return status();
      case 'setup.finish': {
        const selected=(context.managedConnections??[]).find(row=>row.platform==='qq'&&row.ref===payload.connectionRef&&row.accountId===context.accountId);
        assert(selected&&typeof payload.characterId==='string'&&(context.availableCharacters??[]).some(row=>row.id===payload.characterId),'QQ_SETUP_SELECTION_REQUIRED','请选择已连接的账号和角色');
        assert(typeof payload.autoResume==='boolean','QQ_SETUP_SELECTION_REQUIRED','请明确选择启动恢复设置');
        const next=normalizeSettings({...settings,enabled:true,connectionRef:selected.ref,accountId:selected.accountId,contacts:payload.contacts??[],groups:payload.groups??[],proactiveContacts:false});
        const control=beginControl();
        await stopConnection({invalidate:false});checkControl(control);
        const nextStartup={autoResume:false};store.transaction(()=>{store.set('qr-startup-v1',nextStartup);writeStoredQqSettings(store,next);});settings=next;startup=nextStartup;policyGeneration++;
        try{
        const bound=await bindControl(control,{purpose:'qq-operator-bind',contextToken:context.contextToken,accountId:settings.accountId,characterId:payload.characterId});
        assert(bound?.contextToken&&bound.accountId===settings.accountId&&bound.characterId===payload.characterId&&bound.lifeId&&bound.operationId,'QQ_OPERATOR_BINDING_INVALID','角色绑定未验证');
        operator={characterId:bound.characterId,lifeId:bound.lifeId,operationId:bound.operationId,displayName:labelOf(context,bound.characterId)??nameOk(bound.characterName,bound.characterId)??nameOk(bound.displayName,bound.characterId),generation:bound.operatorGeneration};store.set('operator',operator);
        await connect();checkControl(control);
        await host.invoke('social.context.read',{purpose:'manage-plugin',principal,setupAction:'complete',autoResume:payload.autoResume},{signal:control.controller.signal});checkControl(control);
        startup={autoResume:payload.autoResume,accountId:settings.accountId,connectionRef:settings.connectionRef,characterId:operator.characterId,lifeId:operator.lifeId,operationId:operator.operationId};store.set('qr-startup-v1',startup);restoreAttempted=false;
        return {...status(),startup:structuredClone(startup)};
        }catch(error){if(currentControl(control)){await stopConnection({invalidate:false});if(currentControl(control)){const disabled={...settings,enabled:false},stoppedStartup={autoResume:false};store.transaction(()=>{writeStoredQqSettings(store,disabled);store.set('qr-startup-v1',stoppedStartup);});settings=disabled;startup=stoppedStartup;}}throw error;}
      }
      case 'startup.update': {
        // Resume-on-start for the account and character set up now. Turning it off is local and always allowed (the
        // plugin then never asks the host to restore); turning it on needs the host to record it for the live binding.
        assert(typeof payload.autoResume === 'boolean', 'QQ_STARTUP_INVALID', '请明确选择启动恢复设置');
        assert(settings.enabled && settings.accountId && settings.connectionRef && operator, 'QQ_OPERATOR_REQUIRED', '请先完成设置');
        assert(arrivalStartup>startupAccepted,'QQ_CONNECTION_REVOKED','启动恢复设置已撤销');startupAccepted=arrivalStartup;
        const scope = {accountId: settings.accountId, connectionRef: settings.connectionRef, characterId: operator.characterId, lifeId: operator.lifeId, operationId: operator.operationId},control=beginStartup();
        if (!payload.autoResume) {startup = {...scope, autoResume: false};store.set('qr-startup-v1', startup);await host.invoke('social.context.read', {purpose: 'manage-plugin', principal, setupAction: 'complete', autoResume: false},{signal:control.controller.signal}).catch(() => {});checkStartup(control);return {...status(), startup: structuredClone(startup)};}
        await host.invoke('social.context.read', {purpose: 'manage-plugin', principal, setupAction: 'complete', autoResume: true},{signal:control.controller.signal});checkStartup(control);
        assert(settings.accountId === scope.accountId && settings.connectionRef === scope.connectionRef && operator && ['characterId', 'lifeId', 'operationId'].every(key => operator[key] === scope[key]), 'QQ_CONNECTION_REVOKED', '设置期间账号或角色已变化');
        startup = {...scope, autoResume: true};store.set('qr-startup-v1', startup);restoreAttempted = false;
        return {...status(), startup: structuredClone(startup)};
      }
      case 'history.list': {
        const limit = Number.isSafeInteger(payload.limit) ? Math.min(Math.max(payload.limit, 1), 200) : 50;
        const conversationId = typeof payload.conversationId === 'string' ? payload.conversationId : null;
        const messages = conversationId ? db.prepare('SELECT * FROM qq_messages WHERE account_id=? AND conversation_id=? ORDER BY received_at DESC LIMIT ?').all(settings.accountId, conversationId, limit) : db.prepare('SELECT * FROM qq_messages WHERE account_id=? ORDER BY received_at DESC LIMIT ?').all(settings.accountId, limit);
        const outbox = conversationId ? db.prepare('SELECT * FROM qq_outbox WHERE account_id=? AND conversation_id=? ORDER BY created_at DESC LIMIT ?').all(settings.accountId, conversationId, limit) : db.prepare('SELECT * FROM qq_outbox WHERE account_id=? ORDER BY created_at DESC LIMIT ?').all(settings.accountId, limit);
        const sourceGroups = messageKey => db.prepare('SELECT provider_request_id,sources_json,character_id,life_id FROM qq_sources WHERE account_id=? AND message_key=? ORDER BY created_at').all(settings.accountId, messageKey).map(row => ({providerRequestId: row.provider_request_id, characterId: row.character_id, lifeId: row.life_id, sources: JSON.parse(row.sources_json)}));
        const conversations = db.prepare('SELECT conversation_id,MAX(activity_at) AS last_activity FROM (SELECT conversation_id,received_at AS activity_at FROM qq_messages WHERE account_id=? UNION ALL SELECT conversation_id,created_at AS activity_at FROM qq_outbox WHERE account_id=?) GROUP BY conversation_id ORDER BY last_activity DESC,conversation_id').all(settings.accountId, settings.accountId).map(row => ({conversationId: row.conversation_id, conversationType: row.conversation_id.split(':')[0], peerId: row.conversation_id.split(':')[1], lastActivity: row.last_activity}));
        let memoryItems=[];
        if(context.memoryRecoveryAvailable)try{const value=await host.invoke('connections.request',{contextToken:context.contextToken,operation:'qq.memory.status',accountId:settings.accountId,requestIds:outbox.filter(row=>row.status==='sent').map(row=>row.request_id)});memoryItems=value.items??[];}catch{}
        const memoryByRequest=new Map(memoryItems.map(row=>[row.requestId,row]));
        return {conversations, messages: messages.map(row => ({...row, event: JSON.parse(row.event_json), event_json: undefined, sourceGroups: sourceGroups(row.message_key)})), outbox: outbox.map(row => ({...row, sourceGroups: sourceGroups(row.message_key),...(row.status==='sent'?{memoryState:memoryByRequest.get(row.request_id)?.memoryState??'needs-review',memoryRetryAvailable:context.memoryRecoveryAvailable===true&&memoryByRequest.has(row.request_id)&&memoryByRequest.get(row.request_id).memoryState!=='committed'}:{})}))};
      }
      case 'memory.retry': {
        assert(context.memoryRecoveryAvailable===true,'QQ_MEMORY_RECOVERY_UNAVAILABLE','请更新宿主后补记');
        assert(typeof payload.requestId==='string'&&payload.requestId,'QQ_MEMORY_REQUEST_REQUIRED','请选择待补记的发送');
        const row=db.prepare("SELECT * FROM qq_outbox WHERE request_id=? AND account_id=? AND status='sent'").get(payload.requestId,settings.accountId);assert(row,'QQ_MEMORY_PROOF_MISSING','这条发送缺少可核对记录');
        return host.invoke('connections.request',{contextToken:context.contextToken,operation:'qq.memory.retry',accountId:settings.accountId,requestId:row.request_id});
      }
      case 'proactive.offer': return proactive(payload, context);
      default: throw fail('QQ_ACTION_UNKNOWN', '不支持的 QQ 操作');
    }
  }
  function dispatch(action,payload,principal){return trackControl(dispatchInternal(action,payload,principal));}
  function close() {
    if(closePromise)return closePromise;closed = true;invalidateControl();connected = false; connectionAttempt++; connectionGeneration++; cancelActive();
    closePromise=(async()=>{await closeTransport().catch(() => {});await Promise.allSettled([...controls,...pending]);store.close();})();return closePromise;
  }
  async function onHostEventInternal(event) {
    if(event?.type==='tick'&&startup.autoResume&&settings.enabled&&!connected&&!connecting&&!restoreAttempted){
      restoreAttempted=true;
      if(startup.accountId!==settings.accountId||startup.connectionRef!==settings.connectionRef||!operator||['characterId','lifeId','operationId'].some(key=>startup[key]!==operator[key]))return {status:'restore-needs-confirmation'};
      const control=beginControl(),saved=structuredClone(startup);
      try{
        const context=await host.invoke('social.context.read',{purpose:'plugin-background',principal:event.principal},{signal:control.controller.signal});checkControl(control);nameOperator(context);
        assert(context.accountId===saved.accountId,'QQ_CONNECTION_ACCOUNT_MISMATCH');
        const bound=await bindControl(control,{purpose:'qq-operator-bind',contextToken:context.contextToken,accountId:saved.accountId,characterId:saved.characterId,expectedLifeId:saved.lifeId,expectedOperationId:saved.operationId,restore:true});
        assert(bound?.contextToken&&bound.accountId===saved.accountId&&['characterId','lifeId','operationId'].every(key=>bound[key]===saved[key]),'QQ_RESTORE_LIFE_CHANGED');operator={...operator,generation:bound.operatorGeneration};store.set('operator',operator);await connect();checkControl(control);return {status:'restored'};
      }catch{return {status:'restore-needs-confirmation'};}
    }
    if (event?.type === 'proactive.deliver') return deliverProactive(event.offerId);
    if (event?.type === 'lifecycle.revoke') {await stopConnection();return {status: 'revoked'};}
    if (event?.type === 'app.exit') {await close();return {status: 'closed'};}
    return {status: 'ignored'};
  }
  function onHostEvent(event){if(event?.type==='app.exit')return close().then(()=>({status:'closed'}));if(closed)return Promise.resolve({status:'closed'});return trackControl(onHostEventInternal(event));}
  return {dispatch, status, close, receive, deliverProactive, onHostEvent, schema: SETTINGS_SCHEMA};
}
