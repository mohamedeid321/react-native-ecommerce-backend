import assert from 'node:assert/strict';
import {randomUUID,randomInt} from 'node:crypto';
import mongoose from 'mongoose';
import app from '../src/index.js';
import User from '../src/models/user.model.js';
import DeliveryInfo from '../src/models/deliveryInfo.model.js';
import SavedAddress from '../src/models/savedAddress.model.js';
import {connectDB} from '../src/lib/db.js';
import {allowedOrigins} from '../src/middleware/browserSecurity.js';
import {getRedis} from '../src/lib/redis.js';
import {createSessionStore} from '../src/lib/sessionStore.js';

assert.equal(process.env.VERCEL_ENV,'preview');
await connectDB();
const server=app.listen(0,'127.0.0.1');
await new Promise(resolve=>server.once('listening',resolve));
const base='http://127.0.0.1:'+server.address().port+'/api';
const headers={Origin:[...allowedOrigins()].find(v=>v.startsWith('https://')),'Content-Type':'application/json','X-Lotta-CSRF':'1'};
const request=(path,method,body)=>fetch(base+path,{method,headers,body:body?JSON.stringify(body):undefined});
const id=randomUUID();
let user;
try{
 const password=randomUUID(),email=id+'@example.invalid';
 user=await User.create({username:'qa-'+id,email,password,role:'customer'});
 const login=await request('/auth/web/login','POST',{identifier:email,password});
 assert.equal(login.status,200);
 headers.Cookie=login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
 const phone='010'+String(randomInt(10000000,99999999));
 const update={name:'اختبار العميل',email:id+'-updated@example.invalid',phone,currentPassword:password};
 assert.equal((await request('/auth/web/profile','PATCH',{...update,currentPassword:'wrong'})).status,403);
 assert.equal((await request('/auth/web/profile','PATCH',update)).status,200);
 const home={city:'15 مايو',neighborhood:28,building:'1',floor:'2',apartment:'3',phone1:phone};
 const path='/delivery-info';
 for(const building of ['1','2','1'])assert.equal((await request(path,'PUT',{...home,building})).status,200);
 const book=await (await request(path,'GET')).json();
 assert.equal(book.addresses.length,2);
 assert.equal(book.addresses[0].building,'1');
 assert.notEqual(book.addresses[0].key,book.addresses[1].key);
 // Capture only the test mailbox delivery. No external message is sent.
 const originalFetch=globalThis.fetch;
 let token;
 process.env.RESEND_API_KEY='test-only';process.env.RESET_FROM_EMAIL='test@example.invalid';
 globalThis.fetch=(url,opts)=>{
  if(url!=='https://api.resend.com/emails')return originalFetch(url,opts);
  const mail=JSON.parse(opts.body);assert.deepEqual(mail.to,[update.email]);
  token=mail.text.match(/#reset=([a-f0-9]{64})/)[1];return Promise.resolve(new Response('{}'));
 };
 try{
  assert.equal((await request('/auth/web/password/forgot','POST',{email:update.email})).status,200);
  assert.ok(token);
  const next=randomUUID(),body={token,password:next};
  assert.equal((await request('/auth/web/password/reset','POST',body)).status,200);
  assert.equal((await request('/auth/web/password/reset','POST',body)).status,400);
  assert.equal((await request('/auth/web/me','GET')).status,401);
  assert.equal((await request('/auth/web/login','POST',{identifier:update.email,password:next})).status,200);
 }finally{globalThis.fetch=originalFetch}
 console.log('Verified customer identity edits, address deduplication, one-use password reset and session revocation');
}finally{
 if(user){
  await DeliveryInfo.deleteOne({user:user._id});await SavedAddress.deleteMany({user:user._id});
  await createSessionStore(getRedis()).revokeAll(user.id);await User.deleteOne({_id:user._id,username:'qa-'+id});
 }
 await new Promise(resolve=>server.close(resolve));await mongoose.disconnect();await getRedis().quit();
}
