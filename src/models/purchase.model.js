import mongoose from "mongoose";
const schema=new mongoose.Schema({
 date:{type:String,required:true,match:/^\d{4}-\d{2}-\d{2}$/},
 product:{type:mongoose.Schema.Types.ObjectId,ref:"Product",required:true},
 quantity:{type:Number,required:true,min:0},
 unitCost:{type:Number,required:true,min:0},
 supplier:{type:String,maxlength:120,default:""},
 notes:{type:String,maxlength:500,default:""},
 recordedBy:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true}
},{timestamps:true});
schema.index({date:1,product:1},{unique:true});
export default mongoose.models.Purchase||mongoose.model("Purchase",schema);
