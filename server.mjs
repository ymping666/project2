import http from 'node:http';
import path from 'node:path';
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url)),dist=path.join(root,'dist');
const port=Number(process.env.ONE_NOTE_PORT||4176);
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.xml':'application/xml; charset=utf-8','.txt':'text/plain; charset=utf-8'};
http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost'),pathname=decodeURIComponent(url.pathname);
  let target;
  if(pathname==='/__qa/audio')target=path.join(root,'qa','qa-audio.html');
  else if(pathname==='/__qa/storage')target=path.join(root,'qa','qa-storage.html');
  else if(pathname==='/__qa/responsive')target=path.join(root,'qa','qa-responsive.html');
  else{
   target=path.resolve(dist,'.'+pathname);
   if(target!==dist&&!target.startsWith(dist+path.sep)){res.writeHead(403);res.end('Forbidden');return;}
   if((await stat(target)).isDirectory()){
    if(!pathname.endsWith('/')){res.writeHead(301,{Location:pathname+'/'+url.search});res.end();return;}
    target=path.join(target,'index.html');
   }
  }
  const bytes=await readFile(target);res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(bytes);
 }catch{
  res.writeHead(404,{'Content-Type':'text/html; charset=utf-8'});try{res.end(await readFile(path.join(dist,'404.html')));}catch{res.end('Not found');}
 }
}).listen(port,'127.0.0.1',()=>process.stdout.write(`Local: http://127.0.0.1:${port}\n`));
