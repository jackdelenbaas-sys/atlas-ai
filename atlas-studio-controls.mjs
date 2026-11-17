// Shared scene command contract. No code, network URLs or account controls are accepted.
export const MAX_STUDIO_SCREENS=12;
export const MAX_STUDIO_STEPS=32;
const motions=new Set(['idle','wave','greet','point','think','nod','walk','back','dance','hiphop','sillydance','breakdance','flair']);
const presets=new Set(['head','body','studio','screen','left','right','reset']);
const number=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)?Math.max(min,Math.min(max,v)):undefined;
export function normalizeStudioCommands(input){
 const flattened=[];function collect(items,depth=0){if(depth>3||!Array.isArray(items))return;for(const item of items){if(flattened.length>=MAX_STUDIO_STEPS)break;if(item?.type==='sequence')collect(item.steps,depth+1);else flattened.push(item)}}collect(input);
 const out=[];for(const raw of flattened){
  if(!raw||typeof raw!=='object')continue;const c={type:raw.type};
  const nums=raw.type==='screen'?{x:[-2.6,2.6],y:[.75,2.7],z:[-2.6,1.5],width:[.6,4],height:[.4,2.8],rotation:[-180,180]}:raw.type==='camera'?{yaw:[-360,360],pitch:[-70,70],distance:[.8,24],x:[-3,3],y:[.3,2.8],z:[-3,3]}:raw.type==='avatar'?{x:[-2.5,2.5],z:[-2,1.4],rotation:[-360,360]}:{};
  for(const [k,range] of Object.entries(nums)){const n=number(raw[k],...range);if(n!==undefined)c[k]=n}
  if(raw.type==='screen'){
   if(['add','remove','select'].includes(raw.action))c.action=raw.action;
   if(typeof raw.id==='string'&&/^screen-\d{1,6}$/.test(raw.id))c.id=raw.id;
   const count=number(raw.count,1,MAX_STUDIO_SCREENS);if(count!==undefined)c.count=Math.floor(count);
   for(const k of ['visible','clear','billboard'])if(typeof raw[k]==='boolean')c[k]=raw[k];
   if(typeof raw.text==='string')c.text=raw.text.slice(0,800);
  }else if(raw.type==='camera'){if(presets.has(raw.preset))c.preset=raw.preset}
  else if(raw.type==='avatar'){
   if(motions.has(raw.motion))c.motion=raw.motion;
   if(typeof raw.targetScreen==='string'&&/^screen-\d{1,6}$/.test(raw.targetScreen))c.targetScreen=raw.targetScreen;
   if(['beside','front'].includes(raw.placement))c.placement=raw.placement;
   const duration=number(raw.duration,.3,10);if(duration!==undefined)c.duration=duration;
  }
  else if(raw.type==='photos'){
   if(!['next','previous','pause','resume','show','fill','remove'].includes(raw.action))continue;c.action=raw.action;
   if(Array.isArray(raw.screenIds))c.screenIds=[...new Set(raw.screenIds.filter(id=>typeof id==='string'&&/^screen-\d{1,6}$/.test(id)))].slice(0,MAX_STUDIO_SCREENS);
   const n=number(raw.index,0,11);if(n!==undefined)c.index=Math.floor(n);
   if(typeof raw.match==='string')c.match=raw.match.slice(0,80);
  }else if(raw.type==='scene'){
   for(const k of ['roomVisible','autoRotate','naturalMotion','allowAvatarOverlap'])if(typeof raw[k]==='boolean')c[k]=raw[k];
  }else if(raw.type==='wait'){const duration=number(raw.duration,.1,8);if(duration!==undefined)c.duration=duration}
  else if(raw.type!=='reset'&&raw.type!=='normal')continue;
  if(Object.keys(c).length>1||c.type==='reset'||c.type==='normal')out.push(c);
 }return out;
}

