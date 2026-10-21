import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createCatalog,buildEntry} from '../src/catalog.mjs';
import {comparisonType,renderDiagram,safeJSON,renderEntry,entryTitle} from '../src/render.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist');
const catalog=createCatalog();
const read=route=>readFile(path.join(dist,route.endsWith('.html')?route:path.join(route,'index.html')),'utf8');
const pages=await Promise.all(['/',...['guitar','ukulele','piano','about','methodology','privacy'].map(p=>`/${p}/`),...catalog.map(c=>c.path),'/404.html'].map(async route=>({route,html:await read(route)})));

test('120 indexable study routes and exactly 128 generated HTML pages',async()=>{
  assert.equal(catalog.length,120);assert.equal(new Set(catalog.map(e=>e.path)).size,120);
  for(const instrument of ['guitar','ukulele','piano']){const entries=catalog.filter(e=>e.instrument===instrument);assert.equal(entries.length,40);assert.equal(entries.filter(e=>e.kind==='chord').length,32);assert.equal(entries.filter(e=>e.kind==='scale').length,8);}
  async function countHtml(dir){let count=0;for(const file of await readdir(dir,{withFileTypes:true}))count+=file.isDirectory()?await countHtml(path.join(dir,file.name)):Number(file.name.endsWith('.html'));return count;}
  assert.equal(await countHtml(dist),128);
  const manifest=JSON.parse(await readFile(path.join(dist,'manifest.json'),'utf8'));assert.equal(manifest.page_count,120);assert.equal(manifest.entries.length,120);assert.deepEqual(manifest.entries.map(e=>e.path),catalog.map(e=>e.path));
});

test('every page has a distinct title, description, a single h1 and accessible main',()=>{
  const titles=new Set(),descriptions=new Set();
  for(const {route,html} of pages){assert.match(html,/^<!doctype html><html lang="en">/);const title=html.match(/<title>([^<]+)<\/title>/)?.[1],description=html.match(/<meta name="description" content="([^"]+)"/)[1];assert.ok(title,route);assert.ok(description.length>35,route);assert.equal((html.match(/<h1>/g)||[]).length,1,route);assert.match(html,/<main id="main"/);assert.ok(!titles.has(title),`Duplicate title ${title}`);assert.ok(!descriptions.has(description),`Duplicate description ${description}`);titles.add(title);descriptions.add(description);assert.match(html,/name="viewport" content="width=device-width,initial-scale=1"/);}
});

