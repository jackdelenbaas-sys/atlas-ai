import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../cloudflare-worker/index.js',import.meta.url),'utf8');
const worker=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
const token='test-token-with-at-least-32-characters';
const base='https://atlas.test/atlas/api/';
const headers={Origin:'https://jackdelenbaas-sys.github.io',Authorization:'Bearer '+token};
const env={ATLAS_ACCESS_TOKEN:token,AI:{run:async()=>({response:'READY'})}};
const req=(path,body,extra={})=>new Request(base+path,{headers:{...headers,...extra},...(body!==undefined?{method:'POST',body:JSON.stringify(body)}:{})});
test('free AI works without an OpenAI key',async()=>{
 const r=await worker.fetch(req('diagnose'),env);assert.equal(r.status,200);
 const j=await r.json();assert.equal(j.connected,true);assert.equal(j.free,true);
});
test('status identifies free provider and no paid fallback',async()=>{
 const r=await worker.fetch(req('status'),env),j=await r.json();
 assert.equal(r.status,200);assert.equal(j.provider,'cloudflare-workers-ai');assert.equal(j.paidFallback,false);assert.equal(j.web,false);
 assert.ok(new Date(j.resetAt)>new Date());assert.equal(new Date(j.resetAt).getUTCHours(),0);
});
test('rejects wrong token before inference',async()=>{
 const r=await worker.fetch(req('chat',{text:'hello'},{Authorization:'Bearer wrong'}),{...env,AI:{run:()=>assert.fail('unauthorized inference')}});
 assert.equal(r.status,401);
});
test('rejects unapproved origin',async()=>assert.equal((await worker.fetch(req('status',undefined,{Origin:'https://other.example'}),env)).status,403));
test('preflight works without credentials',async()=>assert.equal((await worker.fetch(new Request(base+'chat',{method:'OPTIONS',headers:{Origin:headers.Origin}}),{})).status,204));
test('missing binding gives setup error without using OpenAI',async()=>{
 const r=await worker.fetch(req('chat',{text:'hello'}),{ATLAS_ACCESS_TOKEN:token,OPENAI_API_KEY:'ignored'});
 assert.equal(r.status,503);assert.equal((await r.json()).code,'MISSING_AI_BINDING');
});
test('daily exhaustion stops and gives next reset',async()=>{
 let calls=0;
 const r=await worker.fetch(req('chat',{text:'hello'}),{...env,AI:{run:async()=>{calls++;throw Error('4006 daily free allocation of 10000 neurons exhausted')}}});
 const j=await r.json();assert.equal(r.status,429);assert.equal(j.code,'DAILY_LIMIT_REACHED');assert.equal(j.paidFallback,false);assert.ok(j.resetAt);assert.equal(calls,1);
});
test('a later request can work after provider quota resets',async()=>{
 let exhausted=true;const e={...env,AI:{run:async()=>{if(exhausted)throw Error('daily free allocation exhausted');return {response:'Back online'}}}};
 assert.equal((await worker.fetch(req('chat',{text:'Hi'}),e)).status,429);exhausted=false;
 const r=await worker.fetch(req('chat',{text:'Hi'}),e);assert.equal((await r.json()).text,'Back online');
});
test('chat sends bounded history, memory and text files to fixed free model',async()=>{
 const r=await worker.fetch(req('chat',{text:'Help',model:'paid-model',history:[{role:'assistant',text:'Earlier'}],memories:['A note'],attachments:[{name:'note.txt',type:'text/plain',text:'Document'}]}),{...env,AI:{run:async(model,p)=>{
  assert.equal(model,'@cf/meta/llama-3.3-70b-instruct-fp8-fast');assert.equal(p.max_tokens,700);
  assert.ok(p.messages.some(x=>x.content==='Earlier'));assert.ok(p.messages.at(-1).content.includes('Document'));
  return {response:'Useful answer'};
 }}});
 assert.equal((await r.json()).text,'Useful answer');
});
test('unsupported attachment is rejected before inference',async()=>{
 const r=await worker.fetch(req('chat',{text:'Read',attachments:[{type:'application/pdf',data:'data:application/pdf;base64,AAA'}]}),{...env,AI:{run:()=>assert.fail('unread attachment')}});
 assert.equal(r.status,400);assert.equal((await r.json()).code,'UNSUPPORTED_ATTACHMENT');
});
test('video is disabled and no external paid services are present',async()=>{
 for(const path of ['video','video/example/content']){
  const r=await worker.fetch(req(path,{text:'Create'}),{...env,AI:{run:()=>assert.fail('media inference')}});
  assert.equal(r.status,400);assert.equal((await r.json()).code,'FREE_CHAT_ONLY');
 }
 assert.ok(!source.includes('api.openai.com'));assert.ok(!source.includes('fetch('+'\''+'https://'));
});
test('temporary capacity limit is not misreported as daily exhaustion',async()=>{
 const r=await worker.fetch(req('chat',{text:'Hi'}),{...env,AI:{run:async()=>{throw Error('service busy')}}});
 assert.equal((await r.json()).code,'TEMPORARY_LIMIT');
});
test('empty output and malformed request are handled',async()=>{
 const r=await worker.fetch(req('chat',{text:'Hi'}),{...env,AI:{run:async()=>({})}});assert.equal(r.status,502);
 const bad=await worker.fetch(new Request(base+'chat',{method:'POST',headers,body:'{'}),env);assert.equal(bad.status,400);
});
test('health reveals readiness without revealing credentials',async()=>{
 const r=await worker.fetch(new Request(base+'health'),env);const text=await r.text();
 assert.ok(!text.includes(token));assert.equal(JSON.parse(text).ready,true);
});


