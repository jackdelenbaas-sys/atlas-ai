const cleanStudioResults=items=>(Array.isArray(items)?items:[]).slice(-12).filter(a=>a&&['completed','failed','skipped','canceled','running'].includes(a.status)).map(a=>({id:String(a.id||'').slice(0,100),status:a.status,summary:String(a.summary||'').slice(0,220),reason:String(a.reason||'').slice(0,300),at:Number.isFinite(Number(a.at))?Number(a.at):0}));
const stamp=v=>Number.isFinite(Number(v))?Number(v):0;
export function normalizeHistory(input={}){
 const deleted={};for(const [id,date] of Object.entries(input.deleted||{}).slice(-1000))if(stamp(date)>0)deleted[id]=stamp(date);
 const threads=(Array.isArray(input.threads)?input.threads:[]).slice(0,100).filter(t=>t&&t.id!==undefined).map(t=>({id:String(t.id).slice(0,100),title:String(t.title||'New conversation').slice(0,120),updatedAt:stamp(t.updatedAt)||stamp(t.id),msgs:(Array.isArray(t.msgs)?t.msgs:[]).slice(-200).filter(m=>m&&['user','atlas'].includes(m.role)).map((m,i)=>({id:String(m.id||'legacy:'+t.id+':'+i+':'+m.role).slice(0,160),role:m.role,text:String(m.text||'').slice(0,18000),createdAt:stamp(m.createdAt)||stamp(t.id)+i,updatedAt:stamp(m.updatedAt)||stamp(m.createdAt)||stamp(t.id)+i,imageIds:(m.imageIds||[]).filter(id=>/^[a-zA-Z0-9-]{8,100}$/.test(id)).slice(0,4),sources:(m.sources||[]).slice(0,8),webImages:(m.webImages||[]).slice(0,6),studioResults:cleanStudioResults(m.studioResults)}))}));
 return {threads,deleted};
}
export function mergeHistory(left,right){
 const a=normalizeHistory(left),b=normalizeHistory(right),deleted={...a.deleted};for(const [id,date] of Object.entries(b.deleted))deleted[id]=Math.max(deleted[id]||0,date);
 const map=new Map();for(const t of [...a.threads,...b.threads]){
  if(deleted[t.id])continue;const previous=map.get(t.id);if(!previous){map.set(t.id,t);continue}
  const messages=new Map(previous.msgs.map(m=>[m.id,m]));for(const m of t.msgs){const old=messages.get(m.id);if(!old||m.updatedAt>=old.updatedAt)messages.set(m.id,{...old,...m,imageIds:m.imageIds.length?m.imageIds:old?.imageIds||[],studioResults:cleanStudioResults([...new Map([...(old?.studioResults||[]),...(m.studioResults||[])].map(a=>[a.id,a])).values()].sort((a,b)=>a.at-b.at))})}
  map.set(t.id,{...previous,...(t.updatedAt>=previous.updatedAt?t:{}),updatedAt:Math.max(t.updatedAt,previous.updatedAt),msgs:[...messages.values()].sort((x,y)=>x.createdAt-y.createdAt||x.id.localeCompare(y.id)).slice(-200)});
 }
 return {threads:[...map.values()].sort((x,y)=>y.updatedAt-x.updatedAt||x.id.localeCompare(y.id)).slice(0,100),deleted};
}
const CHUNK=120000;
async function readLarge(storage,key){const n=await storage.get(key+':count');if(!n)return null;let value='';for(let i=0;i<n;i++)value+=await storage.get(key+':'+i)||'';return value}
async function writeLarge(storage,key,value){const old=await storage.get(key+':count')||0,n=Math.ceil(value.length/CHUNK);for(let i=0;i<n;i++)await storage.put(key+':'+i,value.slice(i*CHUNK,(i+1)*CHUNK));await storage.put(key+':count',n);for(let i=n;i<old;i++)await storage.delete(key+':'+i)}
export class AtlasHistory{
 constructor(state,env){this.state=state;this.env=env}
 async fetch(request){
  const path=new URL(request.url).pathname,storage=this.state.storage;
  if(path==='/pair'){
   const p=await request.json();await storage.put('pair',{hash:p.hash,expiresAt:p.expiresAt,activeThreadId:String(p.activeThreadId||'').slice(0,100)});return Response.json({expiresAt:p.expiresAt});
  }
  if(path==='/claim'){
   const p=await request.json();return storage.transaction(async tx=>{const code=await tx.get('pair');if(!code||code.hash!==p.hash||code.expiresAt<Date.now())return Response.json({error:'This private pairing link has expired. Make a new link on your computer.'},{status:410});await tx.delete('pair');return Response.json({token:this.env.ATLAS_ACCESS_TOKEN,activeThreadId:code.activeThreadId||''})});
  }
  if(path.startsWith('/media/')){
   const id=path.slice(7);if(!/^[a-zA-Z0-9-]{8,100}$/.test(id))return Response.json({error:'Invalid media ID'},{status:400});
   if(request.method==='PUT'){const p=await request.json();if(typeof p.data!=='string'||p.data.length>12000000||!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(p.data))return Response.json({error:'Unsupported media'},{status:400});await storage.transaction(tx=>writeLarge(tx,'media:'+id,p.data));return Response.json({ok:true})}
   const data=await storage.transaction(tx=>readLarge(tx,'media:'+id));return data?Response.json({data}):Response.json({error:'Image not found'},{status:404});
  }
  if(request.method==='POST'){
   const incoming=await request.json();const result=await storage.transaction(async tx=>{const raw=await readLarge(tx,'history'),merged=mergeHistory(raw?JSON.parse(raw):{},incoming);await writeLarge(tx,'history',JSON.stringify(merged));return merged});return Response.json(result);
  }
  const raw=await storage.transaction(tx=>readLarge(tx,'history'));return Response.json(raw?JSON.parse(raw):{threads:[],deleted:{}});
 }
}

