import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {mountPage,ok,refuse} from '../../../test/page-harness.mjs';
import {createQqPage} from '../src/client/index.mjs';

const driver=process.env.SOCIAL_TEST_LAYOUT_DRIVER,runtime=process.env.SOCIAL_TEST_LAYOUT_PLAYWRIGHT,out=process.env.SOCIAL_TEST_LAYOUT_OUT;
const routes=async action=>{
 if(action==='readiness')return ok({mode:'runtime',blockers:[]});
 if(action==='status')return ok({enabled:true,connected:true,operator:{characterId:'deepseek',lifeId:'fixture-life',operationId:'fixture-operation',displayName:'DeepSeek'},settings:{enabled:true,connectionRef:'fixture-qq',accountId:'10001',contacts:[],groups:[],proactiveContacts:false,updatePolicy:'manual'},startup:{autoResume:false},checkedAt:Date.now()});
 if(action==='choices.get')return ok({characters:[{id:'deepseek',label:'DeepSeek'}],connections:[{ref:'fixture-qq',accountId:'10001',label:'Fixture QQ'}]});
 if(action==='history.list')return ok({conversations:[],messages:[],outbox:[]});
 return refuse('UNEXPECTED_'+action);
};

test('QQ More menu opens the disconnect confirmation and Cancel leaves the connection unchanged',async t=>{
 const page=mountPage(t,createQqPage,routes);await page.settle();await page.click('更多');await page.click('断开连接…');
 assert.equal(page.all(n=>n.props.role==='dialog').length,1);await page.click('取消');
 assert.equal(page.all(n=>n.props.role==='dialog').length,0);assert.equal(page.count('disconnect'),0);await page.click('更多');
 assert.equal(page.all(n=>n.props.role==='menuitem').length,2);
});

