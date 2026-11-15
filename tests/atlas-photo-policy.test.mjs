import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../cloudflare-worker/index.js',import.meta.url),'utf8');
const ctx=vm.createContext({searchTopic:t=>t,plain:t=>String(t||'').replace(/<[^>]*>/g,''),Date});
vm.runInContext(source.slice(source.indexOf('const PHOTO_STOP='),source.indexOf('async function webImages(')),ctx);
const page=(title,description='',taken='2026-11-15',uploaded='')=>({title:'File:'+title,imageinfo:[{timestamp:uploaded,extmetadata:{ImageDescription:{value:description},DateTimeOriginal:{value:taken}}}]});
const now=new Date('2026-11-15T12:00:00Z');
test('all requested attributes match across subjects, not partial substrings',()=>{
 for(const [query,good,bad] of [['red sports cars','Red sports cars in Rome.jpg','Red barn and cars.jpg'],['black cats','Black cat sleeping.jpg','Black catfish.jpg'],['snowy mountains in Japan','Snowy mountain in Japan.jpg','Mountains in Canada.jpg'],['blue bicycles','Blue bicycle.jpg','Red bicycle.jpg']]){
  const r=ctx.photoRequest(query,now);assert.ok(ctx.photoMatch(r,page(good))>=0,query);assert.equal(ctx.photoMatch(r,page(bad)),-1,query);
 }
});
test('photo requests reject synthetic images and substitute objects',()=>{
 const r=ctx.photoRequest('red cars',now);
 for(const p of [page('Red car.jpg','AI-generated illustration'),page('Red car painting.jpg'),page('Red car toy.jpg')])assert.equal(ctx.photoMatch(r,p),-1);
 assert.ok(ctx.photoMatch(ctx.photoRequest('red toy cars',now),page('Red toy car.jpg'))>=0);
});
test('freshness uses capture date instead of upload date, and excludes unknown or future dates',()=>{
 const r=ctx.photoRequest('latest cars',now);assert.ok(ctx.photoMatch(r,page('Car.jpg','','2026-11-10'))>=0);
 for(const p of [page('Car.jpg','','2015-01-01','2026-11-15'),page('Car.jpg','','','2026-11-15'),page('Car.jpg','','2027-01-01'),page('Car.jpg','','2026-02-31')])assert.equal(ctx.photoMatch(r,p),-1);
});
test('explicit timing and exclusions are honored without treating New York as a date request',()=>{
 const r=ctx.photoRequest('cars today without toys',now);assert.equal(ctx.photoMatch(r,page('Car toy.jpg','','2026-11-15')),-1);assert.equal(ctx.photoMatch(r,page('Car.jpg','','2026-11-14')),-1);
 assert.ok(ctx.photoRequest('New York skyline',now).since);assert.ok(ctx.photoRequest('New York skyline',now).terms.includes('new'));assert.ok(ctx.photoRequest('updated cars',now).since);
});
test('recent capture dates are the default, with an explicit historical exception',()=>{
 assert.ok(ctx.photoRequest('cars',now).since);assert.equal(ctx.photoMatch(ctx.photoRequest('cars',now),page('Car.jpg','','2018-01-01')),-1);
 assert.equal(ctx.photoRequest('historical cars',now).since,null);
});
