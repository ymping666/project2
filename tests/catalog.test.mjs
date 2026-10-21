import test from 'node:test';
import assert from 'node:assert/strict';
import {createCatalog,buildEntry,comparisonType,midiToFrequency,A4_REFERENCE_HZ} from '../src/catalog.mjs';
const pc=n=>(n%12+12)%12;
const expected={major:[0,4,7],minor:[0,3,7],dominant7:[0,4,7,10],minor7:[0,3,7,10],major7:[0,4,7,11],diminished:[0,3,6],augmented:[0,4,8],sus2:[0,2,7],sus4:[0,5,7],'natural-minor':[0,2,3,5,7,8,10],'minor-pentatonic':[0,3,5,7,10],'major-pentatonic':[0,2,4,7,9],'harmonic-minor':[0,2,3,5,7,8,11],'melodic-minor':[0,2,3,5,7,9,11]};
const scaleMajor=[0,2,4,5,7,9,11];
const chordTypes=['major','minor','dominant7','minor7','major7','diminished','augmented','sus2','sus4'];
const scaleTypes=['major','natural-minor','minor-pentatonic','major-pentatonic','harmonic-minor','melodic-minor'];
const tuning={guitar:[40,45,50,55,59,64],ukulele:[67,60,64,69]};
const notePc=name=>pc(({C:0,D:2,E:4,F:5,G:7,A:9,B:11})[name[0]]+[...name.slice(1)].reduce((s,a)=>s+(a==='#'?1:-1),0));
test('catalog contains 540 unique routes, every root for 9 chords and 6 scales per instrument',()=>{
 const all=createCatalog();assert.equal(all.length,540);assert.equal(new Set(all.map(e=>e.id)).size,540);assert.equal(new Set(all.map(e=>e.path)).size,540);
 for(const instrument of ['guitar','ukulele','piano']) {
  const entries=all.filter(e=>e.instrument===instrument);assert.equal(entries.length,180);assert.equal(entries.filter(e=>e.kind==='chord').length,108);assert.equal(entries.filter(e=>e.kind==='scale').length,72);
  for(const [kind,types] of [['chord',chordTypes],['scale',scaleTypes]])for(const type of types)assert.deepEqual(entries.filter(e=>e.kind===kind&&e.type===type).map(e=>e.rootPc).sort((a,b)=>a-b),Array.from({length:12},(_,i)=>i));
 }
});
test('all entries use independently reconstructed complete pitch sets and literal fret arithmetic',()=>{
 for(const e of createCatalog()) {
  const intervals=e.kind==='scale'&&e.type==='major'?scaleMajor:expected[e.type];
  const pcs=intervals.map(i=>pc(e.rootPc+i)).sort((a,b)=>a-b);
  assert.deepEqual(e.intervals,intervals,e.id);
  assert.deepEqual(e.notes.map(notePc).sort((a,b)=>a-b),pcs,e.id);
  assert.equal(e.intervalLabels.length,intervals.length);
  for(const [index,label] of e.intervalLabels.entries()){
   const degree=label.match(/^([b#]*)([1-7])$/);assert.ok(degree,e.id);
   const accidental=[...degree[1]].reduce((sum,a)=>sum+(a==='#'?1:-1),0);
   assert.equal(pc(scaleMajor[Number(degree[2])-1]+accidental),intervals[index],e.id);
   assert.equal(e.notes[index][0],'CDEFGAB'[('CDEFGAB'.indexOf(e.root[0])+Number(degree[2])-1)%7],e.id);
  }
  if(e.kind==='scale') {assert.deepEqual(e.voicings,[]);assert.deepEqual(e.playback.map(m=>m-e.playback[0]),[...intervals,12]);continue;}
  assert.equal(e.voicings.length,2);assert.notDeepEqual(e.voicings[0].midis,e.voicings[1].midis);
  assert.deepEqual(e.playback,e.voicings[0].midis);
  for(const v of e.voicings) {
   assert.deepEqual([...new Set(v.midis.map(pc))].sort((a,b)=>a-b),pcs,e.id);
   assert.equal(v.bassMidi,Math.min(...v.midis));
   const bass=v.bassNote.match(/^([A-G])([b#]*)(-?\d+)$/);assert.ok(bass,e.id);
   const spelledBass=({C:0,D:2,E:4,F:5,G:7,A:9,B:11})[bass[1]]+[...bass[2]].reduce((sum,a)=>sum+(a==='#'?1:-1),0)+12*(Number(bass[3])+1);
   assert.equal(spelledBass,v.bassMidi,e.id);
   assert.equal(v.inversion,['Root position','First inversion','Second inversion','Third inversion'][e.intervals.map(i=>pc(e.rootPc+i)).indexOf(pc(v.bassMidi))],e.id);
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
 assert.deepEqual(buildEntry('piano','chord',11,'major7').notes,['B','D#','F#','A#']);
 assert.deepEqual(buildEntry('piano','chord',0,'major7').voicings.map(v=>v.midis),[[60,64,67,71],[64,67,71,72]]);
 assert.deepEqual(buildEntry('piano','chord',1,'diminished').notes,['Db','Fb','Abb']);
 assert.deepEqual(buildEntry('piano','chord',6,'augmented').notes,['F#','A#','C##']);
 assert.deepEqual(buildEntry('piano','chord',0,'sus2').notes,['C','D','G']);
 assert.deepEqual(buildEntry('piano','chord',0,'sus4').notes,['C','F','G']);
 assert.deepEqual(buildEntry('piano','scale',1,'major-pentatonic').notes,['Db','Eb','F','Ab','Bb']);
 assert.deepEqual(buildEntry('piano','scale',8,'harmonic-minor').notes,['Ab','Bb','Cb','Db','Eb','Fb','G']);
 const melodic=buildEntry('piano','scale',6,'melodic-minor');
 assert.deepEqual(melodic.notes,['F#','G#','A','B','C#','D#','E#']);
 assert.deepEqual(melodic.playback,[66,68,69,71,73,75,77,78]);
 assert.match(melodic.typeName,/ascending/i);assert.match(melodic.symbol,/ascending/i);
});
test('all supported inline comparisons build and invalid inputs reject',()=>{
 for(const instrument of ['guitar','ukulele','piano'])for(let root=0;root<12;root++){
  for(const type of chordTypes)assert.equal(buildEntry(instrument,'chord',root,type).voicings.length,2);
  for(const type of scaleTypes)assert.equal(buildEntry(instrument,'scale',root,type).playback.at(-1)-buildEntry(instrument,'scale',root,type).playback[0],12);
 }
 for(const args of [['banjo','chord',0,'major'],['piano','bad',0,'major'],['piano','chord',12,'major'],['piano','chord',0,'constructor'],['piano','scale',0,'minor']])assert.throws(()=>buildEntry(...args));
 assert.equal(A4_REFERENCE_HZ,440);assert.equal(midiToFrequency(69),440);assert.equal(midiToFrequency(81),880);
 for(const midi of [NaN,Infinity,-1,128,69.5,'69',null,undefined])assert.throws(()=>midiToFrequency(midi),RangeError);
 assert.equal(midiToFrequency(0),440*2**(-69/12));assert.equal(midiToFrequency(127),440*2**(58/12));
});

test('comparison mappings stay in the same root/instrument and every target has a real route',()=>{
 const catalog=createCatalog(),routes=new Set(catalog.map(e=>e.path));
 const map={chord:{major:'minor',minor:'major',dominant7:'minor7',minor7:'dominant7',major7:'dominant7',diminished:'major',augmented:'major',sus2:'sus4',sus4:'sus2'},scale:{major:'natural-minor','natural-minor':'major','minor-pentatonic':'major-pentatonic','major-pentatonic':'minor-pentatonic','harmonic-minor':'natural-minor','melodic-minor':'natural-minor'}};
 for(const entry of catalog){assert.equal(comparisonType(entry),map[entry.kind][entry.type]);const other=buildEntry(entry.instrument,entry.kind,entry.rootPc,comparisonType(entry));assert.ok(routes.has(other.path));assert.notEqual(other.type,entry.type);}
 for(const invalid of [null,undefined,{}, {kind:'constructor',type:'major'}, {kind:'chord',type:'constructor'}])assert.throws(()=>comparisonType(invalid),RangeError);
});

test('legacy 120 route names and page identifiers remain available',()=>{
 const roots=['c','d-flat','d','e-flat','e','f','f-sharp','g','a-flat','a','b-flat','b'];
 const expectedOld=[];
 for(const instrument of ['guitar','ukulele','piano']){
  for(const root of roots)for(const type of ['major','minor'])expectedOld.push([instrument,'chord',root,type]);
  for(const [root,type] of [['c','dominant7'],['g','dominant7'],['d','dominant7'],['f-sharp','dominant7'],['a','minor7'],['d','minor7'],['e','minor7'],['f-sharp','minor7']])expectedOld.push([instrument,'chord',root,type]);
  for(const [root,type] of [['c','major'],['g','major'],['d','major'],['f','major'],['a','natural-minor'],['e','natural-minor'],['a','minor-pentatonic'],['e','minor-pentatonic']])expectedOld.push([instrument,'scale',root,type]);
 }
 assert.equal(expectedOld.length,120);
 const entries=new Map(createCatalog().map(e=>[e.id,e]));
 for(const [instrument,kind,root,type] of expectedOld){const id=`${instrument}-${kind}-${root}-${type}`;assert.equal(entries.get(id)?.path,`/${instrument}/${kind==='chord'?'chords':'scales'}/${root}/${type}/`);}
});
