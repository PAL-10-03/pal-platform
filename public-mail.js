'use strict';
// Dedicated public-site mail delivery. Isolated from BAA/Newstart Gmail automation.
const destination='admin@palbiz.app';
async function sendPublicMail({subject,text,replyTo,attachment}){
 const key=process.env.RESEND_API_KEY||process.env.PAL_PUBLIC_RESEND_API_KEY;
 const from=process.env.PAL_PUBLIC_EMAIL_FROM||'PAL Business Solutions <admin@palbiz.app>';
 if(!key)throw Error('Public email provider is not configured (RESEND_API_KEY)');
 const payload={from,to:[destination],subject,reply_to:replyTo,text};
 if(attachment)payload.attachments=[{filename:attachment.name,content:attachment.content}];
 const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});
 const data=await response.json().catch(()=>({}));
 if(!response.ok||!data.id)throw Error(`Public email provider rejected message (HTTP ${response.status})`);
 return data.id;
}
module.exports={sendPublicMail};
