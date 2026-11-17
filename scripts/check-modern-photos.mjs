import {readFileSync} from 'node:fs';
const contract=readFileSync(new URL('../atlas-studio-controls.mjs',import.meta.url),'utf8');
const source=readFileSync(new URL('../cloudflare-worker/index.js',import.meta.url),'utf8').replace("'../atlas-history.mjs'",JSON.stringify('data:text/javascript;base64,'+Buffer.from(readFileSync(new URL('../atlas-history.mjs',import.meta.url),'utf8')).toString('base64'))).replace("'../atlas-studio-controls.mjs'",JSON.stringify('data:text/javascript;base64,'+Buffer.from(contract).toString('base64')));
const worker=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
const token='local-test-token-more-than-24-characters';
const env={ATLAS_ACCESS_TOKEN:token,AI:{run:()=>{throw Error('Unexpected inference')}}};
const req=(path,body)=>new Request('https://atlas.test/atlas/api/'+path,{method:'POST',headers:{Authorization:'Bearer '+token},body:JSON.stringify(body)});
const r=await worker.fetch(req('web-images',{text:'find a picture of a modern house'}),env),j=await r.json();
console.log(JSON.stringify({status:r.status,photos:j.webImages?.map(i=>({title:i.title,url:i.url})),error:j.error}));
if(!r.ok||!j.webImages?.length)process.exitCode=1;

