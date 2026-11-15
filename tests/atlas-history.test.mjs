import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mergeHistory,normalizeHistory,AtlasHistory} from '../atlas-history.mjs';
const code=readFileSync(new URL('../cloudflare-worker/index.js',import.meta.url),'utf8').replace("'../atlas-history.mjs'",JSON.stringify('data:text/javascript;base64,'+Buffer.from(readFileSync(new URL('../atlas-history.mjs',import.meta.url))).toString('base64'))).replace("'../atlas-studio-controls.mjs'",JSON.stringify('data:text/javascript;base64,'+Buffer.from(readFileSync(new URL('../atlas-studio-controls.mjs',import.meta.url))).toString('base64')));
const worker=(await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))).default;
const token='private-local-test-token-at-least-32-chars';
const message=(id,text,date)=>({id,role:'user',text,createdAt:date,updatedAt:date});
const doc=msgs=>({threads:[{id:'thread-1',title:'Conversation',updatedAt:1,msgs}]});
class Storage{constructor(){this.map=new Map();this.tail=Promise.resolve()}async get(k){return this.map.get(k)}async put(k,v){this.map.set(k,structuredClone(v))}async delete(k){this.map.delete(k)}transaction(fn){const run=this.tail.then(()=>fn(this));this.tail=run.catch(()=>{});return run}}
function environment(){const obj=new AtlasHistory({storage:new Storage()},{ATLAS_ACCESS_TOKEN:token});return {ATLAS_ACCESS_TOKEN:token,HISTORY:{idFromName:n=>n,get:()=>obj}}}
const request=(path,body,auth=token)=>new Request('https://atlas.test/atlas/api/'+path,{method:body?'POST':'GET',headers:{Origin:'https://jackdelenbaas-sys.github.io',...(auth?{Authorization:'Bearer '+auth}:{})},body:body?JSON.stringify(body):undefined});
test('simultaneous phone and desktop messages merge without overwrite or duplicates',()=>{
 const a=doc([message('a','Desktop',1)]),b=doc([message('b','Phone',2)]),merged=mergeHistory(a,b);assert.deepEqual(merged.threads[0].msgs.map(m=>m.text),['Desktop','Phone']);assert.deepEqual(mergeHistory(merged,a),merged);
});
test('deletion survives an offline device replay and rename uses newest edit',()=>{
 const old=doc([message('a','Hello',1)]);assert.equal(mergeHistory({deleted:{'thread-1':10}},old).threads.length,0);
 const next=structuredClone(old);next.threads[0].title='New name';next.threads[0].updatedAt=2;assert.equal(mergeHistory(next,old).threads[0].title,'New name');
});
test('legacy IDs migrate deterministically and private browser-only fields do not sync',()=>{
 const old={threads:[{id:1700000000000,title:'Old',msgs:[{role:'user',text:'Hi',images:['secret-bytes']}]}]};const a=normalizeHistory(old),b=normalizeHistory(old);assert.deepEqual(a,b);assert.ok(a.threads[0].msgs[0].id);assert.equal(a.threads[0].msgs[0].images,undefined);
});
test('private history round-trips across devices without requiring AI credits',async()=>{
 const env=environment();const r=await worker.fetch(request('sync',doc([message('a','Desktop',1)])),env);assert.equal(r.status,200);
 await worker.fetch(request('sync',doc([message('b','Phone',2)])),env);const j=await (await worker.fetch(request('sync'),env)).json();assert.deepEqual(j.threads[0].msgs.map(m=>m.text),['Desktop','Phone']);
 assert.equal((await worker.fetch(request('sync',undefined,'wrong'),env)).status,401);
});
test('pairing links are authenticated to create and can be claimed only once',async()=>{
 const env=environment(),pair='a'.repeat(64);assert.equal((await worker.fetch(request('pair',{code:pair},'wrong'),env)).status,401);
 assert.equal((await worker.fetch(request('pair',{code:pair}),env)).status,200);
 const first=await worker.fetch(request('pair/claim',{code:pair},''),env);assert.equal(first.status,200);assert.equal((await first.json()).token,token);
 assert.equal((await worker.fetch(request('pair/claim',{code:pair},''),env)).status,410);
 assert.equal((await worker.fetch(request('pair/claim',{code:'b'.repeat(64)},''),env)).status,410);
});
test('expired pairing links cannot release a token',async()=>{
 const storage=new Storage(),object=new AtlasHistory({storage},{ATLAS_ACCESS_TOKEN:token});await object.fetch(new Request('https://history.internal/pair',{method:'POST',body:JSON.stringify({hash:'expired',expiresAt:1})}));const r=await object.fetch(new Request('https://history.internal/claim',{method:'POST',body:JSON.stringify({hash:'expired'})}));assert.equal(r.status,410);assert.ok(!(await r.text()).includes(token));
});
test('image history stores and retrieves chunked media on another device',async()=>{
 const env=environment(),data='data:image/png;base64,'+'QUJD'.repeat(100000),id='test-image-12345678';assert.equal((await worker.fetch(request('media/'+id,{data}),env)).status,200);const r=await worker.fetch(request('media/'+id),env);assert.equal((await r.json()).data,data);assert.equal((await worker.fetch(request('media/'+id,undefined,'bad'),env)).status,401);
});
