import {randomBytes,createHash} from 'node:crypto';
import bcrypt from 'bcryptjs';
import User from '../models/user.model.js';
import {normalizePhone} from './webAuth.controller.js';
import {getRedis} from '../lib/redis.js';
import {createSessionStore} from '../lib/sessionStore.js';
const emailOk=email=>typeof email==='string' && email.length<=254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const hash=value=>createHash('sha256').update(value).digest('hex');

export async function updateCustomer(req,res){
 if(req.user.role!=='customer')return res.sendStatus(403);
 const {name,email,phone,currentPassword}=req.body??{};
 const normalized=normalizePhone(phone);
 if(typeof name!=='string'||name.trim().length<2||name.length>80||!emailOk(email)||!normalized)return res.status(400).json({message:'راجع الاسم والبريد ورقم الهاتف'});
 const user=await User.findById(req.user.id);
 const contactChanged=user.email!==email.trim().toLowerCase()||user.phone!==normalized;
 if(contactChanged && (typeof currentPassword!=='string'||Buffer.byteLength(currentPassword)>72||!await user.comparePassword(currentPassword)))return res.status(403).json({message:'أدخل كلمة المرور الحالية لتغيير بيانات الدخول'});
 user.displayName=name.trim();user.email=email.trim().toLowerCase();user.phone=normalized;
 if(contactChanged){user.resetDigest=undefined;user.resetExpires=undefined;}
 try{await user.save()}catch(e){if(e.code===11000)return res.status(409).json({message:'البريد أو الهاتف مستخدم بالفعل'});throw e}
 res.json({user:{id:user.id,username:user.username,displayName:user.displayName,email:user.email,phone:user.phone,role:user.role,profileImage:user.profileImage}});
}

export async function forgotPassword(req,res){
 if(!process.env.RESEND_API_KEY||!process.env.RESET_FROM_EMAIL)return res.status(503).json({message:'إرسال بريد الاسترجاع غير متاح حاليًا'});
 const {email}=req.body??{};
 if(!emailOk(email))return res.status(400).json({message:'اكتب بريدًا صحيحًا'});
 const token=randomBytes(32).toString('hex'),resetDigest=hash(token);
 const origin=(process.env.CLIENT_URL||'').split(',').map(x=>x.trim()).find(x=>x===req.get('origin')&&x.startsWith('https://'));
 if(!origin)return res.sendStatus(403);
 const user=await User.findOneAndUpdate({email:email.trim().toLowerCase(),role:'customer',disabled:{$ne:true}},{$set:{resetDigest,resetExpires:new Date(Date.now()+15*60000)}});
 if(user){
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.RESET_FROM_EMAIL,to:[user.email],subject:'استرجاع كلمة مرور لقطة',text:'لتغيير كلمة المرور خلال ١٥ دقيقة افتح الرابط التالي:\n'+origin+'/login#reset='+token}),signal:AbortSignal.timeout(8000)}).catch(()=>null);
  if(!response?.ok){await User.updateOne({_id:user._id,resetDigest},{$unset:{resetDigest:1,resetExpires:1}});console.error('Password reset delivery failed');}
 }
 res.json({message:'لو البريد مسجّل، هيوصلك رابط استرجاع صالح لمدة ١٥ دقيقة.'});
}
export async function resetPassword(req,res){
 const {token,password}=req.body??{};
 if(typeof token!=='string'||!/^\w{64}$/.test(token)||typeof password!=='string'||password.length<12||Buffer.byteLength(password)>72)return res.status(400).json({message:'راجع الرابط وكلمة المرور (١٢ حرفًا على الأقل)'});
 const filter={role:'customer',disabled:{$ne:true},resetDigest:hash(token),resetExpires:{$gt:new Date()}};
 const user=await User.findOne(filter).select('_id');
 if(!user)return res.status(400).json({message:'الرابط انتهى أو اتستخدم قبل كده'});
 await createSessionStore(getRedis()).revokeAll(user.id);
 const result=await User.updateOne({...filter,_id:user._id},{$set:{password:await bcrypt.hash(password,10),passwordChangedAt:new Date()},$unset:{resetDigest:1,resetExpires:1}});
 if(!result.modifiedCount)return res.status(400).json({message:'اطلب رابط استرجاع جديد'});
 return res.json({message:'تم تغيير كلمة المرور. تقدر تسجل دخولك دلوقتي.'});
}
