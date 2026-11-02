import {assert} from '../../../shared/errors.mjs';
import {QQ_DEFAULTS,normalizeSettings} from './settings.mjs';

const LEGACY_KEYS=['enabled','connectionRef','accountId','contacts','groups','proactiveContacts','updatePolicy'];
export const replyStyleStoreKey=accountId=>'qq-reply-style-v1:'+(accountId||'unbound');
// 2.0.2 strictly rejects unknown settings fields. Keep its record unchanged in
// shape; newer account-bound preferences live in an ignored, additive KV row.
export function readStoredQqSettings(store){
 const legacy=normalizeSettings(store.get('settings',QQ_DEFAULTS)),sidecar=store.get(replyStyleStoreKey(legacy.accountId),null);
 if(sidecar===null)return legacy;
 assert(sidecar&&typeof sidecar==='object'&&!Array.isArray(sidecar)&&Object.keys(sidecar).every(k=>['schemaVersion','accountId','replyStyle','conversationReplyStyles'].includes(k))&&sidecar.schemaVersion===1&&sidecar.accountId===legacy.accountId,'QQ_REPLY_STYLE_INVALID','回复风格存档无效');
 return normalizeSettings({...legacy,replyStyle:sidecar.replyStyle,conversationReplyStyles:sidecar.conversationReplyStyles});
}
export function writeStoredQqSettings(store,value){
 const next=normalizeSettings(value),legacy=Object.fromEntries(LEGACY_KEYS.map(key=>[key,next[key]])),sidecar={schemaVersion:1,accountId:next.accountId,replyStyle:next.replyStyle,conversationReplyStyles:next.conversationReplyStyles};
 // Nested calls use the existing synchronous savepoint implementation. The
 // caller publishes its runtime state only after the outer commit succeeds.
 store.transaction(()=>{store.set('settings',legacy);store.set(replyStyleStoreKey(next.accountId),sidecar);});
 return next;
}
