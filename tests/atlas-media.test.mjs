import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../atlas-app-v8.js',import.meta.url),'utf8');
const start=source.indexOf('function requestedMotion('),end=source.indexOf('async function createVideo(',start);
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
 const events=[];const c=vm.createContext({window:{dispatchEvent:e=>events.push(e)},CustomEvent:class{constructor(type,o){this.type=type;this.detail=o.detail}}});
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
 vm.runInContext(source.slice(source.indexOf('function linkify('),source.indexOf('function studioImage(')),c);
 const root=new Node('div');c.formatAnswer(root,'## Quick answer\n**Bold** text\n\n* First\n* Second\n<script>alert(1)</script>');
 const flatten=n=>n.textContent+n.children.map(flatten).join('');const result=flatten(root);
 assert.ok(!result.includes('**'));assert.ok(!result.includes('##'));assert.ok(result.includes('<script>alert(1)</script>'));
 assert.equal(root.children.find(x=>x.tag==='ul').children.length,2);assert.ok(root.children.some(x=>x.children.some(y=>y.tag==='strong')));
});
