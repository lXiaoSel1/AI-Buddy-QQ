import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import {DirectOneBotTransport} from '../plugins/qq-connect/src/onebot.mjs';
import {REQUIRED_BACKEND_CAPABILITIES} from '../plugins/qq-connect/src/normalizer.mjs';

function textFrame(value){const data=Buffer.from(JSON.stringify(value));const h=Buffer.alloc(data.length<126?2:4);h[0]=0x81;if(data.length<126)h[1]=data.length;else{h[1]=126;h.writeUInt16BE(data.length,2);}return Buffer.concat([h,data]);}
test('MOCK OneBot real loopback HTTP/WS bytes: sender event and message receipt, no history API',async()=>{
 const calls=[],sockets=new Set();let upgraded,resolveMessage;
 const gotMessage=new Promise(resolve=>resolveMessage=resolve),gotUpgrade=new Promise(resolve=>upgraded=resolve);
 const server=createServer(async(req,res)=>{
  let body='';for await(const chunk of req)body+=chunk;calls.push({path:req.url,body:JSON.parse(body)});
  res.setHeader('content-type','application/json');
  if(req.url==='/get_login_info')res.end(JSON.stringify({status:'ok',retcode:0,data:{user_id:20001,nickname:'fixture'}}));
  else if(req.url==='/send_private_msg')res.end(JSON.stringify({status:'ok',retcode:0,data:{message_id:701}}));
  else{res.statusCode=404;res.end('{}');}
 });
 server.on('upgrade',(request,socket)=>{
  sockets.add(socket);socket.on('error',()=>{});socket.on('close',()=>sockets.delete(socket));
  const key=createHash('sha1').update(request.headers['sec-websocket-key']+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+key+'\r\n\r\n');
  upgraded(socket);
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');const port=server.address().port;
 const transport=new DirectOneBotTransport({httpUrl:`http://127.0.0.1:${port}`,webSocketUrl:`ws://127.0.0.1:${port}/events`,capabilities:REQUIRED_BACKEND_CAPABILITIES});
 try{
  await transport.start({accountId:'20001',onEvent:resolveMessage,onEpoch:()=>{}});
  const socket=await gotUpgrade;
  socket.write(textFrame({time:Math.floor(Date.now()/1000),self_id:20001,post_type:'message',message_type:'private',sub_type:'friend',message_id:700,user_id:30001,message:[{type:'text',data:{text:'隔离测试'}}]}));
  const inbound=await Promise.race([gotMessage,new Promise((_,reject)=>{const t=setTimeout(()=>reject(Error('loopback message timeout')),3000);t.unref();})]);
  assert.equal(inbound.user_id,30001);assert.equal(inbound.message_id,700);
  assert.deepEqual(await transport.send({conversationType:'private',peerId:'30001',text:'仅本地模拟回执'}),{status:'sent',messageId:'701'});
  assert.deepEqual(calls.map(c=>c.path),['/get_login_info','/send_private_msg']);assert.equal(calls[1].body.user_id,'30001');
 }finally{await transport.close();for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));}
});
