import {publicCache} from "../lib/publicCache.js";
import Product from "../models/product.model.js";
import mongoose from "mongoose";
export async function listAdminProducts(req,res) {
 const page=Math.max(1,Math.min(10000,parseInt(req.query.page)||1));
 const limit=Math.max(1,Math.min(100,parseInt(req.query.limit)||30));
 const filter={archivedAt:null};
 if(req.query.visibility==="hidden") filter.isActive=false;
 if(req.query.visibility==="active") filter.isActive={$ne:false};
 if(typeof req.query.category==="string" && req.query.category!=="all") filter.category=req.query.category;
 const [products,totalProducts]=await Promise.all([Product.find(filter).select("+purchasePrice").sort({createdAt:-1,_id:-1}).skip((page-1)*limit).limit(limit),Product.countDocuments(filter)]);
 res.set("Cache-Control","no-store");
 res.json({success:true,products:products.map(p=>({...p.toJSON(),purchasePrice:p.purchasePrice??null})),totalProducts,currentPage:page,totalPages:Math.ceil(totalProducts/limit)});
}
export async function setProductVisibility(req,res) {
 if(!mongoose.isValidObjectId(req.params.id)) return res.sendStatus(404);
 if(typeof req.body?.isActive!=="boolean") return res.sendStatus(400);
 const product=await Product.findOneAndUpdate({_id:req.params.id,archivedAt:null},{$set:{isActive:req.body.isActive}},{new:true,runValidators:true});
 if(!product) return res.sendStatus(404);
 await publicCache.invalidate("catalog","search");
 res.json({success:true,product});
}

