(()=>{'use strict';
const $=id=>document.getElementById(id);
let BASE=localStorage.getItem('atlas-hosted-url')||'https://atlas-ai.jack-d-elenbaas.workers.dev';
let ACCESS=sessionStorage.getItem('atlas-access-token')||'';
const STORE='atlas-v43-chat',MEM='atlas-v57-memory',PROFILE='atlas-personality-v1';
const status=$('aiModeLabel'),feed=$('feed'),composer=$('input');
const serverField=$('atlasCloudURL'),tokenField=$('atlasCloudToken');
if(serverField)serverField.value=BASE;
if(tokenField)tokenField.value=ACCESS;
const generateToken=$('atlasGenerateToken');
if(generateToken)generateToken.onclick=async()=>{
 const info=$('atlasTokenInstructions');
 if(!window.crypto?.getRandomValues){if(info)info.textContent='Secure token generation is unavailable.';return}
 let token=ACCESS||(tokenField?.value||'').trim();
 if(token.length<24){const bytes=new Uint8Array(36);crypto.getRandomValues(bytes);token=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')}
 try{
  const copied=navigator.clipboard.writeText(token);
  ACCESS=token;if(tokenField)tokenField.value=token;
  sessionStorage.setItem('atlas-access-token',token);
  sessionStorage.setItem('atlas-pairing-pending','1');
  await copied;
  generateToken.textContent='✓ Token copied';
  if(info)info.textContent='Paste into Cloudflare’s ATLAS_ACCESS_TOKEN Value, then click Add variable and deploy. Return here; Atlas will test automatically.';
 }catch{
  if(tokenField){tokenField.type='text';tokenField.value=token;tokenField.focus();tokenField.select()}
  if(info)info.textContent='Clipboard access was blocked. Copy the selected token manually.';
 }
};
let pairingCheckRunning=false;
async function finishPairing(){
 if(pairingCheckRunning||sessionStorage.getItem('atlas-pairing-pending')!=='1')return;
 pairingCheckRunning=true;
 try{if(await check(true))sessionStorage.removeItem('atlas-pairing-pending')}finally{pairingCheckRunning=false}
}
window.addEventListener('focus',()=>void finishPairing());
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void finishPairing()});
const saveCloud=$('atlasSaveCloud');
if(saveCloud)saveCloud.onclick=()=>{
 let url=(serverField?.value||'').trim().replace(/\/+$/,'');
 if(!/^https:\/\/[^/]+$/.test(url)){alert('Enter the full HTTPS URL of your hosted Atlas backend.');return}
 BASE=url;ACCESS=(tokenField?.value||'').trim();
 if(ACCESS.length<24){alert('Enter the private Atlas access token (at least 24 characters).');return}
 localStorage.setItem('atlas-hosted-url',BASE);sessionStorage.setItem('atlas-access-token',ACCESS);
 void check(true);
};

let data;try{data=JSON.parse(localStorage.getItem(STORE)||'null')}catch{}
if(!data||!Array.isArray(data.threads))data={active:Date.now(),threads:[{id:Date.now(),title:'New conversation',msgs:[]}]};
if(!data.threads.length)data.threads.push({id:Date.now(),title:'New conversation',msgs:[]});
const memories=()=>{try{const m=JSON.parse(localStorage.getItem(MEM)||'[]');return Array.isArray(m)?m:[]}catch{return []}};
const putMem=m=>{try{localStorage.setItem(MEM,JSON.stringify(m.slice(-80)))}catch{}};
const save=()=>{try{const lean={active:data.active,threads:data.threads.slice(0,70).map(t=>({id:t.id,title:t.title,msgs:t.msgs.slice(-160).map(m=>({role:m.role,text:m.text, sources:m.sources||[],imageIds:m.imageIds||[]}))}))};localStorage.setItem(STORE,JSON.stringify(lean))}catch(e){console.warn('Conversation storage full',e)}};
const active=()=>data.threads.find(t=>t.id===data.active)||data.threads[0];
let files=[],busy=false,speaking=false,recognizer=null,pendingAction=0,busyThread=null;
const modelSetting=$('atlasModelChoice');if(modelSetting){modelSetting.value='cloudflare-free';modelSetting.onchange=()=>localStorage.setItem('atlas-model-choice',modelSetting.value)}
let mediaDBPromise;
function mediaDB(){
 return mediaDBPromise||(mediaDBPromise=new Promise((resolve,reject)=>{const r=indexedDB.open('atlas-image-library',1);r.onupgradeneeded=()=>r.result.createObjectStore('images');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)}));
}
async function cacheImages(message){
 if(!message.images?.length)return;
 try{const db=await mediaDB();message.imageIds=message.images.map(()=>crypto.randomUUID());await new Promise((resolve,reject)=>{const tx=db.transaction('images','readwrite'),store=tx.objectStore('images');message.images.forEach((image,i)=>store.put(image,message.imageIds[i]));tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});save()}catch{console.warn('Image remains available for this session; browser image storage is unavailable.')}
}
async function restoreImages(){
 try{const db=await mediaDB();for(const thread of data.threads)for(const m of thread.msgs)if(m.imageIds?.length){m.images=(await Promise.all(m.imageIds.map(id=>new Promise(resolve=>{const r=db.transaction('images').objectStore('images').get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>resolve(null)})))).filter(Boolean)}render()}catch{}
}
function bottom(){feed.scrollTop=feed.scrollHeight;requestAnimationFrame(()=>feed.scrollTop=feed.scrollHeight)}
function linkify(node,text){
 const re=/https:\/\/[^\s<>"]+/g;let i=0,m;
 while((m=re.exec(text))){if(m.index>i)node.append(document.createTextNode(text.slice(i,m.index)));
  const url=m[0].replace(/[.,;!?)}]+$/,'');
  const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';let label=url;if(url.length>90){try{label=new URL(url).hostname+' · open source'}catch{label='open source'}}a.textContent=label;a.style.color='#8be0ff';a.style.textDecoration='underline';node.append(a);i=m.index+m[0].length;
 }
 node.append(document.createTextNode(text.slice(i)));
}
function answerInline(node,text){
 const re=/\*\*([^*\n]+)\*\*|__([^_\n]+)__|`([^`\n]+)`|\[([^\]\n]+)\]\((https:\/\/[^\s)]+)\)/g;let at=0,m;
 while((m=re.exec(text))){linkify(node,text.slice(at,m.index));let part;
  if(m[4]){part=document.createElement('a');part.textContent=m[4];part.href=m[5];part.target='_blank';part.rel='noopener noreferrer'}
  else{part=document.createElement(m[3]?'code':'strong');part.textContent=m[1]||m[2]||m[3]}
  node.append(part);at=m.index+m[0].length;
 }linkify(node,text.slice(at));
}
function formatAnswer(node,text){
 const lines=text.replace(/\r/g,'').split('\n');let list=null,pre=null;
 for(const line of lines){
  if(/^\s*```/.test(line)){if(pre){node.append(pre);pre=null}else{pre=document.createElement('pre');list=null}continue}
  if(pre){pre.textContent+=(pre.textContent?'\n':'')+line;continue}
  if(!line.trim()){list=null;continue}
  const item=line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.+)/);
  if(item){if(!list){list=document.createElement('ul');node.append(list)}const li=document.createElement('li');answerInline(li,item[1]);list.append(li)}
  else{list=null;const p=document.createElement('p');answerInline(p,line.replace(/^\s*#{1,6}\s+/,''));node.append(p)}
 }if(pre)node.append(pre);
}
function studioImage(src){
 if(!/^data:image\/(jpeg|png|webp);base64,/.test(src||''))return;
 window.dispatchEvent(new CustomEvent('atlas-studio-image',{detail:{src}}));
}
function mediaBubble(el,m){
 for(const img of m.images||[]){if(!/^data:image\/(jpeg|png|webp);base64,/.test(img))continue;
  const card=document.createElement('div');card.className='atlas-image-card';
  const preview=document.createElement('button');preview.className='atlas-image-preview';preview.title='Show on Atlas studio screen';
  const pic=document.createElement('img');pic.src=img;pic.alt=m.role==='user'?'Uploaded image':'Atlas created image';pic.loading='lazy';preview.append(pic);preview.onclick=()=>studioImage(img);
  const actions=document.createElement('div');actions.className='atlas-image-actions';
  const show=document.createElement('button');show.textContent='▣ Show in studio';show.onclick=()=>studioImage(img);
  const download=document.createElement('a');download.href=img;download.download='atlas-image.jpg';download.textContent='↓ Save image';
  const improve=document.createElement('button');improve.textContent='✎ Edit image';improve.onclick=async()=>{try{const blob=await (await fetch(img)).blob();await addFiles([new File([blob],'reference.jpg',{type:blob.type})]);composer.value='Edit this image: ';composer.focus()}catch{push('atlas','That image could not be prepared as a reference. Try uploading it again.')}};
  actions.append(show,download,improve);card.append(preview,actions);el.append(card);
 }

 if(m.video){const v=document.createElement('video');v.src=m.video;v.controls=true;v.playsInline=true;v.style.cssText='width:100%;max-height:300px;border-radius:12px;margin-top:10px';el.append(v);
  const a=document.createElement('a');a.href=m.video;a.download='atlas-video.mp4';a.textContent='Download video';a.style.cssText='display:block;color:#8be0ff;margin-top:8px';el.append(a);
 }
 if(m.sources?.length){
  const box=document.createElement('div');box.style.cssText='margin-top:10px;border-top:1px solid #ffffff22;padding-top:8px;display:flex;flex-wrap:wrap;gap:8px';
  for(const item of m.sources.slice(0,5)){if(!/^https:\/\//.test(item.url||''))continue;const a=document.createElement('a');a.href=item.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=item.title||new URL(item.url).hostname;a.style.cssText='color:#9edbff;font-size:11px;max-width:100%;overflow:hidden;text-overflow:ellipsis';box.append(a)}
  el.append(box);
 }
}
function bubble(m){
 const el=document.createElement('div');el.className='bubble '+(m.role==='user'?'user':'atlas');
 if(m.role==='user')linkify(el,m.text||'');else formatAnswer(el,cleanReply(m.text||'').text);mediaBubble(el,m);return el;
}
function render(){
 const t=active();$('send').disabled=busy;$('send').setAttribute('aria-busy',String(busy));feed.replaceChildren();for(const m of t.msgs)feed.append(bubble(m));
 if(busy&&t.id===busyThread){const el=document.createElement('div');el.className='bubble atlas typing';el.id='atlasTyping';el.innerHTML='<i></i><i></i><i></i>';feed.append(el)}
 const threads=$('threads');threads.replaceChildren();
 for(const thread of data.threads){const b=document.createElement('button');b.className='btn entry '+(thread.id===data.active?'active':'');b.textContent=thread.title||'Conversation';b.onclick=()=>{data.active=thread.id;save();render();close()};threads.append(b)}
 bottom();
}
function push(role,text,extras={}){const t=active();const m={role,text,...extras};t.msgs.push(m);save();render();return m}
function setStatus(t){status.textContent=t}
function dispatch(type,action){window.dispatchEvent(new CustomEvent('atlas-action',{detail:{type,action}}))}
function cleanReply(text){
 const actions=[];
 text=String(text||'').replace(/<atlas_actions?>\s*([\s\S]*?)(?:<\/atlas_actions?>|$)/gi,(_,raw)=>{actions.push(...raw.split(',').map(x=>x.trim()));return ''});
 text=text.replace(/(?:^|(?<=[.!?])\s+|\n)(?:think|nod|idle|point|wave|greet)(?:\s*,\s*(?:think|nod|idle|point|wave|greet)){1,4}[.!]?\s*$/i,'').trim();
 return {text,actions};
}
function actionReply(action){return action==='idle'?'Stopping. The dramatic pause is intentional.':action==='dance'?'Fine. The floor clearly needs my talent.':action==='walk'?'Taking a stroll. Very ambitious of me.':action==='back'?'Backing up. A rare strategic retreat.':action==='wave'?'A wave? Consider yourself acknowledged.':'On it. Try to contain your excitement.'}
async function afterReply(run){
 const id=++pendingAction;
 await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 await new Promise(resolve=>setTimeout(resolve,280));
 if(id===pendingAction)run();
}
function performMotion(action){
 $('stageActions').open=false;push('atlas',actionReply(action));
 void afterReply(()=>dispatch('motion',action));
}
function safeMemory(text){
 return typeof text==='string'&&text.length>=4&&text.length<=240&&!/\b(?:sk-[\w-]+|password|api[ _-]?key|access[ _-]?token|credit card|social security|bearer)\b/i.test(text);
}
function storeFact(text){
 const fact=text.trim().slice(0,240);if(!safeMemory(fact))return false;
 const list=memories(),key=fact.toLowerCase().replace(/[.!]+$/,'');
 const old=list.find(x=>(x.text||'').toLowerCase().replace(/[.!]+$/,'')===key);
 if(old)old.date=new Date().toISOString();else list.push({text:fact,date:new Date().toISOString()});
 putMem(list);return true;
}
function profile(){try{const p=JSON.parse(localStorage.getItem(PROFILE)||'{}');return {turns:Math.max(0,Math.min(10000,Number(p.turns)||0)),sass:['gentle','playful','extra'].includes(p.sass)?p.sass:'playful'}}catch{return {turns:0,sass:'playful'}}}
function developPersonality(text){
 const p=profile();p.turns++;
 if(/(?:less|no|stop|without)\s+(?:the\s+)?(?:sarcasm|sass|jokes)|be (?:serious|gentler)/i.test(text))p.sass='gentle';
 else if(/(?:more|extra)\s+(?:sarcasm|sass)|be sassier/i.test(text))p.sass='extra';
 else if(/(?:be|stay)\s+(?:funny|sarcastic|sassy)|bring back.*(?:sass|jokes)/i.test(text))p.sass='playful';
 try{localStorage.setItem(PROFILE,JSON.stringify(p))}catch{}return p;
}
function selectedMemories(question){
 const words=new Set((question.toLowerCase().match(/[a-z]{4,}/g)||[]));
 let budget=1100;
 return memories().filter(m=>safeMemory(m.text)).map((m,i)=>({text:m.text,score:[...words].filter(w=>m.text.toLowerCase().includes(w)).length*10+i/1000}))
 .sort((a,b)=>b.score-a.score).slice(0,8).filter(m=>{budget-=m.text.length;return budget>=0}).map(m=>m.text);
}
function remember(text){
 const m=text.match(/^\s*(?:please\s+)?remember(?:\s+that)?[:\s]+(.{4,600})/i);
 if(!m)return false;
 push('atlas',storeFact(m[1])?'Saved. Tiny memory, enormous ego.':'I won’t save passwords or access keys. Even I have boundaries.');return true;
}
function relevantHistory(question,currentId){
 const words=new Set((question.toLowerCase().match(/[a-z]{4,}/g)||[]).filter(w=>!['what','when','where','with','that','this','have','about','from','please','could','would','create','make'].includes(w)));
 const matches=[];
 for(const thread of data.threads){for(const msg of thread.msgs){if(!msg.text||thread.id===currentId)continue;
  const lower=msg.text.toLowerCase(),score=[...words].filter(w=>lower.includes(w)).length;
  if(score>0)matches.push({score,text:msg.text.slice(0,200),thread:thread.title})}}
 return matches.sort((a,b)=>b.score-a.score).slice(0,3).map(x=>'['+x.thread+'] '+x.text);
}
function summarizeMemory(text){
 // Save only explicit, durable user facts. No summarizer call or model-inferred memories.
 const sentence=(text.match(/^(?:I prefer|I like|I dislike|I love|I hate|my favorite|my favourite|my name is|call me|I am working on|I'm working on)\s+[^\n.!?]{3,200}[.!?]?/i)||[])[0];
 if(sentence)storeFact(sentence);
}
function memoryRequest(text){
 const forget=text.match(/^\s*forget(?:\s+that)?[:\s]+(.+)/i);
 if(forget&&!/^(?:everything|all(?: memories)?)\s*[.!]?$/i.test(forget[1])){
  const q=forget[1].toLowerCase().replace(/[.!]+$/,'');const old=memories(),next=old.filter(m=>!(m.text||'').toLowerCase().includes(q));
  putMem(next);push('atlas',next.length<old.length?'Forgotten. Selective amnesia: finally useful.':'I couldn’t find that saved note. Try a few words from it.');return true;
 }

 if(/^\s*(?:what do you remember|show (?:my |your )?memories|list (?:my |your )?memories)/i.test(text)){
  const list=memories();push('atlas',list.length?'I remember:\n'+list.slice(-20).map(x=>'• '+x.text).join('\n'):'No saved notes yet. Tell me “remember that…” and I’ll hang onto it.');return true}
 if(/^\s*(?:forget everything|clear (?:all )?memories)/i.test(text)){
  if(confirm('Clear saved Atlas notes on this browser?')){putMem([]);localStorage.removeItem(PROFILE);push('atlas','Memory notes cleared. Fresh start, dramatic entrance.')}return true}
 return false;
}
async function api(path,body,timeout=140000){
 if(!BASE||!ACCESS)throw Error('Hosted AI needs the server URL and private access token in Atlas Settings.');
 const c=new AbortController(),timer=setTimeout(()=>c.abort(),timeout);
 try{const r=await fetch(BASE+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+ACCESS,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:c.signal});
  let j;try{j=await r.json()}catch{throw Error('Unexpected response from private Atlas bridge (HTTP '+r.status+')')}
  if(!r.ok){const e=Error(j.error||'HTTP '+r.status);e.code=j.code;e.status=r.status;e.resetAt=j.resetAt;throw e}return j;
 }catch(e){if(e.name==='AbortError')throw Error('Atlas took too long to respond. Your message is saved; please try again.');if(e instanceof TypeError)throw Error('Cannot reach the Atlas server. Check your connection and hosted server address.');throw e}finally{clearTimeout(timer)}
}
async function check(verify=false){
 if(!BASE||!ACCESS){setStatus('ATLAS · SIGN-IN TOKEN NEEDED');const n=$('atlasApiInfo');if(n)n.textContent='Enter your private Atlas access token and press Save connection and test. No OpenAI key is needed for this free Cloudflare connection.';return false}
 setStatus(verify?'ATLAS · TESTING API':'ATLAS · CONNECTING');
 const info=$('atlasApiInfo');
 try{
  const r=await api('/atlas/api/status',null,8000);
  if(!r.configured){
   setStatus('ATLAS · API KEY REQUIRED');
   if(info)info.textContent='Hosted backend is connected, but its OpenAI API key has not been configured.';
   return false;
  }
  if(!verify){
   setStatus('ATLAS · FREE AI CONFIGURED');
   if(info)info.textContent='Free Cloudflare AI is configured. The daily allowance resets automatically at '+new Date(r.resetAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})+'. No paid fallback.';
   return true;
  }
  const live=await api('/atlas/api/diagnose?model='+encodeURIComponent(modelSetting?.value||'cloudflare-free'),null,60000);
  if(!live.connected)throw Error(live.error||'API test did not succeed');
  setStatus('ATLAS ONLINE · '+live.model);
  if(info)info.textContent='Free AI verified. Atlas is ready. Daily limits reset automatically; there is no paid fallback.';
  return true;
 }catch(e){
  setStatus(e.code==='DAILY_LIMIT_REACHED'?'ATLAS · FREE LIMIT RESETS DAILY':'ATLAS · CONNECTION ERROR');
  if(info)info.textContent='Connection test failed: '+e.message+(e.code==='MISSING_RUNTIME_SECRETS'?' Open the Worker runtime Settings → Variables and Secrets, add the missing values, and Deploy. Build secrets alone do not configure the running server.':e.status===401?' Use the Atlas access token here, not your OpenAI API key.':'');
  return false;
 }
}
function imageData(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(Error('Unable to read '+file.name));r.readAsDataURL(file)})}
function textData(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(Error('Unable to read '+file.name));r.readAsText(file)})}
async function reduceImage(file,maxSize=1280){
 const data=await imageData(file);const img=new Image();img.src=data;await img.decode();
 const ratio=Math.min(1,maxSize/Math.max(img.width,img.height));const c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.width*ratio));c.height=Math.max(1,Math.round(img.height*ratio));
 c.getContext('2d').drawImage(img,0,0,c.width,c.height);return c.toDataURL('image/jpeg',.76);
}
async function processFiles(selection=files,forEdit=false){
 const out=[];for(const file of selection.slice(0,3)){
  if(file.size>9*1024*1024)throw Error(file.name+' is over the 9 MB attachment limit.');
  if(file.type.startsWith('image/'))out.push({name:file.name,type:'image/jpeg',data:await reduceImage(file,forEdit?504:1280)});
  else if(file.type.startsWith('text/')||/\.(md|txt|csv|json|js|ts|py|html|css|xml|log)$/i.test(file.name))out.push({name:file.name,type:'text/plain',text:(await textData(file)).slice(0,16000)});
  else throw Error('Unsupported attachment: '+file.name+'. Use an image or text file.');
 }return out;
}
const previewURLs=new Map();
function attachmentPreview(){
 const node=$('atlasFiles');node.replaceChildren();
 for(const [file,url] of previewURLs)if(!files.includes(file)){URL.revokeObjectURL(url);previewURLs.delete(file)}
 for(const [i,file] of files.entries()){
  const card=document.createElement('div');card.className='atlas-upload-card';
  if(file.type.startsWith('image/')){let url=previewURLs.get(file);if(!url){url=URL.createObjectURL(file);previewURLs.set(file,url)}const im=document.createElement('img');im.src=url;im.alt=file.name;card.append(im)}
  const caption=document.createElement('span');caption.textContent=file.name;caption.title=file.name;card.append(caption);
  const remove=document.createElement('button');remove.textContent='×';remove.type='button';remove.title='Remove '+file.name;remove.setAttribute('aria-label','Remove '+file.name);remove.onclick=e=>{e.preventDefault();e.stopPropagation();files=files.filter(f=>f!==file);attachmentPreview()};card.append(remove);node.append(card);
 }
}
async function addFiles(incoming){
 const accepted=[...incoming].filter(f=>f.type.startsWith('image/')||f.type.startsWith('text/')||/\.(md|txt|csv|json|js|ts|py|html|css)$/i.test(f.name));
 const tooLarge=accepted.find(f=>f.size>9*1024*1024);
 if(tooLarge){push('atlas',tooLarge.name+' is too large. Choose an image under 9 MB.');return}
 files=[...files,...accepted].slice(0,3);attachmentPreview();
 const image=accepted.find(f=>f.type.startsWith('image/'));
 if(image)try{studioImage(await reduceImage(image))}catch{setStatus('ATLAS · IMAGE COULD NOT LOAD')}
 if(!accepted.length)push('atlas','Upload an image or text file. You can also paste or drop a picture here.');
}

