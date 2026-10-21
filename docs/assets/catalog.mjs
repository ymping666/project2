export const A4_REFERENCE_HZ = 440;
export function midiToFrequency(midi) {
  if (!Number.isInteger(midi) || midi < 0 || midi > 127) throw new RangeError('MIDI must be an integer from 0 to 127');
  return A4_REFERENCE_HZ * 2 ** ((midi - 69) / 12);
}
const ROOTS = ['C','Db','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
const SLUGS = ['c','d-flat','d','e-flat','e','f','f-sharp','g','a-flat','a','b-flat','b'];
const NATURAL = {C:0,D:2,E:4,F:5,G:7,A:9,B:11};
const LETTERS = 'CDEFGAB';
const TYPES = {
  chord: {
    major: [[0,4,7],[1,3,5],['1','3','5'],'Major',''],
    minor: [[0,3,7],[1,3,5],['1','b3','5'],'Minor','m'],
    dominant7: [[0,4,7,10],[1,3,5,7],['1','3','5','b7'],'Dominant seventh','7'],
    minor7: [[0,3,7,10],[1,3,5,7],['1','b3','5','b7'],'Minor seventh','m7'],
    major7: [[0,4,7,11],[1,3,5,7],['1','3','5','7'],'Major seventh','maj7'],
    diminished: [[0,3,6],[1,3,5],['1','b3','b5'],'Diminished','dim'],
    augmented: [[0,4,8],[1,3,5],['1','3','#5'],'Augmented','aug'],
    sus2: [[0,2,7],[1,2,5],['1','2','5'],'Suspended second','sus2'],
    sus4: [[0,5,7],[1,4,5],['1','4','5'],'Suspended fourth','sus4'],
  },
  scale: {
    major: [[0,2,4,5,7,9,11],[1,2,3,4,5,6,7],['1','2','3','4','5','6','7'],'Major',' major'],
    'natural-minor': [[0,2,3,5,7,8,10],[1,2,3,4,5,6,7],['1','2','b3','4','5','b6','b7'],'Natural minor',' natural minor'],
    'minor-pentatonic': [[0,3,5,7,10],[1,3,4,5,7],['1','b3','4','5','b7'],'Minor pentatonic',' minor pentatonic'],
    'major-pentatonic': [[0,2,4,7,9],[1,2,3,5,6],['1','2','3','5','6'],'Major pentatonic',' major pentatonic'],
    'harmonic-minor': [[0,2,3,5,7,8,11],[1,2,3,4,5,6,7],['1','2','b3','4','5','b6','7'],'Harmonic minor',' harmonic minor'],
    'melodic-minor': [[0,2,3,5,7,9,11],[1,2,3,4,5,6,7],['1','2','b3','4','5','6','7'],'Melodic minor (ascending)',' melodic minor (ascending)'],
  },
};
const TUNINGS = { guitar:[40,45,50,55,59,64], ukulele:[67,60,64,69], piano:[] };
const mod = n => (n % 12 + 12) % 12;
function spell(root, rootPc, intervals, degrees) {
  const start = LETTERS.indexOf(root[0]);
  return intervals.map((interval,i) => {
    const letter = LETTERS[(start + degrees[i] - 1) % 7];
    let delta = mod(rootPc + interval - NATURAL[letter]);
    if (delta > 6) delta -= 12;
    return letter + (delta < 0 ? 'b'.repeat(-delta) : '#'.repeat(delta));
  });
}
function describe(midis, frets, pcs, notes) {
  const bassMidi = Math.min(...midis);
  const index = pcs.indexOf(mod(bassMidi));
  const name = notes[index];
  // Octaves follow the spelled letter: B#3 is the pitch C4.
  const accidental = [...name.slice(1)].reduce((n,c)=>n+(c==='#'?1:-1),0);
  const octave = (bassMidi - NATURAL[name[0]] - accidental) / 12 - 1;
  return {frets,midis,bassMidi,bassNote:name+octave,inversion:['Root position','First inversion','Second inversion','Third inversion'][index]};
}
function stringVoicings(tuning, pcs, notes) {
  const candidates = [];
  const options = tuning.map(open => [null,...Array.from({length:13},(_,i)=>i).filter(f=>pcs.includes(mod(open+f)))]);
  // Prune a partial stretch before enumerating its remaining strings. This
  // retains the same complete candidate set and ordering as the 120-page MVP.
  function visit(frets, minimum = Infinity, maximum = -Infinity) {
    if (frets.length < tuning.length) {
      for (const f of options[frets.length]) {
        const low = f === null || f === 0 ? minimum : Math.min(minimum, f);
        const high = f === null || f === 0 ? maximum : Math.max(maximum, f);
        if (high - low <= 4) visit([...frets,f], low, high);
      }
      return;
    }
    const midis = frets.flatMap((f,i)=>f===null?[]:[tuning[i]+f]);
    if (midis.length < 3 || pcs.some(pc=>!midis.some(m=>mod(m)===pc))) return;
    const stopped = frets.filter(f=>f!==null&&f>0);
    if (stopped.length && Math.max(...stopped)-Math.min(...stopped)>4) return;
    candidates.push(describe(midis,frets,pcs,notes));
  }
  visit([]);
  candidates.sort((a,b)=> Number(mod(a.bassMidi)!==pcs[0])-Number(mod(b.bassMidi)!==pcs[0]) || Math.max(...a.frets.map(f=>f??0))-Math.max(...b.frets.map(f=>f??0)) || a.frets.reduce((s,f)=>s+(f??0),0)-b.frets.reduce((s,f)=>s+(f??0),0) || JSON.stringify(a.frets).localeCompare(JSON.stringify(b.frets)));
  if (candidates.length < 2) throw new Error('Insufficient complete voicings');
  const seen = new Set();
  const distinct = candidates.filter(v=>{const key=v.midis.join(',');if(seen.has(key))return false;seen.add(key);return true;});
  if (distinct.length < 2) throw new Error('Insufficient distinct pitch voicings');
  return distinct.slice(0,2);
}
/** Mathematical pitch examples; no human playability or ease certification. */
export function buildEntry(instrument, kind, rootPc, type) {
  if (!Object.hasOwn(TUNINGS,instrument)) throw new RangeError('Unknown instrument');
  if (!Object.hasOwn(TYPES,kind) || !Object.hasOwn(TYPES[kind],type)) throw new RangeError('Unknown kind or type');
  if (!Number.isInteger(rootPc)||rootPc<0||rootPc>11) throw new RangeError('Invalid root pitch class');
  const [intervals,degrees,intervalLabels,typeName,suffix] = TYPES[kind][type];
  const root = ROOTS[rootPc], rootSlug = SLUGS[rootPc];
  const notes = spell(root,rootPc,intervals,degrees);
  const pcs = intervals.map(i=>mod(rootPc+i));
  const base = (instrument==='guitar'?48:60)+rootPc;
  let voicings=[];
  if (kind==='chord') {
    if (instrument==='piano') {
      const rootPosition = intervals.map(i=>base+i);
      voicings = [describe(rootPosition,[],pcs,notes),describe([...rootPosition.slice(1),rootPosition[0]+12],[],pcs,notes)];
    } else voicings = stringVoicings(TUNINGS[instrument],pcs,notes);
  }
  const playback = kind==='scale'?[...intervals.map(i=>base+i),base+12]:[...voicings[0].midis];
  const path = `/${instrument}/${kind==='chord'?'chords':'scales'}/${rootSlug}/${type}/`;
  return {id:`${instrument}-${kind}-${rootSlug}-${type}`,kind,instrument,root,rootPc,rootSlug,type,typeName,symbol:root+suffix,path,notes,intervals:[...intervals],intervalLabels:[...intervalLabels],voicings,playback};
}
export function createCatalog() {
  return Object.keys(TUNINGS).flatMap(instrument=>Object.entries(TYPES).flatMap(([kind,types])=>
    ROOTS.flatMap((_,pc)=>Object.keys(types).map(type=>buildEntry(instrument,kind,pc,type)))));
}

/** Related same-root examples; inline comparison states are not extra routes. */
export function comparisonType(entry) {
  const comparisons = {
    chord: {major:'minor',minor:'major',dominant7:'minor7',minor7:'dominant7',major7:'dominant7',diminished:'major',augmented:'major',sus2:'sus4',sus4:'sus2'},
    scale: {major:'natural-minor','natural-minor':'major','minor-pentatonic':'major-pentatonic','major-pentatonic':'minor-pentatonic','harmonic-minor':'natural-minor','melodic-minor':'natural-minor'},
  };
  if (!Object.hasOwn(comparisons,entry?.kind) || !Object.hasOwn(comparisons[entry.kind],entry?.type)) throw new RangeError('Unknown comparison kind or type');
  return comparisons[entry.kind][entry.type];
}
