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
