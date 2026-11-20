'use strict';
// Only the CEO communication channel may send. No financial data leaves unless
// explicitly supplied by authorized owner; customer recipients are tenant-bound.
const a=require('./core');
const gmail=require('./gmail');
const NAMES=Object.freeze({'born-again-air':'Born Again Air',newstart:'Newstart'});
const busy=new Set();
function configuration(tenant){
 if(!Object.hasOwn(NAMES,tenant))throw Error('Unknown tenant');
 if(process.env.PAL_CEO_EMAIL_ENABLED!=='true')throw Error('CEO email delivery disabled');
 const from=process.env.PAL_EMAIL_FROM,owner=process.env.PAL_OWNER_REPORT_EMAIL;
 const provider=process.env.PAL_EMAIL_PROVIDER||'gmail';
 if(!from||!owner)throw Error('CEO sender or owner copy address missing');
 if(provider==='gmail'&&!gmail.configured())throw Error('Gmail OAuth credentials missing');
 if(provider==='resend'&&!process.env.RESEND_API_KEY)throw Error('Resend credentials missing');
 if(!['gmail','resend'].includes(provider))throw Error('Unknown email provider');
 const map=JSON.parse(process.env.PAL_CUSTOMER_REPORT_RECIPIENTS_JSON||'{}');
 const customer=map[tenant];
 if(typeof customer!=='string'||!customer.includes('@'))throw Error('No authorized customer recipient for tenant');
 if(!owner.includes('@'))throw Error('Invalid owner copy recipient');
 return {from,owner,key:process.env.RESEND_API_KEY,provider,customer,name:NAMES[tenant]};
}
async function send({key,provider,from,to,subject,text}){
 if(provider==='gmail')return gmail.send({from,to,subject,text});
 const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({from,to:[to],subject,text}),signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error(`Email provider HTTP ${r.status}`);
 const result=await r.json();if(!result.id)throw Error('Email provider did not confirm acceptance');return result.id;
}
async function deliver({tenant,dispatchKey,subject,body}){
 const cfg=configuration(tenant);
 if(!/^[a-zA-Z0-9:_-]{1,120}$/.test(dispatchKey)||typeof subject!=='string'||!subject.trim()||subject.length>160||typeof body!=='string'||!body.trim()||body.length>25000)throw Error('Invalid CEO email request');
 const lock=`${tenant}:${dispatchKey}`;if(busy.has(lock))throw Error('Dispatch already in progress');busy.add(lock);
 try{
  await a.db('pal_ceo_email_dispatch',{method:'POST',query:'on_conflict=tenant,dispatch_key',prefer:'resolution=ignore-duplicates',body:{tenant,dispatch_key:dispatchKey,customer_name:cfg.name,customer_email:cfg.customer,owner_email:cfg.owner}});
  const query=`tenant=eq.${tenant}&dispatch_key=eq.${encodeURIComponent(dispatchKey)}&select=customer_name,customer_email,owner_email,customer_sent_at,owner_copy_sent_at`;
  const record=(await a.db('pal_ceo_email_dispatch',{query}))?.[0];if(!record)throw Error('Dispatch record unavailable');
  if(record.customer_email!==cfg.customer||record.owner_email!==cfg.owner)throw Error('Dispatch recipient changed; manual review required');
  let customerSent=Boolean(record.customer_sent_at),ownerCopied=Boolean(record.owner_copy_sent_at);
  if(!customerSent){
   await send({...cfg,to:cfg.customer,subject,text:body});
   // If persistence fails after provider acceptance, hold manual review to avoid
   // silent re-sending; a provider-accepted email is not proof of delivery.
   await a.db('pal_ceo_email_dispatch',{method:'PATCH',query:`tenant=eq.${tenant}&dispatch_key=eq.${encodeURIComponent(dispatchKey)}`,body:{customer_sent_at:new Date().toISOString()}});
   customerSent=true;
  }
  if(!ownerCopied){
   const prefix=`Sent to ${cfg.name}`;
   await send({...cfg,to:cfg.owner,subject:`${prefix} — ${subject}`.slice(0,160),text:`${prefix}\nCustomer recipient: ${cfg.customer}\n\n${body}`});
   await a.db('pal_ceo_email_dispatch',{method:'PATCH',query:`tenant=eq.${tenant}&dispatch_key=eq.${encodeURIComponent(dispatchKey)}`,body:{owner_copy_sent_at:new Date().toISOString()}});
   ownerCopied=true;
  }
  await a.event(tenant,null,'ceo_email_accepted',{dispatchKey,customerAccepted:customerSent,ownerCopyAccepted:ownerCopied});
  return {customerAccepted:customerSent,ownerCopyAccepted:ownerCopied,customerName:cfg.name};
 }finally{busy.delete(lock);}
}
module.exports={configuration,deliver};
