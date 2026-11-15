import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../atlas-app-v8.js',import.meta.url),'utf8');
const start=source.indexOf('function requestedMotion('),end=source.indexOf('async function send(',start);
const ctx=vm.createContext({});vm.runInContext(source.slice(start,end),ctx);
test('image requests route to generation, picture questions route to vision chat',()=>{
 const attachments=[{type:'image/jpeg'}];
 assert.equal(ctx.modeFromText('Create an image of a castle'),'image');
 assert.equal(ctx.modeFromText('What is in this picture?',attachments),'chat');
 assert.equal(ctx.modeFromText('Describe this photo',attachments),'chat');
 assert.equal(ctx.modeFromText('Make this photo look better',attachments),'image');
 assert.equal(ctx.modeFromText('Create a polished new version of this image',attachments),'image');
 assert.equal(ctx.modeFromText('What is gravity?'),'chat');
});
test('movement commands retain explicit intent',()=>{
 assert.equal(ctx.requestedMotion('Atlas walk backwards'),'back');
 assert.equal(ctx.requestedMotion('Wave'),'wave');assert.equal(ctx.requestedMotion('Stop'),'idle');
 assert.equal(ctx.requestedMotion('Please dance'),'dance');assert.equal(ctx.requestedMotion('What is gravity?'),null);
});
test('only local image data reaches the studio image event',()=>{
 const events=[];const c=vm.createContext({stopStudioSlides:()=>{},window:{dispatchEvent:e=>events.push(e)},CustomEvent:class{constructor(type,o){this.type=type;this.detail=o.detail}}});
 const fn=source.slice(source.indexOf('function studioImage('),source.indexOf('function mediaBubble('));vm.runInContext(fn,c);
 c.studioImage('https://example.com/image.jpg');c.studioImage('data:text/html;base64,AAA');assert.equal(events.length,0);
 c.studioImage('data:image/jpeg;base64,QUJDRA==');assert.equal(events.length,1);assert.equal(events[0].type,'atlas-studio-image');
});

test('follow-up edits target an existing image and questions remain chat',()=>{
 for(const text of ['Make it green','Change the truck to a Cybertruck','Remove the background','Make the house green','Edit this image: sharpen it'])assert.equal(ctx.isImageEdit(text),true,text);
 for(const text of ['What color is it?','Explain the image','Create a new image of a cat','How can I make it green?'])assert.equal(ctx.isImageEdit(text),false,text);
});
test('response sequences match images, greetings and empathy and reject unsafe actions',()=>{
 assert.equal(ctx.responseActions('Create an image','Done',null,'image').join(','),'point,nod,idle');
 assert.equal(ctx.responseActions('hello','Hi',null,'chat').join(','),'greet,nod,idle');
 assert.equal(ctx.responseActions('I am worried','',null,'chat').join(','),'nod,idle');
 assert.equal(ctx.responseActions('Explain','', ['walk','dance','point'],'chat').join(','),'point,idle');
});
const local=new Map();let saved=[];const replies=[];
const memoryCtx=vm.createContext({Date,localStorage:{getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,v),removeItem:k=>local.delete(k)},PROFILE:'test-profile',memories:()=>saved,putMem:m=>saved=m,push:(r,t)=>replies.push(t)});
vm.runInContext(source.slice(source.indexOf('function safeMemory('),source.indexOf('function relevantHistory(')),memoryCtx);
vm.runInContext(source.slice(source.indexOf('function summarizeMemory('),source.indexOf('async function api(')),memoryCtx);
test('memory saves explicit facts, deduplicates and rejects credentials without inference',()=>{
 saved=[];memoryCtx.summarizeMemory('I prefer shorter answers. Also tell me a joke');assert.equal(saved.length,1);assert.equal(saved[0].text,'I prefer shorter answers.');
 memoryCtx.storeFact('I prefer shorter answers.');assert.equal(saved.length,1);
 assert.equal(memoryCtx.storeFact('my password is secret'),false);assert.equal(saved.length,1);
 memoryCtx.remember('remember that my favorite color is green');assert.equal(saved.length,2);
 memoryCtx.memoryRequest('forget favorite color');assert.equal(saved.length,1);
});
test('personality adapts sass and persists familiarity locally',()=>{
 local.clear();assert.equal(memoryCtx.developPersonality('hello').turns,1);
 assert.equal(memoryCtx.developPersonality('less sarcasm please').sass,'gentle');
 assert.equal(memoryCtx.developPersonality('more sass please').sass,'extra');assert.equal(memoryCtx.profile().turns,3);
});
test('relevant memories are selected within a small prompt budget',()=>{
 saved=Array.from({length:80},(_,i)=>({text:'My preference '+i+' '+('a'.repeat(150))}));saved[0]={text:'My favorite color is green'};
 const chosen=memoryCtx.selectedMemories('favorite color');assert.equal(chosen[0],'My favorite color is green');assert.ok(chosen.length<=8);assert.ok(chosen.join('').length<=1100);
});
test('answer formatting renders emphasis and lists without raw markdown or HTML execution',()=>{
 class Node{constructor(tag='text',text=''){this.tag=tag;this.textContent=text;this.children=[]}append(...children){this.children.push(...children)}}
 const c=vm.createContext({document:{createElement:t=>new Node(t),createTextNode:t=>new Node('text',t)}});
 vm.runInContext(source.slice(source.indexOf('function linkify('),source.indexOf('let studioState=')),c);
 const root=new Node('div');c.formatAnswer(root,'## Quick answer\n**Bold** text\n\n* First\n* Second\n<script>alert(1)</script>');
 const flatten=n=>n.textContent+n.children.map(flatten).join('');const result=flatten(root);
 assert.ok(!result.includes('**'));assert.ok(!result.includes('##'));assert.ok(result.includes('<script>alert(1)</script>'));
 assert.equal(root.children.find(x=>x.tag==='ul').children.length,2);assert.ok(root.children.some(x=>x.children.some(y=>y.tag==='strong')));
});

