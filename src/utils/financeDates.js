export const cairoDate=(date=new Date())=>new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit"}).format(date);
export const validDate=d=>typeof d==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
export const shiftDay=(date,days)=>new Date(Date.parse(date)+days*86400000).toISOString().slice(0,10);
// Binary search for the first instant of a Cairo calendar date, including DST transitions.
export function cairoDayStart(day){
 let lo=Date.parse(day)-86400000,hi=Date.parse(day)+86400000;
 while(lo<hi){const mid=Math.floor((lo+hi)/2);if(cairoDate(new Date(mid))<day)lo=mid+1;else hi=mid;}
 return new Date(lo);
}
export function financeRange(query={}){
 const today=cairoDate(),range=query.range??"day";
 const end=query.to??today;
 const start=query.from??(validDate(end)?shiftDay(end,range==="week"?-6:range==="month"?-29:0):null);
 if(!["day","week","month","custom"].includes(range)||!validDate(start)||!validDate(end)||start>end||(Date.parse(end)-Date.parse(start))/86400000>365||(range==="custom"&&(!query.from||!query.to)))return null;
 return {from:start,to:end,start:cairoDayStart(start),end:cairoDayStart(shiftDay(end,1))};
}