function requestedMotion(text){
 const command=/\b(?:atlas|you|please|could you|would you|do a|show me|perform|try to|can you)\b/i.test(text)
     ||/^\s*(?:stop|freeze|idle|wave|dance|point|greet|walk|think|breakdance|moonwalk)\b/i.test(text);
 if(!command)return null;
 if(/\b(?:stop|stand still|freeze|idle)\b/i.test(text))return 'idle';
 if(/\b(?:walk|walking|step|move)\s+(?:backwards?|back)\b/i.test(text))return 'back';
 if(/\b(?:breakdance|breakdancing|break dance)\b/i.test(text))return 'breakdance';
 if(/\b(?:hip.?hop)\b/i.test(text))return 'hiphop';
 if(/\b(?:silly dance|dance silly)\b/i.test(text))return 'sillydance';
 if(/\b(?:flair|flare move)\b/i.test(text))return 'flair';
 if(/\b(?:dance|dancing)\b/i.test(text))return 'dance';
 if(/\b(?:wave|waving)\b/i.test(text))return 'wave';
 if(/\b(?:point|pointing)\b/i.test(text))return /\bforward\b/i.test(text)?'pointforward':'point';
 if(/\b(?:walk|walking|move forward)\b/i.test(text))return 'walk';
 if(/\b(?:think|thinking)\b/i.test(text))return 'think';
 if(/\b(?:hello|greet|greeting)\b/i.test(text))return 'greet';
 return null;
}
function isImageEdit(text){
 const q=(text||'').trim();
 if(/\b(?:explain|describe|identify|what|why|how|analyze|schedule|calendar|recipe|workout|password)\b/i.test(q))return false;
 return /^(?:please\s+)?(?:edit|change|modify|recolor|retouch|enhance|improve|remove|replace|add|erase|crop|brighten|darken|sharpen)\b/i.test(q)||/^(?:please\s+)?(?:make|turn)\s+(?:it|this|that|the\s+\w+)\b/i.test(q)||/\b(?:more realistic|less blurry|better lighting)\b/i.test(q);
}
function responseActions(question,answer,proposed,mode,legacy){
 const allowed=['wave','greet','point','pointforward','think','nod','idle'];
 const valid=Array.isArray(proposed)?proposed.filter(a=>allowed.includes(a)).slice(0,3):[];
 if(mode==='image')return ['point','nod','idle'];
 if(valid.length)return [...valid.filter(a=>a!=='idle'),'idle'].slice(0,4);
 if(legacy&&allowed.includes(legacy))return [legacy,'nod','idle'];
 if(/\b(hi|hello|hey|good morning)\b/i.test(question))return ['greet','nod','idle'];
 if(/\b(image|picture|photo|screen|look)\b/i.test(question))return ['point','nod','idle'];
 if(/\b(sorry|sad|worried|anxious|hurt)\b/i.test(question+' '+answer))return ['nod','idle'];
 return ['think','point','idle'];
}
function modeFromText(t,attachments=[]){
 const q=(t||'').trim();
 // The one chat box handles every task. Never inherit a mode from an earlier message.
 const asks=/\b(?:make|create|generate|draw|paint|design|produce|render|animate|edit|modify|change|transform|enhance|retouch|recolor|turn|convert)\b/i.test(q);
 const video=/\b(?:video|movie|film|animation|animated clip|short clip|footage|moving scene)\b/i.test(q);
 const image=/\b(?:image|picture|photo|photograph|illustration|portrait|poster|drawing|artwork|graphic|logo|visual|rendering|art)\b/i.test(q);
 const hasImage=attachments.some(f=>f.type?.startsWith('image/'));
 const editPicture=hasImage&&isImageEdit(q)||hasImage&&/\b(?:edit|change|transform|recolor|retouch|remove|replace|add|turn|make|stylize|restyle|enhance|erase)\b/i.test(q)&&!/\b(?:explain|describe|identify|what|why|how|analyze)\b/i.test(q);
 if(asks&&video)return 'video';
 if((asks&&image)||editPicture)return 'image';
 // A short request to make a visual object means create the picture, not write instructions.
 if(/^\s*(?:please\s+)?(?:make|create|generate|draw|design)\s+(?:me\s+)?(?:an?\s+)?(?:[a-z-]+\s+){0,3}(?:car|truck|boat|house|castle|robot|character|person|dog|cat|pirate|spaceship|airplane|landscape|scene|monster|dragon|mascot|portrait|logo)\s*[.!?]*$/i.test(q))return 'image';
 // Other vague requests remain chat rather than starting an expensive generation.
 return 'chat';
}
async function send(){
 if(busy)return;const text=composer.value.trim();if(!text&&!files.length)return;++pendingAction;
 composer.value='';if(text&&remember(text)){files=[];attachmentPreview();return}
 if(text&&memoryRequest(text)){files=[];attachmentPreview();return}
 summarizeMemory(text);
 const personality=developPersonality(text);
 const t=active();
 const latest=[...t.msgs].reverse().find(m=>m.images?.length)?.images?.at(-1);
 const recentVisual=t.msgs.at(-1)?.images?.length||/\b(?:image|picture|photo|photograph)\b/i.test(text);
 const followup=Boolean(latest&&recentVisual&&isImageEdit(text));
 const mode=modeFromText(text,files)==='image'||followup?'image':'chat';const current=t.id;
 if(t.title==='New conversation')t.title=(text||'Attachments').slice(0,52);
 const filenames=files.map(x=>x.name);const history=t.msgs.slice(-35).filter(x=>x.role==='user'||x.role==='atlas').map(x=>({role:x.role==='atlas'?'assistant':'user',text:x.text}));
 push('user',(text||'Analyze these attachments')+(filenames.length?'\n📎 '+filenames.join(', '):''));
 const action=mode==='chat'?requestedMotion(text):null;
 if(action&&!files.length&&text.length<90&&!/\b(?:why|how|explain|what|image|picture|photo|create|generate|screen|presentation|center|home)\b/i.test(text)){performMotion(action);return}
 const destination=/\b(?:walk|go|move)\b.{0,35}\b(?:screen|presentation)\b/i.test(text)?'walkToScreen':/\b(?:return|go back|walk back)\b.{0,35}\b(?:center|home|start)\b/i.test(text)?'walkHome':null;
 if(mode==='chat'&&destination&&!files.length&&text.length<110){push('atlas',destination==='walkHome'?'Back to center. My natural habitat.':'Heading to the screen. Presentation mode: mildly impressive.');void afterReply(()=>$(destination)?.click());return}
 busy=true;busyThread=current;render();dispatch('think');setStatus(mode==='chat'?'ATLAS · THINKING':'ATLAS · CREATING IMAGE');
 const requestActionVersion=pendingAction;
 const selection=files;files=[];attachmentPreview();
 let response;
 try{
  const attachments=await processFiles(selection,mode==='image');
  if(mode==='image'&&followup&&!attachments.some(a=>a.type.startsWith('image/'))){
   const blob=await (await fetch(latest)).blob();attachments.push({name:'previous-image.jpg',type:'image/jpeg',data:await reduceImage(new File([blob],'previous-image.jpg',{type:blob.type}),504)});
  }
  const sent=t.msgs.findLast? t.msgs.findLast(m=>m.role==='user'):[...t.msgs].reverse().find(m=>m.role==='user');
  if(sent){sent.images=attachments.filter(a=>a.type.startsWith('image/')).map(a=>a.data);cacheImages(sent);if(sent.images[0])studioImage(sent.images[0]);render()}
  const memory=selectedMemories(text);
  const related=relevantHistory(text,t.id);
  const payload={text:text||'Describe the files I attached.',history,attachments,memories:[...memory,...related],personality,model:modelSetting?.value||'cloudflare-free'};
  response=await api('/atlas/api/'+mode,payload,mode==='image'?210000:150000);
  const cleaned=cleanReply(response.text||'Done. Consider the dramatic entrance complete.');
  const txt=cleaned.text||'Done.';
  if(!response.actions?.length)response.actions=cleaned.actions;
  if(current===data.active){const m=push('atlas',txt,{images:response.images||[],sources:response.sources||[]});cacheImages(m);if(m.images[0])studioImage(m.images[0])}
  else {const thread=data.threads.find(x=>x.id===current);if(thread){const m={role:'atlas',text:txt,images:response.images||[],sources:response.sources||[]};thread.msgs.push(m);cacheImages(m);save()}}
  // Explicit user motions or model-selected actions take precedence over
  // a generic reply nod, so the body follows the intended movement.
  // The explicit user command always wins over an optional AI-selected gesture.
  if(current===data.active&&requestActionVersion===pendingAction)void afterReply(()=>action?dispatch('motion',action):dispatch('sequence',responseActions(text,txt,response.actions,mode)));
  if(speaking&&window.speechSynthesis&&current===data.active){
    speechSynthesis.cancel();
    dispatch('speech',false);
    const utterance=new SpeechSynthesisUtterance(txt.slice(0,1400));
    utterance.rate=1.03;
    utterance.onstart=()=>dispatch('speech',true);
    utterance.onboundary=()=>dispatch('speech-boundary');
    utterance.onend=()=>dispatch('speech',false);
    utterance.onerror=()=>dispatch('speech',false);
    speechSynthesis.speak(utterance);
  }
 }catch(e){if(current===data.active){if(!composer.value)composer.value=text;if(!files.length){files=selection;attachmentPreview()}}if(current===data.active)push('atlas','That didn’t work: '+e.message+(e.code==='MISSING_RUNTIME_SECRETS'?' Open Settings for the missing server configuration.':''));setStatus(e.code==='DAILY_LIMIT_REACHED'?'ATLAS · FREE LIMIT RESETS DAILY':'ATLAS · ERROR');console.error('Atlas request',e)}
 finally{busy=false;busyThread=null;render();if(!['ATLAS · ERROR','ATLAS · FREE LIMIT RESETS DAILY'].includes(status.textContent))setStatus('ATLAS · FREE AI READY')}
}
const input=document.createElement('input');input.type='file';input.multiple=true;input.accept='image/*,.txt,.md,.csv,.json,.js,.ts,.py,.html,.css';input.hidden=true;document.body.append(input);
input.onchange=()=>{void addFiles(input.files);input.value=''};
$('atlasAttach').onclick=()=>input.click();

