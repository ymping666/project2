import {readFile,stat,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createCatalog} from './src/catalog.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),dist=path.join(root,'dist'),failures=[];
const assert=(condition,message)=>{if(!condition)failures.push(message);};
const run=spawnSync(process.execPath,['--test','tests/catalog.test.mjs','tests/audio.test.mjs','tests/site.test.mjs'],{cwd:root,encoding:'utf8',shell:false});
if(run.status!==0)failures.push(`Tests failed: ${run.stderr}\n${run.stdout}`);
const entries=createCatalog();let totalBytes=0,fileCount=0,htmlCount=0,linkCount=0;
async function crawl(dir){for(const item of await readdir(dir,{withFileTypes:true})){const full=path.join(dir,item.name);if(item.isDirectory())await crawl(full);else{fileCount++;totalBytes+=(await stat(full)).size;if(item.name.endsWith('.html'))htmlCount++;}}}
await crawl(dist);
const titles=new Set(),descriptions=new Set();
for(const entry of entries){
 const file=path.join(dist,entry.path,'index.html'),html=await readFile(file,'utf8');
 const title=html.match(/<title>([\s\S]*?)<\/title>/)?.[1],description=html.match(/<meta name="description" content="([^"]*)"/)?.[1];
 assert(title&&!titles.has(title),`Missing/duplicate title: ${entry.path}`);titles.add(title);
 assert(description&&!descriptions.has(description),`Missing/duplicate description: ${entry.path}`);descriptions.add(description);
 assert((html.match(/<h1[\s>]/g)||[]).length===1,`Expected one h1: ${entry.path}`);
 assert(html.includes('<svg'),`Missing static diagram: ${entry.path}`);
 assert(html.includes('noindex,nofollow')||html.includes('rel="canonical"'),`Missing local/prod indexing policy: ${entry.path}`);
 assert(!/https?:\/\/[^"'\s]+\.(?:mjs|js|css|mp3|wav)/i.test(html),`Remote asset: ${entry.path}`);
 for(const match of html.matchAll(/(?:href|src)="([^"#]+)(?:#[^"]*)?"/g)){
  const link=match[1];if(!link.startsWith('/'))continue;linkCount++;
  const dest=path.resolve(dist,'.'+link.split('?')[0]);assert(dest===dist||dest.startsWith(dist+path.sep),`Escaped link ${link}`);
  try{const s=await stat(dest);if(s.isDirectory())await stat(path.join(dest,'index.html'));}catch{failures.push(`Broken local link ${link} in ${entry.path}`);}
 }
}
for(const hub of ['','guitar','ukulele','piano']){
 const html=await readFile(path.join(dist,hub,'index.html'),'utf8');
 for(const entry of entries.filter(e=>!hub||e.instrument===hub))assert(html.includes(`href="${entry.path}"`),`Hub ${hub} misses ${entry.path}`);
}
assert(entries.length===540,'Catalog is not540 content pages');
assert(totalBytes<35*1024*1024,'Static output exceeds35MiB');
const report={scope:'Local Node/data/build/link validation; browser UI/PCM are separate.',test_exit:run.status,content_pages:entries.length,per_instrument:Object.fromEntries(['guitar','ukulele','piano'].map(i=>[i,entries.filter(e=>e.instrument===i).length])),html_files:htmlCount,total_files:fileCount,total_bytes:totalBytes,checked_content_links:linkCount,unique_content_titles:titles.size,unique_content_descriptions:descriptions.size,failures,pass:failures.length===0};
process.stdout.write(JSON.stringify(report,null,2)+'\n');if(failures.length)process.exitCode=1;
