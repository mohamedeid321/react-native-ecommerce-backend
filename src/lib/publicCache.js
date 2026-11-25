import {createHash,randomUUID} from "node:crypto";
import {getRedis} from "./redis.js";
import {createSingleFlight} from "../utils/singleFlight.js";

const prefix=()=> "lotta:public-cache:v1:"+(process.env.PUBLIC_CACHE_NAMESPACE||"shop")+":";
const ALLOWED=new Set(["catalog","search","categories"]);
const READ=`local v=redis.call('GET',KEYS[1]) or '0'; local raw=redis.call('GET',KEYS[2]); return {v,raw or ''}`;
const WRITE=`local v=redis.call('GET',KEYS[1]) or '0'; if v~=ARGV[1] then return 0 end; redis.call('SET',KEYS[2],ARGV[2],'PX',ARGV[3]); return 1`;
const generationKey=ns=>prefix()+ns+":generation";
export function createPublicCache({redis=getRedis,enabled=()=>process.env.PUBLIC_CACHE_ENABLED==="1",timeoutMs=150,now=Date.now}={}){
 const flight=createSingleFlight(128);
 let blockedUntil=0;
 const metrics={hits:0,misses:0,bypasses:0,errors:0};
 const call=async fn=>{
  let timer;
  try{return await Promise.race([Promise.resolve().then(()=>fn(redis())),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error("Cache timeout")),timeoutMs);})]);}
  catch(e){blockedUntil=now()+1000;metrics.errors++;throw e;}
  finally{clearTimeout(timer);}
 };
 return {
  async read(ns,key,ttlMs,load){
   if(!ALLOWED.has(ns)||!Number.isInteger(ttlMs)||ttlMs<1||ttlMs>30000)throw Error("Invalid public cache policy");
   if(!enabled()){metrics.bypasses++;return load();}
   const digest=createHash("sha256").update(key).digest("hex");
   // Fixed-size namespace: 64 slots. Collisions are misses, never another key's data.
   const slot=prefix()+ns+":slot:"+(parseInt(digest.slice(0,2),16)%64);
   return flight(ns+":"+digest,async()=>{
    if(now()<blockedUntil){metrics.bypasses++;return load();}
    let generation,raw;
    try{[generation,raw]=await call(r=>r.eval(READ,2,generationKey(ns),slot));}
    catch{metrics.bypasses++;return load();}
    if(raw){try{const entry=JSON.parse(raw);if(entry.key===digest&&entry.generation===generation&&entry.expiresAt>now()){metrics.hits++;return entry.value;}}catch{}}
    metrics.misses++;
    const started=now();
    const value=await load();
    const remaining=ttlMs-(now()-started);
    if(remaining>0){
     try{
      const raw=JSON.stringify({key:digest,generation,expiresAt:started+ttlMs,value});
      if(Buffer.byteLength(raw)<=64*1024)await call(r=>r.eval(WRITE,2,generationKey(ns),slot,generation,raw,remaining));
     }catch{}
    }
    return value;
   });
  },
  async invalidate(...namespaces){
   if(!enabled())return;
   for(const ns of namespaces){
    if(!ALLOWED.has(ns))throw Error("Invalid public cache namespace");
    try{await call(r=>r.set(generationKey(ns),randomUUID()));}catch{}
   }
  },
  stats(){return {...metrics};}
 };
}
export const publicCache=createPublicCache();
