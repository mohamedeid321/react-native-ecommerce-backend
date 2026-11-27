import mongoose from 'mongoose';

const schema=new mongoose.Schema({
 _id:{type:mongoose.Schema.Types.ObjectId,ref:'Order',required:true},
 phone1:{type:String,required:true,index:true},
 phone2:String,
 whatsapp:String,
 expiresAt:{type:Date,required:true,expires:0},
},{versionKey:false});

export default mongoose.models.GuestContact||mongoose.model('GuestContact',schema);
