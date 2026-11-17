import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {photoSubject} from '../atlas-studio-controls.mjs';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../cloudflare-worker/index.js',import.meta.url),'utf8');
const ctx=vm.createContext({photoSubject,searchTopic:t=>t,plain:t=>String(t||'').replace(/<[^>]*>/g,''),Date});
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
test('recency ranks matching photos without rejecting old or undated fallbacks',()=>{
 const r=ctx.photoRequest('latest cars',now);assert.ok(ctx.photoMatch(r,page('Car.jpg','','2026-11-10'))>=0);
 for(const p of [page('Car.jpg','','2015-01-01','2026-11-15'),page('Car.jpg','','','2026-11-15'),page('Car.jpg','','2026-02-31')])assert.ok(ctx.photoMatch(r,p)>=0);
 assert.equal(ctx.photoMatch(r,page('Car.jpg','','2027-01-01')),-1);
 assert.ok(ctx.photoRecency(page('Car.jpg','','2026-11-10'),now)>ctx.photoRecency(page('Car.jpg','','2020-01-01'),now));
});
test('explicit timing and exclusions are honored without treating New York as a date request',()=>{
 const r=ctx.photoRequest('cars today without toys',now);assert.equal(ctx.photoMatch(r,page('Car toy.jpg','','2026-11-15')),-1);assert.ok(ctx.photoMatch(r,page('Car.jpg','','2026-11-14'))>=0);
 assert.ok(ctx.photoRequest('New York skyline',now).since);assert.ok(ctx.photoRequest('New York skyline',now).terms.includes('new'));assert.ok(ctx.photoRequest('updated cars',now).since);
});
test('recent capture dates are the default, with an explicit historical exception',()=>{
 assert.ok(ctx.photoRequest('cars',now).since);assert.ok(ctx.photoMatch(ctx.photoRequest('cars',now),page('Car.jpg','','2018-01-01'))>=0);
 assert.equal(ctx.photoRequest('historical cars',now).since,null);
});
test('conversational one-picture requests identify the new Tesla robotaxi without filler terms',()=>{
 const r=ctx.photoRequest('show me one cool picture of the Tesla robot taxi the new one',now);
 assert.deepEqual(Array.from(r.terms),['tesla','cybercab']);assert.equal(r.limit,1);
 assert.ok(ctx.photoMatch(r,page('Tesla Cybercab.jpg','',''))>=0);
 assert.equal(ctx.photoMatch(r,page('Tesla Model Y.jpg','','')),-1);
});
test('searches remove retry chatter and normalize compound names',()=>{
 assert.deepEqual(Array.from(ctx.photoRequest('try to find a picture of a cyber cab',now).terms),['cybercab']);
 assert.deepEqual(Array.from(ctx.photoRequest('Tesla cyber taxi cab thing recently made',now).terms),['tesla','cybercab']);
 assert.deepEqual(Array.from(ctx.photoRequest('try to find a good picture of a golden retriever',now).terms),['golden','retriever']);
});

test('query wording preserves city and product names while matching normalized words',()=>{assert.equal(ctx.photoRequest('show me Paris',now).topic,'Paris');assert.equal(ctx.photoRequest('show me Texas',now).topic,'Texas')});
test('a named photo requested on the screen keeps the subject out of the studio-control trap',()=>{
 assert.deepEqual(Array.from(ctx.photoRequest('put a picture of a golden retriever on the screen',now).terms),['golden','retriever']);
});


test('a requested vehicle in the background list is not the primary parade subject',()=>{
 const r=ctx.photoRequest('Cybertruck',now);
 assert.equal(ctx.photoMatch(r,page('2026 Moscow vehicle parade, riding 23 ZAZ, Cybertruck.jpg')),-1);
 assert.ok(ctx.photoMatch(r,page('2026 Moscow vehicle parade, riding 24 Cybertruck.jpg'))>=0);
});
