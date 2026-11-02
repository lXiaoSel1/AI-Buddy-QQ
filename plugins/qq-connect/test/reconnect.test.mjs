import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createQqService} from '../src/service.mjs';
import {REQUIRED_BACKEND_CAPABILITIES} from '../src/normalizer.mjs';

const principal={contextToken:'verified-app-owner'},accountId='10001';
const pause=()=>{let release;const promise=new Promise(resolve=>release=resolve);return {promise,release};};
async function restored(t){
  const parent=process.env.AI_BUDDY_PLUGIN_TEST_ROOT??tmpdir();await mkdir(parent,{recursive:true});
  const root=await mkdtemp(join(parent,'qq-reconnect-')),databasePath=join(root,'plugin.sqlite');
  const f={bound:false,bindCalls:0,starts:0,manageAllowed:true,lifeId:'life-one',operationId:'op-one',generation:0,calls:[]};
  const host={async invoke(method,payload){
    f.calls.push({method,payload});assert.equal(method,'social.context.read','Connecting must not call a model, send a message or create work');
    if(payload.purpose==='manage-plugin')return {contextToken:'management',accountId,permissions:f.manageAllowed?['plugin.manage']:[]};
    assert.equal(payload.purpose,'qq-operator-bind');assert.equal(payload.contextToken,'management');
    f.bindCalls++;if(f.gate){f.started.release();await f.gate.promise;}
    if(f.bindError)throw Object.assign(Error(f.bindError),{code:f.bindError});
    f.bound=true;return {contextToken:'verified-operator',accountId:f.responseAccount??accountId,characterId:f.responseCharacter??payload.characterId,lifeId:f.lifeId,operationId:f.operationId,operatorGeneration:++f.generation,...(f.override??{})};
  }};
  const transport={async close(){},async start(){f.starts++;if(!f.bound)throw Object.assign(Error('Host binding absent after restart'),{code:'QQ_OPERATOR_BINDING_REQUIRED'});return {accountId,connectionId:'restored-connection',capabilities:REQUIRED_BACKEND_CAPABILITIES};},async send(){throw Error('Connect must never send');}};
  const create=()=>createQqService({databasePath,host,transport});f.service=create();
  t.after(async()=>{f.gate?.release();await f.service.close();await rm(root,{recursive:true,force:true});});
  await f.service.dispatch('settings.update',{enabled:true,accountId,connectionRef:'saved-ref',contacts:[],groups:[{id:'30001'}]},principal);
  await f.service.dispatch('operator.select',{characterId:'whale'},principal);
  await f.service.close();f.bound=false;f.bindCalls=0;f.calls=[];f.service=create();
  return f;
}

test('REGRESSION: explicit Connect after restart restores saved host binding before OneBot without QR',async t=>{
  const f=await restored(t),before=f.service.status();
  const result=await f.service.dispatch('connect',{},principal);
  assert.equal(result.connected,true);assert.equal(f.bindCalls,1);assert.equal(f.starts,1);
  assert.deepEqual(result.settings,before.settings);assert.equal(result.operator.lifeId,before.operator.lifeId);
  const bind=f.calls.find(c=>c.payload.purpose==='qq-operator-bind').payload;
  assert.equal(bind.expectedLifeId,'life-one');assert.equal(bind.expectedOperationId,'op-one');
  assert.equal(bind.restore,undefined,'explicit connection must not pretend to have background approval');
  assert.equal((await f.service.dispatch('status',{},principal)).startup.autoResume,false);
});
test('REGRESSION: reconnect cannot silently replace a persisted life after restart',async t=>{
  const f=await restored(t),before=f.service.status().operator;f.lifeId='new-life';
  await assert.rejects(f.service.dispatch('connect',{},principal),{code:'QQ_RECONNECT_OPERATOR_CHANGED'});
  assert.equal(f.starts,0);assert.equal(f.service.status().connected,false);assert.deepEqual(f.service.status().operator,before);
});
for(const [name,change] of [
  ['account',{responseAccount:'10002'}],['character',{responseCharacter:'other'}],
  ['operation',{operationId:'new-operation'}],['missing host token',{override:{contextToken:null}}],
])test('Reconnect refuses changed '+name+' without opening a transport',async t=>{
  const f=await restored(t),before=f.service.status().operator;Object.assign(f,change);
  await assert.rejects(f.service.dispatch('connect',{},principal),{code:'QQ_RECONNECT_OPERATOR_CHANGED'});
  assert.equal(f.starts,0);assert.deepEqual(f.service.status().operator,before);
});
test('Concurrent explicit connects coalesce the bind and OneBot open',async t=>{
  const f=await restored(t);f.gate=pause();f.started=pause();
  const first=f.service.dispatch('connect',{},principal);await f.started.promise;
  const second=f.service.dispatch('connect',{},principal);await new Promise(resolve=>setImmediate(resolve));
  f.gate.release();const values=await Promise.all([first,second]);
  assert.ok(values.every(v=>v.connected));assert.equal(f.bindCalls,1);assert.equal(f.starts,1);
  await f.service.dispatch('connect',{},principal);assert.equal(f.bindCalls,1);assert.equal(f.starts,1);
});
for(const action of ['disconnect','disable','policy-change','close','operator-change'])test('Late reconnect cannot undo '+action,async t=>{
  const f=await restored(t),before=f.service.status().operator;f.gate=pause();f.started=pause();
  const pending=f.service.dispatch('connect',{},principal);
  const rejected=assert.rejects(pending,{code:'QQ_CONNECTION_REVOKED'});await f.started.promise;let closing;
  if(action==='disconnect')await f.service.dispatch('disconnect',{},principal);
  if(action==='disable')await f.service.dispatch('settings.update',{enabled:false},principal);
  if(action==='policy-change')await f.service.dispatch('settings.update',{groups:[]},principal);
  if(action==='close')closing=f.service.close();
  if(action==='operator-change'){
    const gate=f.gate;f.gate=null;await f.service.dispatch('operator.select',{characterId:'other'},principal);f.gate=gate;
  }
  f.gate.release();await rejected;await closing;assert.equal(f.starts,0);assert.equal(f.service.status().connected,false);
  if(action!=='operator-change')assert.deepEqual(f.service.status().operator,before);
  else assert.equal(f.service.status().operator.characterId,'other');
});
test('Login failure is not a successful binding; a later explicit retry can recover',async t=>{
  const f=await restored(t);f.bindError='SOCIAL_LOGIN_EXPIRED';
  await assert.rejects(f.service.dispatch('connect',{},principal),{code:'SOCIAL_LOGIN_EXPIRED'});
  assert.equal(f.starts,0);f.bindError=null;assert.equal((await f.service.dispatch('connect',{},principal)).connected,true);
  assert.equal(f.starts,1);assert.equal(f.bindCalls,2);
});
test('Persisted operator alone gives neither management nor background startup authority',async t=>{
  const f=await restored(t);await f.service.onHostEvent({type:'tick',principal});
  assert.equal(f.starts,0);assert.equal(f.bindCalls,0);f.manageAllowed=false;
  await assert.rejects(f.service.dispatch('connect',{},principal),{code:'PLUGIN_MANAGE_DENIED'});
  assert.equal(f.starts,0);assert.equal(f.bindCalls,0);
});
