// Shared scene command contract. No code, network URLs or account controls are accepted.
export const MAX_STUDIO_SCREENS=12;
export const MAX_STUDIO_STEPS=32;
const motions=new Set(['idle','wave','greet','point','think','nod','walk','back','dance','hiphop','sillydance','breakdance','flair']);
const presets=new Set(['head','body','studio','screen','presentation','fit','left','right','reset']);
const number=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)?Math.max(min,Math.min(max,v)):undefined;
export function normalizeStudioCommands(input){
 const flattened=[];function collect(items,depth=0){if(depth>3||!Array.isArray(items))return;for(const item of items){if(flattened.length>=MAX_STUDIO_STEPS)break;if(item?.type==='sequence')collect(item.steps,depth+1);else flattened.push(item)}}collect(input);
 const out=[];for(const raw of flattened){
  if(!raw||typeof raw!=='object')continue;const c={type:raw.type};
  const nums=raw.type==='screen'?{x:[-2.6,2.6],y:[.75,2.7],z:[-2.6,1.5],width:[.6,4],height:[.4,2.8],rotation:[-180,180]}:raw.type==='camera'?{yaw:[-360,360],pitch:[-70,70],distance:[.8,24],x:[-3,3],y:[.3,2.8],z:[-3,3]}:raw.type==='avatar'?{x:[-3.71,3.71],z:[-3.72,1.93],rotation:[-360,360]}:{};
  for(const [k,range] of Object.entries(nums)){const n=number(raw[k],...range);if(n!==undefined)c[k]=n}
  if(raw.type==='screen'){
   if(['add','remove','select'].includes(raw.action))c.action=raw.action;
   if(typeof raw.id==='string'&&/^screen-\d{1,6}$/.test(raw.id))c.id=raw.id;
   const count=number(raw.count,1,MAX_STUDIO_SCREENS);if(count!==undefined)c.count=Math.floor(count);
   for(const k of ['visible','clear','billboard'])if(typeof raw[k]==='boolean')c[k]=raw[k];
   if(typeof raw.text==='string')c.text=raw.text.slice(0,800);
  }else if(raw.type==='camera'){if(presets.has(raw.preset))c.preset=raw.preset;if(typeof raw.screenId==='string'&&/^screen-\d{1,6}$/.test(raw.screenId))c.screenId=raw.screenId}
  else if(raw.type==='avatar'){
   if(motions.has(raw.motion))c.motion=raw.motion;
   if(typeof raw.targetScreen==='string'&&/^screen-\d{1,6}$/.test(raw.targetScreen))c.targetScreen=raw.targetScreen;
   if(['beside','front'].includes(raw.placement))c.placement=raw.placement;
   if(raw.face==='viewer')c.face='viewer';
   if(typeof raw.travel==='boolean')c.travel=raw.travel;
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
  else if(!['reset','normal','stop'].includes(raw.type))continue;
  if(Object.keys(c).length>1||['reset','normal','stop'].includes(c.type))out.push(c);
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
 if(stopRequested(q))return [{type:'stop'}];
 const clauses=q.split(/\s*(?:,?\s+then\s+|;\s*)/i);if(clauses.length>1)return normalizeStudioCommands(clauses.slice(0,MAX_STUDIO_STEPS).flatMap(part=>parseStudioRequest(part,state)));
 const plan=directStudioPlan(q,state);if(plan!==null)return normalizeStudioCommands(plan);
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
export const STUDIO_CONTRACT="Control Atlas through ordered data commands, not claims. Reply briefly first, then append <atlas_studio>[JSON commands]</atlas_studio>. Up to 32 steps execute sequentially, waiting for walking/gestures. A sequence may use {type:\"sequence\",steps:[commands]}. For explicit visits use placement front so Atlas actually walks to each screen; frame each stop with a camera presentation command and its screenId. Use camera fit to frame the whole studio. The avatar face field viewer turns toward the user. Read recentActions for actual outcomes; never guess what just happened. Design useful multi-step presentations: show photos, walk beside a specific screen, point at it, enlarge that screen, pause, then move to the next. Never point by searching the web for the word point. Up to 12 independent screens. CURRENT STUDIO STATE lists their real IDs, content labels and placement. Commands: {type:\"screen\",action:\"add|remove|select\",count:1..12,id:\"screen-2\",visible:boolean,clear:boolean,text:string,x:number,y:number,z:number,width:number,height:number,billboard:boolean,rotation:number}; {type:\"photos\",action:\"show|fill|next|previous|pause|resume|remove\",screenIds:[\"screen-1\",\"screen-2\"],index:0-based number,match:string}; fill places available photos across target screens, without moving them. Use show for one screen/slideshow. Images are loaded into the requested screen, never URLs invented by you. {type:\"avatar\",motion:\"idle|wave|greet|point|think|nod|walk|back|dance|hiphop|sillydance|breakdance|flair\",targetScreen:\"screen-2\",placement:\"beside|front\",duration:seconds,x:number,z:number,rotation:degrees}. targetScreen with point turns toward the screen and points without walking; placement front explicitly permits standing in front of a picture. {type:\"wait\",duration:seconds}; {type:\"camera\",preset:\"head|body|studio|screen|presentation|fit|left|right|reset\",screenId:\"screen-2\",yaw:number,pitch:number,distance:number,x:number,y:number,z:number}; {type:\"scene\",roomVisible:boolean,autoRotate:boolean,naturalMotion:boolean,allowAvatarOverlap:boolean}; {type:\"normal\"} restores normal view; {type:\"reset\"} clears the scene. Screen positions stay fixed unless explicitly moved. Atlas NEVER walks, paces or relocates automatically, including for photos and screen changes. Walking requires an explicit user movement request. Pointing by itself does not authorize walking. Stop cancels all movement immediately. Use only actual IDs from state. Only include needed fields. Camera angles are degrees. Respect unavailable state. For new photo subjects use photo search, not stale photos. Short intent before actions; never report actions as successful before execution. Studio commands need no web citations." ;

export function shouldDeferStudioCommands(mode,text){
 return mode==='image'||mode==='video'||mode==='web-images'&&/\b(?:of|showing|about)\s+\S/i.test(String(text||''));
}

export function studioRecallRequest(text){
 return /\b(?:what (?:did|have) you (?:just )?(?:do|done|change)|what just happened|what happened|why did you (?:do|move|show|change)|did you (?:move|change|do|finish)|have you (?:finished|done))\b/i.test(String(text||''));
}
export function studioConversation(text){
 const q=String(text||'');
 return stopRequested(q)||studioRecallRequest(q)||/\b(?:atlas|screens?|studio|camera|slideshow|zoom|your (?:body|position|movement)|look at me|face me|turn around|come (?:back|here)|go back)\b/i.test(q)
  ||/^(?:(?:please|can you|could you)\s+)?(?:wave|dance|stop|freeze|stand still|move (?:left|right|forward|back)|walk (?:left|right|forward|back))\b/i.test(q);
}
export function explicitPhotoSearch(text){
 const q=String(text||'').trim().split(/\s+(?:then|and then)\s+/i)[0];
 if(studioRecallRequest(q)||/\b(?:go|walk|come|turn|face|point|zoom|visit|reposition|rotate|resize|enlarge)\b/i.test(q)&&studioConversation(q))return false;
 if(/\b(?:make|create|generate|draw|paint|edit|modify|recolor|retouch)\b/i.test(q))return false;
 if(/\b(?:find|show|get|pull|search|look for|give|send|display|put)\b.*\b(?:images?|pictures?|pics?|photos?|photographs?)\s+(?:of|showing|about)\b/i.test(q))return true;
 if(/^(?:(?:a|an|one|some)\s+)?(?:pictures?|pics?|photos?|images?)\s+(?:of|showing)\b/i.test(q))return true;
 if(studioConversation(q))return false;
 return /\b(?:find|show|get|pull|search|look for|give|send)\b.*\b(?:images?|pictures?|pics?|photos?|photographs?)\b/i.test(q)
  ||/^(?:I want|I need|I'd like)\b.*\b(?:photos?|pictures?|images?)\b/i.test(q)
  ||/^show me (?!how|why|what|your|my|the code|a list|the (?:screen|studio|camera))[^?]{2,90}$/i.test(q);
}
export function photoSearchFollowup(text,history=[]){
 const q=String(text||'').trim();
 if(photoRetryRequest(q)&&previousPhotoSubject(history))return true;
 if(studioConversation(q)||/^(?:what|why|how|where|when|who|did|do|can|could|is|are|go|move|walk|come|turn|point|add|remove|delete|close|open|stop|wave|dance|make|create|generate|edit|remember|forget|thanks|hello|hey)\b/i.test(q)||/[?]/.test(q))return false;
 const last=history.at(-1);if(!last||!/(?:couldn.t find|could not find|couldn.t retrieve|specific name|matching picture|matching photo)/i.test(last.text||''))return false;
 return q.length<140&&/\w/.test(q)&&history.slice(-6).some(m=>m.role==='user'&&explicitPhotoSearch(m.text||''));
}

export function stopRequested(text,history=[]){
 const q=String(text||'').trim();
 if(/^(?:(?:please|can you|could you|atlas)\s+)*(?:stop|freeze|stand still|stay still|don't move|do not move|quit pacing|stop pacing)\b/i.test(q))return true;
 if(/\b(?:you (?:have )?not stopp?ed|you haven't stopp?ed|still (?:pacing|walking|moving)|stop moving)\b/i.test(q))return true;
 return /^(?:no[,]?\s+)?(?:you(?:'re| are)?\s+not|you(?:'re| are)\s+still)[.!?]*$/i.test(q)&&history.slice(-5).some(m=>m.role==='user'&&/\b(?:stop|freeze|pacing|stand still)\b/i.test(m.text||''));
}
export function movementRequested(text){
 const q=String(text||'');
 if(stopRequested(q))return false;
 return /\b(?:walk|walking|pace|pacing|stroll|run|jog|visit|tour|come here|come back|(?:go|move) (?:to|toward|towards|back|home|left|right|forward|backward)|head (?:to|over)|return to (?:the )?(?:center|middle)|take (?:a|some|\d+) steps?)\b/i.test(q)
  ||/\b(?:move|shift|bring|reposition|relocate|put)\s+(?:atlas|him|yourself|you|(?:the\s+)?(?:person|body))\b/i.test(q)
  ||/^(?:(?:please|can you|could you)\s+)?move (?:left|right|forward|backwards?|back)\b/i.test(q);
}
export function authorizeStudioCommands(commands,text){
 const allow=movementRequested(text);
 return normalizeStudioCommands(commands).flatMap(c=>{
  if(c.type!=='avatar')return [c];
  if(!allow&&['walk','back'].includes(c.motion))return [];
  return [{...c,travel:allow}];
 });
}
function photoRetryRequest(text){
 return /^(?:(?:please|can you|could you|would you)\s+)?(?:try (?:again|finding (?:them|it))|(?:find|get|show|fetch|search for)(?:\s+me)?\s+(?:them|it|those|these|the pictures|the photos|the images))(?:\s+(?:again|please|now))?[.!?]*$/i.test(String(text||'').trim());
}
function previousPhotoSubject(history){
 for(const m of history.slice(-16).reverse()){
  if(m.role!=='user'||!explicitPhotoSearch(m.text||''))continue;
  const subject=photoSubject(m.text);if(subject&&!photoRetryRequest(m.text))return subject;
 }
 return '';
}
export function resolvePhotoSubject(text,history=[]){
 const prior=previousPhotoSubject(history),q=String(text||'');
 if(prior&&(photoRetryRequest(q)||/\b(?:image|picture|photo)\s+of\s+(?:the|that|this)?\s*(?:car|vehicle|truck|product|animal|house)\s+(?:designed|made|built|created)\s+by\b/i.test(q)))return prior;
 return photoSubject(q);
}
export function photoSubject(text){
 return String(text||'').split(/\s+(?:then|and then)\s+/i)[0]
  .replace(/^(?:(?:please|can you|could you|would you)\s+)*(?:put|display|place|fill|show|find|get|pull|give|send|search(?: for)?|look for)(?:\s+me)?\s+/i,'')
  .replace(/^(?:(?:a|an|the|some|one|multiple|several)\s+)?(?:pictures?|photos?|images?|pics?)\s+(?:of|showing|about)\s+/i,'')
  .replace(/\s+(?:in|into|on|onto|across|to)\s+(?:each|every|all|both)(?:\s+(?:of\s+)?(?:the\s+)?(?:screens?|displays?))?(?:\s+(?:one|of them))?\s*[.!?]*$/i,'')
  .replace(/\s+(?:in|into|on|onto|to)\s+(?:the\s+)?(?:studio\s+)?(?:screen|display)(?:\s*#?\d+)?\s*[.!?]*$/i,'').trim();
}
export function studioActionSummary(commands){
 if(commands?.some(c=>c.type==='stop'))return 'Stop Atlas.';
 const list=normalizeStudioCommands(commands),visits=list.filter(c=>c.type==='avatar'&&c.targetScreen),moves=list.filter(c=>c.type==='avatar'&&(c.x!==undefined||c.z!==undefined||c.targetScreen));
 if(visits.length>1)return 'Visit '+visits.length+' screens in order.';
 if(visits.length)return 'Head to screen '+visits[0].targetScreen.split('-')[1]+'.';
 if(moves.length)return 'Move Atlas to the requested position.';
 if(list.some(c=>c.type==='camera'))return 'Adjust the camera.';
 if(list.some(c=>c.type==='photos'))return 'Show the pictures on the requested screens.';
 if(list.some(c=>c.action==='add'))return 'Add '+list.reduce((n,c)=>n+(c.action==='add'?(c.count||1):0),0)+' screen(s).';
 return 'Apply the requested studio actions.';
}
export function studioRecallReply(receipts=[]){
 const recent=receipts.slice(-5);if(!recent.length)return "I haven't completed a studio action in this conversation yet.";
 const failed=recent.findLast(r=>r.status==='failed'||r.status==='skipped');
 if(failed)return 'The last action did not finish: '+String(failed.reason||'no clear walking route').slice(0,220);
 const done=recent.filter(r=>r.status==='completed');
 if(recent.at(-1)?.status==='running')return 'I’m still carrying out the studio sequence.'+(done.length?' Completed so far: '+done.map(r=>r.summary).join(' '):'');
 if(!done.length)return recent.at(-1)?.status==='running'?'I’m still carrying out the studio sequence.':'The last studio sequence was canceled.';
 return 'What actually completed: '+done.map(r=>r.summary).join(' ').slice(0,500);
}
function directStudioPlan(q,state){
 const has=Array.isArray(state.screens)&&state.screens.length;
 const ids=presentationTargets(q,state).filter(id=>state.screens?.some(s=>s.id===id&&s.visible!==false));
 const all=/\b(?:all|each|every|both)\b/i.test(q);
 if(/\b(?:show|see|frame|fit)\b/i.test(q)&&/\b(?:all|whole|entire|everything)\b/i.test(q)&&/\b(?:screens?|studio|room|view)\b/i.test(q)&&!/\b(?:photos?|pictures?|images?)\b/i.test(q))return [{type:'camera',preset:'fit'}];
 if(has&&(/\b(?:go|walk|head|visit|tour)\b/i.test(q)||/\bmove\b.*\b(?:to|toward|towards)\b/i.test(q))&&/\bscreens?\b/i.test(q)&&!/\b(?:photos?|pictures?|images?)\s+of\b/i.test(q)){
  const targets=all?state.screens.filter(s=>s.visible!==false).map(s=>s.id):ids;
  return targets.flatMap(targetScreen=>[{type:'avatar',motion:/\bpoint\b/i.test(q)?'point':'walk',targetScreen,placement:'front',duration:1.6},{type:'camera',preset:'presentation',screenId:targetScreen}]);
 }
 if(all&&/\bscreens\b/i.test(q)&&/\b(?:move|resize|enlarge|bigger|smaller)\b/i.test(q))return [];
 if(/\b(?:camera|view|zoom)\b/i.test(q)&&!/\b(?:photos?|pictures?|images?)\s+of\b/i.test(q)){
  if(/\bzoom out\b/i.test(q))return [{type:'camera',distance:(state.camera?.distance||3.8)*1.3}];
  if(/\b(?:fit|reposition|fix|adjust|reset|normal|center|whole|everything|all|back)\b/i.test(q))return [{type:'camera',preset:'fit'}];
  if(has&&/\b(?:screen|picture|photo)\b/i.test(q))return [{type:'camera',preset:'presentation',screenId:ids[0]||state.activeScreenId}];
 }
 const self=/\b(?:atlas|yourself|person|body)\b/i.test(q)||!/screen|display|picture|photo|camera|view|zoom/i.test(q);
 if(self&&/\b(?:look at me|face me|face (?:the )?(?:camera|viewer)|turn (?:back )?(?:to|toward) me)\b/i.test(q))return [{type:'avatar',motion:'idle',face:'viewer',duration:.5}];
 if(self&&/\b(?:come (?:back|here)|go (?:back|home)|return to (?:the )?(?:center|middle)|back to (?:the )?(?:center|normal))\b/i.test(q))return [{type:'avatar',motion:'walk',x:0,z:0,face:'viewer'},{type:'camera',preset:'body'}];
 if(self&&/\b(?:move|walk|step|go|shift)\b/i.test(q)&&/\b(?:left|right|forward|backward|backwards|back)\b/i.test(q)){
  const yaw=(state.camera?.yaw||0)*Math.PI/180,side=/\bleft\b/i.test(q)?-1:/\bright\b/i.test(q)?1:0,forward=/\b(?:back|backward|backwards)\b/i.test(q)?-1:side?0:1;
  return [{type:'avatar',motion:'walk',x:(state.avatar?.x||0)+Math.cos(yaw)*side+Math.sin(yaw)*forward,z:(state.avatar?.z||0)-Math.sin(yaw)*side+Math.cos(yaw)*forward}];
 }
 if(self&&/\bturn around\b/i.test(q))return [{type:'avatar',motion:'idle',rotation:(state.avatar?.rotation||0)+180,duration:1}];
 return null;
}

