import {createHmac} from 'node:crypto';
import GuestContact from '../models/guestContact.model.js';

const contactLifetime=7*24*60*60*1000;
export const guestContactExpiry=(now=Date.now())=>new Date(now+contactLifetime);
export const guestContactCutoff=(now=Date.now())=>new Date(now-contactLifetime);

export const guestPhoneFingerprint=phone=>createHmac('sha256',process.env.JWT_ACCESS_SECRET)
 .update('lotta:guest-first-order:v1:'+phone).digest('hex');

export async function attachGuestContacts(orders){
 const guestIds=orders.filter(order=>order.source==='guest'&&order.guestContactExpiresAt).map(order=>order._id);
 if(!guestIds.length)return orders;
 const contacts=await GuestContact.find({_id:{$in:guestIds},expiresAt:{$gt:new Date()}}).lean();
 const byId=new Map(contacts.map(c=>[String(c._id),c]));
 return orders.map(order=>{
  const contact=byId.get(String(order._id));
  if(!contact)return order;
  const data=typeof order.toJSON==='function'?order.toJSON():order;
  return {...data,delivery:{...data.delivery,phone1:contact.phone1,phone2:contact.phone2,whatsapp:contact.whatsapp}};
 });
}
