import mongoose from "mongoose";
const schema=new mongoose.Schema({
 slug:{type:String,required:true,unique:true,match:/^[a-z0-9]+(?:-[a-z0-9]+)*$/,maxlength:64},
 name:{type:String,required:true,trim:true,maxlength:80},
 isActive:{type:Boolean,default:true},
 sortOrder:{type:Number,default:0,min:0,max:10000}
},{timestamps:true});
export default mongoose.model("Category",schema);
