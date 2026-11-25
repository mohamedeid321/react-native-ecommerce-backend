import express from "express";
import multer from "multer";
import Banner from "../models/banner.model.js";
import Product from "../models/product.model.js";
import Category from "../models/category.model.js";
import {CATEGORY_IDS} from "../models/product.model.js";
import cloudinary from "../lib/cloudinary.js";
import {protectRoute,adminRoute} from "../middleware/auth.middleware.js";
import {fail,isValidId,serverError} from "../utils/http.js";
const router=express.Router();
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:2*1024*1024,files:1,fields:10,fieldSize:4096},fileFilter:(req,file,cb)=>cb(null,["image/png","image/jpeg","image/webp"].includes(file.mimetype))}).single("image");
const uploadImage=file=>new Promise((resolve,reject)=>{
 const stream=cloudinary.uploader.upload_stream({folder:"lotta-banners",resource_type:"image",allowed_formats:["png","jpg","jpeg","webp"]},(err,result)=>err?reject(err):resolve(result));
 stream.end(file.buffer);
});
const removeImage=async id=>{if(id?.startsWith("lotta-banners/"))try{await cloudinary.uploader.destroy(id);}catch{}};
const fields=["title","subtitle","alt","targetType","targetValue","sortOrder","isActive","startsAt","endsAt"];
async function parse(body,old={}){
 if(!body||typeof body!=="object"||Object.keys(body).some(k=>!fields.includes(k)))return null;
 const value={title:old.title,subtitle:old.subtitle??"",alt:old.alt,targetType:old.targetType??"none",targetValue:old.targetValue??"",sortOrder:old.sortOrder??0,isActive:old.isActive??false,startsAt:old.startsAt??null,endsAt:old.endsAt??null,...body};
 for(const [key,max] of [["title",100],["subtitle",250],["alt",160],["targetValue",64]]){if(typeof value[key]!=="string"||value[key].length>max)return null;value[key]=value[key].trim();}
 if(!value.title||!value.alt||!["none","product","category","offers"].includes(value.targetType))return null;
 if(typeof value.sortOrder==="string"&&/^\d+$/.test(value.sortOrder))value.sortOrder=Number(value.sortOrder);
 if(!Number.isInteger(value.sortOrder)||value.sortOrder<0||value.sortOrder>10000)return null;
 if(value.isActive==="true")value.isActive=true;else if(value.isActive==="false")value.isActive=false;
 if(typeof value.isActive!=="boolean")return null;
 for(const key of ["startsAt","endsAt"]){
 const t=value[key];
 if(t===null||t===""){value[key]=null;continue;}
 if(!(t instanceof Date)&&(typeof t!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(t)))return null;
 const date=new Date(t);if(!Number.isFinite(date.getTime()))return null;value[key]=date;
 }
 if(value.startsAt&&value.endsAt&&value.startsAt>=value.endsAt)return null;
 if(value.targetType==="product"&&(!isValidId(value.targetValue)||!await Product.exists({_id:value.targetValue,isActive:{$ne:false}})))return null;
 if(value.targetType==="category"&&(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.targetValue)||(!CATEGORY_IDS.includes(value.targetValue)&&!await Category.exists({slug:value.targetValue,isActive:true}))))return null;
 if(["none","offers"].includes(value.targetType)&&value.targetValue)return null;
 return value;
}
const safe=b=>{const result=b.toObject();delete result.imagePublicId;delete result.updatedBy;return result;};
router.get("/",async(req,res)=>{
 try{const now=new Date();const banners=await Banner.find({archived:{$ne:true},isActive:true,$and:[{$or:[{startsAt:null},{startsAt:{$lte:now}}]},{$or:[{endsAt:null},{endsAt:{$gt:now}}]}]}).sort({sortOrder:1,_id:1}).limit(30).lean();res.json({success:true,banners});}catch(e){serverError(res,e,"listBanners");}
});
router.get("/admin",protectRoute,adminRoute,async(req,res)=>{
 try{const page=Math.min(10000,Math.max(1,parseInt(req.query.page)||1));const filter={archived:{$ne:true}};const [banners,count]=await Promise.all([Banner.find(filter).sort({sortOrder:1,_id:1}).skip((page-1)*50).limit(50).lean(),Banner.countDocuments(filter)]);res.set("Cache-Control","no-store");res.json({success:true,banners,count,page});}catch(e){serverError(res,e,"adminBanners");}
});
router.post("/",protectRoute,adminRoute,upload,async(req,res)=>{
 let uploaded;
 try{const value=await parse(req.body);if(!value||!req.file)return fail(res,400,"Invalid banner or missing image");uploaded=await uploadImage(req.file);const banner=await Banner.create({...value,image:uploaded.secure_url,imagePublicId:uploaded.public_id,updatedBy:req.user._id});return res.status(201).json({success:true,banner:safe(banner)});}
 catch(e){await removeImage(uploaded?.public_id);serverError(res,e,"createBanner");}
});
router.patch("/:id",protectRoute,adminRoute,async(req,res)=>{
 try{if(!isValidId(req.params.id))return fail(res,400,"Invalid banner ID");const old=await Banner.findOne({_id:req.params.id,archived:{$ne:true}});if(!old)return fail(res,404,"Banner not found");const value=await parse(req.body,old);if(!value)return fail(res,400,"Invalid banner");const banner=await Banner.findOneAndUpdate({_id:old._id,archived:{$ne:true},updatedAt:old.updatedAt},{$set:{...value,updatedBy:req.user._id}},{new:true,runValidators:true});if(!banner)return fail(res,409,"Banner changed; refresh");res.json({success:true,banner:safe(banner)});}catch(e){serverError(res,e,"updateBanner");}
});
router.put("/:id/image",protectRoute,adminRoute,upload,async(req,res)=>{
 let uploaded,committed=false;
 try{if(!isValidId(req.params.id)||!req.file)return fail(res,400,"Invalid banner image");const old=await Banner.findOne({_id:req.params.id,archived:{$ne:true}}).select("+imagePublicId");if(!old)return fail(res,404,"Banner not found");uploaded=await uploadImage(req.file);const banner=await Banner.findOneAndUpdate({_id:old._id,archived:{$ne:true},imagePublicId:old.imagePublicId},{$set:{image:uploaded.secure_url,imagePublicId:uploaded.public_id,updatedBy:req.user._id}},{new:true,runValidators:true});if(!banner){await removeImage(uploaded.public_id);return fail(res,409,"Banner changed; refresh");}committed=true;await removeImage(old.imagePublicId);res.json({success:true,banner:safe(banner)});}catch(e){if(!committed)await removeImage(uploaded?.public_id);serverError(res,e,"replaceBannerImage");}
});
router.delete("/:id",protectRoute,adminRoute,async(req,res)=>{
 try{if(!isValidId(req.params.id))return fail(res,400,"Invalid banner ID");const banner=await Banner.findOneAndUpdate({_id:req.params.id,archived:{$ne:true}},{$set:{archived:true,isActive:false,updatedBy:req.user._id}},{new:true});if(!banner)return fail(res,404,"Banner not found");res.json({success:true});}catch(e){serverError(res,e,"archiveBanner");}
});
router.use((error,req,res,next)=>error instanceof multer.MulterError?fail(res,400,"Invalid banner upload"):next(error));
export default router;
