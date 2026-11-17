import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {authorizeStudioCommands,movementRequested,stopRequested,photoSearchFollowup,resolvePhotoSubject,parseStudioRequest} from '../atlas-studio-controls.mjs';
const history=[{role:'user',text:'put pictures of Cybertruck in each'},{role:'atlas',text:'I couldn’t find a matching picture.'}];
test('photos, resizing, camera changes and pointing never authorize walking',()=>{
 for(const text of ['find pictures of Cybertrucks','put it on the screen','resize the screen','move the screen left','reposition the camera','point to each picture','show me a picture of Atlas','create an image of a walking dog']){
  assert.equal(movementRequested(text),false,text);
  const commands=authorizeStudioCommands([{type:'avatar',motion:'walk',x:2},{type:'avatar',motion:'point',targetScreen:'screen-1',travel:true}],text);
  assert.equal(commands.length,1);assert.equal(commands[0].motion,'point');assert.equal(commands[0].travel,false);
 }
 for(const text of ['walk to the screen','go to all the screens','move Atlas left','move to screen 2','reposition Atlas dramatically'])assert.equal(movementRequested(text),true,text);
});
test('stop and repeated stop complaints are deterministic commands, including the screenshot typo',()=>{
 for(const text of ['stop','stop pacing','stop moving','you have not stoped yety','you have not stopped yet']){
  assert.equal(stopRequested(text),true,text);assert.deepEqual(parseStudioRequest(text),[{type:'stop'}]);assert.equal(movementRequested(text),false);
 }
 assert.equal(stopRequested('no you not',[{role:'user',text:'stop pacing'}]),true);
 assert.equal(stopRequested('no you not',[]),false);
});
test('photo retries keep the named model instead of asking again or changing subjects',()=>{
 assert.equal(photoSearchFollowup('can you find them',history),true);assert.equal(resolvePhotoSubject('can you find them',history),'Cybertruck');
 assert.equal(resolvePhotoSubject('an image of the car designed by tesla',history),'Cybertruck');
 assert.equal(resolvePhotoSubject('find pictures of red pandas',history),'red pandas');
 assert.equal(photoSearchFollowup('what did you just do',history),false);
});
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const source=read('../cloudflare-worker/index.js').replace("'../atlas-history.mjs'",JSON.stringify('data:text/javascript;base64,'+Buffer.from(read('../atlas-history.mjs')).toString('base64'))).replace("'../atlas-studio-controls.mjs'",JSON.stringify('data:text/javascript;base64,'+Buffer.from(read('../atlas-studio-controls.mjs')).toString('base64')));
const worker=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
const token='local-no-pacing-test-token-32-characters';
const req=(path,body)=>new Request('https://test/atlas/api/'+path,{method:'POST',headers:{Authorization:'Bearer '+token},body:JSON.stringify(body)});
test('pronoun photo requests retrieve the remembered subject and preserve multiple-picture intent',async()=>{
 const original=globalThis.fetch,queries=[];
 globalThis.fetch=async url=>{const u=new URL(url),q=u.searchParams.get('gsrsearch')||'';queries.push(q);return Response.json({query:{pages:[1,2,3].map(n=>({title:'File:Tesla Cybertruck '+n+'.jpg',imageinfo:[{mime:'image/jpeg',thumburl:'https://upload.wikimedia.org/cybertruck'+n+'.jpg'}]}))}})};
 try{
  const env={ATLAS_ACCESS_TOKEN:token,AI:{run:()=>assert.fail('No model call needed')}};
  for(const path of ['chat','web-images']){
   const r=await worker.fetch(req(path,{text:'can you find them',history}),env),j=await r.json();
   assert.equal(r.status,200);assert.equal(j.webImages.length,3);assert.ok(j.webImages.every(i=>/Cybertruck/.test(i.title)));
  }
  assert.ok(queries.every(q=>/cybertruck/i.test(q)));assert.ok(queries.every(q=>!/\b(?:them|each)\b/.test(q)));
 }finally{globalThis.fetch=original}
});
test('vehicle searches reject dealership or service-building scenes',()=>{
 const code=read('../cloudflare-worker/index.js'),context=vm.createContext({Date,photoSubject:t=>t,searchTopic:t=>t,plain:t=>String(t||'')});
 vm.runInContext(code.slice(code.indexOf('const PHOTO_STOP='),code.indexOf('async function webImages(')),context);
 const request=context.photoRequest('Tesla cars');
 const page=title=>({title:'File:'+title,imageinfo:[{extmetadata:{Categories:{value:'Tesla cars'}}}]});
 assert.equal(context.photoMatch(request,page('Tesla service center with parked cars.jpg')),-1);
 assert.ok(context.photoMatch(request,page('Tesla car closeup.jpg'))>=0);
});

test('coreference keeps the model through several photo retries',()=>{
 const chain=[...history,{role:'user',text:'an image of the car designed by tesla'},{role:'atlas',text:'Here it is.'}];
 assert.equal(resolvePhotoSubject('can you find them',chain),'Cybertruck');
});
