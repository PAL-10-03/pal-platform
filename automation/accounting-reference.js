'use strict';
// Server-side tools only. Tenant comes from the authenticated PAL job context, never Grok input.
const {db}=require('./core');
const TENANTS=new Set(['born-again-air','newstart']);
function tenantGuard(tenant){if(!TENANTS.has(tenant))throw Error('Invalid PAL tenant');}
function vendorKey(value){return String(value||'').trim().toLowerCase().replace(/\s+/g,' ').slice(0,200);}
async function lookup_accounting_codes({tenant,vendor='',search='',limit=30}){
 tenantGuard(tenant);
 const max=Math.min(50,Math.max(1,Number(limit)||30));
 const accounts=await db('pal_accounting_accounts',{query:`tenant=eq.${encodeURIComponent(tenant)}&is_active=eq.true&select=id,account_number,account_name,account_type,qbo_account_id,is_active&order=account_name.asc&limit=500`});
 const key=vendorKey(vendor);
 const rules=key?await db('pal_accounting_rules',{query:`tenant=eq.${encodeURIComponent(tenant)}&vendor_key=eq.${encodeURIComponent(key)}&select=vendor_key,account_id,approved_by,approved_at&limit=1`}):[];
 const query=String(search||'').toLowerCase().trim();
 const matching=(accounts||[]).filter(a=>!query||`${a.account_name} ${a.account_number||''}`.toLowerCase().includes(query));
 const approvedRule=(rules||[]).find(r=>(accounts||[]).some(a=>a.id===r.account_id))||null;
 return {accounts:matching.slice(0,max),approvedRule,moreMatches:matching.length>max};
}
async function save_approved_accounting_rule({tenant,vendor,accountId,approvedBy,rationale=''}){
 tenantGuard(tenant);
 const key=vendorKey(vendor);
 if(!key||!accountId||!approvedBy||String(approvedBy).trim().length<2)throw Error('Explicit approval identity, vendor and account are required');
 const accounts=await db('pal_accounting_accounts',{query:`tenant=eq.${encodeURIComponent(tenant)}&id=eq.${encodeURIComponent(accountId)}&is_active=eq.true&select=id&limit=1`});
 if(accounts?.length!==1)throw Error('Account is not active for this tenant');
 const existing=await db('pal_accounting_rules',{query:`tenant=eq.${encodeURIComponent(tenant)}&vendor_key=eq.${encodeURIComponent(key)}&select=id&limit=1`});
 if(existing?.length)throw Error('Existing approved rule must be reviewed by a manager before replacement');
 const result=await db('pal_accounting_rules',{method:'POST',prefer:'return=representation',body:{tenant,vendor_key:key,account_id:accountId,approved_by:String(approvedBy),rationale:String(rationale).slice(0,500)}});
 return result?.[0]||null;
}
// Called by PAL after Reader creates a bookkeeping task; Reader never accesses accounts.
async function prepareBookkeeperContext({tenant,extracted}){
 tenantGuard(tenant);
 if(!extracted||typeof extracted!=='object')throw Error('Missing extracted transaction');
 const references=await lookup_accounting_codes({tenant,vendor:extracted.vendor||extracted.supplier||'',search:'',limit:50});
 return {extracted,references,requiresActiveAccountVerification:true};
}
module.exports={lookup_accounting_codes,save_approved_accounting_rule,prepareBookkeeperContext,vendorKey,tenantGuard};
