import {createHmac,timingSafeEqual} from 'node:crypto';

const maxAge=30*24*60*60*1000;
export const trackingCutoff=()=>new Date(Date.now()-maxAge);

export function guestTrackingToken(order,key=order.checkoutKey){
 const secret=process.env.JWT_ACCESS_SECRET;
 if(order.source!=='guest'||!key||!secret||!order.createdAt||new Date(order.createdAt)<trackingCutoff())return '';
 return createHmac('sha256',secret).update('lotta:guest-tracking:v1:'+order.orderNumber+':'+key).digest('hex');
}

export function matchesGuestToken(expected,received){
 return /^[a-f0-9]{64}$/.test(expected)&&typeof received==='string'&&/^[a-f0-9]{64}$/.test(received)&&
  timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(received,'hex'));
}
