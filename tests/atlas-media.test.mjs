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
