import {readFileSync as read,readdirSync,existsSync,statSync} from 'node:fs';
import assert from 'node:assert/strict';
const base='https://www.servepointpos.com';
const files=['index.html','contact.html','privacy.html','terms.html',...['blog','fr','es','ar'].flatMap(dir=>readdirSync(dir).filter(f=>f.endsWith('.html')).map(f=>dir+'/'+f))];
const errors=[];
function resolve(p){for(const f of [p.slice(1),p.slice(1)+'.html',p.slice(1)+'/index.html'])if(existsSync(f)&&statSync(f).isFile())return f;if(p==='/')return 'index.html';}
for(const file of files){
 const html=read(file,'utf8');
 const canonical=html.match(/rel="canonical" href="([^"]+)"/);
 if(!canonical){errors.push(file+': missing canonical');continue;}
 const url=new URL(canonical[1]);
 if(url.pathname!== '/' && (/\.html$|\/$/.test(url.pathname))) errors.push(file+': redirecting canonical');
 if(resolve(url.pathname)!==file)errors.push(file+': canonical points to wrong file');
 for(const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)){
  try{JSON.parse(match[1]);}catch{errors.push(file+': invalid structured data');}
 }
 for(const match of html.matchAll(/(?:href|src)="([^"]+)"/g)){
  if(!match[1] || /^(data:|mailto:|tel:|javascript:)/.test(match[1]))continue;
  const link=new URL(match[1],canonical[1]);
  if(link.origin!==base)continue;
  const resolved=resolve(link.pathname);
  if(!resolved){errors.push(file+': broken link '+match[1]);continue;}
  if(link.hash && resolved.endsWith('.html')){
   const id=decodeURIComponent(link.hash.slice(1));
   if(!read(resolved,'utf8').includes(`id="${id}"`))errors.push(file+': missing anchor '+match[1]);
  }
 }
}
const sitemap=read('sitemap.xml','utf8');
const locs=[...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>m[1]);
assert.equal(new Set(locs).size,locs.length,'Duplicate sitemap entries');
for(const loc of locs){const p=new URL(loc).pathname;if(!resolve(p))errors.push('Sitemap missing page '+p);if(p!=='/'&&/\.html$|\/$/.test(p))errors.push('Sitemap redirect '+p);}
if(errors.length){console.error([...new Set(errors)].join('\n'));process.exitCode=1;}else console.log(`SEO checks passed: ${files.length} pages, ${locs.length} sitemap URLs, structured data, local links and anchors.`);
