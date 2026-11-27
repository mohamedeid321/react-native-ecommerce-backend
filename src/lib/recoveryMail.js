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
  return async ({to,subject,text,html})=>{
   try{
    const result=await transport.sendMail({from:{name:'لقطة',address:gmailUser},to,subject,text,html,disableFileAccess:true,disableUrlAccess:true});
    return result.accepted.length>0;
   }catch{return false}
  };
 }
 if(env.RESEND_API_KEY&&env.RESET_FROM_EMAIL){
  return async ({to,subject,text,html})=>{
   const response=await fetch('https://api.resend.com/emails',{
    method:'POST',
    headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({from:env.RESET_FROM_EMAIL,to:[to],subject,text,html}),
    signal:AbortSignal.timeout(8000),
   }).catch(()=>null);
   return response?.ok===true;
  };
 }
 return null;
}

export function recoveryMessage(code){
 if(!/^\d{8}$/.test(code))throw new Error('Invalid recovery code');
 return {
  subject:'كود استرجاع كلمة المرور | لقطة',
  text:'كود استرجاع كلمة المرور لحسابك في لقطة:\n'+code+'\n\nاكتب الكود في صفحة استرجاع كلمة المرور. صالح لمدة ١٥ دقيقة ويُستخدم مرة واحدة. لو ما طلبتش الاسترجاع، تجاهل الرسالة.',
  html:`<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;background:#f4f7f0;color:#173d2b;font-family:Tahoma,Arial,sans-serif">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#fff;border:1px solid #dce8db">
  <tr><td align="center" bgcolor="#06462c" style="padding:18px;color:#fff;font-size:28px;font-weight:bold">لقطة</td></tr>
  <tr><td align="center" style="padding:28px 18px;line-height:1.8">
  <h1 style="margin:0;font-size:22px">كود استرجاع كلمة المرور</h1>
  <p>اكتب الكود في صفحة استرجاع كلمة المرور على لقطة.</p>
  <p dir="ltr" style="padding:12px 16px;background:#e9f3e7;color:#06462c;font:bold 30px/1.3 monospace;letter-spacing:5px">${code}</p>
  <p>صالح لمدة ١٥ دقيقة ويُستخدم مرة واحدة.</p>
  <p style="color:#496456;font-size:13px">لو ما طلبتش الاسترجاع، تجاهل الرسالة.</p>
  </td></tr><tr><td align="center" bgcolor="#06462c" style="padding:12px;color:#fff">فريق لقطة</td></tr>
  </table></td></tr></table></body></html>`,
 };
}
