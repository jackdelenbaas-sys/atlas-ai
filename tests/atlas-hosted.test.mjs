import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare-worker/index.js';

const url='https://atlas.test.workers.dev/atlas/api/status';
const token='test-token-0123456789012345678901234567';
const env={OPENAI_API_KEY:'placeholder-api-key',ATLAS_ACCESS_TOKEN:token};
const origin='https://jackdelenbaas-sys.github.io';

test('requires configured private secrets',async()=>{
 const res=await worker.fetch(new Request(url,{headers:{Origin:origin}}),{},{});
 assert.equal(res.status,503);
 const body=await res.json();
 assert.equal(body.code,'MISSING_RUNTIME_SECRETS');
 assert.deepEqual(body.missing,['OPENAI_API_KEY','ATLAS_ACCESS_TOKEN']);
});
test('rejects calls without owner token',async()=>{
 const res=await worker.fetch(new Request(url,{headers:{Origin:origin}}),env,{});
 assert.equal(res.status,401);
});
test('rejects unapproved browser origins',async()=>{
 const res=await worker.fetch(new Request(url,{headers:{Origin:'https://evil.example',Authorization:'Bearer '+token}}),env,{});
 assert.equal(res.status,403);
});
test('authorizes a valid owner session without revealing API key',async()=>{
 const res=await worker.fetch(new Request(url,{headers:{Origin:origin,Authorization:'Bearer '+token}}),env,{});
 const obj=await res.json();
 assert.equal(res.status,200);
 assert.equal(obj.bridge,'atlas-hosted-v1');
 assert.equal(res.headers.get('Access-Control-Allow-Origin'),origin);
 assert.equal(JSON.stringify(obj).includes(env.OPENAI_API_KEY),false);
});
test('preflight allows only the Atlas website',async()=>{
 const res=await worker.fetch(new Request(url,{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'}}),env,{});
 assert.equal(res.status,204);
 assert.ok(res.headers.get('Access-Control-Allow-Headers').includes('Authorization'));
});

const headers={Origin:origin,Authorization:'Bearer '+token,'Content-Type':'application/json'};
const reply=(text='READY',model='gpt-5.6-terra')=>({model,status:'completed',output:[{type:'message',content:[{type:'output_text',text}]}]});
async function withOpenAI(mock,run){const previous=globalThis.fetch;globalThis.fetch=mock;try{await run()}finally{globalThis.fetch=previous}}
test('diagnoses the selected model with enough room for visible text',async()=>{
 await withOpenAI(async(_,options)=>{
  const p=JSON.parse(options.body);assert.equal(p.model,'gpt-5.6-sol');
  assert.equal(p.reasoning.effort,'none');assert.ok(p.max_output_tokens>=1024);
  return Response.json(reply('READY','gpt-5.6-sol'));
 },async()=>{
  const res=await worker.fetch(new Request(url.replace('/status','/diagnose?model=gpt-5.6-sol'),{headers}),env);
  assert.equal(res.status,200);assert.equal((await res.json()).model,'gpt-5.6-sol');
 });
});
test('model access fallback is limited to unavailable models and reports actual model',async()=>{
 let calls=0;
 await withOpenAI(async(_,options)=>{
  const p=JSON.parse(options.body);calls++;
  if(calls===1)return Response.json({error:{code:'model_not_found',message:'Unavailable model'}},{status:404});
  assert.equal(p.model,'gpt-5.6-sol');return Response.json(reply('Hello','gpt-5.6-sol'));
 },async()=>{
  const res=await worker.fetch(new Request(url.replace('/status','/chat'),{method:'POST',headers,body:JSON.stringify({text:'Hello'})}),env);
  const body=await res.json();assert.equal(res.status,200);assert.equal(body.text,'Hello');assert.equal(body.model,'gpt-5.6-sol');assert.equal(calls,2);
 });
});
test('quota failure is reported once and never leaks a secret echoed by upstream',async()=>{
 let calls=0;
 await withOpenAI(async()=>{calls++;return Response.json({error:{code:'insufficient_quota',message:'Quota for '+env.OPENAI_API_KEY}},{status:429})},async()=>{
  const res=await worker.fetch(new Request(url.replace('/status','/diagnose'),{headers}),env);
  const body=await res.json();assert.equal(res.status,429);assert.equal(body.code,'OPENAI_QUOTA_EXHAUSTED');assert.ok(!JSON.stringify(body).includes(env.OPENAI_API_KEY));assert.equal(calls,1);
 });
});
test('an invalid OpenAI key is distinguished from an invalid Atlas token',async()=>{
 await withOpenAI(async()=>Response.json({error:{message:'Incorrect API key'}},{status:401}),async()=>{
  const res=await worker.fetch(new Request(url.replace('/status','/diagnose'),{headers}),env);
  assert.equal(res.status,502);assert.equal((await res.json()).code,'OPENAI_KEY_INVALID');
 });
});
test('reasoning-only incomplete responses never become a false success',async()=>{
 await withOpenAI(async()=>Response.json({status:'incomplete',incomplete_details:{reason:'max_output_tokens'},output:[{type:'reasoning'}]}),async()=>{
  const res=await worker.fetch(new Request(url.replace('/status','/chat'),{method:'POST',headers,body:'{"text":"hello"}'}),env);
  assert.equal(res.status,502);assert.equal((await res.json()).code,'OUTPUT_LIMIT');
 });
});
test('chat keeps history, uses bounded reasoning and extracts sources',async()=>{
 await withOpenAI(async(_,options)=>{
  const p=JSON.parse(options.body);assert.equal(p.input[0].role,'assistant');assert.equal(p.input.at(-1).role,'user');assert.equal(p.reasoning.effort,'low');assert.ok(p.max_output_tokens>=4096);
  const data=reply('See source');data.output[0].content[0].annotations=[{type:'url_citation',url:'https://example.org',title:'Source'}];return Response.json(data);
 },async()=>{
  const res=await worker.fetch(new Request(url.replace('/status','/chat'),{method:'POST',headers,body:JSON.stringify({text:'Continue',history:[{role:'assistant',text:'Earlier answer'}]})}),env);
  const body=await res.json();assert.equal(res.status,200);assert.equal(body.sources[0].url,'https://example.org');
 });
});
test('bad request JSON is a client error',async()=>{
 const res=await worker.fetch(new Request(url.replace('/status','/chat'),{method:'POST',headers,body:'{'}),env);
 assert.equal(res.status,400);assert.equal((await res.json()).code,'INVALID_JSON');
});
