import test from 'node:test';
import assert from 'node:assert/strict';
import {mountPage,ok,refuse} from '../../../test/page-harness.mjs';
import {createQqPage} from '../src/client/index.mjs';
for(const lang of ['zh-CN','en'])for(const phase of ['clock','waiting','disconnected'])test(lang+': '+phase+' is visible without adding authority',async t=>{
 const state={enabled:true,connected:phase==='clock',operator:{characterId:'fixture',lifeId:'fixture',operationId:'fixture',displayName:'Fixture',generation:1},settings:{enabled:true,connectionRef:'fixture',accountId:'10001',contacts:['20001'],groups:[],proactiveContacts:false,updatePolicy:'manual'},startup:{autoResume:true},reconnect:{phase:phase==='clock'?'idle':phase,attempt:2},transportError:phase==='clock'?{code:'QQ_CLOCK_SKEW'}:'QQ_SOCKET_CLOSED'};
 const page=mountPage(t,createQqPage,async action=>{if(action==='readiness')return ok({mode:'runtime',blockers:[]});if(action==='status')return ok(state);if(action==='choices.get')return ok({characters:[{id:'fixture',label:'Fixture'}],connections:[]});if(action==='history.list')return ok({conversations:[],messages:[],outbox:[]});return refuse('UNEXPECTED');},{lang});await page.settle();
 const text=page.text();if(phase==='clock')assert.ok(text.includes(lang==='en'?'computer clock':'电脑时间不准'));else if(phase==='waiting'){assert.ok(text.includes(lang==='en'?'Reconnecting (attempt 3)':'正在重新连接（第 3 次）'));assert.equal(page.button(lang==='en'?'Reconnect':'重新连接').props.disabled,true);}else{assert.ok(text.includes(lang==='en'?'Connection disconnected':'连接断开了'));assert.equal(page.button(lang==='en'?'Reconnect':'重新连接').props.disabled,false);}
 assert.equal(page.count('connect'),0);assert.equal(page.count('models.request'),0);
});
