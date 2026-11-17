import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {clearWalkingLane,resizeScreen,presentationSize} from '../../atlas-presentation.mjs';
export function screenHarness(){
 const bounds={minX:-3.71,maxX:3.71,minZ:-3.72,maxZ:1.93};
 const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
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
 return {api,images,window,context};
}
