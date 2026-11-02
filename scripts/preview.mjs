import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();
const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.webp':'image/webp','.png':'image/png','.xml':'application/xml','.txt':'text/plain'};
http.createServer(async(req,res)=>{
 try {
  const url=new URL(req.url,'http://localhost');
  const requested=decodeURIComponent(url.pathname);
  const target=path.resolve(root,'.'+requested);
  if(!target.startsWith(root+path.sep)&&target!==root){res.writeHead(403).end();return;}
  if(requested!=='/'&&(requested.endsWith('/')||requested.endsWith('.html'))){
   const clean=requested.replace(/\/index\.html$/,'/').replace(/\.html$/,'').replace(/\/$/,'')||'/';
   res.writeHead(308,{Location:clean+url.search}).end();return;
  }
  let file;
  for(const candidate of [target,target+'.html',path.join(target,'index.html')]){
   if(await stat(candidate).then(s=>s.isFile()).catch(()=>false)){file=candidate;break;}
  }
  if(!file){res.writeHead(404).end('Not found');return;}
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});
  res.end(await readFile(file));
 }catch{res.writeHead(400).end('Bad request');}
}).listen(Number(process.env.PORT)||4173,'127.0.0.1',()=>console.log('Preview: http://127.0.0.1:4173'));
