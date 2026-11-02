import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {openStore} from '../../../shared/store.mjs';
import {normalizeSettings as oldNormalize} from './fixtures/settings-2.0.2.mjs';
import {readStoredQqSettings,writeStoredQqSettings,replyStyleStoreKey} from '../src/settings-store.mjs';
import {createQqService} from '../src/service.mjs';

const pluginId='@ai-buddy/qq-connect',principal={contextToken:'synthetic-app'},legacy={enabled:false,connectionRef:'qq-A',accountId:'10001',contacts:['20001'],groups:[],proactiveContacts:false,updatePolicy:'manual'};
function fixture(t){const root=mkdtempSync(join(tmpdir(),'qq-settings-rollback-')),databasePath=join(root,'plugin.sqlite'),closers=[];t.after(async()=>{for(const close of closers.reverse())await close();rmSync(root,{recursive:true,force:true});});return {databasePath,closers};}
const open=(databasePath,writerVersion='2.0.2')=>openStore({databasePath,pluginId,schemaVersion:1,minimumWriter:'0.1.0-dev.2',writerVersion});
function service(databasePath,accountId='10001'){
 return createQqService({databasePath,host:{invoke:async(method,payload)=>{assert.equal(method,'social.context.read');assert.equal(payload.purpose,'manage-plugin');return {contextToken:'app',accountId,permissions:['plugin.manage'],availableCharacters:[],managedConnections:[{ref:'qq-A',platform:'qq',accountId},{ref:'qq-A2',platform:'qq',accountId}]};}}});
}
test('real SQLite old-reader -> new service write -> old-reader write -> new service read preserves both settings generations',async t=>{
 const f=fixture(t),path=f.databasePath;let store=open(path);f.closers.push(()=>store.close());store.set('settings',oldNormalize(legacy));store.close();
 let current=service(path);f.closers.push(()=>current.close());const first=await current.dispatch('status',{},principal);assert.equal(first.settings.replyStyle,'inherit');
 await current.dispatch('settings.update',{settings:{...first.settings,replyStyle:'brief',conversationReplyStyles:{'private:20001':'detailed'}}},principal);await current.close();
 store=open(path);const old=oldNormalize(store.get('settings'));assert.equal(Object.hasOwn(old,'replyStyle'),false);assert.equal(Object.hasOwn(old,'conversationReplyStyles'),false);store.set('settings',oldNormalize({...old,contacts:['20001','20002']}));const minimum=store.db.prepare('SELECT minimum_writer FROM a_plugin_meta WHERE id=1').get().minimum_writer;assert.equal(minimum,'0.1.0-dev.2');store.close();
 current=service(path);const reopened=await current.dispatch('status',{},principal);assert.equal(reopened.settings.replyStyle,'brief');assert.deepEqual(reopened.settings.conversationReplyStyles,{'private:20001':'detailed'});assert.deepEqual(reopened.settings.contacts,['20001','20002']);await current.close();
});
test('sidecar account binding survives legacy account changes without transferring another account style',t=>{
 const f=fixture(t),store=open(f.databasePath);f.closers.push(()=>store.close());writeStoredQqSettings(store,{...legacy,replyStyle:'brief',conversationReplyStyles:{'private:20001':'detailed'}});
 const accountB=oldNormalize({...legacy,accountId:'10002',connectionRef:'qq-B'});store.set('settings',accountB);const b=readStoredQqSettings(store);assert.equal(b.replyStyle,'inherit');assert.deepEqual(b.conversationReplyStyles,{});writeStoredQqSettings(store,{...b,replyStyle:'natural'});
 store.set('settings',oldNormalize({...legacy,contacts:['20002']}));const a=readStoredQqSettings(store);assert.equal(a.replyStyle,'brief');assert.deepEqual(a.conversationReplyStyles,{'private:20001':'detailed'});assert.deepEqual(a.contacts,['20002']);
});
test('SQLite sidecar write failure rolls back legacy/style/startup and leaves service runtime settings unchanged',async t=>{
 const f=fixture(t),path=f.databasePath;let store=open(path);store.set('settings',legacy);store.set('qr-startup-v1',{autoResume:true,marker:'preserve'});writeStoredQqSettings(store,{...legacy,replyStyle:'brief',conversationReplyStyles:{'private:20001':'detailed'}});store.close();
 const current=service(path),db=new DatabaseSync(path);f.closers.push(()=>current.close(),()=>db.close());
 db.exec("CREATE TRIGGER reject_style BEFORE INSERT ON a_plugin_kv WHEN NEW.key LIKE 'qq-reply-style-v1:%' BEGIN SELECT RAISE(ABORT,'injected-style-write-failure'); END;");
 await assert.rejects(current.dispatch('settings.update',{settings:{...legacy,connectionRef:'qq-A2',contacts:['29999'],replyStyle:'detailed',conversationReplyStyles:{}}},principal),/injected-style-write-failure/);
 const state=await current.dispatch('status',{},principal);assert.equal(state.settings.connectionRef,'qq-A');assert.deepEqual(state.settings.contacts,['20001']);assert.equal(state.settings.replyStyle,'brief');assert.equal(state.startup.autoResume,true);
 assert.equal(JSON.parse(db.prepare("SELECT value FROM a_plugin_kv WHERE key='settings'").get().value).connectionRef,'qq-A');assert.equal(JSON.parse(db.prepare('SELECT value FROM a_plugin_kv WHERE key=?').get(replyStyleStoreKey('10001')).value).replyStyle,'brief');assert.equal(JSON.parse(db.prepare("SELECT value FROM a_plugin_kv WHERE key='qr-startup-v1'").get().value).marker,'preserve');
 db.exec('DROP TRIGGER reject_style');await current.dispatch('settings.update',{settings:{...state.settings,replyStyle:'natural'}},principal);assert.equal((await current.dispatch('status',{},principal)).settings.replyStyle,'natural');
});
