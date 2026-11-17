import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {normalizeStudioCommands,parseStudioRequest,presentationTargets,MAX_STUDIO_STEPS} from '../atlas-studio-controls.mjs';
const source=fs.readFileSync(new URL('../atlas-app-v8.js',import.meta.url),'utf8');
const screens=Array.from({length:6},(_,i)=>({id:'screen-'+(i+1),visible:true}));
const state={available:true,activeScreenId:'screen-3',screens,photos:{count:6}};
test('follow-up adds count screens and fresh image subjects do not reuse old content',()=>{
 assert.deepEqual(parseStudioRequest('add 5 more',state),[{type:'screen',action:'add',count:5}]);
 assert.deepEqual(parseStudioRequest('add another',state),[{type:'screen',action:'add'}]);
 assert.deepEqual(parseStudioRequest('put pictures of cyber trucks in each',state),[]);
 assert.equal(presentationTargets('put pictures of cyber trucks in each',state).length,6);
 assert.deepEqual(presentationTargets('put it on screen 5',state),['screen-5']);
});
test('point to each produces a real ordered presentation and never a photo search command',()=>{
 const commands=parseStudioRequest('point to each',state);assert.equal(commands.length,6);
 assert.deepEqual(commands.map(c=>c.targetScreen),screens.map(s=>s.id));assert.ok(commands.every(c=>c.type==='avatar'&&c.motion==='point'));
 const chain=parseStudioRequest('wave then dance then point to screen 2',state);
 assert.deepEqual(chain.map(c=>c.motion),['wave','dance','point']);assert.equal(chain[2].targetScreen,'screen-2');
 assert.equal(parseStudioRequest('stand in front of screen 2',state)[0].placement,'front');
});
test('nested AI sequences are bounded, validated and retain target IDs and waits',()=>{
 const commands=normalizeStudioCommands([{type:'sequence',steps:[{type:'avatar',motion:'wave',duration:999},{type:'wait',duration:999},{type:'photos',action:'fill',screenIds:['screen-2','screen-2','https://evil.test']},{type:'avatar',targetScreen:'screen-2',placement:'front',motion:'point'}]}]);
 assert.equal(commands.length,4);assert.equal(commands[0].duration,10);assert.equal(commands[1].duration,8);assert.deepEqual(commands[2].screenIds,['screen-2']);
 assert.equal(normalizeStudioCommands(Array.from({length:100},()=>({type:'wait',duration:1}))).length,MAX_STUDIO_STEPS);
});
function queueHarness(){
 const calls=[],pending=[],data={active:'one'};
 const context=vm.createContext({normalizeStudioCommands,data,window:{dispatchEvent(){}},CustomEvent:class{},sceneCommand:c=>{calls.push(c.motion||c.type);return new Promise(resolve=>pending.push(resolve))}});
 vm.runInContext('let studioRunVersion=0,mediaRunVersion=0;',context);
 const start=source.indexOf('async function applyStudioCommands('),end=source.indexOf('function resetConversationScene',start);
 vm.runInContext(source.slice(start,end),context);return {context,calls,pending,data};
}
test('sequence waits for every movement result before starting the next action',async()=>{
 const {context,calls,pending}=queueHarness(),run=context.applyStudioCommands([{type:'avatar',motion:'wave'},{type:'avatar',motion:'dance'},{type:'avatar',motion:'point'}]);
 assert.deepEqual(calls,['wave']);pending.shift()({ok:true});await new Promise(setImmediate);
 assert.deepEqual(calls,['wave','dance']);pending.shift()({ok:true});await new Promise(setImmediate);
 assert.deepEqual(calls,['wave','dance','point']);pending.shift()({ok:true});await run;
});
test('a new conversation or canceled run stops the remaining sequence steps',async()=>{
 for(const cancel of ['data.active="two"','studioRunVersion++']){
  const {context,calls,pending}=queueHarness(),run=context.applyStudioCommands([{type:'avatar',motion:'wave'},{type:'avatar',motion:'dance'}]);
  vm.runInContext(cancel,context);pending.shift()({ok:true});await run;assert.deepEqual(calls,['wave']);
 }
});
test('failed movement stops the queue instead of pretending later steps worked',async()=>{
 const {context,calls,pending}=queueHarness(),run=context.applyStudioCommands([{type:'avatar',motion:'walk'},{type:'avatar',motion:'point'}]);
 pending.shift()({ok:false,error:'No safe movement'});await assert.rejects(run,/No safe movement/);assert.deepEqual(calls,['walk']);
});
function mediaHarness(){
 const events=[],data={active:'one'},current={screens:[...screens],activeScreenId:'screen-3'},downloads=[];
 const context=vm.createContext({Map,Promise,Set,Array,Boolean,Error,mediaRunVersion:0,screenMediaVersion:new Map(),data,presentationTargets,stopStudioSlides(){},currentStudioState:()=>current,active:()=>({msgs:[]}),setStatus(){},loadStudioPhoto:async item=>{downloads.push(item.url);return 'data:image/jpeg;base64,AAAA'},window:{dispatchEvent(e){if(e.type==='atlas-presentation-start'&&!e.detail.screenId)e.detail.screenId=current.activeScreenId;if(e.type==='atlas-studio-image'){events.push(e.detail);e.detail.promise=Promise.resolve(true)}}},CustomEvent:class{constructor(type,{detail}){this.type=type;this.detail=detail}}});
 vm.runInContext(source.slice(source.indexOf('function latestStudioMedia('),source.indexOf('function openImageEditor')),context);
 return {context,events,current,data,downloads};
}
test('fill each screen routes independent photos to every real target, including more than three',async()=>{
 const {context,events,downloads}=mediaHarness();
 const count=await context.fillStudioScreens({webImages:[{url:'https://upload.wikimedia.org/one',title:'One'},{url:'https://upload.wikimedia.org/two',title:'Two'}]},screens.map(s=>s.id));
 assert.equal(count,6);assert.deepEqual(new Set(events.map(e=>e.screenId)),new Set(screens.map(s=>s.id)));assert.equal(downloads.length,2);
 for(const e of events)assert.equal(e.reframe,false);
});
test('upload/generated images can fill every screen without a network request',async()=>{
 const {context,events,downloads}=mediaHarness();await context.fillStudioScreens({images:['data:image/jpeg;base64,AAAA','data:image/png;base64,BBBB']},screens.map(s=>s.id));
 assert.equal(events.length,6);assert.equal(downloads.length,0);assert.equal(new Set(events.map(e=>e.src)).size,2);
});
test('changing selection during photo download cannot redirect the photo to another screen',async()=>{
 const {context,events,current}=mediaHarness();let finish;
 context.loadStudioPhoto=()=>new Promise(resolve=>finish=resolve);
 const run=context.fillStudioScreens({webImages:[{url:'one'}]},['screen-2']);current.activeScreenId='screen-6';finish('data:image/jpeg;base64,AAAA');await run;
 assert.equal(events.length,1);assert.equal(events[0].screenId,'screen-2');
});
test('a closed target or changed conversation is skipped after a late download',async()=>{
 for(const close of [true,false]){
  const {context,events,current,data}=mediaHarness();let finish;context.loadStudioPhoto=()=>new Promise(resolve=>finish=resolve);
  const run=context.fillStudioScreens({webImages:[{url:'one'}]},['screen-2']);
  if(close)current.screens=current.screens.filter(s=>s.id!=='screen-2');else data.active='two';
  finish('data:image/jpeg;base64,AAAA');await run;assert.equal(events.length,0);
 }
});

test('switching a screen off during a fill cannot reopen it after its download finishes',async()=>{
 const {context,events}=mediaHarness();let finish;context.loadStudioPhoto=()=>new Promise(resolve=>finish=resolve);
 const run=context.fillStudioScreens({webImages:[{url:'one'}]},['screen-2']);context.screenMediaVersion.set('screen-2',1);
 finish('data:image/jpeg;base64,AAAA');await run;assert.equal(events.length,0);
});
test('a failed picture falls back to another result while still filling all target screens',async()=>{
 const {context,events}=mediaHarness();context.loadStudioPhoto=async item=>{if(item.url==='broken')throw Error('unavailable');return 'data:image/jpeg;base64,AAAA'};
 const success=await context.fillStudioScreens({webImages:[{url:'broken'},{url:'working'}]},['screen-1','screen-2','screen-3']);
 assert.equal(success,3);assert.equal(events.length,3);
});
