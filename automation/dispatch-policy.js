'use strict';
const ALLOWED=new Set(['bookkeeper','banker','negotiator','reporter','ceo']);
function routesFor(classification,status='classified'){
 if(status!=='classified'||!classification||classification.needsReview||!Number.isFinite(classification.confidence)||classification.confidence<0.85)return [];
 const mandatory=classification.type==='statement'||classification.type==='receipt'?['banker']:classification.type==='invoice'?['bookkeeper']:[];
 return [...new Set([...mandatory,...(classification.routeTo||[]).filter(r=>ALLOWED.has(r))])];
}
module.exports={routesFor};
