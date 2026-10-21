import test from "node:test";
import assert from "node:assert/strict";
import { createAudioPlayer } from "../src/audio.mjs";

function fixture({ suspended = false, resume } = {}) {
  let now = 0;
  let nextHandle = 1;
  const queue = new Map();
  const events = [];
  const oscillators = [];
  const gains = [];
  const timers = {
    setTimeout(callback, delay) {
      const handle = nextHandle++;
      queue.set(handle, { due: now + Math.max(0, delay), callback });
      return handle;
    },
    clearTimeout(handle) { queue.delete(handle); },
  };
  function tick(milliseconds) {
    const target = now + milliseconds;
    for (;;) {
      const next = [...queue].filter(([, entry]) => entry.due <= target)
        .sort((a, b) => a[1].due - b[1].due || a[0] - b[0])[0];
      if (!next) break;
      now = next[1].due;
      queue.delete(next[0]);
      next[1].callback();
    }
    now = target;
  }
  function parameter() {
    return {
      calls: [],
      setValueAtTime(value, time) { this.calls.push(["set", value, time]); },
      linearRampToValueAtTime(value, time) { this.calls.push(["ramp", value, time]); },
      cancelScheduledValues(time) { this.calls.push(["cancel", time]); },
    };
  }
  const context = {
    state: suspended ? "suspended" : "running",
    destination: {},
    get currentTime() { return now / 1000; },
    async resume() {
      if (resume) await resume();
      this.state = "running";
    },
    createOscillator() {
      const oscillator = {
        frequency: parameter(), type: "sine", disconnected: false, stopCalls: [],
        connect(node) { this.connectedTo = node; },
        disconnect() { this.disconnected = true; },
        start(time) { this.startAt = time; },
        stop(time) { this.stopAt = time; this.stopCalls.push(time); },
      };
      oscillators.push(oscillator);
      return oscillator;
    },
    createGain() {
      const gain = {
        gain: parameter(), disconnected: false,
        connect(node) { this.connectedTo = node; },
        disconnect() { this.disconnected = true; },
      };
      gains.push(gain);
      return gain;
    },
  };
  let creations = 0;
  const player = createAudioPlayer({
    onState: (event) => events.push(event),
    contextFactory: () => { creations += 1; return context; },
    timers,
  });
  return {
    player, context, oscillators, gains, queue, events, tick,
    get creations() { return creations; },
    liveVoices() { return oscillators.filter((oscillator) => !oscillator.disconnected); },
  };
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const chord={id:'a',mode:'chord',midis:[42,49,52,58]},scale={id:'s',mode:'scale',midis:[60,62,64,65,67,69,71,72]};
test('native chord and ascending scale schedules use audio-clock times, not UI timer synthesis',async()=>{
 const f=fixture();assert.equal(f.creations,0);await f.player.play([chord,scale]);assert.equal(f.creations,1);assert.equal(f.oscillators.length,12);
 assert.ok(f.oscillators.every(o=>o.type==='triangle'));
 const expected=[92.4986056779086,138.59131548843604,164.81377845643496,233.08188075904496];
 expected.forEach((hz,i)=>assert.ok(Math.abs(f.oscillators[i].frequency.calls[0][1]-hz)<1e-9));
 assert.deepEqual(f.oscillators.slice(0,4).map(o=>o.startAt),[.01,.01,.01,.01]);
 f.oscillators.slice(4).forEach((o,i)=>{assert.ok(Math.abs(o.startAt-(1.16+i*.2))<1e-9);assert.ok(Math.abs(o.stopAt-o.startAt-.26)<1e-9);});
 f.tick(5000);assert.equal(f.liveVoices().length,0);assert.equal(f.queue.size,0);assert.equal(f.events.at(-1).reason,'completed');
 assert.deepEqual(f.events.filter(e=>e.id==='s').map(e=>e.midis),scale.midis.map(m=>[m]));
});
test('stop cancels current and future notes across20rapid runs with one context',async()=>{
 const f=fixture();for(let i=0;i<20;i++){await f.player.play([scale,chord]);f.tick(30);f.player.stop();assert.equal(f.liveVoices().length,0);assert.equal(f.queue.size,0);assert.equal(f.events.at(-1).reason,'stopped');}
 const count=f.events.length;f.tick(100000);assert.equal(f.events.length,count);assert.equal(f.creations,1);
});
test('A440 reference is a finite sine and replaces either mode without stacking',async()=>{
 const f=fixture();await f.player.play([scale]);const old=[...f.oscillators];await f.player.playReference();assert.ok(old.every(o=>o.disconnected));assert.equal(f.liveVoices().length,1);const ref=f.liveVoices()[0];assert.equal(ref.type,'sine');assert.equal(ref.frequency.calls[0][1],440);assert.equal(ref.stopAt-ref.startAt,1.5);f.tick(10);assert.equal(f.events.at(-1).referenceHz,440);
 await f.player.play([chord]);assert.equal(ref.disconnected,true);assert.equal(f.liveVoices().length,4);f.tick(4000);assert.equal(f.liveVoices().length,0);assert.equal(f.events.at(-1).reason,'completed');
});
test('stale pending resume cannot restart stopped audio or override the latest request',async()=>{
 const gate=deferred(),f=fixture({suspended:true,resume:()=>gate.promise});const old=f.player.play([scale]);f.player.stop();gate.resolve();await old;assert.equal(f.oscillators.length,0);
 const gate2=deferred(),g=fixture({suspended:true,resume:()=>gate2.promise});const a=g.player.play([scale]),b=g.player.playReference();gate2.resolve();await Promise.all([a,b]);assert.equal(g.oscillators.length,1);assert.equal(g.oscillators[0].type,'sine');g.player.stop();
});
test('invalid data fails before context creation and rejected resume cleans resources',async()=>{
 const f=fixture();for(const value of [null,[],[chord,chord,chord],[{...chord,mode:'noise'}],[{...chord,midis:[NaN]}],[{...chord,midis:[128]}],[{...chord,midis:[]}],[{...chord,midis:Array(9).fill(60)}]]){await assert.rejects(f.player.play(value));assert.equal(f.events.at(-1).phase,'error');}assert.equal(f.creations,0);
 const g=fixture({suspended:true,resume:async()=>{throw Error('denied');}});await assert.rejects(g.player.play([chord]),/denied/);assert.equal(g.queue.size,0);assert.equal(g.liveVoices().length,0);
});
test('input sequences are snapshotted before an asynchronous resume',async()=>{
 const gate=deferred(),f=fixture({suspended:true,resume:()=>gate.promise});const mutable={id:'original',mode:'chord',midis:[60,64,67]};const pending=f.player.play([mutable]);mutable.midis[0]=1;mutable.id='changed';gate.resolve();await pending;assert.ok(Math.abs(f.oscillators[0].frequency.calls[0][1]-261.6255653005986)<1e-9);f.tick(10);assert.equal(f.events.at(-1).id,'original');f.player.stop();
});
