import User from '../models/user.model.js';
import cloudinary from '../lib/cloudinary.js';

export async function updateCustomerPhoto(req,res){
 if(!['customer','admin'].includes(req.user.role))return res.sendStatus(403);
 const photo=req.body?.photo;
 if(typeof photo!=='string'||photo.length>65000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(photo))return res.status(400).json({message:'صورة غير صالحة'});
 const bytes=Buffer.from(photo.split(',')[1],'base64');
 if(bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)return res.status(400).json({message:'صورة غير صالحة'});
 const uploaded=await cloudinary.uploader.upload(photo,{folder:'lotta/'+req.user.role+'-photos',resource_type:'image',format:'jpg'});
 let previous;
 try{
  previous=await User.findOneAndUpdate({_id:req.user._id,role:req.user.role,disabled:{$ne:true}},{$set:{profileImage:uploaded.secure_url,profileImagePublicId:uploaded.public_id}}).select('+profileImagePublicId');
 }catch(error){
  await cloudinary.uploader.destroy(uploaded.public_id).catch(()=>{});
  throw error;
 }
 if(!previous){await cloudinary.uploader.destroy(uploaded.public_id);return res.sendStatus(403)}
 if(previous.profileImagePublicId)await cloudinary.uploader.destroy(previous.profileImagePublicId).catch(()=>{});
 return res.json({profileImage:uploaded.secure_url});
}
