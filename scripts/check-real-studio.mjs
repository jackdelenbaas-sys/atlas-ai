import {createRequire} from 'node:module';
import {readFileSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.ATLAS_TEST_PLAYWRIGHT||'playwright');
const root=new URL('../',import.meta.url),load=p=>readFileSync(new URL(p,root));
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1200,height:850}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',async route=>{
 const u=new URL(route.request().url());
 if(u.hostname==='jackdelenbaas-sys.github.io'){
  const path=u.pathname.replace(/^\/atlas-ai\//,'')||'index.html';
  if(path.includes('..'))return route.abort();
  try{return route.fulfill({body:load(path),contentType:/\.(?:mjs|js)$/.test(path)?'text/javascript':path.endsWith('.json')?'application/json':'text/html'})}catch{return route.abort()}
 }
 if(u.hostname==='cdn.jsdelivr.net'&&u.pathname.startsWith('/npm/three@0.160.0/')&&process.env.ATLAS_TEST_THREE){
  const path=process.env.ATLAS_TEST_THREE+'/'+u.pathname.slice('/npm/three@0.160.0/'.length);
  return route.fulfill({body:readFileSync(path),contentType:'text/javascript'});
 }
 if(u.hostname==='atlas-motion-library.floot.app')return route.continue();
 if(u.hostname==='atlas-ai.jack-d-elenbaas.workers.dev')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ready:false,configured:false})});
 return route.abort();
});
await page.addInitScript(()=>{
 window.addEventListener('atlas-studio-state',e=>window.currentScene=e.detail);
 window.sceneResults={};
 window.addEventListener('atlas-studio-result',e=>window.sceneResults[e.detail.requestId]=e.detail);
});
const state=()=>page.evaluate(()=>{window.dispatchEvent(new CustomEvent('atlas-studio-state-request'));return window.currentScene});
let commandId=0;
async function dispatch(command,wait=true){
 const id='real-scene-'+(++commandId);
 await page.evaluate(({command,id})=>window.dispatchEvent(new CustomEvent('atlas-studio-control',{detail:{requestId:id,command}})),{command,id});
 if(!wait)return id;
 await page.waitForFunction(id=>Boolean(window.sceneResults[id]),id,{timeout:60000});
 const result=await page.evaluate(id=>window.sceneResults[id],id);assert.equal(result.ok,true,result.error);return result;
}
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=';
try{
 await page.goto('https://jackdelenbaas-sys.github.io/atlas-ai/');
 await page.waitForFunction(()=>document.querySelector('#modelStatus').textContent.includes('Atlas is online'),null,{timeout:120000});
 const initial=await state();assert.ok(initial.avatar?.skeletonReady,'The real animation skeleton must be loaded.');
 await dispatch({type:'avatar',motion:'walk',x:1.8,z:.4,travel:true},false);
 await page.waitForFunction(()=>{window.dispatchEvent(new CustomEvent('atlas-studio-state-request'));return window.currentScene?.avatar?.moving&&window.currentScene.avatar.x>.2},null,{timeout:60000});
 await page.getByRole('button',{name:'Expand studio controls'}).click();
 await page.getByRole('button',{name:'Stop',exact:true}).click();
 await page.waitForFunction(()=>{window.dispatchEvent(new CustomEvent('atlas-studio-state-request'));return window.currentScene?.avatar?.moving===false});
 await page.waitForTimeout(500);const stopped=await state();
 assert.ok(!/walk|run/i.test(stopped.avatar.motion||''),'Stop must switch away from the walking clip.');
 await dispatch({type:'screen',visible:true,x:stopped.avatar.x,y:1.25,z:stopped.avatar.z,width:2.6,height:1.4});
 await page.evaluate(src=>{window.dispatchEvent(new CustomEvent('atlas-presentation-start'));window.dispatchEvent(new CustomEvent('atlas-studio-image',{detail:{src,reframe:true,title:'No pacing test'}}))},png);
 for(let i=0;i<6;i++){
  await page.evaluate(src=>window.dispatchEvent(new CustomEvent('atlas-studio-image',{detail:{src,reframe:false,title:'Next slide'}})),png);
  await page.waitForTimeout(180);
 }
 await dispatch({type:'screen',width:3,height:1.6});
 await page.waitForTimeout(2200);
 const afterPictures=await state();
 assert.equal(afterPictures.avatar.moving,false);assert.ok(!/walk|run/i.test(afterPictures.avatar.motion||''));
 assert.ok(Math.hypot(afterPictures.avatar.x-stopped.avatar.x,afterPictures.avatar.z-stopped.avatar.z)<.05,'Screen/image changes must not translate the real avatar.');
 await dispatch({type:'avatar',motion:'point',targetScreen:afterPictures.activeScreenId,travel:false,duration:.4});
 const pointed=await state();assert.ok(Math.hypot(pointed.avatar.x-stopped.avatar.x,pointed.avatar.z-stopped.avatar.z)<.05);
 await dispatch({type:'avatar',motion:'walk',x:-1.2,z:0,travel:true});
 const walked=await state();assert.ok(Math.hypot(walked.avatar.x-pointed.avatar.x,walked.avatar.z-pointed.avatar.z)>.5,'Explicit walking must still work.');
 assert.equal(walked.avatar.moving,false);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({realWebGL:true,realHumanModel:true,realWalkingClip:true,stopSwitchesToIdle:true,noPacingAfterImages:true,noPacingAfterResize:true,pointingStaysPut:true,explicitWalkingStillWorks:true,pageErrors:0}));
}finally{await browser.close()}
