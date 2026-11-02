import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSettings} from '../src/settings.mjs';
import {normalizeOneBotEvent} from '../src/normalizer.mjs';
test('QQ old settings inherit; conversation style overrides are bounded and do not grant access',()=>{
 const old=normalizeSettings({contacts:['20001'],groups:[]});assert.equal(old.replyStyle,'inherit');assert.deepEqual(old.conversationReplyStyles,{});
 const value=normalizeSettings({replyStyle:'brief',conversationReplyStyles:{'private:20002':'detailed','group:30001':'natural'}});assert.equal(value.replyStyle,'brief');assert.deepEqual(value.contacts,[]);assert.deepEqual(value.groups,[]);
 for(const p of [{replyStyle:'unknown'},{conversationReplyStyles:{'private:bad':'brief'}},{conversationReplyStyles:{'private:1':'bad'}},{conversationReplyStyles:[]}])assert.throws(()=>normalizeSettings(p),{code:'QQ_REPLY_STYLE_INVALID'});
});
test('QQ CQ mention/reply and array events have matching triggers without interpreting ordinary at-names',()=>{
 const base={post_type:'message',message_type:'group',self_id:'10001',user_id:'20001',sender:{user_id:'20001',nickname:'昵称',card:'群名片'},group_id:'30001',message_id:'1',time:1700000000};
 const binding={connectionId:'connection',accountId:'10001'},options={epochSeconds:1699999999,receivedAt:1700000000000};
 const cq=normalizeOneBotEvent({...base,message:'[CQ:at,qq=10001][CQ:reply,id=42]你好'},binding,options);assert.equal(cq.mentioned,true);assert.equal(cq.quoted,true);assert.equal(cq.senderId,'20001');assert.equal(cq.senderDisplayName,'群名片');assert.equal(cq.commandEligible,false);
 const text=normalizeOneBotEvent({...base,message:'&#91;CQ:at,qq=10001&#93; @昵称'},binding,options);assert.equal(text.mentioned,false);assert.equal(text.quoted,false);
});
