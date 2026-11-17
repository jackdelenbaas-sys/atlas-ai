import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {clearWalkingLane,resizeScreen,presentationSize} from '../atlas-presentation.mjs';
import {normalizeStudioCommands,parseStudioRequest} from '../atlas-studio-controls.mjs';
const bounds={minX:-3.71,maxX:3.71,minZ:-3.72,maxZ:1.93};
test('walk toward the larger clear side, including when Atlas stands at either wall',()=>{
 for(const x of [-2.8,0,2.8]){
  const target=clearWalkingLane({x,z:0},[{x:x+.3,z:0,y:1.2,width:1.8,height:1.3}],{x:1,z:0},bounds);
  assert.ok(target);assert.ok(target.x>=bounds.minX&&target.x<=bounds.maxX);
  assert.ok(Math.abs(target.x-(x+.3))>1.8/2+.62);
  if(x<0)assert.ok(target.x>x);else assert.ok(target.x<x);
 }
});
test('all visible screens participate in clearance, not only the selected one',()=>{
 const screens=[{x:.3,z:0,y:1.2,width:1.6,height:1.3},{x:-2,z:0,y:1.2,width:1,height:1}];
 const target=clearWalkingLane({x:0,z:0},screens,{x:1,z:0},bounds);assert.ok(target.x>0);
 for(const s of screens)assert.ok(Math.abs(target.x-s.x)>s.width/2+.62);
 assert.equal(clearWalkingLane({x:0,z:0},[{x:0,z:0,y:1,width:20,height:2}],{x:1,z:0},bounds),null);
});
test('no walk is scheduled for hidden, high or already clear screens',()=>{
 for(const s of [{x:3,z:0,y:1,width:1,height:1},{x:0,z:0,y:3,width:2,height:1},{x:0,z:0,y:1,width:2,height:1,visible:false}])
  assert.equal(clearWalkingLane({x:0,z:0},[s],{x:1,z:0},bounds),null);
});
test('clearance follows the current orbit, never assumes a front camera',()=>{
 for(let i=0;i<120;i++){
  const angle=i*Math.PI/60,right={x:Math.cos(angle),z:Math.sin(angle)},avatar={x:Math.sin(i)*2,z:-.8};
  const screen={x:avatar.x+.1*right.x,z:avatar.z+.1*right.z,y:1.2,width:1.5,height:1.2};
  const target=clearWalkingLane(avatar,[screen],right,bounds);
  if(!target)continue;
  assert.ok(target.x>=bounds.minX-1e-8&&target.x<=bounds.maxX+1e-8);
  assert.ok(target.z>=bounds.minZ-1e-8&&target.z<=bounds.maxZ+1e-8);
  assert.ok(Math.abs((target.x-screen.x)*right.x+(target.z-screen.z)*right.z)>screen.width/2+.62);
 }
});
test('every corner preserves aspect ratio and the opposite anchor',()=>{
 for(const x of [-1,1])for(const y of [-1,1]){
  const s=resizeScreen(1.5,1,x*.6,y*.4,{x,y});
  assert.ok(s.width>1.5);assert.ok(Math.abs(s.width/s.height-1.5)<1e-10);
  assert.ok(Math.abs(s.offsetX-x*s.width/2-(-x*1.5/2))<1e-10);
  assert.ok(Math.abs(s.offsetY-y*s.height/2-(-y/2))<1e-10);
 }
 for(const delta of [-100,100]){const s=resizeScreen(1.5,1,delta,-delta);assert.ok(s.width>=.6&&s.width<=4);assert.ok(s.height>=.4&&s.height<=2.8)}
});
test('AI can create, select and close bounded screen IDs',()=>{
 assert.deepEqual(normalizeStudioCommands([{type:'screen',id:'screen-2',action:'remove'},{type:'screen',id:'https://bad',action:'eval'}]),[{type:'screen',id:'screen-2',action:'remove'}]);
 assert.deepEqual(parseStudioRequest('add another screen'),[{type:'screen',action:'add'}]);
 assert.deepEqual(parseStudioRequest('close the screen'),[{type:'screen',action:'remove'}]);
});
function screenHarness(){
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const start=html.indexOf('const studioScreens=new Map()'),end=html.indexOf('let studioTargetX=0',start);
 assert.ok(start>0&&end>start);
 class V{constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z})}set(x,y,z){Object.assign(this,{x,y,z});return this}copy(v){return this.set(v.x,v.y,v.z)}clone(){return new V(this.x,this.y,this.z)}setFromMatrixColumn(){return this.set(1,0,0)}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z}normalize(){return this}dot(v){return this.x*v.x+this.y*v.y+this.z*v.z}applyQuaternion(){return this}applyMatrix4(){return this}distanceTo(){return 0}lerp(v){return this.copy(v)}}
 class Q{setFromEuler(){return this}clone(){return new Q()}invert(){return this}}
 class Obj{constructor(geometry,material){this.geometry=geometry;this.material=material;this.position=new V();this.scale=new V(1,1,1);this.rotation={y:0};this.quaternion=new Q();this.children=[];this.userData={};this.visible=true}add(o){this.children.push(o)}remove(o){this.children=this.children.filter(x=>x!==o)}updateMatrixWorld(){}}
 class Material{dispose(){this.disposed=true}}
 class Texture extends Material{constructor(image){super();this.image=image}}
 class Geometry{}
 const ctx={fillRect(){},fillText(){},drawImage(){}},elements=new Map();
 const element=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',replaceChildren(){},append(){}});return elements.get(id)};
 const listeners=new Map(),images=[];
 const window={addEventListener(name,fn){listeners.set(name,fn)},dispatchEvent(e){listeners.get(e.type)?.(e);return true}};
 class CE{constructor(type,options={}){this.type=type;this.detail=options.detail}}
 const context={console,Map,Image:class{constructor(){this.width=1600;this.height=900;this.naturalWidth=1600;this.naturalHeight=900;images.push(this)}decode(){return new Promise(resolve=>this.resolve=resolve)}},
  THREE:{Group:Obj,Mesh:Obj,BoxGeometry:Geometry,PlaneGeometry:Geometry,MeshBasicMaterial:Material,CanvasTexture:Texture,Vector3:V,Vector2:V,Quaternion:Q,Euler:Geometry,Plane:Geometry,Raycaster:Geometry,Box3:class{setFromPoints(){this.min={x:-2,y:0,z:0};this.max={x:2,y:2,z:0};return this}},MathUtils:{clamp:(x,a,b)=>Math.max(a,Math.min(b,x))}},
  document:{createElement(type){return type==='canvas'?{getContext:()=>ctx}:{} }},window,CustomEvent:CE,$:element,studio:new Obj(),mat:()=>new Material(),model:null,camera:{matrixWorld:{},position:new V(0,1,4),quaternion:new Q(),aspect:1.5,fov:35},
  canvas:{addEventListener(){},style:{}},performance:{now:()=>100},ROOM_LIMITS:bounds,clearWalkingLane,resizeScreen,presentationSize,presentationFit:()=>({x:0,y:1,z:0,distance:4}),
  yaw:0,pitch:0,center:new V(),distance:4,auto:false,sliders(){},updateCam(){},orientScreen(){},emitStudioState(){},setTimeout(){},phonePointers:new Map(),drag:false,travelPlan:null,presentationCameraTween:null,studioObjects:{visible:true},spotlight:{},rim:{}
 };
 const api=vm.runInNewContext(html.slice(start,end)+
 ';({makeStudioScreen,selectStudioScreen,removeStudioScreen,presentStudioImage,setScreenVisibility,drawPresentation,all:()=>[...studioScreens.values()],active:()=>activeScreen})',context);
 return {api,images,window};
}
test('four screens have independent canvases and visibility',()=>{
 const {api}=screenHarness();for(let i=0;i<3;i++)api.makeStudioScreen();assert.equal(api.makeStudioScreen(),null);
 const screens=api.all();assert.equal(screens.length,4);assert.equal(new Set(screens.map(s=>s.surface)).size,4);
 api.setScreenVisibility(true,screens[0]);api.setScreenVisibility(true,screens[1]);api.setScreenVisibility(false,screens[0]);
 assert.equal(screens[0].root.visible,false);assert.equal(screens[1].root.visible,true);
});
test('late image decode cannot resurrect a hidden or closed screen',async()=>{
 const {api,images}=screenHarness();const first=api.active(),pending=api.presentStudioImage('data:image/jpeg;base64,AAAA',false,first);
 api.setScreenVisibility(false,first);images[0].resolve();await pending;assert.equal(first.root.visible,false);
 const second=api.makeStudioScreen(),p=api.presentStudioImage('data:image/jpeg;base64,AAAA',false,second);
 api.removeStudioScreen(second);images[1].resolve();await p;assert.equal(api.all().includes(second),false);assert.equal(second.root.visible,false);
});
test('pending images remain attached to their original screen after selection changes',async()=>{
 const {api,images}=screenHarness(),first=api.active(),p=api.presentStudioImage('data:image/jpeg;base64,AAAA',false,first);
 const second=api.makeStudioScreen();images[0].resolve();await p;
 assert.equal(first.root.visible,true);assert.equal(second.root.visible,false);assert.equal(api.active(),second);
});
test('slideshow aspect changes keep the chosen display envelope without cumulative shrinking',()=>{
 const {api}=screenHarness(),s=api.active();api.drawPresentation({width:1600,height:900,naturalWidth:1600,naturalHeight:900},s);
 const envelope={...s.envelope};
 for(let i=0;i<20;i++)api.drawPresentation(i%2?{width:1600,height:900,naturalWidth:1600,naturalHeight:900}:{width:900,height:1600,naturalWidth:900,naturalHeight:1600},s);
 assert.equal(s.envelope.width,envelope.width);assert.equal(s.envelope.height,envelope.height);
 assert.ok(Math.abs(s.base.width*s.root.scale.x-envelope.width)<1e-9);
});
