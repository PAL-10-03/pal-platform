'use strict';
// Deterministic, read-only comparison engine. No inference of payments from amounts alone.
const cents=v=>{if(typeof v!=='number'||!Number.isFinite(v))throw Error('Invalid monetary value');return Math.round(v*100);};
function reconcile(statement,ledger){
 if(!statement||!Array.isArray(statement.transactions)||!Array.isArray(ledger))throw Error('Statement lines and QBO ledger required');
 const {account,periodStart,periodEnd,beginningBalance,endingBalance}=statement;
 if(!account||!/^\d{4}-\d{2}-\d{2}$/.test(periodStart)||!/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)||periodEnd<periodStart)throw Error('Incomplete statement period');
 const begin=cents(beginningBalance),end=cents(endingBalance);
 const entries=statement.transactions.map((x,i)=>({index:i,date:x.date,amount:cents(x.amount),reference:String(x.reference||''),description:String(x.description||'')}));
 if(entries.some(x=>!/^\d{4}-\d{2}-\d{2}$/.test(x.date)||x.date<periodStart||x.date>periodEnd))throw Error('Invalid statement transaction date');
 const computed=begin+entries.reduce((s,x)=>s+x.amount,0);
 const balanceAgrees=computed===end;
 const used=new Set(),matched=[],unmatched=[],ambiguous=[];
 for(const line of entries){
  const candidates=ledger.filter((r,i)=>!used.has(i)&&r&&typeof r.amount==='number'&&cents(r.amount)===line.amount&&r.date===line.date&&(!line.reference||!r.reference||String(r.reference)===line.reference));
  // Amount/date alone is insufficient for automatic payment application; this is a suggested comparison only.
  if(candidates.length===1){const item=candidates[0];const index=ledger.indexOf(item);used.add(index);matched.push({statementIndex:line.index,ledgerId:item.id||null,confidence:'candidate-only'});}
  else if(candidates.length>1)ambiguous.push({statementIndex:line.index,candidates:candidates.length});
  else unmatched.push({statementIndex:line.index,amount:line.amount/100,date:line.date});
 }
 const ledgerUnmatched=ledger.filter((_,i)=>!used.has(i)).map(x=>({ledgerId:x.id||null,date:x.date,amount:x.amount}));
 return {account,periodStart,periodEnd,statementLineCount:entries.length,openingBalance:begin/100,closingBalance:end/100,calculatedClosingBalance:computed/100,balanceAgrees,matchedCandidates:matched,unmatchedStatement:unmatched,ambiguous,unmatchedLedger:ledgerUnmatched,fullyReconciled:false,requiresHumanReview:true,reason:'Candidate matches do not establish QBO clearing or reconciliation status'};
}
module.exports={reconcile};
