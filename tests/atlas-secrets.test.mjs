import test from 'node:test';
import assert from 'node:assert/strict';
import {seedRuntimeSecrets} from '../cloudflare-worker/sync-runtime-secrets.mjs';
const env={WORKERS_CI:'1',WORKERS_CI_BRANCH:'main',OPENAI_API_KEY:'test-key',ATLAS_ACCESS_TOKEN:'test-token-0123456789012345678901234567'};
test('never migrates secrets outside a production Cloudflare build',()=>{
 for(const e of [{...env,WORKERS_CI:''},{...env,WORKERS_CI_BRANCH:'feature'},{}]){
  assert.equal(seedRuntimeSecrets(e,()=>assert.fail('must not run')).state,'skipped');
 }
});
test('never overwrites configured runtime secrets',()=>{
 const result=seedRuntimeSecrets(env,args=>{assert.equal(args[1],'list');return {status:0,stdout:JSON.stringify([{name:'OPENAI_API_KEY'},{name:'ATLAS_ACCESS_TOKEN'}])}});
 assert.equal(result.state,'already-configured');
});
test('passes only missing secrets over stdin and reports names only',()=>{
 let calls=0;
 const result=seedRuntimeSecrets(env,(args,input)=>{
  calls++;
  if(calls===1)return {status:0,stdout:'[{"name":"ATLAS_ACCESS_TOKEN"}]'};
  assert.equal(args[1],'bulk');assert.ok(!args.join(' ').includes(env.OPENAI_API_KEY));
  assert.deepEqual(JSON.parse(input),{OPENAI_API_KEY:'test-key'});return {status:0};
 });
 assert.equal(calls,2);assert.deepEqual(result,{state:'configured',names:['OPENAI_API_KEY']});
 assert.ok(!JSON.stringify(result).includes(env.OPENAI_API_KEY));
});
test('no available build secrets leaves runtime configuration unchanged',()=>{
 assert.equal(seedRuntimeSecrets({WORKERS_CI:'1',WORKERS_CI_BRANCH:'main'},()=>assert.fail('must not run')).state,'no-build-secrets');
});
test('list failure and invalid output do not attempt uploads',()=>{
 assert.throws(()=>seedRuntimeSecrets(env,()=>({status:1,stdout:'private upstream output'})),/Cannot check/);
 assert.throws(()=>seedRuntimeSecrets(env,()=>({status:0,stdout:'bad json'})),/no secrets were changed/);
});
