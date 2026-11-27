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

const escapeHtml=value=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function recoveryMessage(origin,token,env=process.env){
 const link=origin+'/login#reset='+token;
 const safeLink=escapeHtml(link);
 const base=escapeHtml(origin);
 const phone=(env.RESET_SUPPORT_WHATSAPP||'').replace(/[+\s()-]/g,'');
 const handle=(env.RESET_SUPPORT_INSTAGRAM||'').trim().replace(/^@/,'');
 const socials=[
  ['فيسبوك','https://www.facebook.com/profile.php?id=61596476945722'],
  ['واتساب',/^[1-9]\d{7,14}$/.test(phone)?'https://wa.me/'+phone:''],
  ['إنستجرام',/^[a-zA-Z0-9_.]{1,30}$/.test(handle)?'https://www.instagram.com/'+handle+'/':''],
 ].filter(([,url])=>url).map(([label,url])=>`<a style="display:inline-block;margin:6px;color:#fff4a6" href="${escapeHtml(url)}">${label}</a>`).join('');
 return {
  subject:'إعادة تعيين كلمة المرور لحسابك في لقطة',
  text:'أهلًا من لقطة.\n\nافتح الرابط التالي لاختيار كلمة مرور جديدة. الرابط صالح لمدة ١٥ دقيقة ويُستخدم مرة واحدة.\n'+link+'\n\nلو ما طلبتش التغيير، تجاهل الرسالة.\nفريق لقطة',
  html:`<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;background:#f3f6ee;font-family:Tahoma,Arial,sans-serif;color:#183b2b">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f3f6ee"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background:#fff">
  <tr><td align="center" bgcolor="#06462c" style="color:white;padding:20px;font-size:28px;font-weight:bold">لقطة</td></tr>
  <tr><td align="right" style="padding:26px 24px;font-size:15px;line-height:1.85">
  <h1 style="font-size:23px;line-height:1.4;margin:0 0 12px">إعادة تعيين كلمة المرور</h1>
  <p style="margin:0 0 18px">أهلًا من لقطة. استخدم الزر لاختيار كلمة مرور جديدة لحسابك. الرابط صالح لمدة ١٥ دقيقة ويُستخدم مرة واحدة.</p>
  <a href="${safeLink}" style="display:inline-block;padding:11px 20px;background:#0b6139;color:white;text-decoration:none;border-radius:8px;font-weight:bold">اختار كلمة مرور جديدة</a>
  <p style="margin:18px 0 0;color:#486354">لو ما طلبتش تغيير كلمة المرور، تجاهل الرسالة.</p>
  </td></tr>
  <tr><td align="center" style="background:#e8f2e6;padding:16px">
  <img src="${base}/assets/web/drawer-fruit-basket.webp" width="116" alt="" style="display:block;margin:0 auto 8px">
  <strong>من لقطة، فاكهة طازجة لحد باب بيتك</strong>
  </td></tr>
  <tr><td align="center" bgcolor="#06462c" style="padding:12px;color:white">فريق لقطة<br>${socials}</td></tr>
  </table></td></tr></table></body></html>`,
 };
}
