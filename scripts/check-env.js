import "dotenv/config";
const required=["MONGO_URI","REDIS_URL","JWT_SECRET","JWT_ACCESS_SECRET","CLIENT_URL","MFA_ENCRYPTION_KEY","MFA_ENROLLMENT_TOKEN","CLOUDINARY_CLOUD_NAME","CLOUDINARY_API_KEY","CLOUDINARY_API_SECRET","GOOGLE_CLIENT_ID"];
const failures=[];
for(const key of required)if(!process.env[key]?.trim())failures.push(key+" is missing");
if(process.env.JWT_ACCESS_SECRET&&Buffer.byteLength(process.env.JWT_ACCESS_SECRET)<32)failures.push("JWT_ACCESS_SECRET must be at least 32 bytes");
if(process.env.JWT_SECRET&&process.env.JWT_SECRET===process.env.JWT_ACCESS_SECRET)failures.push("JWT secrets must differ");
if(process.env.MFA_ENCRYPTION_KEY&&!/^[a-f0-9]{64}$/i.test(process.env.MFA_ENCRYPTION_KEY))failures.push("MFA_ENCRYPTION_KEY must contain 64 hex characters");
if(process.env.MFA_ENROLLMENT_TOKEN&&process.env.MFA_ENROLLMENT_TOKEN.length<32)failures.push("MFA_ENROLLMENT_TOKEN must be at least 32 characters");
if(process.env.NODE_ENV==="production"){
 for(const value of (process.env.CLIENT_URL||"").split(",")){try{const url=new URL(value.trim());if(url.protocol!=="https:"||url.origin!==value.trim())throw Error();}catch{failures.push("CLIENT_URL must contain exact HTTPS origins");break;}}
 if(process.env.REDIS_URL&&!process.env.REDIS_URL.startsWith("rediss://"))failures.push("Production Redis must use TLS");
}
if(failures.length){console.error(failures.join("\n"));process.exitCode=1;}else console.log("Environment configuration passed (credentials not tested)");