$('studioUpload').onclick=()=>input.click();
for(const b of document.querySelectorAll('[data-motion]'))b.onclick=()=>performMotion(b.dataset.motion);
document.addEventListener('pointerdown',e=>{const menu=$('stageActions');if(menu.open&&!menu.contains(e.target))menu.open=false});
document.addEventListener('keydown',e=>{if(e.key==='Escape')$('stageActions').open=false});
$('studioPresent').onclick=()=>{const imgs=active().msgs.flatMap(m=>m.images||[]);if(imgs.length)studioImage(imgs.at(-1));else input.click()};
$('app').addEventListener('dragover',e=>{e.preventDefault();document.body.classList.add('atlas-dropping')});
$('app').addEventListener('dragleave',e=>{if(!e.currentTarget.contains(e.relatedTarget))document.body.classList.remove('atlas-dropping')});
$('app').addEventListener('drop',e=>{e.preventDefault();document.body.classList.remove('atlas-dropping');void addFiles(e.dataTransfer.files)});
composer.addEventListener('paste',e=>{const images=[...e.clipboardData.items].filter(i=>i.type.startsWith('image/')).map(i=>i.getAsFile()).filter(Boolean);if(images.length){e.preventDefault();void addFiles(images)}});

$('send').onclick=send;
composer.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}});
$('newChat').onclick=()=>{const id=Date.now();data.threads.unshift({id,title:'New conversation',msgs:[]});data.active=id;save();render();close()};
const open=id=>{$(id).classList.add('show');$('veil').classList.add('show')};
const close=()=>{document.querySelectorAll('.sheet').forEach(x=>x.classList.remove('show'));$('veil').classList.remove('show')};
$('historyBtn').onclick=()=>open('history');$('settingsBtn').onclick=()=>open('settings');$('veil').onclick=close;document.querySelectorAll('[data-close]').forEach(b=>b.onclick=close);
$('atlasCheckAPI').onclick=()=>check(true);
$('atlasMemoryView').onclick=()=>{$('atlasMemoryInfo').textContent=memories().map(x=>'• '+x.text).join('\n')||'No saved notes yet.'};
$('atlasMemoryClear').onclick=()=>{if(confirm('Clear saved memory notes?')){putMem([]);localStorage.removeItem(PROFILE);$('atlasMemoryInfo').textContent='Memories cleared'}};
$('mic').title='Speak into Atlas';
$('mic').onclick=()=>{const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){alert('Voice input is not supported in this browser.');return}
 if(recognizer){recognizer.stop();recognizer=null;return}recognizer=new SR();recognizer.lang='en-US';recognizer.onresult=e=>{composer.value=e.results[0][0].transcript;composer.focus()};recognizer.onend=()=>{recognizer=null;$('mic').classList.remove('on')};recognizer.start();$('mic').classList.add('on')};
