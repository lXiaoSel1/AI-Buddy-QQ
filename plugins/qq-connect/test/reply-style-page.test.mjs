import test from 'node:test';
import assert from 'node:assert/strict';
import {mountPage,ok,refuse} from '../../../test/page-harness.mjs';
import {createQqPage} from '../src/client/index.mjs';
const settings=(extra={})=>({enabled:true,connectionRef:'qq-A',accountId:'10001',contacts:['20001'],groups:[{id:'30001',naturalParticipation:false,quietOpener:false,highUsageAcknowledged:false}],proactiveContacts:false,updatePolicy:'manual',...extra});
function fixture(t,over={}){let current=settings();return mountPage(t,createQqPage,async(action,payload)=>{
 if(over[action])return over[action](payload);
 if(action==='readiness')return ok({mode:'runtime'});
 if(action==='status')return ok({settings:current,enabled:true,connected:true,operator:{characterId:'chatgpt',displayName:'GPT'},startup:{autoResume:false}});
 if(action==='choices.get')return ok({characters:[{id:'chatgpt',label:'GPT'}],connections:[{ref:'qq-A',accountId:'10001',label:'A'}]});
 if(action==='history.list')return ok({conversations:[],messages:[],outbox:[]});
 if(action==='settings.update'){current=payload.settings;return ok({saved:true});}
 return refuse('UNEXPECTED_'+action);
 });}
test('QQ default and permitted private/group style controls save the existing settings shape',async t=>{
 const p=fixture(t);await p.settle();await p.click('回复风格…');await p.change('回复风格','brief');await p.change('回复风格范围','private:20001');await p.change('回复风格','detailed');await p.change('回复风格范围','group:30001');await p.change('回复风格','natural');await p.click('保存回复风格');
 const v=p.calls.find(x=>x.action==='settings.update').payload.settings;assert.equal(v.replyStyle,'brief');assert.deepEqual(v.conversationReplyStyles,{'private:20001':'detailed','group:30001':'natural'});assert.deepEqual(v.contacts,['20001']);assert.equal(v.groups[0].naturalParticipation,false);
});
test('cancelling style edits discards the draft without a write',async t=>{
 const p=fixture(t);await p.settle();await p.click('回复风格…');await p.change('回复风格','detailed');await p.click('取消');assert.equal(p.count('settings.update'),0);await p.click('回复风格…');const select=p.all(n=>n.type==='select'&&n.props['aria-label']==='回复风格')[0];assert.equal(select.props.value,'inherit');
});
test('account changes clear unsaved style drafts and late save completion cannot close a newer account dialog',async t=>{
 let b=false,release;const p=fixture(t,{
  status:()=>ok({settings:settings(b?{connectionRef:'qq-B',accountId:'10002',replyStyle:'natural'}:{}),enabled:true,connected:true,operator:{characterId:'chatgpt',displayName:'GPT'},startup:{autoResume:false}}),
  'choices.get':()=>ok({characters:[{id:'chatgpt',label:'GPT'}],connections:[{ref:b?'qq-B':'qq-A',accountId:b?'10002':'10001',label:b?'B':'A'}]}),
  'settings.update':()=>new Promise(resolve=>release=()=>resolve(ok({saved:true}))),
 });
 await p.settle();await p.click('回复风格…');await p.change('回复风格','detailed');await p.click('保存回复风格');b=true;await p.dispatch('ai-buddy:social-accounts-changed');assert.equal(p.all(n=>n.props.role==='dialog').length,0);await p.click('回复风格…');release();await p.settle();assert.equal(p.all(n=>n.props.role==='dialog').length,1);assert.equal(p.all(n=>n.type==='select'&&n.props['aria-label']==='回复风格')[0].props.value,'natural');
});
