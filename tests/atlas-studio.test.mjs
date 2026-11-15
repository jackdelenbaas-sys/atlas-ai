import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,writeFileSync} from 'node:fs';
import {normalizeStudioCommands,parseStudioRequest,extractStudioCommands} from '../atlas-studio-controls.mjs';
test('screen removal handles the reported request and does not require AI',()=>{assert.deepEqual(parseStudioRequest('can you remove the picture of the cow on the scree'),[{type:'screen',visible:false,clear:true}])});
test('camera and screen geometry use bounded commands',()=>{assert.deepEqual(normalizeStudioCommands([{type:'screen',width:999,x:-999,url:'https://evil.test'},{type:'camera',distance:NaN,pitch:100},{type:'exec',code:'bad'}]),[{type:'screen',x:-2.6,width:4},{type:'camera',pitch:70}]);assert.equal(parseStudioRequest('zoom in',{camera:{distance:4}})[0].distance,3);assert.equal(parseStudioRequest('make the screen bigger',{screen:{width:2,height:1}})[0].width,2.6)});
test('model metadata is separate from displayed text and malformed data is discarded',()=>{assert.deepEqual(extractStudioCommands('Moving it. <atlas_studio>[{"type":"screen","x":1}]</atlas_studio>'),{text:'Moving it.',studio:[{type:'screen',x:1}]});assert.deepEqual(extractStudioCommands('Okay <atlas_studio>bad</atlas_studio>'),{text:'Okay',studio:[]})});
test('new conversation clears presentation and restores avatar even during pending actions',async()=>{
 const source=readFileSync(new URL('../index.html',import.meta.url),'utf8');let listener;const events=[];
 const context=vm.createContext({normalizeStudioCommands,window:{addEventListener:(n,f)=>{if(n==='atlas-studio-control')listener=f},dispatchEvent:e=>events.push(e)},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail}},Object,Math,Error});
 vm.runInContext(`let presentationVersion=1,studioControlVersion=0,chatActionVersion=0,travelRequest=0,showRun={},travelPlan={},gesture='walk',speechActive=true,speechMouthLevel=1;const sc={fillRect(){}};const screenTex={};const screenRoot={visible:true,scale:{set(){}}};let screenBillboard=false;const screenPos={};const model={position:{x:2,z:1},rotation:{y:2}};function showScreen(v){screenRoot.visible=v}function applyScreenPosition(){}function playMixamo(){}function centerAtlasView(){}function emitStudioState(){};`,context);
 vm.runInContext(source.slice(source.indexOf('function clearStudioScreen()'),source.indexOf('async function installGLB')),context);
 await listener({detail:{requestId:'reset',command:{type:'reset'}}});
 assert.equal(events.at(-1).detail.ok,true);assert.equal(vm.runInContext('screenRoot.visible',context),false);assert.equal(vm.runInContext('presentationVersion',context),2);assert.equal(vm.runInContext('model.position.x',context),0);assert.equal(vm.runInContext('travelPlan',context),null);
});
test('put them on the screen starts photos rather than revealing an empty panel',()=>{assert.deepEqual(parseStudioRequest('put them on the screen',{photos:{count:6}}),[{type:'photos',action:'show'}]);assert.deepEqual(parseStudioRequest('show the screen',{photos:{count:6}}),[{type:'photos',action:'show'}])});
test('decoded slideshow frames draw on the studio texture and become visible',async()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8'),drawn=[];
 const c=vm.createContext({Image:class{async decode(){}},drawPresentation:i=>drawn.push(i.src),showScreen:v=>drawn.push(v),screenPos:{},applyScreenPosition(){},center:{set(){}},mobileCanvas:()=>false,sliders(){},updateCam(){},$:()=>({}),window:{dispatchEvent(){}},CustomEvent:class{}});
 vm.runInContext('let presentationVersion=0,screenContent={},yaw=0,pitch=0,distance=0;',c);
 vm.runInContext(html.slice(html.indexOf('async function presentStudioImage('),html.indexOf("window.addEventListener('atlas-studio-image'")),c);
 await c.presentStudioImage('data:image/jpeg;base64,QUJDRA==',true);await c.presentStudioImage('data:image/jpeg;base64,QUJDRA==',false);
 assert.deepEqual(drawn,['data:image/jpeg;base64,QUJDRA==',true,'data:image/jpeg;base64,QUJDRA==',true]);
 assert.equal(vm.runInContext('screenContent.kind',c),'image');
});
