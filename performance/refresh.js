import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {getRedis} from '../src/lib/redis.js';
import {createSessionStore} from '../src/lib/sessionStore.js';
if(process.env.CI!=='true'||process.env.MONGO_URI!=='mongodb://127.0.0.1:27017/lotta_performance'||process.env.REDIS_URL!=='redis://127.0.0.1:6379')throw Error('Isolated CI only');
const f=JSON.parse(await readFile('performance/fixture.json','utf8'));
const store=createSessionStore(getRedis());
const agent=new http.Agent({keepAlive:true,maxSockets:50,maxTotalSockets:1000});
function request(path,method,cookie,localAddress){return new Promise((resolve,reject)=>{
const req=http.request({host:'127.0.0.1',port:3000,path:'/api/auth/web/'+path,method,localAddress,agent,headers:{Cookie:cookie,Origin:'http://localhost:5173','X-Lotta-CSRF':'1','Content-Type':'application/json','Content-Length':0}},res=>{let body='';res.on('data',d=>body+=d);res.on('end',()=>resolve({status:res.statusCode,cookies:res.headers['set-cookie']||[],body}));});
req.setTimeout(10000,()=>req.destroy(Error('request timed out')));req.on('error',reject);req.end();});}
const cookie=(r,name)=>r.cookies.find(c=>c.startsWith(name+'='))?.split(';')[0];
try{
assert.equal(f.accounts.length,1000);
const accounts=await Promise.all(f.accounts.map(async(a,i)=>({id:a.id,ip:'127.0.0.'+(2+Math.floor(i/50)),refresh:(await store.create(a.id)).refreshToken})));
const timings=[];const started=performance.now();
const rotated=await Promise.all(accounts.map(async a=>{const t=performance.now();const r=await request('refresh','POST','lotta_refresh='+a.refresh,a.ip);timings.push(performance.now()-t);assert.equal(r.status,200);assert.equal(JSON.parse(r.body).user.id,a.id);const access=cookie(r,'lotta_access'),refresh=cookie(r,'lotta_refresh');assert.ok(access&&refresh);assert.notEqual(refresh,'lotta_refresh='+a.refresh);return {...a,access,rotated:refresh};}));
const elapsed=performance.now()-started;timings.sort((a,b)=>a-b);const p95=timings[Math.ceil(timings.length*.95)-1];
await Promise.all(rotated.map(async a=>{const r=await request('me','GET',a.access,a.ip);assert.equal(r.status,200);assert.equal(JSON.parse(r.body).user.id,a.id);}));
const a=rotated[0];assert.equal((await request('refresh','POST','lotta_refresh='+a.refresh,a.ip)).status,401);assert.equal((await request('me','GET',a.access,a.ip)).status,401);
for(let i=0;i<9;i++)assert.equal((await request('refresh','POST','lotta_refresh=invalid',a.ip)).status,401);
assert.equal((await request('refresh','POST','lotta_refresh=invalid',a.ip)).status,429);
console.log('REFRESH_BENCHMARK '+JSON.stringify({sessions:rotated.length,sourceIPs:20,refreshP95Ms:Math.round(p95),refreshRps:Math.round(1000000/elapsed),unexpectedErrors:0,rotatedSessionChecks:1000,reuseRejected:true,rateLimitPreserved:true}));
assert.ok(p95<2000,'refresh p95 must be below 2 seconds');
}finally{agent.destroy();await getRedis().quit();}
