import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {screenHarness} from './helpers/studio-screen-harness.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import {normalizeStudioCommands,parseStudioRequest,extractStudioCommands} from '../atlas-studio-controls.mjs';
test('screen removal handles the reported request and does not require AI',()=>{assert.deepEqual(parseStudioRequest('can you remove the picture of the cow on the scree'),[{type:'screen',visible:false,clear:true}])});
test('camera and screen geometry use bounded commands',()=>{assert.deepEqual(normalizeStudioCommands([{type:'screen',width:999,x:-999,url:'https://evil.test'},{type:'camera',distance:NaN,pitch:100},{type:'exec',code:'bad'}]),[{type:'screen',x:-2.6,width:4},{type:'camera',pitch:70}]);assert.equal(parseStudioRequest('zoom in',{camera:{distance:4}})[0].distance,3);assert.equal(parseStudioRequest('make the screen bigger',{screen:{width:2,height:1}})[0].width,2.6)});
test('model metadata is separate from displayed text and malformed data is discarded',()=>{assert.deepEqual(extractStudioCommands('Moving it. <atlas_studio>[{"type":"screen","x":1}]</atlas_studio>'),{text:'Moving it.',studio:[{type:'screen',x:1}]});assert.deepEqual(extractStudioCommands('Okay <atlas_studio>bad</atlas_studio>'),{text:'Okay',studio:[]})});
test('new conversation clears every presentation and restores avatar during pending actions',async()=>{
 const source=readFileSync(new URL('../index.html',import.meta.url),'utf8'),{api,images,window,context}=screenHarness();
 api.makeStudioScreen();const s=api.active(),pending=api.presentStudioImage('data:image/jpeg;base64,QUJDRA==',false,s);
 context.normalizeStudioCommands=normalizeStudioCommands;context.centerAtlasView=()=>{};context.playMixamo=()=>{};
 context.model={position:{x:2,z:1},rotation:{y:2}};const events=[];
 window.dispatchEvent=e=>events.push(e);
 vm.createContext(context);
 vm.runInContext("let chatActionVersion=0,travelRequest=0,showRun={},travelPlan={},gesture='walk',speechActive=true,speechMouthLevel=1;",context);
 let listener;const original=window.addEventListener;window.addEventListener=(name,fn)=>{if(name==='atlas-studio-control')listener=fn;else original(name,fn)};
 vm.runInContext(source.slice(source.indexOf('function clearStudioScreen('),source.indexOf('async function installGLB')),context);
 await listener({detail:{requestId:'reset',command:{type:'reset'}}});
 assert.equal(events.at(-1).detail.ok,true);images[0].resolve();await pending;
 assert.equal(api.all().length,1);assert.equal(api.active().root.visible,false);
 assert.equal(context.model.position.x,0);assert.equal(vm.runInContext('travelPlan',context),null);
});
test('put them on the screen starts photos rather than revealing an empty panel',()=>{assert.deepEqual(parseStudioRequest('put them on the screen',{photos:{count:6}}),[{type:'photos',action:'show'}]);assert.deepEqual(parseStudioRequest('show the screen',{photos:{count:6}}),[{type:'photos',action:'show'}])});
test('decoded slideshow frames update their original screen texture and become visible',async()=>{
 const {api,images}=screenHarness(),s=api.active();
 for(let i=0;i<2;i++){const p=api.presentStudioImage('data:image/jpeg;base64,QUJDRA==',false,s);images[i].resolve();await p;assert.equal(s.root.visible,true);assert.equal(s.content.kind,'image');assert.equal(s.texture.needsUpdate,true)}
});
test('screen off prevents pending decoded pictures from making a panel visible',async()=>{
 const {api,images}=screenHarness(),s=api.active();
 const p=api.presentStudioImage('data:image/jpeg;base64,QUJDRA==',false,s);
 api.setScreenVisibility(false,s);images[0].resolve();await p;
 assert.equal(s.root.visible,false);assert.equal(s.content.kind,'empty');
});
