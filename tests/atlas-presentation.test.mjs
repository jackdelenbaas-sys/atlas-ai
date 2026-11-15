import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {presentationFit,presentationSize} from '../atlas-presentation.mjs';
import {parseStudioRequest,normalizeStudioCommands} from '../atlas-studio-controls.mjs';
test('portrait and wide photos keep their full aspect with a thin frame',()=>{
 for(const ratio of [.4,.66,1,1.5,2.8]){const size=presentationSize(ratio);assert.ok(Math.abs(size.width/size.height-ratio)<1e-9);assert.ok(size.height<=1.55);assert.ok(size.width<=1.85+1e-9)}
});
test('camera fits complete screens and avatar above the composer on narrow and wide views',()=>{
 for(const aspect of [.4,.7,1,1.8])for(const width of [1,2,4]){
  const bounds={min:{x:-1.4,y:0,z:-.3},max:{x:width,y:2.8,z:.2}},f=presentationFit(bounds,aspect,35),tan=Math.tan(35*Math.PI/360),near=f.distance-.25;
  for(const x of [bounds.min.x,bounds.max.x])assert.ok(Math.abs((x-f.x)/(near*tan*aspect))<.87);
  for(const y of [bounds.min.y,bounds.max.y]){const projected=(y-f.y)/(near*tan);assert.ok(projected<.8);assert.ok(projected>-.55)}
 }
});
test('return to normal preserves content and follow-up resizing stays local',()=>{
 assert.deepEqual(parseStudioRequest('return to normal'),[{type:'normal'}]);assert.deepEqual(normalizeStudioCommands([{type:'normal'}]),[{type:'normal'}]);
 assert.equal(parseStudioRequest('even bigger',{screen:{width:2,height:1}})[0].width,2.6);
});
test('playing an already-running clip preserves its phase even when forced',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');let resets=0;
 const action={isRunning:()=>true,reset:()=>{resets++;throw Error('Restarted running clip')}};
 const c=vm.createContext({mixamoMixer:{clipAction:()=>action},mixamoCurrent:action,clipFor:()=>({})});
 vm.runInContext(html.slice(html.indexOf('function playMixamo('),html.indexOf('// Reusable actions')),c);
 assert.equal(c.playMixamo('idle',true),true);assert.equal(resets,0);
 assert.match(html,/title:'Atlas response',returnHome:false/);assert.match(html,/if\(run.show.returnHome===false\)/);
});
