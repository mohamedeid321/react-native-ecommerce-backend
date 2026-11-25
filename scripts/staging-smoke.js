// Use only against an authorized staging deployment, not production.
const raw=process.env.STAGING_BASE_URL;
if(!raw||process.env.CONFIRM_STAGING!=="yes"){console.error("Set STAGING_BASE_URL and CONFIRM_STAGING=yes for an authorized staging deployment");process.exit(1);}
const url=new URL(raw);
if(!["https:","http:"].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.pathname!=="/")throw Error("Use an origin URL only");
const paths=["/api/health/live","/api/health/ready","/api/settings","/api/products?limit=6","/api/categories","/api/banners"];
const timings=[];let errors=0;
for(const path of paths){
 const start=performance.now();
 try{const r=await fetch(new URL(path,url),{signal:AbortSignal.timeout(10000),redirect:"error"});await r.json();if(r.status!==200)errors++;console.log(path+" "+r.status);}
 catch{errors++;console.error(path+" failed");}
 timings.push(performance.now()-start);
}
if(errors){console.error("Staging readiness failed");process.exit(1);}
const concurrency=4,perWorker=10,loadPaths=paths.slice(2);
await Promise.all(Array.from({length:concurrency},(_,worker)=>(async()=>{for(let i=0;i<perWorker;i++){
 const start=performance.now();
 try{const r=await fetch(new URL(loadPaths[(worker+i)%loadPaths.length],url),{signal:AbortSignal.timeout(10000),redirect:"error"});await r.json();if(r.status!==200)errors++;}
 catch{errors++;}
 timings.push(performance.now()-start);
}})()));
timings.sort((a,b)=>a-b);
console.log(JSON.stringify({requests:timings.length,concurrency,errors,p95Ms:Math.round(timings[Math.ceil(timings.length*.95)-1])}));
if(errors)process.exitCode=1;
