import {publicCache} from "../lib/publicCache.js";
import {createSingleFlight} from "../utils/singleFlight.js";
import express from "express";
import Category from "../models/category.model.js";
import {CATEGORY_IDS} from "../models/product.model.js";
import {protectRoute,adminRoute} from "../middleware/auth.middleware.js";
const router=express.Router();
const labels=["فاكهة","خضروات","ألبان","لحوم","أسماك","مخبوزات","منزل","ملابس","عناية شخصية","ألعاب"];
async function list(){
 const saved=await Category.find().lean();
 const map=new Map(saved.map(c=>[c.slug,c]));
 CATEGORY_IDS.forEach((slug,i)=>{if(!map.has(slug))map.set(slug,{slug,name:labels[i],isActive:true,sortOrder:i});});
 return [...map.values()].sort((a,b)=>a.sortOrder-b.sortOrder||a.slug.localeCompare(b.slug));
}
const publicFlight=createSingleFlight();
router.get("/",async(req,res)=>res.json({categories:(await publicFlight("categories",()=>publicCache.read("categories","active",30000,list))).filter(c=>c.isActive)}));
router.get("/admin",protectRoute,adminRoute,async(req,res)=>res.json({categories:await list()}));
router.put("/:slug",protectRoute,adminRoute,async(req,res)=>{
 const {slug}=req.params;const {name,isActive,sortOrder=0}=req.body||{};
 if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||slug.length>64||typeof name!=="string"||!name.trim()||name.length>80||typeof isActive!=="boolean"||!Number.isInteger(sortOrder)||sortOrder<0||sortOrder>10000)return res.sendStatus(400);
 const category=await Category.findOneAndUpdate({slug},{$set:{name:name.trim(),isActive,sortOrder}},{upsert:true,new:true,runValidators:true});
 await publicCache.invalidate("categories");
 res.json({category});
});
export default router;
