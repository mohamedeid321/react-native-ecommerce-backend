import User from "../models/user.model.js";
import { fail, serverError } from "../utils/http.js";

const publicProfile = u => ({
  displayName: u.displayName || u.username,
  phone: u.phone || "",
  residence: u.courierResidence || "",
  profileImage: u.profileImage || "",
});

export function getCourierProfile(req,res) {
  return res.json({profile:publicProfile(req.user)});
}

export async function updateCourierProfile(req,res) {
  const {displayName,phone,residence,profileImage}=req.body??{};
  if(typeof displayName!=="string"||!displayName.trim()||displayName.trim().length>80||
     typeof phone!=="string"||!/^\+201[0125]\d{8}$/.test(phone)||
     typeof residence!=="string"||residence.trim().length>200) return fail(res,400,"Invalid profile");
  if(profileImage!==undefined&&profileImage!==""){
    if(typeof profileImage!=="string"||profileImage.length>65000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(profileImage)) return fail(res,400,"Invalid profile image");
    const image=Buffer.from(profileImage.split(",")[1],"base64");
    if(image[0]!==255||image[1]!==216||image[2]!==255||image.at(-2)!==255||image.at(-1)!==217) return fail(res,400,"Invalid JPEG");
  }
  try{
    const user=await User.findOneAndUpdate({_id:req.user._id,role:"delivery",disabled:{$ne:true}},
      {$set:{displayName:displayName.trim(),phone,courierResidence:residence.trim(),...(profileImage===undefined?{}:{profileImage})}},
      {new:true,runValidators:true});
    if(!user)return fail(res,404,"Courier not found");
    return res.json({profile:publicProfile(user)});
  }catch(e){
    if(e.code===11000)return fail(res,409,"Phone already exists");
    return serverError(res,e,"updateCourierProfile");
  }
}
