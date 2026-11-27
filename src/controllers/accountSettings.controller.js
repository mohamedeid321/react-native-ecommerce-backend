import {recoveryMailer,recoveryMessage} from '../lib/recoveryMail.js';
import {randomBytes,createHash} from 'node:crypto';
import bcrypt from 'bcryptjs';
import User from '../models/user.model.js';
import {normalizePhone, publicUser} from './webAuth.controller.js';
import {getRedis} from '../lib/redis.js';
import {createSessionStore} from '../lib/sessionStore.js';
const emailOk=email=>typeof email==='string' && email.length<=254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const hash=value=>createHash('sha256').update(value).digest('hex');

export async function updateAccount(req,res){
 if(!['customer','admin'].includes(req.user.role))return res.sendStatus(403);
 const {name,email,phone,currentPassword}=req.body??{};
 const displayName=typeof name==='string'?name.trim():'';
 const address=typeof email==='string'?email.trim().toLowerCase():'';
 const normalized=normalizePhone(phone);
 const phoneChanged=normalized ? normalized!==normalizePhone(req.user.phone) : (phone || '')!==(req.user.phone || '');
 if(displayName.length<2||displayName.length>80||!emailOk(address)||(phoneChanged&&!normalized))
  return res.status(400).json({message:'راجع الاسم والبريد ورقم الهاتف'});
 const user=await User.findById(req.user.id);
 if(!user||user.disabled||user.role!==req.user.role)return res.sendStatus(403);
 const contactChanged=user.email!==address||phoneChanged;
 if(contactChanged && (typeof currentPassword!=='string'||Buffer.byteLength(currentPassword)>72||!await user.comparePassword(currentPassword)))
  return res.status(403).json({message:'أدخل كلمة المرور الحالية لتغيير بيانات الدخول'});
 const fields={displayName};
 if(user.email!==address)fields.email=address;
 if(phoneChanged)fields.phone=normalized;
 const filter={_id:user._id,role:user.role,disabled:{$ne:true},email:user.email,phone:user.phone??null};
 const changes={$set:fields};
 if(contactChanged)changes.$unset={resetDigest:1,resetExpires:1};
 try{
  const updated=await User.findOneAndUpdate(filter,changes,{new:true,runValidators:true});
  if(!updated)return res.status(409).json({message:'البيانات اتغيرت، حدّث الصفحة وحاول تاني'});
  return res.json({user:publicUser(updated)});
 }catch(e){
  if(e.code===11000)return res.status(409).json({message:'البريد أو الهاتف مستخدم بالفعل'});
  if(e.name==='ValidationError')return res.status(400).json({message:'راجع البيانات المدخلة'});
  throw e;
 }
}

export async function forgotPassword(req,res){
 const mail=recoveryMailer();
 if(!mail)return res.status(503).json({message:'إرسال بريد الاسترجاع غير متاح حاليًا'});
 const {email}=req.body??{};
 if(!emailOk(email))return res.status(400).json({message:'اكتب بريدًا صحيحًا'});
 const token=randomBytes(32).toString('hex'),resetDigest=hash(token);
 const origin=(process.env.CLIENT_URL||'').split(',').map(x=>x.trim()).find(x=>x===req.get('origin')&&x.startsWith('https://'));
 if(!origin)return res.sendStatus(403);
 const user=await User.findOneAndUpdate({email:email.trim().toLowerCase(),role:'customer',disabled:{$ne:true}},{$set:{resetDigest,resetExpires:new Date(Date.now()+15*60000)}});
 if(user){
  const sent=await mail({to:user.email,...recoveryMessage(origin,token)});
  if(!sent){await User.updateOne({_id:user._id,resetDigest},{$unset:{resetDigest:1,resetExpires:1}});console.error('Password reset delivery failed');}
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
