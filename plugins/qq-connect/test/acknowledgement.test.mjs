import test from 'node:test';
import assert from 'node:assert/strict';
import {HostOneBotTransport} from '../src/onebot.mjs';
import {REQUIRED_BACKEND_CAPABILITIES} from '../src/normalizer.mjs';

test('QQ host cursor acknowledges only after the current event handler completes',async()=>{
 let complete,entered,finished;const handlerStarted=new Promise(resolve=>{entered=resolve;}),handlerGate=new Promise(resolve=>{complete=resolve;}),disconnected=new Promise(resolve=>{finished=resolve;}),polls=[];
 const host={async invoke(method,payload){if(method==='connections.open')return {connectionId:'c',accountId:'123',cursor:0,capabilities:REQUIRED_BACKEND_CAPABILITIES};if(method==='connections.close')return {closed:true};assert.equal(method,'connections.events');polls.push(payload);if(polls.length===1)return {cursor:1,events:[{message_id:1}]};throw Object.assign(Error('End of local probe'),{code:'PROBE_END'});}};
 const transport=new HostOneBotTransport(host);
 try{await transport.start({connectionRef:'r',accountId:'123',onEvent:async()=>{entered();await handlerGate;},onDisconnect:finished});await handlerStarted;assert.equal(polls.length,1);assert.equal(polls[0].ackCursor,0);complete();await disconnected;assert.equal(polls[1].cursor,1);assert.equal(polls[1].ackCursor,1);}finally{complete();await transport.close();}
});
