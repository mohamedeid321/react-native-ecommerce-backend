export function scheduledDeliveryDate(now=new Date()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat("en-GB",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",hourCycle:"h23"}).formatToParts(now).map(p=>[p.type,p.value]));
 const date=new Date(Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day)+(Number(parts.hour)>=22?2:1)));
 return date.toISOString().slice(0,10);
}