const image='data:image/jpeg;base64,QUJDRA==';
test('uploaded image uses vision model and exact multimodal schema',async()=>{
 const r=await worker.fetch(req('chat',{text:'What is here?',attachments:[{type:'image/jpeg',data:image}]}),{...env,AI:{run:async(model,p)=>{
 assert.equal(model,'@cf/meta/llama-4-scout-17b-16e-instruct');assert.deepEqual(p.messages.at(-1).content,[{type:'text',text:'What is here?'},{type:'image_url',image_url:{url:image}}]);return {response:'A picture'};
 }}});assert.equal(r.status,200);assert.equal((await r.json()).text,'A picture');
});
test('generation sends precise named objects in multipart format',async()=>{
 const prompt='Create a big Tesla Cybertruck ruling over the other cars';
 const r=await worker.fetch(req('image',{text:prompt}),{...env,AI:{run:async(model,p)=>{
 assert.equal(model,'@cf/black-forest-labs/flux-2-klein-4b');
 const form=await new Response(p.multipart.body,{headers:{'Content-Type':p.multipart.contentType}}).formData();
 assert.ok(form.get('prompt').includes(prompt));assert.equal(form.get('width'),'1024');assert.equal(form.get('input_image_0'),null);return {image:'QUJDRA=='};
 }}});assert.equal(r.status,200);assert.deepEqual((await r.json()).images,[image]);
});
test('edit passes original reference bytes directly to the image model',async()=>{
 let calls=0;const r=await worker.fetch(req('image',{text:'Make the house green',attachments:[{type:'image/jpeg',data:image}]}),{...env,AI:{run:async(model,p)=>{
 calls++;assert.match(model,/klein-4b/);const form=await new Response(p.multipart.body,{headers:{'Content-Type':p.multipart.contentType}}).formData();
 assert.match(form.get('prompt'),/Make the house green/);assert.match(form.get('prompt'),/Preserve/);
 assert.equal(await form.get('input_image_0').text(),'ABCD');return {image:'QUJDRA=='};
 }}});assert.equal(r.status,200);assert.equal(calls,1);const j=await r.json();assert.match(j.text,/edited image/);assert.deepEqual(j.actions,['point','nod','idle']);
});
test('remote image URL and malformed image are rejected before inference',async()=>{
 for(const data of ['https://example.com/private.jpg','data:image/svg+xml;base64,QUJDRA==']){const r=await worker.fetch(req('chat',{attachments:[{type:'image/jpeg',data}]}),{...env,AI:{run:()=>assert.fail('invalid image inference')}});assert.equal(r.status,400);assert.equal((await r.json()).code,'INVALID_IMAGE');}
});
test('image daily limit stops after one call with no fallback',async()=>{
 let calls=0;const r=await worker.fetch(req('image',{text:'A castle'}),{...env,AI:{run:async()=>{calls++;throw Error('daily free allocation exhausted')}}});assert.equal(r.status,429);assert.equal((await r.json()).code,'DAILY_LIMIT_REACHED');assert.equal(calls,1);
});
test('missing generation output is a handled failure',async()=>{const r=await worker.fetch(req('image',{text:'A castle'}),env);assert.equal(r.status,502);assert.equal((await r.json()).images,undefined)});