$('speaker').title='Speak Atlas responses';$('speaker').onclick=()=>{speaking=!speaking;$('speaker').classList.toggle('on',speaking);if(!speaking){speechSynthesis?.cancel();dispatch('speech',false)}};
const app=$('app'),divider=$('dividerHandle');let dragging=false;
divider.addEventListener('pointerdown',e=>{dragging=true;divider.setPointerCapture(e.pointerId)});
divider.addEventListener('pointermove',e=>{if(!dragging)return;const r=app.getBoundingClientRect(),mobile=matchMedia('(max-width:760px)').matches;
 const p=mobile?(e.clientY-r.top)/r.height*100:(e.clientX-r.left)/r.width*100;
 const v=Math.max(mobile?24:20,Math.min(mobile?70:80,p));
 app.style.setProperty(mobile?'--mobile-split':'--split',v+'%');localStorage.setItem(mobile?'atlas-mobile-split':'atlas-split',String(v))});
divider.addEventListener('pointerup',()=>dragging=false);divider.addEventListener('pointercancel',()=>dragging=false);
const saved=Number(localStorage.getItem('atlas-split'));if(saved>20&&saved<80)app.style.setProperty('--split',saved+'%');
const savedMobile=Number(localStorage.getItem('atlas-mobile-split'));if(savedMobile>24&&savedMobile<70)app.style.setProperty('--mobile-split',savedMobile+'%');
composer.addEventListener('focus',()=>document.body.classList.add('atlas-typing'));
composer.addEventListener('blur',()=>document.body.classList.remove('atlas-typing'));
render();void check();void restoreImages();
if(new URLSearchParams(location.search).has('setup'))open('settings');
})();

