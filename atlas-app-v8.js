(()=>{'use strict';
const $=id=>document.getElementById(id);
const BASE='https://erins-mac-mini.tail04f5e9.ts.net';
const STORE='atlas-v43-chat',MEM='atlas-v57-memory';
const status=$('aiModeLabel'),feed=$('feed'),composer=$('input');
let data;try{data=JSON.parse(localStorage.getItem(STORE)||'null')}catch{}
if(!data||!Array.isArray(data.threads))data={active:Date.now(),threads:[{id:Date.now(),title:'New conversation',msgs:[]}]};
if(!data.threads.length)data.threads.push({id:Date.now(),title:'New conversation',msgs:[]});
const memories=()=>{try{const m=JSON.parse(localStorage.getItem(MEM)||'[]');return Array.isArray(m)?m:[]}catch{return []}};
const putMem=m=>{try{localStorage.setItem(MEM,JSON.stringify(m.slice(-80)))}catch{}};
const save=()=>{try{const lean={active:data.active,threads:data.threads.slice(0,70).map(t=>({id:t.id,title:t.title,msgs:t.msgs.slice(-160).map(m=>({role:m.role,text:m.text, sources:m.sources||[]}))}))};localStorage.setItem(STORE,JSON.stringify(lean))}catch(e){console.warn('Conversation storage full',e)}};
const active=()=>data.threads.find(t=>t.id===data.active)||data.threads[0];
let files=[],busy=false,queuedMode='chat',speaking=false,recognizer=null;
const modelSetting=$('atlasModelChoice');if(modelSetting){modelSetting.value=localStorage.getItem('atlas-model-choice')||'gpt-6-luna';modelSetting.onchange=()=>localStorage.setItem('atlas-model-choice',modelSetting.value)}
function bottom(){feed.scrollTop=feed.scrollHeight;requestAnimationFrame(()=>feed.scrollTop=feed.scrollHeight)}
function linkify(node,text){
 const re=/https:\/\/[^\s<>"]+/g;let i=0,m;
 while((m=re.exec(text))){if(m.index>i)node.append(document.createTextNode(text.slice(i,m.index)));
  const url=m[0].replace(/[.,;!?)}]+$/,'');
  const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';let label=url;if(url.length>90){try{label=new URL(url).hostname+' · open source'}catch{label='open source'}}a.textContent=label;a.style.color='#8be0ff';a.style.textDecoration='underline';node.append(a);i=m.index+m[0].length;
 }
 node.append(document.createTextNode(text.slice(i)));
}
function mediaBubble(el,m){
 for(const img of m.images||[]){if(!img.startsWith('data:image/'))continue;
  const a=document.createElement('a');a.href=img;a.download='atlas-image.png';a.title='Download image';
  const pic=document.createElement('img');pic.src=img;pic.alt='Atlas generated image';pic.style.cssText='max-width:100%;border-radius:13px;display:block;margin-top:10px';a.append(pic);el.append(a);
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
 linkify(el,m.text||'');mediaBubble(el,m);return el;
}
function render(){
 const t=active();feed.replaceChildren();for(const m of t.msgs)feed.append(bubble(m));
 if(busy&&t.id===data.active){const el=document.createElement('div');el.className='bubble atlas typing';el.id='atlasTyping';el.innerHTML='<i></i><i></i><i></i>';feed.append(el)}
 const threads=$('threads');threads.replaceChildren();
 for(const thread of data.threads){const b=document.createElement('button');b.className='btn entry '+(thread.id===data.active?'active':'');b.textContent=thread.title||'Conversation';b.onclick=()=>{data.active=thread.id;save();render();close()};threads.append(b)}
 bottom();
}
function push(role,text,extras={}){const t=active();const m={role,text,...extras};t.msgs.push(m);save();render();return m}
function setStatus(t){status.textContent=t}
function dispatch(type,action){window.dispatchEvent(new CustomEvent('atlas-action',{detail:{type,action}}))}
function remember(text){
 const m=text.match(/^\s*(?:please\s+)?remember(?:\s+that)?[:\s]+(.{4,600})/i);
 if(!m)return false;
 const list=memories(),fact=m[1].trim();
 if(!list.some(x=>(x.text||'').toLowerCase()===fact.toLowerCase()))list.push({text:fact,date:new Date().toISOString()});
 putMem(list);push('atlas','Noted. My memory has officially been upgraded with that little gem.');return true;
}
function relevantHistory(question,currentId){
 const words=new Set((question.toLowerCase().match(/[a-z]{4,}/g)||[]).filter(w=>!['what','when','where','with','that','this','have','about','from','please','could','would','create','make'].includes(w)));
 const matches=[];
 for(const thread of data.threads){for(const msg of thread.msgs){if(!msg.text||thread.id===currentId)continue;
  const lower=msg.text.toLowerCase(),score=[...words].filter(w=>lower.includes(w)).length;
  if(score>0)matches.push({score,text:msg.text.slice(0,350),thread:thread.title})}}
 return matches.sort((a,b)=>b.score-a.score).slice(0,8).map(x=>'['+x.thread+'] '+x.text);
}
function summarizeMemory(text){
 const m=text.match(/^\s*(?:I prefer|I like|my favorite|my favourite)\s+(.{3,160})/i);
 if(!m)return;const fact=text.slice(0,180),list=memories();
 if(!list.some(x=>(x.text||'').toLowerCase()===fact.toLowerCase())){list.push({text:fact,date:new Date().toISOString()});putMem(list)}
}
function memoryRequest(text){
 if(/^\s*(?:what do you remember|show (?:my |your )?memories|list (?:my |your )?memories)/i.test(text)){
  const list=memories();push('atlas',list.length?'I remember:\n'+list.slice(-20).map(x=>'• '+x.text).join('\n'):'No saved notes yet. Tell me “remember that…” and I’ll hang onto it.');return true}
 if(/^\s*(?:forget everything|clear (?:all )?memories)/i.test(text)){
  if(confirm('Clear saved Atlas notes on this browser?')){putMem([]);push('atlas','Memory notes cleared. Fresh start, dramatic entrance.')}return true}
 return false;
}
async function api(path,body,timeout=140000){
 const c=new AbortController(),timer=setTimeout(()=>c.abort(),timeout);
 try{const r=await fetch(BASE+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:c.signal});
  let j;try{j=await r.json()}catch{throw Error('Unexpected response from private Atlas bridge (HTTP '+r.status+')')}
  if(!r.ok)throw Error(j.error||'HTTP '+r.status);return j;
 }finally{clearTimeout(timer)}
}
async function check(verify=false){
 setStatus(verify?'ATLAS · TESTING API':'ATLAS · CONNECTING');
 const info=$('atlasApiInfo');
 try{
  const r=await api('/atlas/api/status',null,8000);
  if(!r.configured){
   setStatus('ATLAS · API KEY REQUIRED');
   if(info)info.textContent='The bridge is installed, but no OpenAI API key was configured. Run the Atlas Cloud installer to add one privately.';
   return false;
  }
  if(!verify){
   setStatus('ATLAS · KEY INSTALLED');
   if(info)info.textContent='API key detected for '+r.model+'. Click Test API connection to verify the model and billing are working.';
   return true;
  }
  const live=await api('/atlas/api/diagnose',null,45000);
  if(!live.connected)throw Error(live.error||'API test did not succeed');
  setStatus('ATLAS ONLINE · '+live.model);
  if(info)info.textContent='Verified live response from '+live.model+'. Atlas is ready.';
  return true;
 }catch(e){
  setStatus('ATLAS · CONNECTION ERROR');
  if(info)info.textContent='Connection test failed: '+e.message;
  return false;
 }
}
function imageData(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(Error('Unable to read '+file.name));r.readAsDataURL(file)})}
function textData(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(Error('Unable to read '+file.name));r.readAsText(file)})}
async function reduceImage(file){
 const data=await imageData(file);const img=new Image();img.src=data;await img.decode();
 const ratio=Math.min(1,1350/Math.max(img.width,img.height));const c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.width*ratio));c.height=Math.max(1,Math.round(img.height*ratio));
 c.getContext('2d').drawImage(img,0,0,c.width,c.height);return c.toDataURL('image/jpeg',.76);
}
async function videoFrames(file){
 const u=URL.createObjectURL(file),video=document.createElement('video');video.preload='auto';video.muted=true;video.src=u;video.playsInline=true;
 try{await new Promise((res,rej)=>{video.onloadedmetadata=res;video.onerror=()=>rej(Error('Cannot inspect this video'));setTimeout(()=>rej(Error('Video did not load')),9000)});
  const shots=[],length=Math.min(video.duration||9,35);
  for(let i=1;i<=3;i++){video.currentTime=Math.min(Math.max(0,length-0.2),length*i/4);
    await new Promise((res,rej)=>{video.onseeked=res;video.onerror=()=>rej(Error('Cannot read video frame'));setTimeout(res,2500)});
    const c=document.createElement('canvas'),ratio=Math.min(1,800/Math.max(video.videoWidth||800,video.videoHeight||450));
    c.width=Math.max(1,Math.floor((video.videoWidth||800)*ratio));c.height=Math.max(1,Math.floor((video.videoHeight||450)*ratio));
    c.getContext('2d').drawImage(video,0,0,c.width,c.height);shots.push(c.toDataURL('image/jpeg',.65));
  }return shots;
 }finally{URL.revokeObjectURL(u);video.removeAttribute('src');video.load()}
}
async function processFiles(){
 const out=[];for(const file of files.slice(0,8)){
  if(file.size>9*1024*1024)throw Error(file.name+' is over the 9 MB attachment limit.');
  if(file.type.startsWith('image/'))out.push({name:file.name,type:'image/jpeg',data:await reduceImage(file)});
  else if(file.type.startsWith('video/'))out.push({name:file.name,type:file.type,frames:await videoFrames(file)});
  else if(file.type==='application/pdf')out.push({name:file.name,type:file.type,data:await imageData(file)});
  else if(/\.(docx|pptx|xlsx)$/i.test(file.name))out.push({name:file.name,type:file.type||'application/vnd.openxmlformats-officedocument',data:await imageData(file)});
  else if(file.type.startsWith('text/')||/\.(md|txt|csv|json|js|ts|py|html|css|xml|log)$/i.test(file.name))out.push({name:file.name,type:'text/plain',text:(await textData(file)).slice(0,16000)});
  else throw Error('Unsupported attachment: '+file.name+'. Use images, videos, PDF, Office, or text files.');
 }return out;
}
function attachmentPreview(){
 const node=$('atlasFiles');node.replaceChildren();
 for(const [i,file] of files.entries()){const pill=document.createElement('button');pill.className='atlas-file-pill';pill.textContent='📎 '+file.name+' ×';pill.title='Remove '+file.name;pill.onclick=()=>{files.splice(i,1);attachmentPreview()};node.append(pill)}
}
function requestedMotion(text){
 if(!/\b(?:atlas|you|please|could you|would you)\b/i.test(text) && !/^\s*(?:wave|dance|point|greet|walk|think)\b/i.test(text))return null;
 if(/\b(?:dance|dancing)\b/i.test(text))return 'dance';
 if(/\b(?:wave|waving)\b/i.test(text))return 'wave';
 if(/\b(?:point|pointing)\b/i.test(text))return 'point';
 if(/\b(?:walk|walking)\b/i.test(text))return 'walk';
 if(/\b(?:think|thinking)\b/i.test(text))return 'think';
 if(/\b(?:hello|greet|greeting)\b/i.test(text))return 'greet';
 return null;
}
function modeFromText(t){
 if(queuedMode!=='chat')return queuedMode;
 if(/\b(?:make|create|generate|draw|paint|design)\b[\s\S]{0,90}\b(?:video|movie|animation|clip)\b/i.test(t))return 'video';
 if(/\b(?:make|create|generate|draw|paint|design)\b[\s\S]{0,90}\b(?:image|picture|photo|portrait|illustration|poster)\b/i.test(t))return 'image';
 return 'chat';
}
async function createVideo(text,m){
 const j=await api('/atlas/api/video',{text},60000);
 if(!j.id)throw Error('Video service did not return a render job ID');
 m.text='Rendering your video. This can take a few minutes.';render();
 for(let i=0;i<55;i++){await new Promise(r=>setTimeout(r,9000));const state=await api('/atlas/api/video/'+encodeURIComponent(j.id),null,30000);
  if(state.status==='completed'){
   const r=await fetch(BASE+'/atlas/api/video/'+encodeURIComponent(j.id)+'/content');if(!r.ok)throw Error('Video generated, but download failed');
   m.video=URL.createObjectURL(await r.blob());m.text='Your video is ready. Yes, I expect applause.';render();return;
  }
  if(state.status==='failed')throw Error(state.error?.message||'Video creation failed');
  if(i%3===0){m.text='Video rendering · '+(state.progress||0)+'%';render()}
 }
 throw Error('Video is still rendering. Job ID: '+j.id);
}
async function send(){
 if(busy)return;const text=composer.value.trim();if(!text&&!files.length)return;
 composer.value='';if(text&&remember(text)){files=[];attachmentPreview();return}
 if(text&&memoryRequest(text)){files=[];attachmentPreview();return}
 summarizeMemory(text);
 const t=active(),mode=modeFromText(text);const current=t.id;
 if(t.title==='New conversation')t.title=(text||'Attachments').slice(0,52);
 const filenames=files.map(x=>x.name);const history=t.msgs.slice(-35).filter(x=>x.role==='user'||x.role==='atlas').map(x=>({role:x.role==='atlas'?'assistant':'user',text:x.text}));
 push('user',(text||'Analyze these attachments')+(filenames.length?'\n📎 '+filenames.join(', '):''));
 const action=requestedMotion(text);
 if(/\b(?:walk|go|move)\b.{0,35}\b(?:screen|presentation)\b/i.test(text))$('walkToScreen')?.click();
 else if(/\b(?:return|go back|walk back)\b.{0,35}\b(?:center|home|start)\b/i.test(text))$('walkHome')?.click();
 else if(action)dispatch('motion',action);
 busy=true;queuedMode='chat';render();dispatch('think');setStatus(mode==='chat'?'ATLAS · THINKING':mode==='image'?'ATLAS · CREATING IMAGE':'ATLAS · RENDERING VIDEO');
 const selection=files;files=[];attachmentPreview();
 let response;
 try{
  if(mode==='video'){const m=push('atlas','Starting your video…');await createVideo(text,m);dispatch('respond');return}
  const attachments=await (async()=>{const prior=files;files=selection;try{return await processFiles()}finally{files=prior}})();
  const sent=t.msgs.findLast? t.msgs.findLast(m=>m.role==='user'):[...t.msgs].reverse().find(m=>m.role==='user');
  if(sent){sent.images=attachments.filter(a=>a.type.startsWith('image/')).map(a=>a.data);render()}
  const memory=memories().slice(-35).map(x=>x.text);
  const related=relevantHistory(text,t.id);
  const payload={text:text||'Describe the files I attached.',history,attachments,memories:[...memory,...related],model:modelSetting?.value||'gpt-6-luna'};
  response=await api('/atlas/api/'+mode,payload,mode==='image'?210000:150000);
  let txt=response.text||'Done. Consider the dramatic entrance complete.';
  const match=txt.match(/<atlas_action>(wave|dance|point|think|greet|idle)<\/atlas_action>/i);
  txt=txt.replace(/<atlas_action>[\s\S]*?<\/atlas_action>/gi,'').trim();
  if(current===data.active)push('atlas',txt,{images:response.images||[],sources:response.sources||[]});
  else {const thread=data.threads.find(x=>x.id===current);if(thread){thread.msgs.push({role:'atlas',text:txt,sources:response.sources||[]});save()}}
  dispatch('respond');if(match)dispatch('motion',match[1]);
  if(speaking&&window.speechSynthesis){speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(txt.slice(0,1400));u.rate=1.06;speechSynthesis.speak(u)}
 }catch(e){if(current===data.active)push('atlas','That didn’t work: '+e.message+'. Check the API connection in Settings.');setStatus('ATLAS · ERROR');console.error('Atlas request',e)}
 finally{busy=false;render();if(status.textContent!=='ATLAS · ERROR')setStatus('ATLAS · READY')}
}
const input=document.createElement('input');input.type='file';input.multiple=true;input.accept='image/*,video/*,.pdf,.docx,.pptx,.xlsx,.txt,.md,.csv,.json,.js,.ts,.py,.html,.css,.xml,.log';input.hidden=true;document.body.append(input);
input.onchange=()=>{files=[...files,...input.files].slice(0,8);input.value='';attachmentPreview()};
$('atlasAttach').onclick=()=>input.click();
$('atlasImage').onclick=()=>{queuedMode='image';composer.placeholder='Describe the image to create…';composer.focus()};
$('atlasVideo').onclick=()=>{queuedMode='video';composer.placeholder='Describe the video to create…';composer.focus()};
$('send').onclick=send;
composer.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}});
$('newChat').onclick=()=>{const id=Date.now();data.threads.unshift({id,title:'New conversation',msgs:[]});data.active=id;save();render();close()};
const open=id=>{$(id).classList.add('show');$('veil').classList.add('show')};
const close=()=>{document.querySelectorAll('.sheet').forEach(x=>x.classList.remove('show'));$('veil').classList.remove('show')};
$('historyBtn').onclick=()=>open('history');$('settingsBtn').onclick=()=>open('settings');$('veil').onclick=close;document.querySelectorAll('[data-close]').forEach(b=>b.onclick=close);
$('atlasCheckAPI').onclick=()=>check(true);
$('atlasMemoryView').onclick=()=>{$('atlasMemoryInfo').textContent=memories().map(x=>'• '+x.text).join('\n')||'No saved notes yet.'};
$('atlasMemoryClear').onclick=()=>{if(confirm('Clear saved memory notes?')){putMem([]);$('atlasMemoryInfo').textContent='Memories cleared'}};
$('mic').title='Speak into Atlas';
$('mic').onclick=()=>{const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){alert('Voice input is not supported in this browser.');return}
 if(recognizer){recognizer.stop();recognizer=null;return}recognizer=new SR();recognizer.lang='en-US';recognizer.onresult=e=>{composer.value=e.results[0][0].transcript;composer.focus()};recognizer.onend=()=>{recognizer=null;$('mic').classList.remove('on')};recognizer.start();$('mic').classList.add('on')};
$('speaker').title='Speak Atlas responses';$('speaker').onclick=()=>{speaking=!speaking;$('speaker').classList.toggle('on',speaking);if(!speaking)speechSynthesis?.cancel()};
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
render();void check();
})();