test('all links and static module imports resolve within the output',async()=>{
  for(const {route,html} of pages){for(const match of html.matchAll(/(?:href|src)="([^"]+)"/g)){const href=match[1];if(href.startsWith('#')){assert.ok(html.includes(`id="${href.slice(1)}"`),`${route} missing anchor ${href}`);continue;}assert.ok(href.startsWith('/'),`Unexpected external or relative asset ${href} in ${route}`);const pathname=href.split(/[?#]/)[0];await access(path.join(dist,pathname,pathname.endsWith('/')?'index.html':''));}}
  const app=await readFile(path.join(dist,'assets/app.mjs'),'utf8');for(const match of app.matchAll(/from '([^']+)'/g)){assert.ok(match[1].startsWith('./'));await access(path.join(dist,'assets',match[1]));}assert.doesNotMatch(app,/\bfetch\s*\(|https?:\/\//);
});

test('local build is excluded from crawling and invents no canonical domain',async()=>{
  for(const {html} of pages){assert.match(html,/name="robots" content="noindex,nofollow"/);assert.doesNotMatch(html,/rel="canonical"|property="og:url"|https?:\/\/example/);}
  assert.equal(await readFile(path.join(dist,'robots.txt'),'utf8'),'User-agent: *\nDisallow: /\n');await assert.rejects(access(path.join(dist,'sitemap.xml')));
});

test('every study embeds complete parseable data and useful diagrams without JavaScript',()=>{
  for(const entry of catalog){const html=pages.find(p=>p.route===entry.path).html;const script=html.match(/<script id="page-data" type="application\/json">([\s\S]*?)<\/script>/)?.[1];assert.ok(script);const data=JSON.parse(script);assert.deepEqual(data.entry,entry);assert.equal(data.catalog.length,120);assert.equal(data.comparison.rootPc,entry.rootPc);assert.equal(data.comparison.instrument,entry.instrument);assert.equal(data.comparison.type,comparisonType(entry));assert.ok(html.includes(entryTitle(entry)));assert.ok(html.includes('role="img"'));for(const note of entry.notes)assert.ok(html.includes(`<strong>${note}</strong>`),`${entry.id} missing ${note}`);if(entry.kind==='chord'){assert.ok(html.includes('data-position="1"'));assert.ok(html.includes('Actual bass: '+entry.voicings[0].bassNote));}else assert.ok(html.includes('all matching positions')||entry.instrument==='piano');}
});

test('all rendered fretboard dots independently match string tuning, fret and chord or scale pitches',()=>{
  const tunings={guitar:[40,45,50,55,59,64],ukulele:[67,60,64,69]};
  for(const entry of catalog.filter(c=>c.instrument!=='piano'))for(let position=0;position<(entry.kind==='chord'?2:1);position++){
    const html=renderDiagram(entry,position),dots=[...html.matchAll(/<circle data-midi="(\d+)" data-fret="(\d+)" data-string="(\d+)"/g)].map(match=>({midi:Number(match[1]),fret:Number(match[2]),string:Number(match[3])})),tuning=tunings[entry.instrument];
    const expected=[];tuning.forEach((open,index)=>{for(let fret=0;fret<=12;fret++){if(entry.kind==='chord'?entry.voicings[position].frets[index]===fret:entry.intervals.some(interval=>(entry.rootPc+interval)%12===(open+fret)%12))expected.push({midi:open+fret,fret,string:tuning.length-index});}});
    assert.deepEqual(dots,expected,`${entry.id} position ${position}`);assert.match(html,/× muted, 0 open/);assert.match(html,/numbers are frets 0–12/);
  }
});

test('piano keyboard has all 48 chromatic keys with the exact sounding MIDI notes selected',()=>{
  for(const entry of catalog.filter(c=>c.instrument==='piano'))for(let position=0;position<(entry.kind==='chord'?2:1);position++){
    const html=renderDiagram(entry,position),keys=[...html.matchAll(/<rect[^>]+data-midi="(\d+)" data-active="(true|false)"/g)];assert.equal(keys.length,48);assert.deepEqual(keys.map(k=>Number(k[1])).sort((a,b)=>a-b),Array.from({length:48},(_,i)=>i+48));const selected=keys.filter(k=>k[2]==='true').map(k=>Number(k[1])).sort((a,b)=>a-b);assert.deepEqual(selected,[...new Set(entry.kind==='chord'?entry.voicings[position].midis:entry.playback)].sort((a,b)=>a-b),entry.id);
  }
});

test('safe embedded JSON cannot break out of its script element',()=>{
  const original={text:'</script><script>alert("bad")</script> & <>'};const serialized=safeJSON(original);assert.doesNotMatch(serialized,/[<>&]/);assert.deepEqual(JSON.parse(serialized),original);
});

test('enharmonic roots are searchable and note finder has real pitch-class metadata',()=>{
  const html=pages[0].html;for(const alias of ['c#','db','d#','eb','f#','gb','g#','ab','a#','bb'])assert.ok(html.includes(alias),alias);assert.ok(html.includes('id="note-finder-form"'));const data=JSON.parse(html.match(/<script id="page-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);assert.equal(data.catalog.length,120);for(const entry of data.catalog)assert.ok(entry.pitchClasses.every(pc=>Number.isInteger(pc)&&pc>=0&&pc<=11));
});

test('Cb sounding notes use the scientific octave of the written letter',()=>{
  const entry=buildEntry('piano','chord',8,'minor'),comparison=buildEntry('piano','chord',8,'major');const html=renderEntry(entry,comparison,catalog);assert.ok(entry.notes.includes('Cb'));assert.match(html,/Cb[45]/);for(const voicing of entry.voicings)for(const midi of voicing.midis.filter(m=>m%12===11)){const octave=(midi-(-1))/12-1;assert.ok(html.includes(`Cb${octave}`),`Expected Cb${octave} for MIDI ${midi}`);}
});
