import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {createQqService} from '../src/service.mjs';
import {REQUIRED_BACKEND_CAPABILITIES} from '../src/normalizer.mjs';

const deferred=()=>{let release;return {promise:new Promise(r=>{release=r;}),release:()=>release()};};
const owner={contextToken:'verified-owner'};
function fixture(t){
 const parent=resolve(process.env.AI_BUDDY_PLUGIN_TEST_ROOT??join(tmpdir(),'buddy-social-audit'));mkdirSync(parent,{recursive:true});
 const root=mkdtempSync(join(parent,'qq-lifecycle-')),databasePath=join(root,'plugin.sqlite');
 const state={starts:0,generation:0,gate:null,entered:null};
 const host={async invoke(method,payload){
  assert.equal(method,'social.context.read','Lifecycle tests must not dispatch models, work or messages');
  if(payload.purpose==='manage-plugin')return {contextToken:'management',accountId:'10001',permissions:['plugin.manage'],availableCharacters:[{id:'whale'},{id:'claude'}],managedConnections:[{platform:'qq',ref:'qq',accountId:'10001'},{platform:'qq',ref:'qq-other',accountId:'10001'}]};
  if(payload.purpose==='plugin-background')return {contextToken:'background',accountId:'10001',permissions:['plugin.activity']};
  assert.equal(payload.purpose,'qq-operator-bind');
  const gate=state.gate;if(gate){state.entered.release();await gate.promise;}
  return {contextToken:'operator',accountId:'10001',characterId:payload.characterId,lifeId:'life-'+payload.characterId,operationId:'op-'+payload.characterId,operatorGeneration:++state.generation};
 }};
 const transport={async close(){},async start(){state.starts++;return {connectionId:'connection-'+state.starts,accountId:'10001',capabilities:REQUIRED_BACKEND_CAPABILITIES};},async send(){assert.fail('Must not send');}};
 const service=createQqService({databasePath,host,transport});
 const setup=()=>service.dispatch('setup.finish',{connectionRef:'qq',characterId:'whale',contacts:[],groups:[],autoResume:true},owner);
 t.after(async()=>{state.gate?.release();await service.close();assert.ok(resolve(root).startsWith(parent+sep));rmSync(root,{recursive:true,force:true});});
 return {service,state,setup,block(){state.gate=deferred();state.entered=deferred();return state.gate;}};
}

for(const operation of ['disconnect','disable','policy-change','close','operator-change'])test('AUDIT QQ setup late binding cannot undo '+operation,async t=>{
 const f=fixture(t),gate=f.block();const pending=f.setup().then(value=>({value}),error=>({error}));await f.state.entered.promise;
 let closing;
 if(operation==='disconnect')await f.service.dispatch('disconnect',{},owner);
 if(operation==='disable')await f.service.dispatch('settings.update',{enabled:false},owner);
 if(operation==='policy-change')await f.service.dispatch('settings.update',{groups:[{id:'30001'}]},owner);
 if(operation==='close')closing=f.service.close();
 if(operation==='operator-change'){f.state.gate=null;await f.service.dispatch('operator.select',{characterId:'claude'},owner);f.state.gate=gate;}
 gate.release();const result=await pending;await closing;
 assert.ok(result.error,'Superseded setup must fail, not report success');
 assert.equal(f.state.starts,0,'A cancelled setup must never open a transport');
 assert.equal(f.service.status().connected,false);
 if(operation==='operator-change')assert.equal(f.service.status().operator.characterId,'claude','Old setup cleanup cannot overwrite newer role');
 if(operation==='policy-change')assert.equal(f.service.status().settings.groups[0].id,'30001','Old setup cleanup cannot overwrite newer settings');
});

test('AUDIT QQ background restore cannot reconnect after explicit disconnect',async t=>{
 const f=fixture(t);await f.setup();await f.service.dispatch('disconnect',{},owner);const starts=f.state.starts,gate=f.block();
 const pending=f.service.onHostEvent({type:'tick',principal:owner});await f.state.entered.promise;
 await f.service.dispatch('disconnect',{},owner);gate.release();await pending;
 assert.equal(f.service.status().connected,false);assert.equal(f.state.starts,starts);
});

test('AUDIT QQ late role selection cannot undo a newer selection',async t=>{
 const f=fixture(t);await f.setup();const gate=f.block();
 const pending=f.service.dispatch('operator.select',{characterId:'whale'},owner).then(value=>({value}),error=>({error}));await f.state.entered.promise;
 f.state.gate=null;await f.service.dispatch('operator.select',{characterId:'claude'},owner);f.state.gate=gate;gate.release();
 const result=await pending;assert.ok(result.error);assert.equal(f.service.status().operator.characterId,'claude');
});

test('AUDIT QQ rejected connected endpoint edit preserves startup and selection',async t=>{
 const f=fixture(t);await f.setup();const before=await f.service.dispatch('status',{},owner);
 await assert.rejects(f.service.dispatch('settings.update',{connectionRef:'qq-other'},owner),{code:'QQ_DISCONNECT_BEFORE_ACCOUNT_CHANGE'});
 const after=await f.service.dispatch('status',{},owner);
 assert.deepEqual(after.startup,before.startup);assert.deepEqual(after.settings,before.settings);assert.deepEqual(after.operator,before.operator);assert.equal(after.connected,true);
});
