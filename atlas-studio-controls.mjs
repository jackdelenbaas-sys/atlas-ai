// Shared scene command contract. No code, network URLs or account controls are accepted.
const motions=new Set(['idle','wave','greet','point','think','nod','walk','back','dance','hiphop','sillydance','breakdance','flair']);
const presets=new Set(['head','body','studio','screen','left','right','reset']);
const number=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)?Math.max(min,Math.min(max,v)):undefined;
export function normalizeStudioCommands(input){
 const out=[];for(const raw of (Array.isArray(input)?input:[]).slice(0,8)){
  if(!raw||typeof raw!=='object')continue;const c={type:raw.type};
  const nums=raw.type==='screen'?{x:[-2.6,2.6],y:[.75,2.7],z:[-2.6,1.5],width:[.6,4],height:[.4,2.8],rotation:[-180,180]}:raw.type==='camera'?{yaw:[-360,360],pitch:[-70,70],distance:[.8,12],x:[-3,3],y:[.3,2.8],z:[-3,3]}:raw.type==='avatar'?{x:[-2.5,2.5],z:[-2,1.4],rotation:[-360,360]}:{};
  for(const [k,range] of Object.entries(nums)){const n=number(raw[k],...range);if(n!==undefined)c[k]=n}
  if(raw.type==='screen'){
   for(const k of ['visible','clear','billboard'])if(typeof raw[k]==='boolean')c[k]=raw[k];
   if(typeof raw.text==='string')c.text=raw.text.slice(0,800);
  }else if(raw.type==='camera'){if(presets.has(raw.preset))c.preset=raw.preset}
  else if(raw.type==='avatar'){if(motions.has(raw.motion))c.motion=raw.motion}
  else if(raw.type==='photos'){
   if(!['next','previous','pause','resume','show','remove'].includes(raw.action))continue;c.action=raw.action;
   const n=number(raw.index,0,5);if(n!==undefined)c.index=Math.floor(n);
   if(typeof raw.match==='string')c.match=raw.match.slice(0,80);
  }else if(raw.type==='scene'){
   for(const k of ['roomVisible','autoRotate','naturalMotion'])if(typeof raw[k]==='boolean')c[k]=raw[k];
  }else if(raw.type!=='reset'&&raw.type!=='normal')continue;
  if(Object.keys(c).length>1||c.type==='reset'||c.type==='normal')out.push(c);
 }return out;
}
export function parseStudioRequest(text,state={}){
 const q=String(text||'').trim(),lower=q.toLowerCase();const out=[];
 if(/^(?:(?:please|can you|could you)\s+)?(?:(?:go|return|back|get)\s+(?:back\s+)?(?:to\s+)?|restore\s+|reset\s+)?(?:the\s+)?(?:normal(?: view| layout| studio)?|default view|original view)[.!?]?$/i.test(q))return [{type:'normal'}];
 const screen=/\b(screen|display|presentation|scree)\b/i.test(q)||/^(?:even |a little |much )?(?:bigger|smaller|larger)[.!?]?$/i.test(q);
 const photo=/\b(photo|picture|image|slideshow|slide)s?\b/i.test(q);
 if(screen&&/\b(?:put|show|display|play|bring|turn on)\b/i.test(q)&&(/\b(?:them|those|these|photos?|pictures?|images?|slideshow)\b/i.test(q)||state.photos?.count>0))out.push({type:'photos',action:'show'});
 if(screen&&/\b(hide|remove|clear|erase|turn off|switch off|take.+off)\b/i.test(q))out.push({type:'screen',visible:false,clear:true});
 else if(screen&&!out.length&&/\b(show|turn on|switch on|bring back)\b/i.test(q)&&!photo)out.push({type:'screen',visible:true});
 if(screen&&/\b(bigger|larger|enlarge|smaller|shrink)\b/i.test(q)){
  const factor=/bigger|larger|enlarge/i.test(q)?1.3:.75;
  out.push({type:'screen',width:(state.screen?.width||1.5)*factor,height:(state.screen?.height||1.06)*factor});
 }
 if(screen&&/\b(move|put|place|shift)\b/i.test(q)){
  const pos={type:'screen'};
  if(/\bleft\b/i.test(q))pos.x=-1.4;else if(/\bright\b/i.test(q))pos.x=1.4;
  if(/\b(up|higher)\b/i.test(q))pos.y=(state.screen?.y||1.5)+.3;else if(/\b(down|lower)\b/i.test(q))pos.y=(state.screen?.y||1.5)-.3;
  if(/\b(center|middle)\b/i.test(q))pos.x=0;
  if(Object.keys(pos).length>1)out.push(pos);
 }
 if(/\b(zoom|close.?up|full.?body|camera|view|face)\b/i.test(q)&&!photo){
  if(/\b(close.?up|face|head)\b/i.test(q))out.push({type:'camera',preset:'head'});
  else if(/\b(full.?body|whole body|all of you|zoom out)\b/i.test(q))out.push({type:'camera',preset:'body'});
  else if(/\b(zoom in|closer)\b/i.test(q))out.push({type:'camera',distance:(state.camera?.distance||3.8)*.75});
  else if(/\bleft\b/i.test(q))out.push({type:'camera',preset:'left'});
  else if(/\bright\b/i.test(q))out.push({type:'camera',preset:'right'});
  else if(/\b(reset|center)\b/i.test(q))out.push({type:'camera',preset:'reset'});
 }
 if(photo&&!out.some(c=>c.clear)){
  if(/\b(next|previous|prev)\b/i.test(q))out.push({type:'photos',action:/previous|prev/i.test(q)?'previous':'next'});
  else if(/\b(pause|stop rotating|stop cycling)\b/i.test(q))out.push({type:'photos',action:'pause'});
  else if(/\b(resume|start rotating|start cycling)\b/i.test(q))out.push({type:'photos',action:'resume'});
 }
 if(/\b(room|background)\b/i.test(q)&&/\b(hide|show|turn off|turn on)\b/i.test(q))out.push({type:'scene',roomVisible:/show|turn on/i.test(q)});
 if(/^(?:please\s+)?reset (?:the )?(?:studio|scene|everything)(?:[.!])?$/i.test(q))out.push({type:'reset'});
 return normalizeStudioCommands(out);
}
export function extractStudioCommands(text){
 const raw=[];const clean=String(text||'').replace(/<atlas_studio>\s*([\s\S]*?)(?:<\/atlas_studio>|$)/gi,(_,json)=>{try{raw.push(...JSON.parse(json.replace(/^```(?:json)?\s*|\s*```$/g,'')))}catch{}return ''});
 return {text:clean.trim(),studio:normalizeStudioCommands(raw)};
}
export const STUDIO_CONTRACT='You control the 3D studio through commands, never by merely claiming an action happened. For scene changes append <atlas_studio>[JSON commands]</atlas_studio>. Up to 8 commands. Use {type:"normal"} to restore the normal layout without clearing photos. Screen adjustments automatically reframe to keep everything visible. Commands: {type:"screen",visible:boolean,clear:boolean,text:string,x:number,y:number,z:number,width:number,height:number,billboard:boolean,rotation:number}; {type:"camera",preset:"head|body|studio|screen|left|right|reset",yaw:number,pitch:number,distance:number,x:number,y:number,z:number}; {type:"avatar",motion:"idle|wave|greet|point|think|nod|walk|back|dance|hiphop|sillydance|breakdance|flair",x:number,z:number,rotation:number}; {type:"photos",action:"next|previous|pause|resume|show|remove",index:0-based number,match:string}; {type:"scene",roomVisible:boolean,autoRotate:boolean,naturalMotion:boolean}; {type:"reset"}. Include only fields needed. Screen size is in studio units; default 1.5 by 1.06. Camera angles and rotations are degrees. Avatar walking stays inside the room. For a requested change write a short intent such as "I’m clearing the screen", not a claim of successful completion. The browser executes commands and reports failures. Never invent visible pictures; use CURRENT STUDIO STATE. If state.available is false, explain that 3D controls are unavailable. Never put commands in ordinary visible prose or cite web sources for studio control requests.';
