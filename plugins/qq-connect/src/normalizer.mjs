import {assert} from '../../../shared/errors.mjs';
import {idString} from './settings.mjs';

const fail=code=>Object.assign(Error(code),{code});
const messageId=value=>platformMessageId(value);
const decode=value=>value.replace(/&#44;/g,',').replace(/&#91;/g,'[').replace(/&#93;/g,']').replace(/&amp;/g,'&');
// Tokenize first: escaped literal CQ must never become a structural mention/reply.
export function parseQqMessageSegments(value){
 if(Array.isArray(value)){if(value.length>128)throw fail('QQ_MESSAGE_TOO_LARGE');return value;}
 if(typeof value!=='string'||value.length>200000)throw fail('QQ_MESSAGE_INVALID');
 const result=[];let start=0;const plain=s=>{if(s)result.push({type:'text',data:{text:decode(s)}});};
 for(const m of value.matchAll(/\[CQ:(?:at|reply),[^\[\]]*\]/g)){
  const at=/^\[CQ:at,qq=(all|[1-9]\d{0,19})\]$/.exec(m[0]),reply=/^\[CQ:reply,id=([^,\[\]]{1,128})\]$/.exec(m[0]);
  const rid=reply&&messageId(decode(reply[1]));if(!at&&!rid)continue;
  plain(value.slice(start,m.index));result.push(at?{type:'at',data:{qq:at[1]}}:{type:'reply',data:{id:rid}});start=m.index+m[0].length;
 }
 plain(value.slice(start));if(result.length>128)throw fail('QQ_MESSAGE_TOO_LARGE');return result;
}

const scalarId = value => typeof value === 'string' ? value : Number.isSafeInteger(value) ? String(value) : '';
export function platformMessageId(value) {
  const id = scalarId(value);
  return id && id.length <= 128 && !/[\s\u0000-\u001f\u007f]/u.test(id) ? id : null;
}
const bounded = (value, maximum = 100000) => typeof value === 'string' ? value.slice(0, maximum) : '';
export const REQUIRED_BACKEND_CAPABILITIES = ['events.private', 'events.group', 'identity.sender', 'identity.account', 'messages.id', 'messages.timestamp', 'send.receipt'];

export function normalizeOneBotEvent(raw, binding, {epochSeconds, receivedAt = Date.now()} = {}) {
  assert(binding?.connectionId && idString(binding.accountId), 'QQ_BINDING_REQUIRED', '需要经过托管连接绑定的账号');
  assert(raw && raw.post_type === 'message', 'QQ_EVENT_UNSUPPORTED', '仅接收新的消息事件');
  assert(['private', 'group'].includes(raw.message_type), 'QQ_EVENT_UNSUPPORTED', '消息会话类型无效');
  const selfId = scalarId(raw.self_id), senderId = scalarId(raw.user_id ?? raw.sender?.user_id);
  assert(selfId === binding.accountId && idString(senderId), 'QQ_EVENT_IDENTITY_INVALID', '事件与连接账号不匹配');
  if (raw.user_id !== undefined && raw.sender?.user_id !== undefined) assert(scalarId(raw.user_id) === scalarId(raw.sender.user_id), 'QQ_EVENT_IDENTITY_INVALID', '发送者字段存在歧义');
  assert(senderId !== selfId, 'QQ_SELF_EVENT', '忽略账号自己的发送回流');
  const sourceMessageId = platformMessageId(raw.message_id);
  assert(sourceMessageId, 'QQ_MESSAGE_ID_REQUIRED', '缺少稳定的平台消息 ID');
  assert(Number.isSafeInteger(raw.time) && raw.time >= epochSeconds && raw.time * 1000 <= receivedAt + 30000, 'QQ_OFFLINE_OR_INVALID_TIME', '只处理本次连接之后的新事件');
  const conversationType = raw.message_type;
  const peerId = conversationType === 'group' ? scalarId(raw.group_id) : senderId;
  assert(idString(peerId), 'QQ_EVENT_IDENTITY_INVALID', '会话 ID 无效');
  assert(Array.isArray(raw.message) || typeof raw.message === 'string', 'QQ_MESSAGE_INVALID', '消息段无效');
  const segments = parseQqMessageSegments(raw.message);
  assert(segments.length <= 128, 'QQ_MESSAGE_TOO_LARGE', '消息段数量过多');
  const parts = [], unsupported = [], text = [];
  let mentioned = false, quoted = false;
  for (const segment of segments) {
    const type = segment?.type, data = segment?.data ?? {};
    if (type === 'text') { const content = bounded(data.text); parts.push({type, text: content}); text.push(content); }
    else if (type === 'at') { const target = scalarId(data.qq); if (target === selfId) mentioned = true; parts.push({type, target}); }
    else if (type === 'reply') { quoted = true; parts.push({type, messageId: scalarId(data.id)}); }
    else if (type === 'image' || type === 'mface') {
      if (!(binding.capabilities ?? []).includes(type)) unsupported.push(type);
      parts.push({type, mediaRef: {file: bounded(data.file, 4096), url: bounded(data.url, 4096), subType: data.sub_type ?? null, emojiId: scalarId(data.emoji_id), summary: bounded(data.summary, 512)}});
    } else if (type === 'face') {
      if (!(binding.capabilities ?? []).includes(type)) unsupported.push(type);
      parts.push({type, faceId: scalarId(data.id)});
    } else if (type === 'json' || type === 'xml') {
      if (!(binding.capabilities ?? []).includes(type)) unsupported.push(type);
      parts.push({type, card: bounded(data.data, 32768)});
    } else {
      unsupported.push(type || 'unknown'); parts.push({type: 'unsupported', originalType: bounded(type, 64)});
    }
  }
  const plainText = text.join('').trim();
  const links = [...plainText.matchAll(/https?:\/\/[^\s<>]+/g)].map(match => match[0]).slice(0, 32);
  return Object.freeze({
    connectionId: binding.connectionId, accountId: selfId, senderId,
    senderNickname: bounded(raw.sender?.nickname, 256), senderCard: bounded(raw.sender?.card, 256), senderDisplayName: bounded(raw.sender?.card, 256).trim() || bounded(raw.sender?.nickname, 256).trim() || senderId,
    conversationType, peerId, conversationId: conversationType + ':' + peerId,
    sourceMessageId, occurredAt: new Date(raw.time * 1000).toISOString(), receivedAt: new Date(receivedAt).toISOString(),
    plainText, parts, links, mentioned, quoted, unsupported: [...new Set(unsupported)],
    commandEligible: segments.length > 0 && segments.every(segment => segment?.type === 'text'),
  });
}

export function parseWorkCommand(event) {
  const text = event.plainText;
  const prefix = /^\/(工作|计划|批准|取消)(?:\s|$)/u.test(text);
  if (!prefix) return null;
  if (!event.commandEligible) return {action: 'deny', reason: 'quoted-or-attached-command'};
  let match;
  if ((match = /^\/工作\s+([\s\S]{1,20000})$/u.exec(text))) return {action: 'propose', text: match[1].trim()};
  if ((match = /^\/计划\s+([a-zA-Z0-9_.:-]{1,128})$/u.exec(text))) return {action: 'read', taskId: match[1]};
  if ((match = /^\/批准\s+([a-zA-Z0-9_.:-]{1,128})\s+([1-9]\d{0,8})$/u.exec(text))) return {action: 'approve', taskId: match[1], planVersion: Number(match[2])};
  if ((match = /^\/取消\s+([a-zA-Z0-9_.:-]{1,128})\s+([1-9]\d{0,8})$/u.exec(text))) return {action: 'cancel', taskId: match[1], planVersion: Number(match[2])};
  return {action: 'deny', reason: 'invalid-work-command'};
}
