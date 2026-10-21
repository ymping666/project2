import {midiToFrequency,A4_REFERENCE_HZ} from './catalog.mjs';

const CHORD_SECONDS=.9,REFERENCE_SECONDS=1.5,SCALE_STEP_SECONDS=.2,SCALE_NOTE_SECONDS=.26,GAP_SECONDS=.25,LEAD_SECONDS=.01;

export function createAudioPlayer({onState=()=>{},contextFactory=()=>new (globalThis.AudioContext||globalThis.webkitAudioContext)(),timers=globalThis}={}){
 let context=null,generation=0,active=false;
 const voices=new Set(),pending=new Set();
 const emit=(phase,id=null,midis=[],extra={})=>onState({phase,id,midis:[...midis],...extra});
 const now=()=>Number.isFinite(context?.currentTime)?context.currentTime:0;
 function dispose(voice,stop=true){
  voice.oscillator.onended=null;
  if(stop){try{voice.gain.gain.cancelScheduledValues(now());voice.gain.gain.setValueAtTime(0,now());voice.oscillator.stop(now());}catch{/* Closed or already stopped. */}}
  try{voice.oscillator.disconnect();}catch{}
  try{voice.gain.disconnect();}catch{}
  voices.delete(voice);
 }
 function clear(){for(const timer of pending)timers.clearTimeout(timer);pending.clear();for(const voice of [...voices])dispose(voice);}
 function interrupt(reason,notify=false){const wasActive=active;generation++;active=false;clear();if(wasActive||notify)emit('idle',null,[],{reason});return generation;}
 function schedule(token,time,callback){const handle=timers.setTimeout(()=>{pending.delete(handle);if(token===generation&&active)callback();},Math.max(0,(time-now())*1000));pending.add(handle);}
 function voice(midi,start,duration,reference=false){
  const oscillator=context.createOscillator();let gain;
  try{gain=context.createGain();}catch(error){try{oscillator.disconnect();}catch{}throw error;}
  const item={oscillator,gain};voices.add(item);oscillator.onended=()=>dispose(item,false);
  oscillator.type=reference?'sine':'triangle';oscillator.frequency.setValueAtTime(midiToFrequency(midi),start);
  gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.05,start+.015);gain.gain.linearRampToValueAtTime(.04,start+.09);
  gain.gain.setValueAtTime(.04,start+Math.max(.09,duration-.2));gain.gain.linearRampToValueAtTime(0,start+duration);
  oscillator.connect(gain);gain.connect(context.destination);oscillator.start(start);oscillator.stop(start+duration);
 }
 function validate(sequence){
  if(!Array.isArray(sequence)||sequence.length<1||sequence.length>2)throw new TypeError('Expected one or two playback items.');
  return sequence.map(item=>{
   if(!item||typeof item.id!=='string'||!item.id||!['chord','scale'].includes(item.mode)||!Array.isArray(item.midis)||item.midis.length<1||item.midis.length>(item.mode==='chord'?8:25)||item.midis.some(m=>!Number.isInteger(m)||m<0||m>127))throw new TypeError('Invalid playback item or MIDI note.');
   return {id:item.id,mode:item.mode,midis:[...item.midis]};
  });
 }
 async function start(sequence,reference=false){
  const token=interrupt('interrupted');
  try{
   const items=reference?[{id:null,mode:'reference',midis:[69]}]:validate(sequence);
   active=true;emit('starting');
   if(!context||context.state==='closed')context=contextFactory();
   if(context.state!=='running')await context.resume();
   if(token!==generation||!active)return;
   if(context.state!=='running')throw new Error('Audio context did not start.');
   let cursor=now()+LEAD_SECONDS;
   items.forEach((item,index)=>{
    const duration=reference?REFERENCE_SECONDS:item.mode==='scale'?(item.midis.length-1)*SCALE_STEP_SECONDS+SCALE_NOTE_SECONDS:CHORD_SECONDS;
    if(item.mode==='scale'){
     item.midis.forEach((m,i)=>{const at=cursor+i*SCALE_STEP_SECONDS;voice(m,at,SCALE_NOTE_SECONDS);schedule(token,at,()=>emit('playing',item.id,[m]));});
    }else{
     item.midis.forEach(m=>voice(m,cursor,duration,reference));
     schedule(token,cursor,()=>emit('playing',item.id,item.midis,reference?{referenceHz:A4_REFERENCE_HZ}:{}));
    }
    if(index<items.length-1)schedule(token,cursor+duration,()=>emit('playing'));
    cursor+=duration+(index<items.length-1?GAP_SECONDS:0);
   });
   schedule(token,cursor+.02,()=>{generation++;active=false;clear();emit('idle',null,[],{reason:'completed'});});
  }catch(error){if(token!==generation)return;generation++;active=false;clear();const message=error instanceof Error?error.message:String(error);emit('error',null,[],{error:message});throw error;}
 }
 return {play:sequence=>start(sequence),playReference:()=>start(null,true),stop:()=>interrupt('stopped',true)};
}
