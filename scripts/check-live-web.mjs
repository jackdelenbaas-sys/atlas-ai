import {readFileSync} from 'node:fs';
const contract=readFileSync(new URL('../atlas-studio-controls.mjs',import.meta.url),'utf8');
const source=readFileSync(new URL('../cloudflare-worker/index.js',import.meta.url),'utf8').replace("'../atlas-studio-controls.mjs'",JSON.stringify('data:text/javascript;base64,'+Buffer.from(contract).toString('base64')));
const worker=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
const token='local-test-token-with-more-than-24-chars';
const env={ATLAS_ACCESS_TOKEN:token,AI:{run:async()=>({response:'Local test response; no AI was called.'})}};
const request=(path,body)=>new Request('https://atlas.test/atlas/api/'+path,{method:'POST',headers:{Authorization:'Bearer '+token},body:JSON.stringify(body)});
const result=await worker.fetch(request('web-images',{text:'Show me photos of cows'}),env);const images=await result.json();
console.log(JSON.stringify({test:'live photo retrieval',status:result.status,photos:images.webImages?.length,error:images.error}));
if(images.webImages?.[0]){const r=await worker.fetch(request('web-image',{url:images.webImages[0].url}),env);const j=await r.json();console.log(JSON.stringify({test:'live photo bytes',status:r.status,bytes:j.image?.length,error:j.error}));}
const r=await worker.fetch(request('chat',{text:'What are cattle?'}),env);const j=await r.json();console.log(JSON.stringify({test:'live article retrieval with mock summary',status:r.status,sources:j.sources?.map(x=>x.title),error:j.error}));