export function presentationTargets(text,state={}){
 const screens=Array.isArray(state.screens)?state.screens.filter(s=>/^screen-\d{1,6}$/.test(s.id||'')):[];
 const named=String(text||'').match(/\bscreen\s*(\d+)\b/i);
 if(named){const id='screen-'+Number(named[1]);return screens.some(s=>s.id===id)?[id]:[]}
 if(/\b(?:each|every|all|both)\b/i.test(text)&&screens.length)return screens.map(s=>s.id);
 return state.activeScreenId?[state.activeScreenId]:screens.length?[screens[0].id]:[];
}
function requestedScreenCount(text){
 const found=text.match(/\b(?:add|open|create)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/i);
 if(!found)return 1;
 const words=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve'];
 return Math.max(1,Math.min(MAX_STUDIO_SCREENS,Number(found[1])||words.indexOf(found[1].toLowerCase())||1));
}
export function parseStudioRequest(text,state={}){
 const q=String(text||'').trim(),lower=q.toLowerCase();const out=[];
 const clauses=q.split(/\s*(?:,?\s+then\s+|;\s*)/i);if(clauses.length>1)return normalizeStudioCommands(clauses.slice(0,MAX_STUDIO_STEPS).flatMap(part=>parseStudioRequest(part,state)));
 const targets=presentationTargets(q,state),hasScreens=Array.isArray(state.screens)&&state.screens.length>0;
 if(/\bpoint\b/i.test(q)&&(/\b(?:each|every|all|both|screen|picture|photo|image)\b/i.test(q))&&hasScreens)return normalizeStudioCommands(targets.filter(id=>state.screens.some(s=>s.id===id&&s.visible!==false)).map(targetScreen=>({type:'avatar',motion:'point',targetScreen,placement:/\bin front\b/i.test(q)?'front':'beside',duration:2.6})));
 if(/\b(?:stand|walk|go|move)\b/i.test(q)&&/\b(?:in front|beside|next to)\b/i.test(q)&&hasScreens)return [{type:'avatar',motion:'walk',targetScreen:targets[0],placement:/\bin front\b/i.test(q)?'front':'beside'}];
 if(/^(?:please |can you )?(?:wave|dance|nod|think|stop|stand still)[.!?]?$/i.test(q))return [{type:'avatar',motion:/wave/i.test(q)?'wave':/dance/i.test(q)?'dance':/nod/i.test(q)?'nod':/think/i.test(q)?'think':'idle',duration:/dance/i.test(q)?5:2.5}];
 if(hasScreens&&/\b(?:put|show|display|fill)\b/i.test(q)&&/\b(?:each|every|all|both)\b/i.test(q)&&!/\b(?:photos?|pictures?|images?)\s+of\b/i.test(q))return [{type:'photos',action:'fill',screenIds:targets}];
 if(/^(?:(?:please|can you|could you)\s+)?(?:(?:go|return|back|get)\s+(?:back\s+)?(?:to\s+)?|restore\s+|reset\s+)?(?:the\s+)?(?:normal(?: view| layout| studio)?|default view|original view)[.!?]?$/i.test(q))return [{type:'normal'}];
 if(/\b(?:add|open|create|another|new)\b/i.test(q)&&(/\b(?:screens?|displays?)\b/i.test(q)||hasScreens&&/^add\s+(?:another|\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?:\s+more)?[.!?]?$/i.test(q))&&!(/\b(?:photo|picture|image)\b/i.test(q))){const count=requestedScreenCount(q);return [{type:'screen',action:'add',...(count>1?{count}:{})}]};
 if(/\b(?:close|delete)\b/i.test(q)&&/\bscreen\b/i.test(q))return [{type:'screen',action:'remove'}];
 const screen=/\b(screens?|display|presentation|scree)\b/i.test(q)||/^(?:even |a little |much )?(?:bigger|smaller|larger)[.!?]?$/i.test(q);
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
 return normalizeStudioCommands(out.map(command=>/\bscreen\s*\d+\b/i.test(q)&&targets[0]?(command.type==='screen'?{...command,id:targets[0]}:command.type==='photos'?{...command,screenIds:targets}:command):command));
}
export function extractStudioCommands(text){
 const raw=[];const clean=String(text||'').replace(/<atlas_studio>\s*([\s\S]*?)(?:<\/atlas_studio>|$)/gi,(_,json)=>{try{raw.push(...JSON.parse(json.replace(/^```(?:json)?\s*|\s*```$/g,'')))}catch{}return ''});
 return {text:clean.trim(),studio:normalizeStudioCommands(raw)};
}
export const STUDIO_CONTRACT="Control Atlas through ordered data commands, not claims. Reply briefly first, then append <atlas_studio>[JSON commands]</atlas_studio>. Up to 32 steps execute sequentially, waiting for walking/gestures. A sequence may use {type:\"sequence\",steps:[commands]}. Design useful multi-step presentations: show photos, walk beside a specific screen, point at it, enlarge that screen, pause, then move to the next. Never point by searching the web for the word point. Up to 12 independent screens. CURRENT STUDIO STATE lists their real IDs, content labels and placement. Commands: {type:\"screen\",action:\"add|remove|select\",count:1..12,id:\"screen-2\",visible:boolean,clear:boolean,text:string,x:number,y:number,z:number,width:number,height:number,billboard:boolean,rotation:number}; {type:\"photos\",action:\"show|fill|next|previous|pause|resume|remove\",screenIds:[\"screen-1\",\"screen-2\"],index:0-based number,match:string}; fill places available photos across target screens, without moving them. Use show for one screen/slideshow. Images are loaded into the requested screen, never URLs invented by you. {type:\"avatar\",motion:\"idle|wave|greet|point|think|nod|walk|back|dance|hiphop|sillydance|breakdance|flair\",targetScreen:\"screen-2\",placement:\"beside|front\",duration:seconds,x:number,z:number,rotation:degrees}. targetScreen with point walks beside it, turns toward it and points; placement front explicitly permits standing in front of a picture. {type:\"wait\",duration:seconds}; {type:\"camera\",preset:\"head|body|studio|screen|left|right|reset\",yaw:number,pitch:number,distance:number,x:number,y:number,z:number}; {type:\"scene\",roomVisible:boolean,autoRotate:boolean,naturalMotion:boolean,allowAvatarOverlap:boolean}; {type:\"normal\"} restores normal view; {type:\"reset\"} clears the scene. Screen positions stay fixed unless explicitly moved. Atlas walks to clear space; if none exists he stays still. Use only actual IDs from state. Only include needed fields. Camera angles are degrees. Respect unavailable state. For new photo subjects use photo search, not stale photos. Short intent before actions; never report actions as successful before execution. Studio commands need no web citations." ;
