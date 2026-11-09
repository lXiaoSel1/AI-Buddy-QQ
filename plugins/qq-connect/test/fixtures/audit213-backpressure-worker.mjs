import {parentPort} from 'node:worker_threads';
import {HostOneBotTransport} from '../../src/onebot.mjs';
import {REQUIRED_BACKEND_CAPABILITIES} from '../../src/normalizer.mjs';
let release,batches=0;const gate=new Promise(done=>{release=done;});
const transport=new HostOneBotTransport({async invoke(method){
 if(method==='connections.open')return {connectionId:'fixture',accountId:'10000',capabilities:REQUIRED_BACKEND_CAPABILITIES};
 if(method==='connections.close')return {closed:true};
 batches++;
 if(batches<=10){
  if(batches===10)setTimeout(()=>{parentPort.postMessage({responsive:true,batches});release();void transport.close();},10);
  return {cursor:batches*100,events:Array.from({length:100},(_,i)=>({id:(batches-1)*100+i}))};
 }
 return {cursor:1000,events:[]};
}});
await transport.start({connectionRef:'fixture',accountId:'10000',onEvent:event=>event.id===0?gate:Promise.resolve()});
