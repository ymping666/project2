import { createAudioPlayer } from './audio.mjs';
const dataNode=document.getElementById('page-data');
let data;
try {data=JSON.parse(dataNode?.textContent||'{}');}catch {data={};}
document.documentElement.classList.add('js');

function setupLibrary(){
  const form=document.querySelector('.filters'); if(!form)return;
  form.addEventListener('submit',event=>event.preventDefault());
  const search=document.getElementById('search'),instrument=document.getElementById('instrument-filter'),kind=document.getElementById('kind-filter'),root=document.getElementById('root-filter'),type=document.getElementById('type-filter'),cards=[...document.querySelectorAll('[data-catalog-entry]')],more=document.getElementById('show-more'),progress=document.getElementById('catalog-progress');
  let limit=60;
  function filter(reset=true){
    if(reset)limit=60;
    const query=search.value.trim().toLowerCase().replaceAll('♯','#').replaceAll('♭','b');let matches=0,shown=0;
    for(const card of cards){const match=(!instrument.value||card.dataset.instrument===instrument.value)&&(!kind.value||card.dataset.kind===kind.value)&&(!root.value||card.dataset.root===root.value)&&(!type.value||card.dataset.type===type.value)&&query.split(/\s+/).every(part=>card.dataset.search.includes(part));if(match)matches++;const show=match&&shown<limit;card.hidden=!show;if(show)shown++;}
    document.getElementById('result-count').textContent=`${matches} ${matches===1?'study':'studies'} match your filters`;
    document.getElementById('no-results').hidden=matches!==0;
    more.hidden=shown>=matches;more.textContent=`Show next ${Math.min(60,matches-shown)} studies`;
    progress.textContent=matches?`Showing ${shown} of ${matches}. All studies are available through these filters.`:'';
  }
  form.addEventListener('input',()=>filter());form.addEventListener('change',()=>filter());form.addEventListener('reset',()=>setTimeout(()=>filter(),0));more.addEventListener('click',()=>{limit+=60;filter(false);});filter();
}

