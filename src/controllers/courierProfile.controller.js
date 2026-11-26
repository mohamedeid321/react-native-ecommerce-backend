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
  const {profileImage}=req.body??{};
  if(Object.keys(req.body??{}).some(key=>key!=="profileImage") || typeof profileImage!=="string")return fail(res,400,"Only the profile image can be changed");
  if(profileImage!==""){
    if(typeof profileImage!=="string"||profileImage.length>65000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(profileImage)) return fail(res,400,"Invalid profile image");
    const image=Buffer.from(profileImage.split(",")[1],"base64");
    if(image[0]!==255||image[1]!==216||image[2]!==255||image.at(-2)!==255||image.at(-1)!==217) return fail(res,400,"Invalid JPEG");
  }
  try{
    const user=await User.findOneAndUpdate({_id:req.user._id,role:"delivery",disabled:{$ne:true}},
      {$set:{profileImage}},
      {new:true,runValidators:true});
    if(!user)return fail(res,404,"Courier not found");
    return res.json({profile:await account(user)});
  }catch(e){
    if(e.code===11000)return fail(res,409,"Phone already exists");
    return serverError(res,e,"updateCourierProfile");
  }
}
