// Fit all content above the composer, for both narrow phones and wide desktops.
export function presentationFit(bounds,aspect,fov=35){
 const width=Math.max(.1,bounds.max.x-bounds.min.x),height=Math.max(.1,bounds.max.y-bounds.min.y),depth=Math.max(0,bounds.max.z-bounds.min.z);
 const tan=Math.tan(fov*Math.PI/360),ratio=Math.max(.2,aspect);
 return {x:(bounds.min.x+bounds.max.x)/2,y:(bounds.min.y+bounds.max.y)/2-height*.10,z:(bounds.min.z+bounds.max.z)/2,distance:Math.max(height/(2*tan*.63),width/(2*tan*ratio*.86))+depth/2+.15};
}
export function presentationSize(aspect){const a=Math.max(.2,Math.min(5,aspect));const height=Math.min(1.55,1.85/a);return {width:height*a,height}}
