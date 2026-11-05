import test from 'node:test';
import assert from 'node:assert/strict';
import {clampPoint,stepTravel,stepGravity,ROOM_BOUNDS,BODY_RADIUS} from '../atlas-motion.mjs';

test('room reserves clearance for the body at every wall',()=>{
 const p=clampPoint(-100,100);
 assert.equal(p.x,ROOM_BOUNDS.minX+BODY_RADIUS);
 assert.equal(p.z,ROOM_BOUNDS.maxZ-BODY_RADIUS);
 assert.deepEqual(clampPoint(NaN,Infinity),{x:0,z:0});
});
for(const hz of [20,30,60,120])test(`walk turns, accelerates and arrives without crossing room at ${hz}fps`,()=>{
 const target=clampPoint(100,-100);
 let x=0,z=0,yaw=0,maxSpeed=0,previous=0,arrived=false;
 const plan={toX:target.x,toZ:target.z,speed:1,velocity:0};
 for(let i=0;i<hz*30;i++){
  const p=stepTravel(plan,x,z,yaw,1/hz);
  assert.ok(p.x<=target.x+.00001&&p.z>=target.z-.00001);
  assert.ok(p.speed<=1.00001);
  assert.ok(p.speed-previous<=1.4/hz+.00001);
  maxSpeed=Math.max(p.speed,maxSpeed);previous=p.speed;
  x=p.x;z=p.z;yaw=p.yaw;plan.velocity=p.speed;
  if(p.done){arrived=true;break}
 }
 assert.ok(arrived);assert.ok(Math.hypot(x-target.x,z-target.z)<.02);assert.ok(maxSpeed>.9);
});
test('backward travel faces forward and does not spin around',()=>{
 const p=stepTravel({toX:0,toZ:-1,speed:1,velocity:0,backward:true},0,0,0,.05);
 assert.ok(Math.abs(Math.sin(p.yaw))<1e-8);assert.ok(p.z<0);
});
test('a destination behind Atlas requires turning before translating',()=>{
 const p=stepTravel({toX:0,toZ:-1,speed:1,velocity:0},0,0,0,.05);
 assert.equal(p.speed,0);assert.equal(p.z,0);assert.ok(Math.abs(p.yaw)<=.14+.000001);
});
test('gravity settles an elevated body onto the floor without tunnelling',()=>{
 let h=1,v=0,landed=false;
 for(let i=0;i<180;i++){
  const n=stepGravity(h,v,.006,1/60);h=n.height;v=n.velocity;
  assert.ok(h>=.006);if(n.grounded){landed=true;break}
 }
 assert.ok(landed);assert.equal(h,.006);assert.equal(v,0);
});
test('floor contact corrects an animated shoe penetration immediately',()=>{
 assert.deepEqual(stepGravity(0,0,.14,1/60),{height:.14,velocity:0,grounded:true});
});
