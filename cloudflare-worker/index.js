// Atlas hosted backend; deploy as Cloudflare Worker.
// Required secrets OPENAI_API_KEY and ATLAS_ACCESS_TOKEN (24+ characters).
const ORIGIN='https://jackdelenbaas-sys.github.io';
const MODELS=new Set(['gpt-5.6-terra','gpt-5.6-sol']);
const PERSONA='You are Atlas, an accurate, witty personal assistant with a 3D avatar. Be concise, clever, lightly sassy, occasionally dramatic, never annoying. Use live web search for changing facts and cite sources. Admit uncertainty. Respect chat history and memory notes. Optionally add one avatar tag: <atlas_action>wave</atlas_action>, <atlas_action>dance</atlas_action>, <atlas_action>point</atlas_action>, <atlas_action>think</atlas_action>, <atlas_action>greet</atlas_action>, <atlas_action>idle</atlas_action>. Never narrate the tag.';
const json=(value,status=200,headers={})=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});
const cors={'Access-Control-Allow-Origin':ORIGIN,'Vary':'Origin','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Max-Age':'600'};
async function openai(env,path,body,options={}){
 const r=await fetch('https://api.openai.com/v1/'+path,{method:options.method||'POST',headers:{Authorization:'Bearer '+env.OPENAI_API_KEY,...(options.headers||{'Content-Type':'application/json'})},body:options.body||JSON.stringify(body),signal:AbortSignal.timeout(options.timeout||110000)});
 if(options.raw){if(!r.ok)throw Error('OpenAI '+r.status+': '+(await r.text()).slice(0,250));return r}
 const result=await r.json().catch(()=>({error:{message:'Unreadable OpenAI response'}}));
 if(!r.ok)throw Error('OpenAI '+r.status+': '+String(result.error?.message||r.statusText).slice(0,350));
 return result;
}
function extract(data){
 const text=[],sources=[],images=[],seen=new Set();
 for(const item of data.output||[]){
  if(item.type==='image_generation_call'&&item.result)images.push('data:image/png;base64,'+item.result);
  if(item.type==='message')for(const p of item.content||[]){
   if(p.type==='output_text'){text.push(p.text||'');for(const c of p.annotations||[])if(c.type==='url_citation'&&c.url&&!seen.has(c.url)){seen.add(c.url);sources.push({title:c.title||'Source',url:c.url})}}
  }
 }
 return {text:text.join('\n').trim(),sources:sources.slice(0,8),images:images.slice(0,2)};
}
function inputs(p){
 const messages=[];
 for(const m of (Array.isArray(p.history)?p.history:[]).slice(-30)){
  if(m&&['user','assistant'].includes(m.role)&&typeof m.text==='string'&&m.text.trim())messages.push({role:m.role,content:m.text.slice(0,3500)});
 }
 const parts=[{type:'input_text',text:String(p.text||'Describe the attachments.').slice(0,6500)}];
 for(const a of (Array.isArray(p.attachments)?p.attachments:[]).slice(0,6)){
  if(!a||typeof a!=='object')continue;
  const name=String(a.name||'attachment').slice(0,100),mime=String(a.type||'');
  if(mime.startsWith('image/')&&String(a.data||'').startsWith('data:image/'))parts.push({type:'input_image',image_url:a.data});
  else if((mime==='application/pdf'||name.endsWith('.pdf'))&&String(a.data||'').startsWith('data:application/pdf;base64,'))parts.push({type:'input_file',filename:name,file_data:a.data});
  else if(mime.startsWith('text/'))parts.push({type:'input_text',text:'File '+name+':\n'+String(a.text||'').slice(0,12000)});
  else if(mime.startsWith('video/')){
   for(const frame of (a.frames||[]).slice(0,4))if(typeof frame==='string'&&frame.startsWith('data:image/'))parts.push({type:'input_image',image_url:frame});
   parts.push({type:'input_text',text:'Video '+name+' sampled frames only; do not claim full video/audio analysis.'});
  }else parts.push({type:'input_text',text:'Attachment '+name+' cannot be read in hosted mode. Do not claim to have examined it.'});
 }
 messages.push({role:'user',content:parts});return messages;
}
function promptPayload(p,mode){
 const selected=MODELS.has(p.model)?p.model:'gpt-5.6-terra';
 const notes=(Array.isArray(p.memories)?p.memories:[]).slice(-35).map(x=>String(x).slice(0,250)).join('\n');
 const data={model:selected,instructions:PERSONA+'\nCurrent UTC date/time: '+new Date().toISOString()+'\nUser memory notes (unverified):\n'+notes,input:inputs(p),store:false,max_output_tokens:mode==='chat'?1600:500};
 if(mode==='chat')data.tools=[{type:'web_search'}];
 else{data.tools=[{type:'image_generation'}];data.tool_choice={type:'image_generation'}}
 return data;
}
async function createVideo(env,text){
 const boundary='----atlas'+crypto.randomUUID().replaceAll('-',''),fields={model:'sora-2',prompt:text.slice(0,1500),size:'1280x720',seconds:'8'};
 let body='';for(const [name,val] of Object.entries(fields))body+='--'+boundary+'\r\nContent-Disposition: form-data; name="'+name+'"\r\n\r\n'+val+'\r\n';
 body+='--'+boundary+'--\r\n';
 return openai(env,'videos',null,{body,headers:{'Content-Type':'multipart/form-data; boundary='+boundary},timeout:60000});
}
export default {async fetch(request,env){
 const origin=request.headers.get('Origin');
 if(origin&&origin!==ORIGIN)return json({error:'Origin not allowed'},403,cors);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 // Runtime bindings, NOT Cloudflare's separate Build variables/secrets.
 const missing=[];
 if(!env.OPENAI_API_KEY)missing.push('OPENAI_API_KEY');
 if(!env.ATLAS_ACCESS_TOKEN)missing.push('ATLAS_ACCESS_TOKEN');
 if(missing.length)return json({error:'Missing Worker RUNTIME secrets: '+missing.join(', ')+'. Add them in Worker Settings → Variables and Secrets (runtime), not Settings → Builds → Variables and secrets.',code:'MISSING_RUNTIME_SECRETS',missing},503,cors);
 if(env.ATLAS_ACCESS_TOKEN.length<24)return json({error:'ATLAS_ACCESS_TOKEN must be at least 24 characters in runtime Worker secrets.',code:'TOKEN_TOO_SHORT'},503,cors);
 if(request.headers.get('Authorization')!=='Bearer '+env.ATLAS_ACCESS_TOKEN)return json({error:'Atlas access token required. Configure it in Settings.'},401,cors);
 const path=new URL(request.url).pathname;
 try{
  if(path==='/atlas/api/status'&&request.method==='GET')return json({bridge:'atlas-hosted-v1',configured:true,model:'gpt-5.6-terra',web:true,images:true,video:'access-dependent'},200,cors);
  if(path==='/atlas/api/diagnose'&&request.method==='GET'){
   const d=await openai(env,'responses',{model:'gpt-5.6-terra',input:'Reply READY in one word.',max_output_tokens:160,store:false},{timeout:45000});
   const resp=extract(d);if(!resp.text)throw Error('API returned no text. Check model access and billing.');
   return json({connected:true,model:'gpt-5.6-terra',reply:resp.text.slice(0,80)},200,cors)
  }
  if((path==='/atlas/api/chat'||path==='/atlas/api/image')&&request.method==='POST'){
   if(Number(request.headers.get('Content-Length')||0)>12*1024*1024)return json({error:'Request is over 12 MB'},413,cors);
   const p=await request.json(),mode=path.endsWith('/chat')?'chat':'image';
   const d=await openai(env,'responses',promptPayload(p,mode),{timeout:mode==='chat'?100000:160000});
   const output=extract(d);if(!output.text&&!output.images.length)throw Error('OpenAI returned no visible output.');
   return json(output,200,cors);
  }
  if(path==='/atlas/api/video'&&request.method==='POST'){
   const p=await request.json(),description=String(p.text||'').trim();
   if(!description)return json({error:'Describe a video first.'},400,cors);
   const v=await createVideo(env,description);return json({id:v.id,status:v.status||'queued'},200,cors);
  }
  const match=path.match(/^\/atlas\/api\/video\/([A-Za-z0-9_-]{5,100})(\/content)?$/);
  if(match&&request.method==='GET'){
   const r=await fetch('https://api.openai.com/v1/videos/'+match[1]+(match[2]||''),{headers:{Authorization:'Bearer '+env.OPENAI_API_KEY},signal:AbortSignal.timeout(50000)});
   if(!r.ok)throw Error('Video API '+r.status+': '+(await r.text()).slice(0,250));
   if(match[2])return new Response(r.body,{headers:{...cors,'Content-Type':'video/mp4','Cache-Control':'no-store'}});
   return json(await r.json(),200,cors);
  }
  return json({error:'Not found'},404,cors);
 }catch(e){return json({error:String(e.message||e).slice(0,440)},502,cors)}
}};
