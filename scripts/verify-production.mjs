import assert from 'node:assert/strict';
const origin='https://www.servepointpos.com';
const checks=[
 ['/',200,'Your restaurant POS.'],
 ['/contact',200,'/contact.js'],
 ['/blog/restaurant-management-software',200,'A five-step test before you switch'],
 ['/blog/software-hosteleria-tpv',200,'Checklist antes de cambiar'],
 ['/sitemap.xml',200,'https://www.servepointpos.com/blog/restaurant-management-software</loc>'],
 ['/home.css',200,'--paper:#faf9f5'],
 ['/site.js',200,'servepoint_conversion'],
 ['/contact.js',200,'result.success !== true'],
 ['/blog/restaurant-management-software.html',308,'/blog/restaurant-management-software'],
 ['/fr/',308,'/fr'],
];
await Promise.all(checks.map(async([route,status,expected])=>{
 const response=await fetch(origin+route,{redirect:'manual',signal:AbortSignal.timeout(30000)});
 assert.equal(response.status,status,route);
 if(status===308)assert.equal(new URL(response.headers.get('location'),origin).pathname,expected,route);
 else assert.ok((await response.text()).includes(expected),route+' contains the deployed rebuild');
 console.log(`${status} ${route} verified`);
}));
