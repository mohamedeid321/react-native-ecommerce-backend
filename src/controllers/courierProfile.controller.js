import {normalizePhone} from "./webAuth.controller.js";
import Order from "../models/order.model.js";
import User from "../models/user.model.js";
import { fail, serverError } from "../utils/http.js";

const publicProfile = u => ({
  displayName: u.displayName || u.username,
  email: u.email,
  phone: u.phone || "",
  residence: u.courierResidence || "",
  profileImage: u.profileImage || "",
});

async function account(user){
  const rows=await Order.aggregate([
    {$match:{courier:user._id}},
    {$group:{_id:"$status",count:{$sum:1}}}
  ]);
  const counts=Object.fromEntries(rows.map(row=>[row._id,row.count]));
  const completed=counts.delivered||0;
  const cancelled=counts.cancelled||0;
  const remaining=(counts.placed||0)+(counts.preparing||0)+(counts.out_for_delivery||0);
  return {...publicProfile(user),counts:{completed,remaining,cancelled}};
}

export async function getCourierProfile(req,res) {
  return res.json({profile:await account(req.user)});
}

export async function updateCourierProfile(req,res) {
  const {profileImage,displayName,phone}=req.body??{};
  const fields={};
  if(Object.keys(req.body??{}).some(key=>!["profileImage","displayName","phone"].includes(key)))return fail(res,400,"بيانات غير مسموح بتعديلها");
  if(displayName!==undefined){
    if(typeof displayName!=="string"||displayName.trim().length<2||displayName.trim().length>80)return fail(res,400,"راجع الاسم");
    fields.displayName=displayName.trim();
  }
  if(phone!==undefined){
    const normalized=normalizePhone(phone);
    if(!normalized)return fail(res,400,"راجع رقم التليفون");
    fields.phone=normalized;
  }
  if(profileImage!==undefined)fields.profileImage=profileImage;
  if(profileImage!==undefined&&profileImage!==""){
    if(typeof profileImage!=="string"||profileImage.length>65000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(profileImage)) return fail(res,400,"Invalid profile image");
    const image=Buffer.from(profileImage.split(",")[1],"base64");
    if(image[0]!==255||image[1]!==216||image[2]!==255||image.at(-2)!==255||image.at(-1)!==217) return fail(res,400,"Invalid JPEG");
  }
  if(!Object.keys(fields).length)return fail(res,400,"أدخل البيانات المراد تعديلها");
  try{
    const user=await User.findOneAndUpdate({_id:req.user._id,role:"delivery",disabled:{$ne:true}},
      {$set:fields},
      {new:true,runValidators:true});
    if(!user)return fail(res,404,"Courier not found");
    return res.json({profile:await account(user)});
  }catch(e){
    if(e.code===11000)return fail(res,409,"Phone already exists");
    return serverError(res,e,"updateCourierProfile");
  }
}