test('animation metadata never leaks into visible answers',()=>{
 const c=vm.createContext({extractStudioCommands:t=>({text:t.replace(/<atlas_studio>[\s\S]*?<\/atlas_studio>/g,'')})});vm.runInContext(source.slice(source.indexOf('function cleanReply('),source.indexOf('function actionReply(')),c);
 assert.equal(c.cleanReply('Hello. <atlas_actions>greet,nod,idle</atlas_actions>').text,'Hello.');
 assert.equal(c.cleanReply('Ready to help. think, idle.').text,'Ready to help.');
 assert.equal(c.cleanReply('Ready. <atlas_actions>think,idle').text,'Ready.');
 assert.equal(c.cleanReply('I think, therefore I am.').text,'I think, therefore I am.');
});
test('dance picker varies routines, avoids immediate repeats and preserves fallbacks',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8'),c=vm.createContext({});
 vm.runInContext(html.slice(html.indexOf('function danceChoices('),html.indexOf('const clipFor=')),c);
 const choices=['Hip Hop','Silly','Flair','Breakdance'];const a=c.danceChoices(choices,'Silly',()=>0);const b=c.danceChoices(choices,'Silly',()=>.99);
 assert.equal(a.length,4);assert.notEqual(a[0],'Silly');assert.equal(a.at(-1),'Silly');assert.notEqual(a.join(),b.join());assert.equal(new Set(a).size,4);
});
test('reply paints before action and newer commands cancel pending motion',async()=>{
 const events=[],frames=[],timers=[];const c=vm.createContext({pendingAction:0,requestAnimationFrame:f=>frames.push(f),setTimeout:f=>timers.push(f)});
 vm.runInContext(source.slice(source.indexOf('async function afterReply('),source.indexOf('function performMotion(')),c);
 const first=c.afterReply(()=>events.push('old'));frames.shift()();frames.shift()();await Promise.resolve();assert.equal(events.length,0);
 const second=c.afterReply(()=>events.push('new'));frames.shift()();frames.shift()();await Promise.resolve();
 timers.shift()();timers.shift()();await Promise.all([first,second]);assert.equal(events.join(),'new');
});
test('web image finding is separate from generation and editing',()=>{
 assert.equal(ctx.modeFromText('Show me a cow'),'web-images');
 assert.equal(ctx.modeFromText('Find multiple photos of cows from the web'),'web-images');
 assert.equal(ctx.modeFromText('Create an image of a cow'),'image');
 assert.equal(ctx.modeFromText('make a cow'),'image');
 assert.equal(ctx.modeFromText('What is in this image?',[{type:'image/jpeg'}]),'chat');
});
test('slideshow rotates, caches photos and only reframes the camera once',async()=>{
 const events=[];let tick,calls=0;
 const c=vm.createContext({Image:class{async decode(){}},Map,CustomEvent:class{constructor(type,o){this.type=type;this.detail=o.detail}},window:{dispatchEvent:e=>events.push(e),addEventListener:()=>{}},document:{hidden:false},$:()=>null,api:async()=>{calls++;return {image:'data:image/jpeg;base64,QUJDRA==' }},setStatus:()=>{},setInterval:f=>{tick=f;return 1},clearInterval:()=>{}});
 vm.runInContext(source.slice(source.indexOf('let studioState='),source.indexOf('function studioImage(')),c);
 await c.startStudioSlideshow([{url:'https://upload.wikimedia.org/a.jpg'},{url:'https://thumb.wikimedia.org/b.jpg'}]);await new Promise(setImmediate);
 tick();await new Promise(setImmediate);
 assert.equal(events.length,2);assert.equal(events[0].detail.reframe,true);assert.equal(events[1].detail.reframe,false);
 tick();await new Promise(setImmediate);assert.equal(calls,2);
 c.stopStudioSlides();tick();await Promise.resolve();assert.equal(events.length,3);
});

