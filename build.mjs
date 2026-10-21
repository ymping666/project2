import { mkdir,writeFile,copyFile,rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createCatalog,buildEntry } from './src/catalog.mjs';
import { renderCatalog,renderEntry,renderInfo,render404,comparisonType,lightEntry } from './src/render.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const dist=path.join(here,'dist');
const baseIndex=process.argv.indexOf('--base-url');
let baseURL;
if(baseIndex!==-1){
  const input=process.argv[baseIndex+1];if(!input)throw Error('--base-url requires an actual https origin');
  const url=new URL(input);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/'||/^(localhost|127\.|example\.|.*\.example$)/i.test(url.hostname))throw Error('Use a real HTTPS origin, without a path, credentials, query or fragment.');baseURL=url.origin;
}
const catalog=createCatalog();
if(catalog.length!==120||new Set(catalog.map(c=>c.path)).size!==120)throw Error('Expected exactly 120 unique studies');
const expectedDist=path.resolve(here,'dist');
if(path.resolve(dist)!==expectedDist||path.relative(here,dist)!=='dist'||path.dirname(dist)!==here)throw Error('Unsafe output directory');
await rm(dist,{recursive:true,force:true});await mkdir(path.join(dist,'assets'),{recursive:true});
for(const asset of ['app.mjs','styles.css','audio.mjs','catalog.mjs'])await copyFile(path.join(here,'src',asset),path.join(dist,'assets',asset));
async function page(route,html){const file=route.endsWith('.html')?path.join(dist,route):path.join(dist,route,'index.html');await mkdir(path.dirname(file),{recursive:true});await writeFile(file,html);}
await page('/',renderCatalog(catalog,null,baseURL));
for(const instrument of ['guitar','ukulele','piano'])await page(`/${instrument}/`,renderCatalog(catalog,instrument,baseURL));
for(const entry of catalog){const comparison=buildEntry(entry.instrument,entry.kind,entry.rootPc,comparisonType(entry));await page(entry.path,renderEntry(entry,comparison,catalog,baseURL));}
for(const info of ['about','methodology','privacy'])await page(`/${info}/`,renderInfo(info,baseURL));
await page('/404.html',render404());
await writeFile(path.join(dist,'manifest.json'),JSON.stringify({name:'One Note',edition:'local',page_count:120,total_html_pages:128,entries:catalog.map(lightEntry)},null,2));
await writeFile(path.join(dist,'robots.txt'),baseURL?`User-agent: *\nAllow: /\nSitemap: ${baseURL}/sitemap.xml\n`:'User-agent: *\nDisallow: /\n');
if(baseURL){const routes=['/','/guitar/','/ukulele/','/piano/','/about/','/methodology/','/privacy/',...catalog.map(c=>c.path)];const xmlEscape=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');await writeFile(path.join(dist,'sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${routes.map(route=>`<url><loc>${xmlEscape(baseURL+route)}</loc></url>`).join('')}</urlset>\n`);}
console.log(`Built ${catalog.length} studies, 3 instrument hubs and 5 supporting HTML files in ${dist}`);
