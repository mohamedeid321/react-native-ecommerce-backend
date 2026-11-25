// Local admission control: Mongo transactions and unique indexes remain the correctness boundary across instances.
export function createCheckoutGate({limit=4,maxQueued=256,waitMs=5000}={}){
 let active=0;
 const queue=[];
 const releaseFor=()=>{
  let released=false;
  return ()=>{
   if(released)return;
   released=true;
   const next=queue.shift();
   if(next){clearTimeout(next.timer);next.resolve(releaseFor());}
   else active--;
  };
 };
 return {
  acquire(){
   if(active<limit){active++;return Promise.resolve(releaseFor());}
   if(queue.length>=maxQueued)return Promise.resolve(null);
   return new Promise(resolve=>{
    const entry={resolve,timer:null};
    entry.timer=setTimeout(()=>{
     const index=queue.indexOf(entry);
     if(index>=0){queue.splice(index,1);resolve(null);}
    },waitMs);
    queue.push(entry);
   });
  }
 };
}
export const checkoutGate=createCheckoutGate();
