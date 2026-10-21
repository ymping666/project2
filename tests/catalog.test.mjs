import test from 'node:test';
import assert from 'node:assert/strict';
import {createCatalog,buildEntry,midiToFrequency,A4_REFERENCE_HZ} from '../src/catalog.mjs';
const pc=n=>(n%12+12)%12;
const expected={major:[0,4,7],minor:[0,3,7],dominant7:[0,4,7,10],minor7:[0,3,7,10],'natural-minor':[0,2,3,5,7,8,10],'minor-pentatonic':[0,3,5,7,10]};
const scaleMajor=[0,2,4,5,7,9,11];
const tuning={guitar:[40,45,50,55,59,64],ukulele:[67,60,64,69]};
const notePc=name=>pc(({C:0,D:2,E:4,F:5,G:7,A:9,B:11})[name[0]]+[...name.slice(1)].reduce((s,a)=>s+(a==='#'?1:-1),0));
test('catalog contains exactly 120 unique routes, 40 per instrument',()=>{
 const all=createCatalog();assert.equal(all.length,120);assert.equal(new Set(all.map(e=>e.id)).size,120);assert.equal(new Set(all.map(e=>e.path)).size,120);
 for(const instrument of ['guitar','ukulele','piano']) {const entries=all.filter(e=>e.instrument===instrument);assert.equal(entries.length,40);assert.equal(entries.filter(e=>e.kind==='scale').length,8);}
});
test('all entries use independently reconstructed complete pitch sets and literal fret arithmetic',()=>{
 for(const e of createCatalog()) {
  const intervals=e.kind==='scale'&&e.type==='major'?scaleMajor:expected[e.type];
  const pcs=intervals.map(i=>pc(e.rootPc+i)).sort((a,b)=>a-b);
  assert.deepEqual(e.notes.map(notePc).sort((a,b)=>a-b),pcs,e.id);
  if(e.kind==='scale') {assert.deepEqual(e.voicings,[]);assert.deepEqual(e.playback.map(m=>m-e.playback[0]),[...intervals,12]);continue;}
  assert.equal(e.voicings.length,2);assert.notDeepEqual(e.voicings[0].midis,e.voicings[1].midis);
  assert.deepEqual(e.playback,e.voicings[0].midis);
  for(const v of e.voicings) {
   assert.deepEqual([...new Set(v.midis.map(pc))].sort((a,b)=>a-b),pcs,e.id);
   assert.equal(v.bassMidi,Math.min(...v.midis));
   if(e.instrument==='piano'){assert.deepEqual(v.frets,[]);continue;}
   assert.equal(v.frets.length,tuning[e.instrument].length);
   assert(v.frets.every(f=>f===null||(Number.isInteger(f)&&f>=0&&f<=12)));
   assert.deepEqual(v.midis,v.frets.flatMap((f,i)=>f===null?[]:[tuning[e.instrument][i]+f]));
   assert(v.midis.length>=3);
   const stopped=v.frets.filter(f=>f!==null&&f>0);assert(Math.max(...stopped)-Math.min(...stopped)<=4);
  }
 }
});
test('high G uses actual minimum, with independent known C major pitches',()=>{
 const e=buildEntry('ukulele','chord',0,'major');
 const v=e.voicings.find(v=>v.midis[0]>v.bassMidi);assert(v,'high G example must expose reentrant ordering');
 assert.equal(v.bassMidi,60);assert.equal(v.bassNote,'C4');
 assert.deepEqual(v.frets,[0,0,0,null]);assert.deepEqual(v.midis,[67,60,64]);
});
test('known piano answers and diatonic spelling',()=>{
 const c=buildEntry('piano','chord',0,'major');assert.deepEqual(c.voicings.map(v=>v.midis),[[60,64,67],[64,67,72]]);assert.equal(c.voicings[1].inversion,'First inversion');assert.equal(c.voicings[1].bassNote,'E4');
 assert.deepEqual(buildEntry('guitar','chord',6,'major').notes,['F#','A#','C#']);
 assert.deepEqual(buildEntry('piano','chord',1,'minor').notes,['Db','Fb','Ab']);
 assert.deepEqual(buildEntry('piano','scale',6,'major').notes,['F#','G#','A#','B','C#','D#','E#']);
});
test('all supported inline comparisons build and invalid inputs reject',()=>{
 for(const instrument of ['guitar','ukulele','piano'])for(let root=0;root<12;root++){
  for(const type of ['major','minor','dominant7','minor7'])assert.equal(buildEntry(instrument,'chord',root,type).voicings.length,2);
  for(const type of ['major','natural-minor','minor-pentatonic'])assert.equal(buildEntry(instrument,'scale',root,type).playback.at(-1)-buildEntry(instrument,'scale',root,type).playback[0],12);
 }
 for(const args of [['banjo','chord',0,'major'],['piano','bad',0,'major'],['piano','chord',12,'major'],['piano','chord',0,'constructor'],['piano','scale',0,'minor']])assert.throws(()=>buildEntry(...args));
 assert.equal(A4_REFERENCE_HZ,440);assert.equal(midiToFrequency(69),440);assert.equal(midiToFrequency(81),880);
 for(const midi of [NaN,Infinity,-1,128,69.5,'69',null,undefined])assert.throws(()=>midiToFrequency(midi),RangeError);
 assert.equal(midiToFrequency(0),440*2**(-69/12));assert.equal(midiToFrequency(127),440*2**(58/12));
});
