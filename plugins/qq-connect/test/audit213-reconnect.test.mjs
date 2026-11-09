// Preparation only: real candidate services with isolated account/model/transport fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createQqService} from '../src/service.mjs';
import {REQUIRED_BACKEND_CAPABILITIES} from '../src/normalizer.mjs';
import {HostOneBotTransport} from '../src/onebot.mjs';
const principal={contextToken:'fixture-owner'},ACCOUNT='10001',OWNER='20001';
const pause=()=>{let release;const promise=new Promise(resolve=>release=resolve);return {promise,release};};

function qqFixture(t){
 const root=process.env.AI_BUDDY_PLUGIN_TEST_ROOT??tmpdir();mkdirSync(root,{recursive:true});
 const directory=mkdtempSync(join(root,'audit213-social-'));
 const f={at:Date.UTC(2026,10,9,17),models:0,contexts:new Map(),sent:[],starts:0,seq:0};
 const host={async invoke(method,payload={},options={}){
  if(method==='social.context.read'){
   if(['manage-plugin','plugin-background'].includes(payload.purpose))return {contextToken:'fixture-manage',accountId:ACCOUNT,permissions:['plugin.manage','plugin.activity'],availableCharacters:[{id:'whale',label:'Fixture'}],managedConnections:[{ref:'fixture-qq',platform:'qq',accountId:ACCOUNT,label:'Fixture'}]};
   if(payload.purpose==='qq-operator-bind')return {contextToken:'fixture-operator',accountId:ACCOUNT,characterId:payload.characterId,lifeId:'fixture-life',operationId:'fixture-operation',operatorGeneration:1};
   const context={...payload,contextToken:'fixture-event-'+ ++f.seq,ownerVerified:true,permissions:[],personaId:'fixture-persona',modelCapabilities:['text']};f.contexts.set(context.contextToken,context);return context;
  }
  if(method==='activity.lease')return {leaseId:'fixture-lease-'+ ++f.seq,generation:1};
  if(method==='activity.check'){const c=f.contexts.get(payload.contextToken);return {valid:true,characterId:c.characterId,lifeId:c.lifeId,operationId:c.operationId,generation:1};}
  if(method==='models.request'){f.models++;f.entered?.release();if(f.gate)await f.gate.promise;return {text:'Fixture reply',requestId:'fixture-model-'+f.models,usageAccounting:'core-model-router'};}
  if(method==='experience.append')return {eventId:payload.eventId,recorded:true,stored:true};
  if(method==='activity.finish')return {finished:true};
  throw Error('Unexpected fixture host method '+method);
 }};
 const transport=f.transport={async start(options){f.options=options;f.starts++;if(f.startError)throw Object.assign(Error(f.startError),{code:f.startError});const binding={connectionId:'fixture-connection-'+f.starts,accountId:ACCOUNT,capabilities:REQUIRED_BACKEND_CAPABILITIES};options.onEpoch(binding);return binding;},async close(){},async send(input){f.sent.push(input);return f.sendResult??{status:'sent',messageId:'fixture-send-'+f.sent.length};}};
 f.service=createQqService({databasePath:join(directory,'plugin.sqlite'),host,transport,now:()=>f.at});
 t.after(()=>{f.gate?.release();return f.service.close();});
 f.activate=async(autoResume=false,contacts=[OWNER])=>{await f.service.dispatch('setup.finish',{connectionRef:'fixture-qq',characterId:'whale',contacts,groups:[],autoResume},principal);};
 f.event=()=>({post_type:'message',message_type:'private',self_id:ACCOUNT,user_id:OWNER,sender:{user_id:OWNER},message_id:'fixture-msg-'+ ++f.seq,time:f.at/1000,message:[{type:'text',data:{text:'Fixture message'}}]});
 return f;
}

test('C9: changing reply style while a model is pending preserves the authorized reply',async t=>{
 const f=qqFixture(t);await f.activate();f.entered=pause();f.gate=pause();
 const pending=f.service.receive(f.event());await f.entered.promise;
 await f.service.dispatch('settings.update',{replyStyle:'brief'},principal);f.gate.release();
 const result=await pending;console.log('C9_RESULT',JSON.stringify({result,sends:f.sent.length}));
 assert.equal(result.status,'sent');assert.equal(f.sent.length,1);
});

test('C7: unchanged approved startup binding can recover a second disconnection',async t=>{
 const f=qqFixture(t);await f.activate(true);
 for(let n=0;n<2;n++){f.options.onDisconnect('QQ_SOCKET_CLOSED');f.at+=60000;await f.service.onHostEvent({type:'tick',principal});}
 console.log('C7_RESULT',JSON.stringify({starts:f.starts,connected:f.service.status().connected}));
 assert.equal(f.starts,3);assert.equal(f.service.status().connected,true);assert.equal(f.sent.length,0);
});

