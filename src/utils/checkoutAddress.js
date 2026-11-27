import {CITIES,GOVERNORATE,MAX_NEIGHBORHOOD} from '../config/shop.js';

const digits=value=>String(value??'').replace(/[٠-٩۰-۹]/g,d=>String(d.charCodeAt(0)-(d<='٩'?1632:1776))).trim();
export const checkoutPhone=value=>digits(value).replace(/[\s()-]/g,'').replace(/^(?:\+20|0020)/,'0');
const phonePattern=/^01[0125]\d{8}$/;

export function checkoutAddress(input){
 const data={governorate:GOVERNORATE,neighborhood:Number(digits(input?.neighborhood))};
 for(const key of ['city','building','apartment','floor','street','landmark']){
  const value=input?.[key];
  data[key]=typeof value==='string'?value.trim():'';
  if(data[key].length>(['street','landmark'].includes(key)?150:40))throw Error('راجع طول بيانات العنوان');
 }
 if(!CITIES.includes(data.city))throw Error('اختار المدينة');
 if(!Number.isInteger(data.neighborhood)||data.neighborhood<1||data.neighborhood>MAX_NEIGHBORHOOD)throw Error('اختار المجاورة');
 if(!data.building||!data.apartment||!data.floor)throw Error('أكمل رقم العمارة والدور والشقة');
 data.phone1=checkoutPhone(input?.phone1);
 data.phone2=checkoutPhone(input?.phone2);
 data.whatsapp=checkoutPhone(input?.whatsapp)||data.phone1;
 if(!phonePattern.test(data.phone1)||data.phone2&&!phonePattern.test(data.phone2))throw Error('راجع أرقام التليفون');
 if(!phonePattern.test(data.whatsapp))throw Error('راجع رقم واتساب');
 return data;
}
