import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
test('saturated polling waits for the unsettled acknowledgement head without starving timers',async t=>{
 const worker=new Worker(new URL('./fixtures/audit213-backpressure-worker.mjs',import.meta.url));
 t.after(()=>worker.terminate());
 const result=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('A completed later batch starved the event loop at the backlog limit')),1500);worker.once('message',row=>{clearTimeout(timer);resolve(row);});worker.once('error',error=>{clearTimeout(timer);reject(error);});});
 assert.deepEqual(result,{responsive:true,batches:10});
});