test('photo replies start presenting automatically without a second request',async()=>{
 const shown=[];const c=vm.createContext({studioImage:x=>shown.push(x),startStudioSlideshow:async x=>shown.push(x)});
 vm.runInContext(source.slice(source.indexOf('async function presentReplyMedia('),source.indexOf('function openImageEditor(')),c);
 const photos=[{url:'https://upload.wikimedia.org/house.jpg'}];await c.presentReplyMedia({webImages:photos});assert.equal(shown[0],photos);
 assert.match(source,/void presentReplyMedia\(m\)/);
});
test('slideshow skips failed downloads and keeps rotating successful photos',async()=>{
 const events=[];let tick;
 const c=vm.createContext({Image:class{async decode(){}},Map,Set,CustomEvent:class{constructor(type,o){this.type=type;this.detail=o.detail}},window:{dispatchEvent:e=>events.push(e),addEventListener:()=>{}},document:{hidden:false},$:()=>null,api:async(p,{url})=>{if(url.includes('broken'))throw Error('blocked');return {image:'data:image/jpeg;base64,QUJDRA=='}},setStatus:()=>{},setInterval:f=>{tick=f;return 1},clearInterval:()=>{}});
 vm.runInContext(source.slice(source.indexOf('let studioState='),source.indexOf('function studioImage(')),c);
 await c.startStudioSlideshow([{url:'https://upload.wikimedia.org/broken.jpg'},{url:'https://upload.wikimedia.org/house.jpg'},{url:'https://upload.wikimedia.org/villa.jpg'}]);
 assert.equal(events.length,1);assert.equal(events[0].detail.reframe,true);tick();await new Promise(setImmediate);assert.equal(events.length,2);assert.equal(events[1].detail.reframe,false);
});
test('browser photo download avoids the authenticated proxy when CORS succeeds',async()=>{
 let requests=0;const c=vm.createContext({Image:class{async decode(){}},fetch:async()=>({ok:true,blob:async()=>({type:'image/jpeg',size:123})}),AbortSignal:{timeout:()=>null},imageData:async()=> 'data:image/jpeg;base64,QUJDRA==',api:()=>{requests++;throw Error('No proxy needed')}});
 vm.runInContext(source.slice(source.indexOf('async function decodeStudioPhoto('),source.indexOf('async function startStudioSlideshow(')),c);
 assert.match(await c.loadStudioPhoto({url:'https://upload.wikimedia.org/house.jpg'}),/^data:image/);assert.equal(requests,0);
});
test('undecodable photo bytes are rejected before a blank frame can replace the screen',async()=>{
 const c=vm.createContext({Image:class{async decode(){throw Error('Invalid image bytes')}},api:async()=>({image:'data:image/jpeg;base64,QkFE'})});
 vm.runInContext(source.slice(source.indexOf('async function decodeStudioPhoto('),source.indexOf('async function startStudioSlideshow(')),c);
 await assert.rejects(()=>c.loadStudioPhoto({url:'https://upload.wikimedia.org/bad.jpg'}),/Invalid image bytes/);
});
