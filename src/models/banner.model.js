import mongoose from "mongoose";
const schema=new mongoose.Schema({
 title:{type:String,required:true,maxlength:100},
 subtitle:{type:String,default:"",maxlength:250},
 image:{type:String,required:true,maxlength:2048},
 imagePublicId:{type:String,required:true,select:false},
 alt:{type:String,required:true,maxlength:160},
 targetType:{type:String,enum:["none","product","category","offers"],default:"none"},
 targetValue:{type:String,default:"",maxlength:64},
 sortOrder:{type:Number,min:0,max:10000,default:0},
 isActive:{type:Boolean,default:false},
 startsAt:Date,
 endsAt:Date,
 archived:{type:Boolean,default:false},
 updatedBy:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true,select:false}
},{timestamps:true});
schema.index({archived:1,isActive:1,sortOrder:1});
export default mongoose.models.Banner||mongoose.model("Banner",schema);
