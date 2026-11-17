// Fit all content above the composer, for both narrow phones and wide desktops.
export function presentationFit(bounds,aspect,fov=35){
 const width=Math.max(.1,bounds.max.x-bounds.min.x),height=Math.max(.1,bounds.max.y-bounds.min.y),depth=Math.max(0,bounds.max.z-bounds.min.z);
 const tan=Math.tan(fov*Math.PI/360),ratio=Math.max(.2,aspect);
 return {x:(bounds.min.x+bounds.max.x)/2,y:(bounds.min.y+bounds.max.y)/2-height*.10,z:(bounds.min.z+bounds.max.z)/2,distance:Math.max(height/(2*tan*.63),width/(2*tan*ratio*.86))+depth/2+.15};
}
export function presentationSize(aspect){const a=Math.max(.2,Math.min(5,aspect));const height=Math.min(1.55,1.85/a);return {width:height*a,height}}

export function facingCameraYaw(yaw,position,camera,dt){const target=Math.atan2(camera.x-position.x,camera.z-position.z);const delta=Math.atan2(Math.sin(target-yaw),Math.cos(target-yaw));return yaw+delta*(1-Math.exp(-Math.max(0,dt)*6))}

// Choose a clear horizontal lane in the current viewing direction, inside the room.
// Return null when the room cannot fit the body beside all screens.
export function clearWalkingLane(avatar,screens,right,bounds,radius=.62){
 const length=Math.hypot(right.x,right.z)||1,rx=right.x/length,rz=right.z/length;
 let lo=-Infinity,hi=Infinity;
 for(const [p,v,min,max] of [[avatar.x,rx,bounds.minX,bounds.maxX],[avatar.z,rz,bounds.minZ,bounds.maxZ]]){
  if(Math.abs(v)<1e-7)continue;
  const a=(min-p)/v,b=(max-p)/v;lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));
 }
 const origin=avatar.x*rx+avatar.z*rz;
 const blocked=screens.filter(s=>s.visible!==false&&s.y-s.height/2<1.95&&s.y+s.height/2>.05)
  .map(s=>({lo:s.x*rx+s.z*rz-origin-s.width/2-radius,hi:s.x*rx+s.z*rz-origin+s.width/2+radius}));
 if(!blocked.some(s=>s.lo<.08&&s.hi>-.08))return null;
 let free=[{lo,hi}];
 for(const b of blocked){free=free.flatMap(f=>b.hi<=f.lo||b.lo>=f.hi?[f]:[{lo:f.lo,hi:Math.min(f.hi,b.lo)},{lo:Math.max(f.lo,b.hi),hi:f.hi}].filter(v=>v.hi-v.lo>.12))}
 const candidates=free.map(f=>{const t=Math.max(f.lo+.06,Math.min(f.hi-.06,0));return {t,space:f.hi-f.lo}})
  .filter(c=>Math.abs(c.t)>.04).sort((a,b)=>b.space-a.space||Math.abs(a.t)-Math.abs(b.t));
 if(!candidates.length)return null;const c=candidates[0];
 return {x:avatar.x+rx*c.t,z:avatar.z+rz*c.t,space:c.space};
}
export function resizeScreen(width,height,dx,dy,corner={x:1,y:-1}){
 // Keep the full photo ratio and anchor the opposite corner.
 const ratio=width/height;
 const change=(dx*corner.x+dy*corner.y/ratio)/(1+1/(ratio*ratio));
 const nextWidth=Math.max(Math.max(.6,.4*ratio),Math.min(Math.min(4,2.8*ratio),width+change));
 const nextHeight=nextWidth/ratio;
 return {width:nextWidth,height:nextHeight,offsetX:corner.x*(nextWidth-width)/2,offsetY:corner.y*(nextHeight-height)/2};
}
