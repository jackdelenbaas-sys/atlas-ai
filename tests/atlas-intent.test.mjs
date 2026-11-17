import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseStudioRequest,explicitPhotoSearch,photoSearchFollowup,photoSubject,studioRecallReply,studioRecallRequest,normalizeStudioCommands} from '../atlas-studio-controls.mjs';
import {normalizeHistory,mergeHistory} from '../atlas-history.mjs';
const state={available:true,activeScreenId:'screen-2',screens:[{id:'screen-1',visible:true},{id:'screen-2',visible:true},{id:'screen-3',visible:true}],camera:{yaw:0,distance:6},avatar:{x:0,z:0,rotation:0}};
const failed=[{role:'user',text:'find photos of Cybertrucks'},{role:'atlas',text:"I couldn’t find a matching picture. Try the specific name or model."}];
test('the screenshot movement instruction wins over stale photo-search context',()=>{
 const commands=parseStudioRequest('go to all the screens',state);
 assert.equal(commands.length,6);
 assert.deepEqual(commands.filter(c=>c.type==='avatar').map(c=>c.targetScreen),['screen-1','screen-2','screen-3']);
 assert.ok(commands.filter(c=>c.type==='avatar').every(c=>c.placement==='front'));
 assert.ok(commands.filter(c=>c.type==='camera').every(c=>c.preset==='presentation'&&c.screenId));
 for(const q of ['go to all the screens','what did you just do','move Atlas left','reposition the camera','show me all the screens','come back here']){
  assert.equal(explicitPhotoSearch(q),false,q);assert.equal(photoSearchFollowup(q,failed),false,q);
 }
});
test('commands distinguish moving the screen, moving Atlas and moving the camera',()=>{
 assert.deepEqual(parseStudioRequest('move Atlas left',state),[{type:'avatar',x:-1,z:0,motion:'walk'}]);
 assert.deepEqual(parseStudioRequest('move the screen left',state),[{type:'screen',x:-1.4}]);
 assert.deepEqual(parseStudioRequest('reposition the camera',state),[{type:'camera',preset:'fit'}]);
 assert.deepEqual(parseStudioRequest('show me all the screens',state),[{type:'camera',preset:'fit'}]);
 assert.equal(parseStudioRequest('look at me',state)[0].face,'viewer');
 assert.ok(parseStudioRequest('zoom out',state)[0].distance>state.camera.distance);
 const combo=parseStudioRequest('wave then go to every screen then come back here',state);
 assert.equal(combo[0].motion,'wave');assert.ok(combo.some(c=>c.targetScreen==='screen-3'));assert.equal(combo.at(-1).preset,'body');
});
test('photo placement words never become subject requirements across unrelated subjects',()=>{
 for(const [q,subject] of [['put pictures of cybertruck in each','cybertruck'],['find photos of red pandas on all the screens','red pandas'],['show pictures of snowy mountains in Japan on screen 2','snowy mountains in Japan'],['find photos of cats in each then point to each','cats']]){
  assert.equal(explicitPhotoSearch(q),true,q);assert.equal(photoSubject(q),subject,q);
 }
 assert.equal(photoSearchFollowup('Tesla Cybertruck',failed),true);
 assert.equal(photoSearchFollowup('make an image of a dragon',failed),false);
});
test('recaps report only recorded outcomes and explain blocked or failed movement',()=>{
 assert.equal(studioRecallRequest('what did you just do'),true);
 assert.match(studioRecallReply([]),/haven't completed/i);
 assert.match(studioRecallReply([{status:'completed',summary:'Reached screen 2.'},{status:'completed',summary:'Repositioned the camera.'}]),/Reached screen 2.*Repositioned the camera/);
 assert.match(studioRecallReply([{status:'skipped',reason:'No clear walking route'}]),/did not finish.*No clear walking route/);
 assert.match(studioRecallReply([{status:'running',summary:'Visit 3 screens'}]),/still carrying out/);
});
test('action receipts remain bounded and merge across devices',()=>{
 const doc={threads:[{id:'a',msgs:[{id:'m',role:'atlas',text:'Moving.',updatedAt:1,studioResults:[{id:'one',status:'completed',summary:'Reached screen 1.',at:1},{status:'invented',summary:'bad'}]}]}]};
 const clean=normalizeHistory(doc);assert.equal(clean.threads[0].msgs[0].studioResults.length,1);
 const next=structuredClone(doc);next.threads[0].msgs[0].studioResults=[{id:'two',status:'completed',summary:'Repositioned the camera.',at:2}];
 const merged=mergeHistory(doc,next);assert.deepEqual(merged.threads[0].msgs[0].studioResults.map(x=>x.id),['one','two']);
});
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const code=read('../cloudflare-worker/index.js').replace("'../atlas-history.mjs'",JSON.stringify('data:text/javascript;base64,'+Buffer.from(read('../atlas-history.mjs')).toString('base64'))).replace("'../atlas-studio-controls.mjs'",JSON.stringify('data:text/javascript;base64,'+Buffer.from(read('../atlas-studio-controls.mjs')).toString('base64')));
const worker=(await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))).default;
const token='disposable-intent-test-token-more-than-24-characters';
const request=(path,body)=>new Request('https://test/atlas/api/'+path,{method:'POST',headers:{Authorization:'Bearer '+token},body:JSON.stringify(body)});
test('backend independently protects movement and recaps even when an older client picks photo search',async()=>{
 const original=globalThis.fetch;globalThis.fetch=()=>assert.fail('No web request should happen');
 const env={ATLAS_ACCESS_TOKEN:token,AI:{run:()=>assert.fail('No model should be needed')}};
 try{
  for(const path of ['chat','web-images']){
   const result=await worker.fetch(request(path,{text:'go to all the screens',studioState:state}),env),j=await result.json();
   assert.equal(result.status,200);assert.equal(j.studio.filter(c=>c.type==='avatar').length,3);assert.equal(j.webImages,undefined);
   const recap=await worker.fetch(request(path,{text:'what did you just do',studioState:{...state,recentActions:[{status:'completed',summary:'Reached screen 3.'}]}}),env);
   assert.match((await recap.json()).text,/Reached screen 3/);
  }
 }finally{globalThis.fetch=original}
});
test('photo refinement cannot replace the requested subject with a random cricket image',async()=>{
 const original=globalThis.fetch;let queries=[];
 globalThis.fetch=async url=>{
  const u=new URL(url),q=u.searchParams.get('gsrsearch')||'';queries.push(q);
  const pages=q.includes('cricket')?[{title:'File:Cricket game.jpg',imageinfo:[{mime:'image/jpeg',thumburl:'https://upload.wikimedia.org/cricket.jpg'}]}]:[];
  return Response.json({query:{pages}});
 };
 try{
  const result=await worker.fetch(request('web-images',{text:'put pictures of cybertruck in each'}),{ATLAS_ACCESS_TOKEN:token,AI:{run:async()=>({response:'["cricket"]'})}}),j=await result.json();
  assert.equal(j.webImages.length,0);assert.ok(queries.some(q=>/cybertruck/i.test(q)));assert.ok(!queries.some(q=>/\beach\b/.test(q)));
 }finally{globalThis.fetch=original}
});
test('missing studio metadata triggers one bounded command repair instead of a false action claim',async()=>{
 const original=globalThis.fetch;globalThis.fetch=()=>assert.fail('Studio planning must not search');
 let calls=0;const env={ATLAS_ACCESS_TOKEN:token,AI:{run:async()=>{
  calls++;return {response:calls===1?"I moved Atlas dramatically.":'[{"type":"avatar","motion":"walk","x":1,"z":0}]'};
 }}};
 try{
  const result=await worker.fetch(request('chat',{text:'reposition Atlas dramatically',studioState:state}),env),j=await result.json();
  assert.equal(calls,2);assert.equal(j.studio[0].motion,'walk');assert.ok(!/I moved Atlas dramatically/.test(j.text));
 }finally{globalThis.fetch=original}
});