for(const control of ['auto-resume-off','explicit-disconnect','operator-change'])test('C7: '+control+' cannot revive a disconnected binding',async t=>{
 const f=qqFixture(t);await f.activate(true);f.options.onDisconnect('QQ_SOCKET_CLOSED');
 if(control==='auto-resume-off')await f.service.dispatch('startup.update',{autoResume:false},principal);
 if(control==='explicit-disconnect')await f.service.dispatch('disconnect',{},principal);
 if(control==='operator-change')await f.service.dispatch('operator.select',{characterId:'other'},principal);
 f.at+=60000;await f.service.onHostEvent({type:'tick',principal});assert.equal(f.starts,1);assert.equal(f.service.status().connected,false);
});
test('C7: reconnect uses bounded backoff and stops after five consecutive failures',async t=>{
 const f=qqFixture(t);await f.activate(true);f.options.onDisconnect('QQ_SOCKET_CLOSED');f.startError='QQ_SOCKET_FAILED';
 await f.service.onHostEvent({type:'tick',principal});assert.equal(f.starts,1);
 for(let n=0;n<6;n++){f.at+=60000;await f.service.onHostEvent({type:'tick',principal});}
 assert.equal(f.starts,6);assert.equal(f.service.status().reconnect.phase,'disconnected');assert.equal(f.service.status().reconnect.attempt,5);
});
test('C7: unknown send receipt is never resubmitted after a connection recovery',async t=>{
 const f=qqFixture(t);await f.activate(true);f.sendResult={status:'unknown'};const raw=f.event();assert.equal((await f.service.receive(raw)).status,'unknown');
 f.options.onDisconnect('QQ_SOCKET_CLOSED');f.at+=60000;await f.service.onHostEvent({type:'tick',principal});raw.time=f.at/1000;await f.service.receive(raw);assert.equal(f.sent.length,1);assert.equal(f.models,1);
});
test('C7: a slow conversation does not block another allowed conversation',async t=>{
 const f=qqFixture(t);await f.activate(false,[OWNER,'20002']);f.gate=pause();
 const first=f.service.receive(f.event()),second=f.service.receive({...f.event(),user_id:'20002',sender:{user_id:'20002'}});
 for(let n=0;n<100&&f.models<2;n++)await new Promise(resolve=>setImmediate(resolve));assert.equal(f.models,2);f.gate.release();assert.ok((await Promise.all([first,second])).every(row=>row.status==='sent'));
});
test('C9: allowlist revocation still cancels a model that is already pending',async t=>{
 const f=qqFixture(t);await f.activate();f.entered=pause();f.gate=pause();const pending=f.service.receive(f.event());await f.entered.promise;
 await f.service.dispatch('settings.update',{contacts:[]},principal);f.gate.release();assert.equal((await pending).status,'cancelled');assert.equal(f.sent.length,0);
});
test('C10: direct adapter future events expose clock skew and do not invoke a model',async t=>{
 const f=qqFixture(t);await f.activate();const raw=f.event();raw.time+=31;assert.equal((await f.service.receive(raw)).reason,'QQ_CLOCK_SKEW');assert.equal(f.service.status().transportError,'QQ_CLOCK_SKEW');assert.equal(f.models,0);
});
test('C7: actual host polling keeps receiving while a handler waits and acknowledges only settled batches',async()=>{
 const gate=pause(),arrived=pause(),polls=[];let handled=0;
 const transport=new HostOneBotTransport({async invoke(method,payload,options){
  if(method==='connections.open')return {connectionId:'fixture',accountId:ACCOUNT,capabilities:REQUIRED_BACKEND_CAPABILITIES};
  if(method==='connections.close')return {closed:true};
  polls.push({...payload});
  if(polls.length<=2)return {cursor:polls.length,events:[{id:polls.length}]};
  await new Promise(resolve=>{const done=()=>{clearTimeout(timer);options.signal.removeEventListener('abort',done);resolve();},timer=setTimeout(done,5);options.signal.addEventListener('abort',done,{once:true});if(options.signal.aborted)done();});return {cursor:2,events:[]};
 }});
 try{await transport.start({connectionRef:'fixture',accountId:ACCOUNT,onEvent:async raw=>{handled++;if(handled===2)arrived.release();if(raw.id===1)await gate.promise;}});
  await Promise.race([arrived.promise,new Promise((_,reject)=>setTimeout(()=>reject(Error('Polling stayed blocked by the first model')),1000))]);
  assert.equal(handled,2);assert.ok(polls.every(row=>row.ackCursor===0));gate.release();for(let n=0;n<100&&!polls.some(row=>row.ackCursor===2);n++)await new Promise(resolve=>setTimeout(resolve,10));assert.ok(polls.some(row=>row.ackCursor===2));
 }finally{gate.release();await transport.close();}
});
