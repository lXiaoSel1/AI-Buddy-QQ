import {assert} from '../../../shared/errors.mjs';

export const QQ_DEFAULTS = Object.freeze({
  enabled: false, connectionRef: '', accountId: '', contacts: [], groups: [],
  proactiveContacts: false, updatePolicy: 'manual', replyStyle: 'inherit', conversationReplyStyles: {},
});
export const HIGH_USAGE_TEXT = '开启群主动话题后，判断是否发言、构思话题和回复都可能消耗 tokens；即使最终未发言也可能产生用量。请按需开启。';
export const idString = value => typeof value === 'string' && /^[1-9]\d{0,19}$/.test(value);
export function normalizeSettings(value, previous = QQ_DEFAULTS) {
  assert(value && typeof value === 'object' && !Array.isArray(value), 'QQ_SETTINGS_INVALID', '设置必须是对象');
  const allowed = new Set(Object.keys(QQ_DEFAULTS));
  assert(Object.keys(value).every(key => allowed.has(key)), 'QQ_SETTING_UNKNOWN', '存在未支持的设置');
  const result = {...QQ_DEFAULTS, ...previous, ...value};
  for (const key of ['enabled', 'proactiveContacts']) assert(typeof result[key] === 'boolean', 'QQ_SETTINGS_INVALID', key + ' 必须为布尔值');
  assert(typeof result.connectionRef === 'string' && result.connectionRef.length <= 256, 'QQ_CONNECTION_INVALID', '连接引用无效');
  assert(result.accountId === '' || idString(result.accountId), 'QQ_ACCOUNT_INVALID', 'QQ 账号 ID 无效');
  assert(['manual', 'automatic'].includes(result.updatePolicy), 'QQ_UPDATE_POLICY_INVALID', '更新策略无效');
  assert(Array.isArray(result.contacts) && result.contacts.length <= 10000 && result.contacts.every(idString), 'QQ_CONTACT_INVALID', '联系人必须是平台 ID');
  result.contacts = [...new Set(result.contacts)];
  assert(Array.isArray(result.groups) && result.groups.length <= 10000, 'QQ_GROUP_INVALID', '群设置无效');
  const groupIds = new Set();
  result.groups = result.groups.map(group => {
    assert(group && idString(group.id) && !groupIds.has(group.id), 'QQ_GROUP_INVALID', '群 ID 无效或重复');
    groupIds.add(group.id);
    assert(Object.keys(group).every(key => ['id', 'naturalParticipation', 'quietOpener', 'highUsageAcknowledged'].includes(key)), 'QQ_GROUP_INVALID', '群设置包含未知字段');
    for (const key of ['naturalParticipation', 'quietOpener', 'highUsageAcknowledged']) assert(group[key] === undefined || typeof group[key] === 'boolean', 'QQ_GROUP_INVALID', '群开关必须为布尔值');
    assert(!group.quietOpener || group.highUsageAcknowledged === true, 'QQ_USAGE_ACK_REQUIRED', HIGH_USAGE_TEXT);
    return {id: group.id, naturalParticipation: group.naturalParticipation === true, quietOpener: group.quietOpener === true, highUsageAcknowledged: group.highUsageAcknowledged === true};
  });
  assert(['inherit','brief','natural','detailed'].includes(result.replyStyle), 'QQ_REPLY_STYLE_INVALID', '回复风格无效');
  const styles = result.conversationReplyStyles;
  assert(styles && typeof styles === 'object' && !Array.isArray(styles) && Object.keys(styles).length <= 10000, 'QQ_REPLY_STYLE_INVALID', '会话回复风格无效');
  assert(Object.entries(styles).every(([key, mode]) => /^(private|group):[1-9]\d{0,19}$/.test(key) && ['inherit','brief','natural','detailed'].includes(mode)), 'QQ_REPLY_STYLE_INVALID', '会话回复风格无效');
  result.conversationReplyStyles = Object.fromEntries(Object.entries(styles).filter(([, mode]) => mode !== 'inherit'));
  if (result.enabled) assert(result.connectionRef && result.accountId, 'QQ_CONNECTION_REQUIRED', '启用前请配置受管理的账号连接');
  return result;
}

export const SETTINGS_SCHEMA = {
  schemaVersion: 1, minimumWriter: '0.1.0-dev.2', defaults: QQ_DEFAULTS,
  requiredBackendCapabilities: ['events.private', 'events.group', 'identity.sender', 'identity.account', 'messages.id', 'messages.timestamp', 'send.receipt'],
  optionalMessageCapabilities: ['image', 'face', 'mface', 'json', 'xml', 'reply'],
  voiceSupported: false, offlineHistoryReplay: false, retainHistoryOnUninstall: true,
};
