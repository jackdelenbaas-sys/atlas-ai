// Runs only inside the owner's existing Cloudflare production build.
// Secrets stay in memory and travel to Wrangler on stdin, never in files/logs/argv.
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

export function seedRuntimeSecrets(env,run,config='wrangler.jsonc'){
 if(env.WORKERS_CI!=='1'||env.WORKERS_CI_BRANCH!=='main')return {state:'skipped',names:[]};
 const names=['OPENAI_API_KEY','ATLAS_ACCESS_TOKEN'];
 const available=names.filter(name=>String(env[name]||'').trim());
 if(!available.length)return {state:'no-build-secrets',names:[]};
 const list=run(['secret','list','--config',config]);
 if(list.status!==0)throw Error('Cannot check runtime secret names. Configure runtime secrets in Cloudflare Settings.');
 let existing;
 try{const text=list.stdout||'';existing=JSON.parse(text.slice(text.indexOf('['),text.lastIndexOf(']')+1))}
 catch{throw Error('Cannot read runtime secret names; no secrets were changed.')}
 if(!Array.isArray(existing))throw Error('Unexpected runtime secret list; no secrets were changed.');
 const installed=new Set(existing.map(s=>s.name));
 const missing=available.filter(name=>!installed.has(name));
 if(!missing.length)return {state:'already-configured',names:[]};
 if(missing.includes('ATLAS_ACCESS_TOKEN')&&env.ATLAS_ACCESS_TOKEN.trim().length<24)throw Error('Build ATLAS_ACCESS_TOKEN must contain at least 24 characters.');
 const input=JSON.stringify(Object.fromEntries(missing.map(name=>[name,env[name].trim()])));
 const upload=run(['secret','bulk','--config',config],input);
 if(upload.status!==0)throw Error('Runtime secret setup failed. Add the missing secrets in Cloudflare runtime Settings.');
 return {state:'configured',names:missing};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const run=(args,input)=>spawnSync('npx',['--no-install','wrangler',...args],{
   input,encoding:'utf8',timeout:60000,maxBuffer:1024*1024,
   env:{...process.env,NO_COLOR:'1',FORCE_COLOR:'0',WRANGLER_SEND_METRICS:'false'}
  });
  const result=seedRuntimeSecrets(process.env,run,process.argv[2]||'wrangler.jsonc');
  console.log('Atlas runtime setup: '+result.state+(result.names.length?' ('+result.names.join(', ')+')':''));
 }catch(error){console.error('Atlas runtime setup: '+error.message);process.exitCode=1}
}
