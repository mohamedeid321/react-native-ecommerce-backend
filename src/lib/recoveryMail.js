import nodemailer from 'nodemailer';

export function recoveryMailer(env=process.env){
 const gmailUser=env.RESET_GMAIL_USER?.trim();
 const gmailPassword=env.RESET_GMAIL_APP_PASSWORD?.replace(/\s/g,'');
 if(gmailUser&&gmailPassword){
  const transport=nodemailer.createTransport({
   host:'smtp.gmail.com',port:465,secure:true,
   auth:{user:gmailUser,pass:gmailPassword},
   connectionTimeout:3000,greetingTimeout:3000,socketTimeout:5000,
  });
  return async ({to,subject,text})=>{
   try{
    const result=await transport.sendMail({from:{name:'لقطة',address:gmailUser},to,subject,text,disableFileAccess:true,disableUrlAccess:true});
    return result.accepted.length>0;
   }catch{return false}
  };
 }
 if(env.RESEND_API_KEY&&env.RESET_FROM_EMAIL){
  return async ({to,subject,text})=>{
   const response=await fetch('https://api.resend.com/emails',{
    method:'POST',
    headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({from:env.RESET_FROM_EMAIL,to:[to],subject,text}),
    signal:AbortSignal.timeout(8000),
   }).catch(()=>null);
   return response?.ok===true;
  };
 }
 return null;
}