function setupNoteFinder(){
  const form=document.getElementById('note-finder-form');if(!form)return;
  form.addEventListener('submit',event=>{
    event.preventDefault();const input=document.getElementById('note-input').value.trim(),status=document.getElementById('finder-status'),results=document.getElementById('finder-results');results.replaceChildren();
    const tokens=input.replaceAll('♯','#').replaceAll('♭','b').split(/[\s,]+/).filter(Boolean),pcs=[];
    if(!tokens.length){status.textContent='Enter at least one note, such as C E G.';return;}
    for(const token of tokens){const match=token.match(/^([A-Ga-g])([#b]{0,2})(-?\d)?$/);if(!match){status.textContent=`“${token}” is not a note name. Use A–G, optional # or b, and an optional octave.`;return;}const natural={C:0,D:2,E:4,F:5,G:7,A:9,B:11}[match[1].toUpperCase()],acc=[...match[2]].reduce((sum,c)=>sum+(c==='#'?1:-1),0);pcs.push((natural+acc+12)%12);}
    const wanted=[...new Set(pcs)].sort((a,b)=>a-b).join(','),matches=(data.catalog||[]).filter(entry=>[...new Set(entry.pitchClasses)].sort((a,b)=>a-b).join(',')===wanted);
    status.textContent=matches.length?`${matches.length} exact pitch-class ${matches.length===1?'match':'matches'} in this ${data.instrument?'instrument ':''}library. Octave and inversion are ignored.`:'No exact note-set match in this library. Try C E G, or explore the complete studies above.';
    for(const entry of matches){const link=document.createElement('a');link.href=entry.path;link.textContent=`${entry.title} ↗`;results.append(link);}
  });
}

function setupStudy(){
  if(!data.entry||!data.comparison)return;
  const entries={a:data.entry,b:data.comparison},positions={a:0,b:0};
  document.querySelectorAll('[data-voicing]').forEach(button=>button.addEventListener('click',()=>{
    const side=button.dataset.side,index=Number(button.dataset.voicing);positions[side]=index;
    const card=document.querySelector(`[data-study="${side}"]`);
    card.querySelectorAll('[data-voicing]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    card.querySelectorAll('[data-position]').forEach(section=>{section.dataset.active=String(Number(section.dataset.position)===index);if(section.tagName==='DETAILS')section.open=Number(section.dataset.position)===index;});
    player.stop();
  }));
  const status=document.getElementById('audio-status');
  const player=createAudioPlayer({onState(state){
    document.querySelectorAll('[data-study]').forEach(card=>{if(state.phase==='playing'&&state.id===card.dataset.study)card.setAttribute('data-playing','true');else card.removeAttribute('data-playing');});
    status.dataset.phase=state.phase;
    const label=state.referenceHz?'A4 reference':state.id?`Study ${state.id.toUpperCase()}`:'Audio';
    status.textContent=state.phase==='error'?`Sound could not start. ${state.error||state.reason||'Try pressing play again.'}`:state.phase==='starting'?'Preparing sound…':state.phase==='playing'?`${label} playing${state.referenceHz?' · 440 Hz':''}. Press Stop to end playback.`:'Playback stopped. Ready for another listen.';
  }});
  function sequence(side){const entry=entries[side];return {id:side,midis:entry.kind==='chord'?entry.voicings[positions[side]].midis:entry.playback,mode:entry.kind};}
  document.querySelectorAll('[data-play]').forEach(button=>button.addEventListener('click',()=>{const target=button.dataset.play;Promise.resolve(player.play(target==='ab'?[sequence('a'),sequence('b')]:[sequence(target)])).catch(()=>{});}));
  document.getElementById('stop-audio').addEventListener('click',()=>player.stop());
  document.getElementById('reference-audio').addEventListener('click',()=>Promise.resolve(player.playReference()).catch(()=>{}));
  window.addEventListener('pagehide',()=>player.stop());
  document.addEventListener('visibilitychange',()=>{if(document.hidden)player.stop();});
  setupPractice(data.entry,data.comparison);
}

function setupPractice(entry,comparison){
  const quiz=document.getElementById('quiz'),key=`one-note:practice:v1:${entry.id}`;
  const storage=new URLSearchParams(location.search).get('storage')==='off'?{getItem(){throw Error('Storage disabled for local QA');},setItem(){throw Error('Storage disabled for local QA');},removeItem(){throw Error('Storage disabled for local QA');}}:{getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value),removeItem:key=>localStorage.removeItem(key)};
  const common=entry.notes.filter(note=>comparison.notes.includes(note));
  const questions=[
    {prompt:`Which list contains the notes of ${entry.symbol}?`,options:[entry.notes.join(' · '),comparison.notes.join(' · '),'C · D · F# · G#'],answer:0,explain:`${entry.symbol} contains ${entry.notes.join(', ')}. The degrees are ${entry.intervalLabels.join(', ')}.`},
    {prompt:`What is the root of this ${entry.kind}?`,options:[entry.notes[1],entry.root,entry.notes[entry.notes.length-1]],answer:1,explain:`${entry.root} is degree 1, the reference note for every interval in this ${entry.kind}.`},
    {prompt:`Which note belongs to both ${entry.symbol} and ${comparison.symbol}?`,options:['No notes are shared',common[0]||entry.root,'Every note is shared'],answer:1,explain:`The shared notes are ${common.join(', ')}. Listen for them while the other notes change.`},
    {prompt:entry.kind==='chord'?'What determines the inversion of a chord?':entry.instrument==='piano'?'What is the distance between adjacent piano keys, including black keys?':'What does fret 0 mean on a string instrument?',options:entry.kind==='chord'?['The loudest note','The highest note','The lowest sounding note']:entry.instrument==='piano'?['One semitone','One octave','One whole tone']:['An open, sounding string','A muted string','A note outside the scale'],answer:entry.kind==='chord'?2:0,explain:entry.kind==='chord'?'The actual bass is the lowest sounding pitch. String order alone does not determine it, especially on a high-G ukulele.':entry.instrument==='piano'?'Adjacent keys, counting both black and white keys, are one semitone apart. Twelve semitones make an octave.':'Fret 0 means an open string. A cross (×) means the string is muted and does not sound.'}
  ];
  let answers=[],warning='',begun=false;
  try {const raw=storage.getItem(key);if(raw!==null){const saved=JSON.parse(raw);if(saved.version!==1||!Array.isArray(saved.answers)||saved.answers.length>4||saved.answers.some((a,i)=>!Number.isInteger(a)||a<0||a>=questions[i].options.length))throw Error('Invalid saved practice');answers=saved.answers;begun=answers.length>0;}}
  catch {warning='Saved progress could not be read. This visit starts fresh; practice still works.';}
  function save(){try{storage.setItem(key,JSON.stringify({version:1,answers}));}catch{warning='Browser storage is unavailable. Your answers work for this visit.';}}
  function el(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
  function button(text,className,callback){const b=el('button',text,className);b.type='button';b.addEventListener('click',callback);return b;}
  function reset(){answers=[];begun=true;try{storage.removeItem(key);}catch{warning='Browser storage is unavailable. Your answers work for this visit.';}render();}
  function render(index=answers.length){
    quiz.replaceChildren();
    if(!begun){quiz.append(el('h3','Ready to notice the difference?'),el('p','Four questions about the notes and diagrams in this study.'),button('Start practice ↗','dark-button',()=>{begun=true;render();}));}
    else if(index>=4){const score=answers.filter((a,i)=>a===questions[i].answer).length;quiz.append(el('div','Practice complete','quiz-top'),el('h3','A closer look, one note at a time.'),el('p',`${score} / 4`,'quiz-score'),el('p','Revisit the diagrams, compare the sounds, or try the questions again.'),button('Reset practice','outline-button',reset));}
    else {const q=questions[index],chosen=answers[index],answered=chosen!==undefined;const top=el('div',`Question ${index+1} of 4`,'quiz-top');top.append(button('Reset practice','text-button',reset));quiz.append(top,el('h3',q.prompt));const options=el('div',undefined,'quiz-options');q.options.forEach((option,i)=>{const b=button(option,'quiz-option',()=>{answers[index]=i;save();render(index);});b.disabled=answered;if(answered&&i===q.answer)b.classList.add('correct');if(answered&&i===chosen&&i!==q.answer)b.classList.add('incorrect');options.append(b);});quiz.append(options);if(answered){const message=el('div',`${chosen===q.answer?'Correct.':'Take another look.'} ${q.explain}`,'feedback');message.setAttribute('role','status');quiz.append(message,button(index===3?'See your result ↗':'Next question →','dark-button',()=>render(index+1)));}}
    quiz.append(el('p',warning||'Progress is saved on this browser for this page.','small-muted'));
  }
  render();
}
setupLibrary();
setupNoteFinder();
setupStudy();
