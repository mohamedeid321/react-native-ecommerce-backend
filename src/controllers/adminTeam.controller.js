import {createHash,randomBytes} from 'node:crypto';
import User from '../models/user.model.js';
import PushToken from '../models/pushToken.model.js';
import {isOwnerAdmin,adminJobs,adminPermissions} from '../config/adminPermissions.js';
import {getRedis} from '../lib/redis.js';
import {createSessionStore} from '../lib/sessionStore.js';
import {fail,isValidId} from '../utils/http.js';

const staffFilter={role:'admin',adminPermissions:{$type:'array'}};
const fields='username displayName email adminJob adminPermissions disabled +mfaSecret';
const publicStaff=user=>({
 id:user.id,name:user.displayName||user.username,email:user.email,
 job:user.adminJob,permissions:user.adminPermissions,disabled:!!user.disabled,mfaReady:!!user.mfaSecret,
});
export const ownerOnly=(req,res,next)=>isOwnerAdmin(req.user)?next():fail(res,403,'إدارة الفريق متاحة لصاحب المتجر');
export const activationDigest=value=>createHash('sha256').update(value).digest('hex');
const activation=()=>{
 const token=randomBytes(24).toString('hex');
 return {token,data:{staffActivationDigest:activationDigest(token),staffActivationExpires:new Date(Date.now()+24*60*60*1000)}};
};
function staffSettings(body){
 const name=typeof body?.name==='string'?body.name.trim():'';
 const job=body?.job,permissions=body?.permissions;
 if(name.length<2||name.length>80||!adminJobs.includes(job)||!Array.isArray(permissions)||
    permissions.length>adminPermissions.length||permissions.some(key=>!adminPermissions.includes(key)))return null;
 return {displayName:name,adminJob:job,adminPermissions:[...new Set(permissions)]};
}
export async function listAdminTeam(req,res){
 const staff=await User.find(staffFilter).select(fields).sort({createdAt:-1}).limit(100);
 return res.json({staff:staff.map(publicStaff),jobs:adminJobs});
}
export async function addAdminTeamMember(req,res){
 const settings=staffSettings(req.body),email=typeof req.body?.email==='string'?req.body.email.trim().toLowerCase():'',password=req.body?.password;
 if(!settings||!/^\S+@\S+\.\S+$/.test(email)||email.length>254||typeof password!=='string'||password.length<12||Buffer.byteLength(password)>72)
  return fail(res,400,'راجع الاسم والمسمى والصلاحيات والبريد وكلمة المرور');
 const {token,data}=activation();
 try{
  const user=await User.create({...settings,...data,role:'admin',username:'staff-'+randomBytes(12).toString('hex'),email,password});
  return res.status(201).json({staff:publicStaff(user),activationToken:token});
 }catch(e){if(e.code===11000)return fail(res,409,'البريد مستخدم بالفعل');throw e}
}
export async function updateAdminTeamMember(req,res){
 if(!isValidId(req.params.id))return res.sendStatus(404);
 const settings=staffSettings(req.body);
 if(!settings||typeof req.body.disabled!=='boolean')return fail(res,400,'راجع بيانات الحساب');
 const user=await User.findOneAndUpdate({...staffFilter,_id:req.params.id},{$set:{...settings,disabled:req.body.disabled}},{new:true,runValidators:true}).select(fields);
 if(!user)return res.sendStatus(404);
 if(user.disabled||!user.adminPermissions.includes('notifications.read'))await PushToken.deleteMany({user:user._id,role:'admin'});
 if(user.disabled)await createSessionStore(getRedis()).revokeAll(user.id);
 return res.json({staff:publicStaff(user)});
}
export async function renewStaffActivation(req,res){
 if(!isValidId(req.params.id))return res.sendStatus(404);
 const {token,data}=activation();
 const result=await User.updateOne({...staffFilter,_id:req.params.id,mfaSecret:{$exists:false},disabled:{$ne:true}},{$set:data});
 if(!result.matchedCount)return fail(res,409,'المفتاح الجديد متاح للحساب النشط اللي لسه ما ربطش المصادقة');
 return res.json({activationToken:token});
}
