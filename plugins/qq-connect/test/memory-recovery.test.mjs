import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createQqService} from '../src/service.mjs';
import {createQqPage} from '../src/client/index.mjs';
import {mountPage,ok,refuse} from '../../../test/page-harness.mjs';

async function fixture(t,{available=true,items=[]}={}){
 const root=await mkdtemp(join(tmpdir(),'qq-memory-plugin-')),calls=[],host={invoke:async(method,payload)=>{calls.push({method,payload});if(method==='social.context.read')return {contextToken:'app-management',accountId:'123',permissions:['plugin.manage'],memoryRecoveryAvailable:available,managedConnections:[{ref:'qq-ref',accountId:'123',platform:'qq'}],availableCharacters:[]};if(method==='connections.request')return {items};throw Error('Unexpected side effect '+method);}},transport={close:async()=>{},start:async()=>{throw Error('must not open QQ');},send:async()=>{throw Error('must not resend');}},service=createQqService({databasePath:join(root,'plugin.sqlite'),host,transport});
 await service.dispatch('settings.update',{settings:{enabled:false,accountId:'123',connectionRef:'qq-ref'}},{contextToken:'principal'});
 const db=new DatabaseSync(join(root,'plugin.sqlite'));db.prepare('INSERT INTO qq_outbox(request_id,message_key,account_id,conversation_id,character_id,life_id,operator_generation,text_value,status,platform_message_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('old-sent','incoming','123','private:789','original','original-life',1,'original text','sent','456',1700000000000);db.close();t.after(async()=>{await service.close();await rm(root,{recursive:true,force:true});});return {service,calls};
}
test('QQ outbox alone remains needs-review and cannot manufacture a trusted memory retry',async t=>{
 const f=await fixture(t),history=await f.service.dispatch('history.list',{},{});assert.equal(history.outbox[0].memoryState,'needs-review');assert.equal(history.outbox[0].memoryRetryAvailable,false);assert.equal(f.calls.some(row=>['models.request','activity.lease'].includes(row.method)),false);
});
test('QQ history accepts only host memory status and manual retry uses the existing scoped management operation',async t=>{
 const f=await fixture(t,{items:[{requestId:'old-sent',memoryState:'pending'}]}),history=await f.service.dispatch('history.list',{},{});assert.equal(history.outbox[0].memoryState,'pending');assert.equal(history.outbox[0].memoryRetryAvailable,true);await f.service.dispatch('memory.retry',{requestId:'old-sent'},{});const last=f.calls.at(-1);assert.equal(last.method,'connections.request');assert.deepEqual(last.payload,{contextToken:'app-management',operation:'qq.memory.retry',accountId:'123',requestId:'old-sent'});await assert.rejects(f.service.dispatch('memory.retry',{requestId:'other-account-or-fabricated'},{}),{code:'QQ_MEMORY_PROOF_MISSING'});assert.equal(f.calls.some(row=>['models.request','activity.lease','owner.work.propose'].includes(row.method)),false);
});
test('QQ older host keeps history readable and explicitly refuses unsupported memory retry',async t=>{
 const f=await fixture(t,{available:false}),history=await f.service.dispatch('history.list',{},{});assert.equal(history.outbox[0].memoryState,'needs-review');await assert.rejects(f.service.dispatch('memory.retry',{requestId:'old-sent'},{}),{code:'QQ_MEMORY_RECOVERY_UNAVAILABLE'});
});
const settings={enabled:true,connectionRef:'qq-ref',accountId:'123',contacts:['789'],groups:[],proactiveContacts:false,updatePolicy:'manual'},running={enabled:true,connected:true,operator:{characterId:'whale',displayName:'鲸鱼娘',lifeId:'life',operationId:'op',generation:1},settings,startup:{autoResume:false}};
for(const lang of ['zh-CN','en'])test('QQ page renders three factual memory statuses and exact memory-only retry action '+lang,async t=>{
 let retried=false;const history=()=>({conversations:[{conversationId:'private:789',conversationType:'private',peerId:'789',lastActivity:1700000000000}],messages:[],outbox:[['remembered','committed'],['pending',retried?'committed':'pending'],['review','needs-review']].map(([id,state],i)=>({request_id:id,conversation_id:'private:789',created_at:1700000000000+i,text_value:id,status:'sent',memoryState:state,memoryRetryAvailable:id==='pending'&&!retried}))});
 const page=mountPage(t,createQqPage,async(action,payload)=>{if(action==='readiness')return ok({mode:'runtime',blockers:[]});if(action==='status')return ok(running);if(action==='choices.get')return ok({characters:[{id:'whale',label:'鲸鱼娘'}],connections:[{ref:'qq-ref',accountId:'123',label:'Isolated QQ'}]});if(action==='history.list')return ok(history());if(action==='memory.retry'){assert.deepEqual(payload,{requestId:'pending'});retried=true;return ok({items:[]});}return refuse('UNEXPECTED_'+action);},{lang});
 await page.settle();await page.click(lang==='en'?'Chats & work':'聊天与工作');assert.match(page.text(),lang==='en'?/Remembered/:/已记忆/);assert.match(page.text(),lang==='en'?/Memory pending/:/待补记/);assert.match(page.text(),lang==='en'?/Needs review/:/需要核对/);await page.click(lang==='en'?'Retry memory only':'仅重试补记');assert.equal(page.count('memory.retry'),1);assert.equal(page.count('connect'),0);assert.equal(retried,true);
});

for(const lang of ['zh-CN','en'])test('QQ memory retry errors explain the failure in the selected language '+lang,async t=>{
 const codes=['QQ_MEMORY_ORIGINAL_CONTEXT_INVALID','QQ_MEMORY_PROOF_INVALID','QQ_MEMORY_PROOF_MISSING','QQ_MEMORY_PROOF_CONFLICT','QQ_MEMORY_LEGACY_PROOF_INCOMPLETE','QQ_MEMORY_APPEND_UNCONFIRMED','QQ_MEMORY_APPEND_FAILED','QQ_MEMORY_REQUEST_REQUIRED','QQ_MEMORY_RECOVERY_UNAVAILABLE'];let errorCode=codes[0];
 const history={conversations:[{conversationId:'private:789',conversationType:'private',peerId:'789',lastActivity:1700000000000}],messages:[],outbox:[{request_id:'retry',conversation_id:'private:789',created_at:1700000000000,text_value:'Original text',status:'sent',memoryState:'needs-review',memoryRetryAvailable:true}]};
 const page=mountPage(t,createQqPage,async action=>{if(action==='readiness')return ok({mode:'runtime',blockers:[]});if(action==='status')return ok(running);if(action==='choices.get')return ok({characters:[{id:'whale',label:'鲸鱼娘'}],connections:[{ref:'qq-ref',accountId:'123',label:'Isolated QQ'}]});if(action==='history.list')return ok(history);if(action==='memory.retry')return refuse(errorCode);return refuse('UNEXPECTED_'+action);},{lang});await page.settle();await page.click(lang==='en'?'Chats & work':'聊天与工作');
 for(const code of codes){errorCode=code;await page.click(lang==='en'?'Retry memory only':'仅重试补记');const alert=page.all(node=>node.props?.className==='qq-alert err')[0];assert.ok(alert);assert.doesNotMatch(page.textOf(alert),/这一步没有完成|That did not go through/);assert.ok(page.textOf(alert).includes(code));}
});
