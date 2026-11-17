import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {AtlasHistory} from '../atlas-history.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.ATLAS_TEST_PLAYWRIGHT||'playwright');
const root=new URL('../',import.meta.url),load=p=>readFileSync(new URL(p,root),'utf8');
const source=load('cloudflare-worker/index.js').replace("'../atlas-history.mjs'",JSON.stringify('data:text/javascript;base64,'+Buffer.from(load('atlas-history.mjs')).toString('base64'))).replace("'../atlas-studio-controls.mjs'",JSON.stringify('data:text/javascript;base64,'+Buffer.from(load('atlas-studio-controls.mjs')).toString('base64')));
const worker=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
class Storage{constructor(){this.map=new Map();this.tail=Promise.resolve()}async get(k){return this.map.get(k)}async put(k,v){this.map.set(k,structuredClone(v))}async delete(k){this.map.delete(k)}transaction(fn){const run=this.tail.then(()=>fn(this));this.tail=run.catch(()=>{});return run}}
const token='local-browser-test-token-with-no-production-access',object=new AtlasHistory({storage:new Storage()},{ATLAS_ACCESS_TOKEN:token});
const env={ATLAS_ACCESS_TOKEN:token,HISTORY:{idFromName:n=>n,get:()=>object},AI:{run:async()=>({response:'Hello from Atlas.'})}};
const html=load('index.html').replace(/<script type="module">[\s\S]*?<\/script>/g,''); // Layout/sync test; WebGL rendering has separate geometry tests.
const errors=[];const browser=await chromium.launch({headless:true});
async function device(options,connected=false){
 const context=await browser.newContext(options);if(connected)await context.addInitScript(t=>localStorage.setItem('atlas-access-token',t),token);
 await context.route('**/*',async route=>{
  const r=route.request(),u=new URL(r.url());
  if(u.hostname==='atlas-ai.jack-d-elenbaas.workers.dev'){
   const response=await worker.fetch(new Request(r.url(),{method:r.method(),headers:r.headers(),body:r.postData()||undefined}),env);return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
  }
  if(u.hostname==='jackdelenbaas-sys.github.io'){
   const name=u.pathname.split('/').at(-1)||'index.html';if(name==='index.html')return route.fulfill({contentType:'text/html',body:html});
   if(['atlas-app-v8.js','atlas-history.mjs','atlas-studio-controls.mjs'].includes(name))return route.fulfill({contentType:'text/javascript',body:load(name)});
  }
  return route.abort();
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));return {page,context};
}
const origin='https://jackdelenbaas-sys.github.io/atlas-ai/';
try{
 const desktop=await device({viewport:{width:1365,height:900}},true),d=desktop.page;
 await d.goto(origin);await d.waitForFunction(()=>document.querySelector('#atlasSyncStatus').textContent.includes('Synced'));
 await d.locator('#input').fill('Hello desktop');await d.locator('#send').click();await d.locator('#feed').getByText('Hello from Atlas.',{exact:true}).waitFor();
 await d.waitForFunction(()=>document.querySelector('#atlasSyncStatus').textContent.includes('Synced'));await d.locator('#settingsBtn').click();await d.locator('#atlasPairDevice').click();await d.waitForFunction(()=>document.querySelector('#atlasPairLink').value.includes('#pair='));const link=await d.locator('#atlasPairLink').inputValue();
 const phone=await device({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1}),p=phone.page;
 await p.goto(link);await p.locator('#feed').getByText('Hello desktop',{exact:true}).waitFor();assert.equal(new URL(p.url()).hash,'');assert.equal(await p.evaluate(()=>localStorage.getItem('atlas-access-token')),token);
 let left=await p.locator('#app > .left').boundingBox(),right=await p.locator('#app > .right').boundingBox();assert.ok(right.y>=left.y+left.height-2);assert.ok(right.height>200);
 await p.locator('#input').fill('Hello phone');assert.equal(await p.locator('#app > .left').isVisible(),true);await p.locator('#send').click();await p.locator('#feed').getByText('Hello phone',{exact:true}).waitFor();await p.waitForFunction(()=>!document.querySelector('#send').disabled);
 await p.setViewportSize({width:844,height:390});await p.waitForFunction(()=>{const a=document.querySelector('#app>.left').getBoundingClientRect(),b=document.querySelector('#app>.right').getBoundingClientRect();return b.x>=a.right-2&&Math.abs(a.top-b.top)<2});
 left=await p.locator('#app > .left').boundingBox();right=await p.locator('#app > .right').boundingBox();assert.ok(left.height>300&&right.height>300);
 const composer=await p.locator('.inputglass').boundingBox();assert.ok(composer.y>=0&&composer.y+composer.height<=391);
 await p.waitForFunction(()=>document.querySelector('#atlasSyncStatus').textContent.includes('Synced'));await d.bringToFront();await d.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await d.locator('#feed').getByText('Hello phone',{exact:true}).waitFor();
 await d.locator('#settings [data-close]').click();await d.locator('#historyBtn').click();d.once('dialog',dialog=>dialog.accept('Renamed on desktop'));await d.locator('.atlas-history-row').first().getByTitle('Rename conversation').click();
 await d.waitForFunction(()=>document.querySelector('#atlasSyncStatus').textContent.includes('Synced'));await p.bringToFront();await p.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await p.waitForFunction(()=>document.querySelector('#threads').textContent.includes('Renamed on desktop'));
 await p.locator('#historyBtn').click();p.once('dialog',dialog=>dialog.accept());await p.locator('.atlas-history-row').first().getByTitle('Delete conversation').click();
 await p.waitForFunction(()=>document.querySelector('#atlasSyncStatus').textContent.includes('Synced'));await d.bringToFront();await d.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await d.waitForFunction(()=>!document.querySelector('#threads').textContent.includes('Renamed on desktop'));
 const routing=await device({viewport:{width:1365,height:900}},true),rp=routing.page,wrongRequests=[];
 rp.on('request',r=>{if(/\/atlas\/api\/(?:chat|web-images)$/.test(new URL(r.url()).pathname))wrongRequests.push(r.url())});
 await rp.goto(origin);await rp.waitForFunction(()=>document.querySelector('#atlasSyncStatus').textContent.includes('Synced'));
 await rp.evaluate(()=>{
  const state={available:true,activeScreenId:'screen-1',screens:[1,2,3].map(n=>({id:'screen-'+n,visible:true,x:n-2,y:1.3,z:-.5,width:1.5,height:1})),avatar:{x:0,z:0,rotation:0},camera:{yaw:0,pitch:0,distance:5}};
  window.recordedStudioCommands=[];
  window.addEventListener('atlas-studio-state-request',()=>window.dispatchEvent(new CustomEvent('atlas-studio-state',{detail:state})));
  window.addEventListener('atlas-studio-control',e=>{
   const c=e.detail.command;window.recordedStudioCommands.push(c);
   if(c.type==='avatar'){state.avatar.x=c.x??state.screens.find(s=>s.id===c.targetScreen)?.x??state.avatar.x;state.avatar.z=c.z??.15;}
   window.dispatchEvent(new CustomEvent('atlas-studio-result',{detail:{requestId:e.detail.requestId,ok:true,effect:c.type==='camera'?{cameraChanged:true}:{moved:true}}}));
  });
 });
 await rp.locator('#input').fill('go to all the screens');await rp.locator('#send').click();
 await rp.waitForFunction(()=>window.recordedStudioCommands.length===6);
 const tour=await rp.evaluate(()=>window.recordedStudioCommands);assert.equal(tour.filter(c=>c.type==='avatar').length,3);assert.equal(tour.filter(c=>c.type==='camera'&&c.preset==='presentation').length,3);
 await rp.locator('#input').fill('what did you just do');await rp.locator('#send').click();
 await rp.locator('#feed').getByText(/What actually completed:/).waitFor();assert.equal(wrongRequests.length,0);
 await rp.locator('#input').fill('reposition the camera');await rp.locator('#send').click();await rp.waitForFunction(()=>window.recordedStudioCommands.length===7);
 assert.equal((await rp.evaluate(()=>window.recordedStudioCommands.at(-1))).preset,'fit');
 await rp.locator('#input').fill('move Atlas left');await rp.locator('#send').click();await rp.waitForFunction(()=>window.recordedStudioCommands.length===8);
 assert.equal((await rp.evaluate(()=>window.recordedStudioCommands.at(-1))).type,'avatar');assert.equal(wrongRequests.length,0);
 let held,routeReady;const routed=new Promise(resolve=>routeReady=resolve);
 await rp.route('**/atlas/api/chat',route=>{held=route;routeReady()});
 await rp.locator('#input').fill('Hello, a slow reply please');await rp.locator('#send').click();
 await rp.waitForFunction(()=>document.querySelector('#send').disabled);
 await routed;await rp.locator('#input').fill('stop pacing');await rp.locator('#send').click();
 await rp.waitForFunction(()=>window.recordedStudioCommands.at(-1)?.type==='stop');
 await rp.locator('#feed').getByText('Stopped. I’ll stay here until you tell me to move.',{exact:true}).waitFor();
 assert.ok(held);await held.fulfill({status:200,contentType:'application/json',body:JSON.stringify({text:'Slow reply completed.',images:[],sources:[]})});
 assert.deepEqual(errors,[]);console.log(JSON.stringify({portrait:true,landscape:true,composerInViewport:true,pairing:true,persistedConnection:true,bidirectionalHistory:true,renameSync:true,deleteSync:true,studioRouting:true,orderedTour:true,cameraCommands:true,receiptRecap:true,noAccidentalSearches:true,pageErrors:0}));
 await routing.context.close();
 await desktop.context.close();await phone.context.close();
}finally{await browser.close()}

