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

const escapeAttribute=value=>value.replace(/[&"<>']/g,char=>({'&':'&amp;','"':'&quot;','<':'&lt;','>':'&gt;',"'":'&#39;'}[char]));

export function recoveryMessage(code,origin){
 if(typeof code!=='string'||!/^\d{8}$/.test(code))throw new Error('Invalid recovery code');
 const site=new URL(origin);
 if(site.protocol!=='https:'||site.origin!==origin)throw new Error('Invalid storefront origin');
 const base=escapeAttribute(origin);
 const image=(name,size,alt='')=>`<img alt="${alt}" width="${size}" src="${base}/assets/email/${name}.png" style="display:inline-block;border:0;vertical-align:middle;max-width:100%;height:auto">`;
 const boxes=[...code].map(digit=>`<td width="29" height="40" align="center" bgcolor="#eef6ea" style="border:1px solid #cbdccc;border-radius:6px;color:#114931;font:bold 21px Arial,sans-serif">${digit}</td>`).join('');
 const facebook='https://www.facebook.com/profile.php?id=61596476945722';
 const footerLinks=[['about','عن لقطة'],['faq','المساعدة'],['privacy','سياسة الخصوصية']]
  .map(([path,label])=>`<a href="${base}/${path}" style="display:inline-block;margin:4px;color:#164d31;font-weight:bold">${label}</a>`).join(' &nbsp; ');
 return {
  subject:'كود استرجاع كلمة المرور | لقطة',
  text:'كود استرجاع كلمة المرور لحسابك في لقطة:\n'+code+'\n\nانسخ الكود وأدخله في صفحة استرجاع كلمة المرور اللي فتحتها على لقطة. صالح لمدة ١٥ دقيقة ويُستخدم مرة واحدة. لو ما طلبتش الاسترجاع، تجاهل الرسالة.',
  html:`<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;background:#f0f5ef;color:#19412f;font-family:Tahoma,Arial,sans-serif">
  <table role="presentation" dir="rtl" width="100%" cellspacing="0" cellpadding="0" bgcolor="#f0f5ef"><tr><td align="center" style="padding:24px 10px">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:548px;background:#fff;border-top:5px solid #137045;border-radius:14px">
  <tr><td align="center" style="padding:27px 10px 22px;line-height:1.8">
   ${image('envelope',72)}
   <h1 style="margin:12px 0 6px;font-size:25px;line-height:1.4;color:#123e2a">كود استرجاع كلمة المرور</h1>
   <p style="margin:0 auto 14px;max-width:375px;color:#426051;font-size:14px">انسخ الكود وأدخله في صفحة استرجاع كلمة المرور اللي فتحتها على لقطة.</p>
   <table role="presentation" dir="ltr" cellpadding="0" cellspacing="3" align="center"><tr>${boxes}</tr></table>
   <p style="margin:12px 0 10px;font-size:13px;color:#426051">تقدر تحدد الكود وتنسخه من هنا <strong dir="ltr" style="white-space:nowrap">${code}</strong></p>
   <p style="margin:12px 0 4px;font-size:14px">صالح لمدة <strong>١٥ دقيقة</strong> ويُستخدم مرة واحدة.</p>
   <p style="margin:0;font-size:13px;color:#426051">لو ما طلبتش الاسترجاع، تجاهل الرسالة.</p>
  </td></tr>
  <tr><td align="center" bgcolor="#e9f2e7" style="padding:20px 12px;color:#19412f;font-size:13px;line-height:1.7">
   <a href="${facebook}" style="display:inline-block;margin:0 5px">${image('facebook',26,'لقطة على فيسبوك')}</a>
   <span style="display:inline-block;margin:0 5px">${image('whatsapp',26,'واتساب')}</span>
   <span style="display:inline-block;margin:0 5px">${image('instagram',26,'إنستجرام')}</span>
   <p style="margin:8px 0">${footerLinks}</p>
   <p style="margin:6px 0 14px">لقطة، فاكهة طازجة لحد باب بيتك في مدينة 15 مايو.</p>
   ${image('lotta',88,'شعار لقطة')}
  </td></tr>
  </table></td></tr></table></body></html>`,
 };
}
