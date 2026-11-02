import test from 'node:test';
import assert from 'node:assert/strict';
import {mountPage,ok,refuse} from '../../../test/page-harness.mjs';
import {createQqPage} from '../src/client/index.mjs';

for(const lang of ['zh-CN','en']){
 const en=lang==='en';
 test(lang+': global refresh updates the selected chat and overview while preserving unsaved drafts',async t=>{
  let fresh=false;const settings={enabled:true,connectionRef:'qq-A',accountId:'10001',contacts:['20001','20002'],groups:[],proactiveContacts:false,updatePolicy:'manual',replyStyle:'inherit',conversationReplyStyles:{}};
  const conversations=['20001','20002'].map((id,i)=>({conversationId:'private:'+id,conversationType:'private',peerId:id,lastActivity:Date.now()-i}));
  const page=mountPage(t,createQqPage,async(action,payload)=>{
   if(action==='readiness')return ok({mode:'runtime'});
   if(action==='status')return ok({settings,enabled:true,connected:true,operator:{characterId:'deepseek',lifeId:'life',displayName:'DeepSeek'},startup:{autoResume:false}});
   if(action==='choices.get')return ok({characters:[{id:'deepseek',label:'DeepSeek'}],connections:[{ref:'qq-A',accountId:'10001',label:'A'}]});
   if(action==='onboarding.contacts')return ok({accountRef:'qq-A',contacts:[{id:'20001',label:'First contact'},{id:'20002',label:'Second contact'}],groups:[]});
   if(action==='history.list'){const id=payload.conversationId??'private:20001';return ok({conversations,messages:[{message_key:'m-'+id,conversation_id:id,received_at:Date.now(),sender_id:id.split(':')[1],event:{plainText:(fresh?'FRESH_':'OLD_')+id}}],outbox:[{request_id:'r-'+id,conversation_id:id,created_at:Date.now(),text_value:'RECEIPT_'+id,status:fresh?'sent':'unknown',memoryState:fresh?'committed':'pending'}]});}
   return refuse('UNEXPECTED_'+action);
  },{lang});
  await page.settle();await page.click(en?'Allow-list':'允许的联系人与群');await page.change(en?'Group number to allow':'新增允许群的群号','39999');await page.click(en?'Add group':'添加群');await page.click(en?'Chats & work':'聊天与工作');await page.click('Second contact');await page.click(en?'Chat reply style…':'会话回复风格…');await page.change(en?'Reply style':'回复风格','detailed');fresh=true;await page.click(en?'Refresh':'刷新');
  const selected=page.all(n=>n.props.className==='qq-conv'&&n.props['aria-current']===true)[0];assert.ok(page.textOf(selected).includes('Second contact'));assert.ok(page.text().includes('FRESH_private:20002'));assert.ok(!page.text().includes('OLD_private:20002'));assert.ok(page.text().includes(en?'Remembered':'已记忆'));assert.equal(page.all(n=>n.type==='select'&&n.props['aria-label']===(en?'Reply style':'回复风格'))[0].props.value,'detailed');await page.click(en?'Cancel':'取消');await page.click(en?'Allow-list':'允许的联系人与群');assert.ok(page.text().includes('39999'));assert.equal(page.count('settings.update'),0);
 });
}
