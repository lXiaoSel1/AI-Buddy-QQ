import test from 'node:test';
import assert from 'node:assert/strict';
import {mountPage,ok,refuse} from '../../../test/page-harness.mjs';
import {createQqPage} from '../src/client/index.mjs';

const characters=[{id:'deepseek',label:'DeepSeek'},{id:'hunyuan',label:'混元'},{id:'bad);url(file:///private)',label:'无立绘角色'}];
const state={enabled:true,connected:true,operator:{characterId:'deepseek',displayName:'DeepSeek',lifeId:'life',operationId:'operation',generation:1},settings:{enabled:true,connectionRef:'qq-ref',accountId:'10001',contacts:[],groups:[],proactiveContacts:false,updatePolicy:'manual'},startup:{autoResume:false},checkedAt:Date.now()};
const routes=async action=>action==='readiness'?ok({mode:'runtime',blockers:[]}):action==='status'?ok(state):action==='choices.get'?ok({characters,connections:[{ref:'qq-ref',accountId:'10001',label:'我的QQ'}]}):action==='history.list'?ok({conversations:[],messages:[],outbox:[]}):refuse('UNEXPECTED_'+action);

test('F1-4: the operator and character picker use full-body portrait slots with a safe CSS variable fallback',async t=>{
 const page=mountPage(t,createQqPage,routes);await page.settle();
 const status=page.all(n=>n.props['aria-label']==='接管状态')[0];
 assert.ok(page.all(n=>n.props.className==='qq-portrait status',status).length===1,'the status card has a portrait instead of its 56px face');
 assert.ok(page.all(n=>n.type==='i'&&n.props.style?.backgroundImage==='var(--buddy-portrait-deepseek,none)',status).length===1);
 await page.click('换一位角色…');
 const picker=page.all(n=>n.props.role==='group'&&n.props['aria-label']==='接管角色')[0];
 const cards=page.all(n=>n.type==='button',picker);assert.equal(cards.length,3);
 assert.ok(cards.every(n=>String(n.props.className).includes('qq-op-pick')));
 for(const [card,name] of cards.map((card,i)=>[card,characters[i].label]))assert.ok(page.textOf(card).includes(name));
 assert.equal(page.all(n=>n.type==='i'&&String(n.props.style?.backgroundImage).includes('--buddy-portrait-'),cards[2]).length,0,'unsafe ids never enter CSS');
 assert.equal(page.all(n=>n.props.className==='qq-portrait',cards[2])[0].children[0].children.join(''),'无','missing portraits keep a letter');
 const css=page.styles.find(n=>n.id==='qq-style').textContent;
 assert.match(css,/\.qq-portrait\{[^}]*height:104px/);assert.match(css,/\.qq-portrait>i\{[^}]*background-size:contain/);
 assert.match(css,/\.qq \.qq-op-picks button\.qq-op-pick\{[^}]*height:132px/);assert.match(css,/\.qq-portrait\.status\{[^}]*height:120px/);
});
