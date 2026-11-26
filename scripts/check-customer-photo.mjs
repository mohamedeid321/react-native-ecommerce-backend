import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import mongoose from 'mongoose';
import app from '../src/index.js';
import User from '../src/models/user.model.js';
import {connectDB} from '../src/lib/db.js';
import cloudinary from '../src/lib/cloudinary.js';
import {allowedOrigins} from '../src/middleware/browserSecurity.js';
import {getRedis} from '../src/lib/redis.js';
import {createSessionStore} from '../src/lib/sessionStore.js';

assert.equal(process.env.VERCEL_ENV,'preview','Run with preview credentials only');
await connectDB();
const server=app.listen(0,'127.0.0.1');
await new Promise(resolve=>server.once('listening',resolve));
const api='http://127.0.0.1:'+server.address().port+'/api/auth/web';
const headers={'Content-Type':'application/json','X-Lotta-CSRF':'1',Origin:[...allowedOrigins()][0]};
let user;
try{
 const unique=randomUUID(),password=randomUUID();
 user=await User.create({username:'qa-'+unique,email:unique+'@example.invalid',password,role:'customer'});
 assert.match(user.profileImage,/^https:\/\/api\.dicebear\.com\//);
 const login=await fetch(api+'/login',{method:'POST',headers,body:JSON.stringify({identifier:user.email,password})});
 assert.equal(login.status,200,'customer login');
 const cookie=login.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
 const upload=await fetch(api+'/profile/photo',{method:'PATCH',headers:{...headers,Cookie:cookie},body:JSON.stringify({photo:'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAMAAwDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDJoooryT58/9k='})});
 assert.equal(upload.status,200,'customer photo upload');
 const {profileImage}=await upload.json();
 assert.equal(new URL(profileImage).hostname,'res.cloudinary.com');
 const current=await fetch(api+'/me',{headers:{Cookie:cookie}});
 assert.equal((await current.json()).user.profileImage,profileImage);
 assert.equal((await User.findById(user.id)).profileImage,profileImage);
 console.log('Verified default avatar, customer photo upload, Mongo link and account reload');
}finally{
 if(user){
  const saved=await User.findById(user.id).select('+profileImagePublicId');
  if(saved?.profileImagePublicId)await cloudinary.uploader.destroy(saved.profileImagePublicId);
  await createSessionStore(getRedis()).revokeAll(user.id);
  await User.deleteOne({_id:user._id,email:user.email});
 }
 await new Promise(resolve=>server.close(resolve));
 await mongoose.disconnect();
 await getRedis().quit();
}
