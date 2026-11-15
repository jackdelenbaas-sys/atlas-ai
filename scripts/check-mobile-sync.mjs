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
 await d.locator('#input').fill('Hello desktop');await d.locator('#send').click();await d.getByText('Hello from Atlas.',{exact:true}).waitFor();
 await d.locator('#settingsBtn').click();await d.locator('#atlasPairDevice').click();await d.waitForFunction(()=>document.querySelector('#atlasPairLink').value.includes('#pair='));const link=await d.locator('#atlasPairLink').inputValue();
 const phone=await device({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1}),p=phone.page;
 await p.goto(link);await p.getByText('Hello desktop',{exact:true}).waitFor();assert.equal(new URL(p.url()).hash,'');assert.equal(await p.evaluate(()=>localStorage.getItem('atlas-access-token')),token);
 let left=await p.locator('#app > .left').boundingBox(),right=await p.locator('#app > .right').boundingBox();assert.ok(right.y>=left.y+left.height-2);assert.ok(right.height>200);
 await p.locator('#input').fill('Hello phone');assert.equal(await p.locator('#app > .left').isVisible(),true);await p.locator('#send').click();await p.getByText('Hello phone',{exact:true}).waitFor();await p.waitForFunction(()=>!document.querySelector('#send').disabled);
 await p.setViewportSize({width:844,height:390});await p.waitForFunction(()=>{const a=document.querySelector('#app>.left').getBoundingClientRect(),b=document.querySelector('#app>.right').getBoundingClientRect();return b.x>=a.right-2&&Math.abs(a.top-b.top)<2});
 left=await p.locator('#app > .left').boundingBox();right=await p.locator('#app > .right').boundingBox();assert.ok(left.height>300&&right.height>300);
 const composer=await p.locator('.inputglass').boundingBox();assert.ok(composer.y>=0&&composer.y+composer.height<=391);
 await p.waitForFunction(()=>document.querySelector('#atlasSyncStatus').textContent.includes('Synced'));await d.bringToFront();await d.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await d.getByText('Hello phone',{exact:true}).waitFor();
 await d.locator('#settings [data-close]').click();await d.locator('#historyBtn').click();d.once('dialog',dialog=>dialog.accept('Renamed on desktop'));await d.locator('.atlas-history-row').first().getByTitle('Rename conversation').click();
 await d.waitForFunction(()=>document.querySelector('#atlasSyncStatus').textContent.includes('Synced'));await p.bringToFront();await p.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await p.waitForFunction(()=>document.querySelector('#threads').textContent.includes('Renamed on desktop'));
 await p.locator('#historyBtn').click();p.once('dialog',dialog=>dialog.accept());await p.locator('.atlas-history-row').first().getByTitle('Delete conversation').click();
 await p.waitForFunction(()=>document.querySelector('#atlasSyncStatus').textContent.includes('Synced'));await d.bringToFront();await d.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await d.waitForFunction(()=>!document.querySelector('#threads').textContent.includes('Renamed on desktop'));
 assert.deepEqual(errors,[]);console.log(JSON.stringify({portrait:true,landscape:true,composerInViewport:true,pairing:true,persistedConnection:true,bidirectionalHistory:true,renameSync:true,deleteSync:true,pageErrors:0}));
 await desktop.context.close();await phone.context.close();
}finally{await browser.close()}
