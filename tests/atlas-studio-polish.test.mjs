import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {screenHarness} from './helpers/studio-screen-harness.mjs';
import {stepTravel,smoothTurn,clampPoint} from '../atlas-motion.mjs';
import {normalizeStudioCommands,parseStudioRequest,presentationTargets,MAX_STUDIO_STEPS,shouldDeferStudioCommands,studioActionSummary} from '../atlas-studio-controls.mjs';
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
 const context=vm.createContext({normalizeStudioCommands,studioActionSummary,recordStudioResult(){},data,window:{dispatchEvent(){}},CustomEvent:class{},sceneCommand:c=>{calls.push(c.motion||c.type);return new Promise(resolve=>pending.push(resolve))}});
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

function sceneHarness({blocked=false,cancel=false}={}){
 const harness=screenHarness(),{context,api,window}=harness,results=[],motions=[];
 let now=100,canceled=false,listener,cancelListener;
 context.model={position:{x:0,z:0},rotation:{y:0}};context.normalizeStudioCommands=normalizeStudioCommands;context.clampToRoom=clampPoint;
 context.ensureAction=async()=>{};context.clipFor=()=>({duration:1});context.centerAtlasView=()=>{};
 context.playMixamo=motion=>motions.push({motion,now});context.travelRequest=0;context.chatActionVersion=0;
 context.showRun=null;context.gesture='';context.manualMotionUntil=0;context.speechActive=false;context.speechMouthLevel=0;
 context.planTravel=(x,z)=>{context.travelPlan={toX:x,toZ:z,speed:1,velocity:0,turnVelocity:0}};
 context.performance.now=()=>now;
 context.setTimeout=callback=>setImmediate(()=>{
  now+=40;
  if(cancel&&!canceled){canceled=true;cancelListener?.()}
  if(!blocked){
   const p=context.travelPlan,m=context.model;
   if(p){const next=stepTravel(p,m.position.x,m.position.z,m.rotation.y,.04);Object.assign(m.position,{x:next.x,z:next.z});m.rotation.y=next.yaw;p.velocity=next.speed;p.turnVelocity=next.turnVelocity;if(next.done)context.travelPlan=null}
   else{const target=vm.runInContext('avatarFacingTarget',context);if(target!==null){const turn=smoothTurn(m.rotation.y,target,vm.runInContext('avatarTurnVelocity',context),.04);m.rotation.y=turn.yaw;context.tickTurnVelocity=turn.velocity;vm.runInContext('avatarTurnVelocity=tickTurnVelocity',context)}}
  }
  callback();
 });
 const add=window.addEventListener;window.addEventListener=(type,fn)=>{if(type==='atlas-studio-control')listener=fn;else if(type==='atlas-studio-cancel')cancelListener=fn;else add(type,fn)};
 window.dispatchEvent=e=>{if(e.type==='atlas-studio-result')results.push(e.detail)};
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 vm.runInContext(html.slice(html.indexOf('function clearStudioScreen('),html.indexOf('async function installGLB')),context);
 api.active().root.visible=true;
 return {...harness,results,motions,run:command=>listener({detail:{requestId:'test',command}})};
}
test('the real scene command walks, turns toward the target, points, then reports completion',async()=>{
 const {run,results,motions,context,api}=sceneHarness(),s=api.active(),before={...s.pos};
 await run({type:'avatar',motion:'point',targetScreen:s.id,placement:'beside',duration:1});
 assert.equal(results.at(-1).ok,true);assert.ok(motions.some(m=>m.motion==='walk'));assert.ok(motions.some(m=>m.motion==='point'));
 assert.equal(motions.at(-1).motion,'idle');assert.ok(Math.hypot(context.model.position.x,context.model.position.z)>.1);assert.deepEqual({...s.pos},before);
 const point=motions.find(m=>m.motion==='point');assert.ok(point.now>1000);
});
test('explicit front placement is permitted without moving the picture',async()=>{
 const {run,results,api,context}=sceneHarness(),s=api.active(),before={...s.pos};
 await run({type:'avatar',motion:'walk',targetScreen:s.id,placement:'front'});
 assert.equal(results.at(-1).ok,true);assert.equal(vm.runInContext('allowAvatarOverlap',context),true);
 assert.ok(Math.abs(context.model.position.x-s.pos.x)<.02);assert.deepEqual({...s.pos},before);
});
test('a frozen movement times out safely, while cancellation stops a pending movement',async()=>{
 for(const options of [{blocked:true},{cancel:true}]){
  const {run,results,context,api}=sceneHarness(options),before={...api.active().pos};
  await run({type:'avatar',motion:'point',targetScreen:api.active().id,duration:1});
  assert.equal(results.at(-1).ok,false);assert.match(results.at(-1).error,/stopped|canceled/i);
  assert.equal(context.travelPlan,null);assert.deepEqual({...api.active().pos},before);
 }
});

test('new photo and generation tasks finish before their requested follow-up actions',()=>{
 for(const mode of ['web-images','image']){
  const text=mode==='web-images'?'find pictures of Cybertrucks in each then point to each':'create a picture of a cow then wave then point to each';
  const actions=parseStudioRequest(text,state);assert.ok(actions.length);assert.equal(shouldDeferStudioCommands(mode,text),true);assert.ok(actions.some(c=>c.motion==='point'));
 }
 assert.equal(shouldDeferStudioCommands('chat','wave then dance'),false);
 assert.equal(shouldDeferStudioCommands('web-images','show those pictures on the screen'),false);
});

test('a real tour moves Atlas to every screen and executes the camera at each stop',async()=>{
 const {run,results,api,context}=sceneHarness(),first=api.active();first.pos.x=1.5;first.root.position.x=1.5;
 const second=api.makeStudioScreen();second.root.visible=true;second.pos.x=-1.5;second.root.position.x=-1.5;
 const commands=parseStudioRequest('go to all the screens',{available:true,screens:api.all().map(s=>({id:s.id,visible:true})),activeScreenId:first.id});
 const stops=[];
 for(const command of commands){
  await run(command);assert.equal(results.at(-1).ok,true,results.at(-1).error);
  if(command.type==='avatar'){assert.equal(results.at(-1).effect.blocked,undefined);stops.push({...context.model.position})}
  else assert.equal(results.at(-1).effect.cameraChanged,true);
 }
 assert.equal(stops.length,2);assert.ok(stops[0].x>1);assert.ok(stops[1].x<-1);
});

