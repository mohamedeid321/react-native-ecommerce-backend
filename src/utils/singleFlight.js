// Coalesce identical in-flight public reads only. No retained result, TTL, or stale-data cache.
export function createSingleFlight(maxKeys=128){
 const pending=new Map();
 return function run(key,load){
  if(pending.has(key))return pending.get(key);
  if(pending.size>=maxKeys)return Promise.resolve().then(load);
  const promise=Promise.resolve().then(load).finally(()=>{if(pending.get(key)===promise)pending.delete(key);});
  pending.set(key,promise);
  return promise;
 };
}
