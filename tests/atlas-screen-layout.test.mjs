import test from 'node:test';
import assert from 'node:assert/strict';
import {screenHarness} from './helpers/studio-screen-harness.mjs';
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
