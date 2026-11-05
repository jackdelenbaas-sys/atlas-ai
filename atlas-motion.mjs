// All distances are metres, time is seconds. Shared by the scene and CPU tests.
export const ROOM_BOUNDS=Object.freeze({minX:-4.33,maxX:4.33,minZ:-4.34,maxZ:2.55});
export const BODY_RADIUS=.62;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function clampPoint(x,z,radius=BODY_RADIUS){
 return {x:clamp(Number.isFinite(x)?x:0,ROOM_BOUNDS.minX+radius,ROOM_BOUNDS.maxX-radius),
 z:clamp(Number.isFinite(z)?z:0,ROOM_BOUNDS.minZ+radius,ROOM_BOUNDS.maxZ-radius)};
}
export function stepTravel(state,x,z,yaw,dt){
 dt=clamp(dt,0,.05);
 const dx=state.toX-x,dz=state.toZ-z,remaining=Math.hypot(dx,dz);
 if(remaining<.012)return {x:state.toX,z:state.toZ,yaw,speed:0,done:true};
 const heading=Math.atan2(dx,dz)+(state.backward?Math.PI:0);
 const angle=Math.atan2(Math.sin(heading-yaw),Math.cos(heading-yaw));
 const turn=clamp(angle,-2.8*dt,2.8*dt);
 yaw+=turn;
 // Turn on the spot before advancing; brake using v²=2ad near the destination.
 const desired=Math.min(state.speed,Math.sqrt(2*1.8*remaining))*Math.max(0,Math.cos(angle));
 const speed=Math.max(0,(state.velocity||0)+clamp(desired-(state.velocity||0),-2.4*dt,1.4*dt));
 const step=Math.min(remaining,speed*dt);
 const point=clampPoint(x+dx/remaining*step,z+dz/remaining*step);
 return {...point,yaw,speed,done:remaining-step<.012};
}
export function stepGravity(height,velocity,minimum,dt){
 dt=clamp(dt,0,.05);
 velocity-=9.81*dt;
 height+=velocity*dt;
 if(height<minimum)return {height:minimum,velocity:Math.max(0,velocity),grounded:true};
 return {height,velocity,grounded:false};
}
