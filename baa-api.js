const fs=require('fs');const path=require('path');const ExcelJS=require('exceljs');const pdfParse=require('pdf-parse');
const catalogModels=require('./data/catalog-models.json');const seedCatalog=require('./data/catalog.json');const seedPrices=require('./data/prices.json');
const base=path.join(__dirname,'data','baa-runtime');fs.mkdirSync(base,{recursive:true});
const su=(process.env.SUPABASE_URL||'').replace(/\/$/,'');const sk=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||'';const bucket=process.env.PAL_SUPABASE_BUCKET||'pal-private-documents';const remote=!!(su&&sk);
const safeId=s=>/^[a-zA-Z0-9_-]{1,90}$/.test(s||'');
// Initialize only the two bundled reference datasets when their remote objects
// do not yet exist. Never overwrite an existing remote catalog or price list.
const seedKeys=new Set(['catalog','prices']);
const seedInFlight=new Map();
async function readRemote(key){
 const r=await fetch(`${su}/storage/v1/object/${bucket}/born-again-air/app/${key}.json`,{headers:{apikey:sk,Authorization:`Bearer ${sk}`}});
 if(r.ok)return {found:true,value:await r.json()};
 if(r.status===404)return {found:false};
 // Supabase Storage can return HTTP 400 with an Object-not-found payload.
 // Only the missing box index is allowed to fall back to the empty-list default.
 // Other 400 responses (bad credentials, bucket errors, etc.) remain visible.
 if((key==='box-index'||key==='price-history'||key==='price-bundle')&&r.status===400){
  const body=await r.text();
  let detail={};try{detail=JSON.parse(body);}catch(_){}
  const message=String(detail.message||'').toLowerCase();
  const error=String(detail.error||'').toLowerCase();
  const code=String(detail.statusCode||detail.status||'');
  // Missing objects are returned as HTTP 400 by some Supabase Storage versions.
  // Require a recognized missing-object message; never hide auth or bucket errors.
  if((message==='object not found'||message==='the resource was not found'||message==='not found'||error==='not_found'||error==='not found'||error==='nosuchkey')&&
     (!code||code==='400'||code==='404'))return {found:false};
  throw Error('Storage read failed 400 for '+key+': '+(detail.message||detail.error||body.slice(0,160)));
 }
 throw Error('Storage read failed '+r.status+' for '+key);
}
async function initializeSeed(key,fallback){
 if(seedInFlight.has(key))return seedInFlight.get(key);
 const task=(async()=>{
  // Recheck before writing in case another request initialized the file.
  const existing=await readRemote(key);
  if(existing.found)return existing.value;
  const json=JSON.stringify(fallback);
  // No upsert: an existing object must never be replaced by bundled seed data.
  const r=await fetch(`${su}/storage/v1/object/${bucket}/born-again-air/app/${key}.json`,{
   method:'POST',headers:{apikey:sk,Authorization:`Bearer ${sk}`,'Content-Type':'application/json'},body:json
  });
  if(!r.ok){
   // Concurrent first-time initialization may have created the object.
   if(r.status===409){const raced=await readRemote(key);if(raced.found)return raced.value;}
   throw Error('Storage initialization failed '+r.status+' for '+key);
  }
  const verified=await readRemote(key);
  if(!verified.found||JSON.stringify(verified.value)!==json)throw Error('Storage verification failed for '+key);
  console.log('Supabase seed initialized and verified: '+key+' ('+fallback.length+' records)');
  return verified.value;
 })();
 seedInFlight.set(key,task);
 try{return await task;}finally{seedInFlight.delete(key);}
}
async function read(key,fallback){if(remote){
 const result=await readRemote(key);
 if(result.found)return result.value;
 if(seedKeys.has(key))return initializeSeed(key,fallback);
 }else{const f=path.join(base,key+'.json');if(fs.existsSync(f))return JSON.parse(fs.readFileSync(f));}
 return structuredClone(fallback);
}
async function write(key,value){const json=JSON.stringify(value);if(remote){const r=await fetch(`${su}/storage/v1/object/${bucket}/born-again-air/app/${key}.json`,{method:'POST',headers:{apikey:sk,Authorization:`Bearer ${sk}`,'Content-Type':'application/json','x-upsert':'true'},body:json});if(!r.ok)throw Error('Storage write failed '+r.status);}else fs.writeFileSync(path.join(base,key+'.json'),json);}
async function removeStoredBox(id){
 if(remote){
  const r=await fetch(`${su}/storage/v1/object/${bucket}/born-again-air/app/box-${id}.json`,{method:'DELETE',headers:{apikey:sk,Authorization:`Bearer ${sk}`}});
  if(!r.ok&&r.status!==404)throw Error('Storage delete failed '+r.status+' for box-'+id);
 }else{
  const f=path.join(base,'box-'+id+'.json');if(fs.existsSync(f))fs.unlinkSync(f);
 }
}
// Manually added records are stored independently so a future catalog import cannot erase them.
async function cat(){
 const [baseRows,manualRows]=await Promise.all([read('catalog',seedCatalog),read('catalog-manual',[])]);
 const seen=new Set(baseRows.map(r=>norm(r.part)+'|'+norm(r.core)));
 return baseRows.concat(manualRows.filter(r=>{const key=norm(r.part)+'|'+norm(r.core);if(seen.has(key))return false;seen.add(key);return true;}));
}
const prices=()=>read('prices',seedPrices);
const priceHistory=()=>read('price-history',{a:[],b:[]});
// One storage object is the committed snapshot. A failed write cannot half-rotate lists.
// Existing prices.json and price-history.json are read as-is until the first upload.
async function priceSheets(){
 const snapshot=await read('price-bundle',null);
 if(snapshot!==null){
  if(!snapshot||!Array.isArray(snapshot.current)||!Array.isArray(snapshot.a)||!Array.isArray(snapshot.b))throw Error('Invalid saved price bundle');
  return snapshot;
 }
 const [current,history]=await Promise.all([prices(),priceHistory()]);
 return {current,a:Array.isArray(history.a)?history.a:[],b:Array.isArray(history.b)?history.b:[]};
}
const priceUploadLock={busy:false};const norm=v=>String(v??'').trim().toUpperCase().replace(/\s+/g,'');
const num=v=>v===null||v===undefined||v===''?null:Number(v);
// The PDF catalog establishes identity (part + core). The Excel CORE BASE
// column is the price key; it may equal the PDF part number, not the PDF core.
// Resolve the catalog pair first, then look up CORE BASE by the mapped part
// number. Only fall back to mapped core if there is no mapped-part price.
function priceFor(priceRows, mappedPart, mappedCore){
 const keys=[norm(mappedPart)].filter(Boolean); // CORE BASE in the supplied buy list indexes REMAN part numbers
 let candidates=[],key='';
 for(const candidate of [...new Set(keys)]){
  const rows=priceRows.filter(x=>norm(x.coreBase)===candidate);
  if(rows.length){candidates=rows;key=candidate;break;}
 }
 const values=[...new Set(candidates.map(x=>Number(x.price)).filter(Number.isFinite))];
 return {price:values.length===1?values[0]:null,priceStatus:values.length===0?'missing':values.length>1?'ambiguous':'matched',priceMatches:candidates.length,priceCoreBase:key};
}
function priceForSheets(sheets,part,core){
 for(const [name,rows] of [['current',sheets.current],['a',sheets.a],['b',sheets.b]]){
  const result=priceFor(rows,part,core);
  // A matching key, even if ambiguous, must not silently fall back to older prices.
  if(result.priceStatus!=='missing')return {...result,priceSource:name};
 }
 return {...priceFor([],part,core),priceSource:null};
}
function lookup(rows,priceRows,q){const term=norm(q);if(!term)return {matches:[]};const matches=rows.filter(r=>norm(r.part)===term||norm(r.core)===term).slice(0,50);return {matches:matches.map(r=>({...r,...(Array.isArray(priceRows)?priceFor(priceRows,r.part,r.core):priceForSheets(priceRows,r.part,r.core))})),duplicate:matches.length>1};}
function boxRows(b){return (b.items||[]).map(x=>({...x,extended:Number.isFinite(x.price)?Math.round(x.price*x.qty*100)/100:null}));}
function summary(b){const rows=boxRows(b);return {...b,items:rows,totalQty:rows.reduce((a,x)=>a+x.qty,0),pricedTotal:rows.reduce((a,x)=>a+(x.extended||0),0),unpriced:rows.filter(x=>x.extended===null).length};}
function parseCatalogText(text){const out=[];const seen=new Set();for(const line of text.split(/\r?\n/)){const m=line.trim().match(/^(\d{4,8})\s+(?:No New|\d{4,8})\s+(\d{4,12})(?:\s|$)/i);if(!m)continue;const k=m[1]+'|'+m[2];if(!seen.has(k)){seen.add(k);out.push({part:m[1],core:m[2],...(catalogModels[m[1]]?{model:catalogModels[m[1]]}:{})});}}return out;}
function parsePriceSheet(wb){const sh=wb.worksheets[0];if(!sh)throw Error('Workbook has no sheet');let hdr=0,part=0,core=0,price=0;for(let i=1;i<=Math.min(sh.rowCount,25);i++){const row=sh.getRow(i);const cells=row.values.map(v=>norm(typeof v==='object'?v?.text??v?.result??'':v));part=cells.indexOf('BASEPN');core=cells.indexOf('COREBASE');price=cells.indexOf('PRICE');if(part>0&&core>0&&price>0){hdr=i;break;}}if(!hdr)throw Error('Expected BASE PN, CORE BASE and PRICE columns');const rows=[];for(let i=hdr+1;i<=sh.rowCount;i++){const row=sh.getRow(i);const p=norm(row.getCell(part).value),c=norm(row.getCell(core).value);const val=row.getCell(price).value;const n=Number(typeof val==='object'?val?.result:val);if((p||c)&&Number.isFinite(n)&&val!==null&&val!=='')rows.push({basePart:p,coreBase:c,price:n,sourceRow:i});}return rows;}
module.exports=function(app,auth){const json=require('express').json({limit:'1mb'});const manager=(req,res,next)=>{if(!auth.manager(req))return res.status(403).json({error:'Born Again Air manager access required'});next();};
app.get('/api/baa/status',manager,async(req,res)=>{try{const [c,sheets,index]=await Promise.all([cat(),priceSheets(),read('box-index',[])]);res.json({catalog:c.length,prices:sheets.current.length,pricesA:sheets.a.length,pricesB:sheets.b.length,boxes:index.length,persistent:remote,warning:remote?null:'Local storage is temporary on Render. Configure Supabase Storage for persistence.'});}catch(e){res.status(500).json({error:e.message});}});
app.get('/api/baa/lookup',manager,async(req,res)=>{try{res.json(lookup(await cat(),await priceSheets(),req.query.q));}catch(e){res.status(500).json({error:e.message});}});
app.get('/api/baa/catalog',manager,async(req,res)=>{try{const rows=await cat();res.json({count:rows.length,rows:rows.filter(x=>!req.query.q||norm(x.part).includes(norm(req.query.q))||norm(x.core).includes(norm(req.query.q))).slice(Math.max(0,Number(req.query.offset)||0),Math.max(0,Number(req.query.offset)||0)+100).map(x=>({...x,index:rows.indexOf(x)}))});}catch(e){res.status(500).json({error:e.message});}});
app.get('/api/baa/prices',manager,async(req,res)=>{try{const sheet=String(req.query.sheet||'current').toLowerCase();if(!['current','a','b'].includes(sheet))return res.status(400).json({error:'Invalid price list'});const sheets=await priceSheets();const rows=sheets[sheet],q=norm(req.query.q);const filtered=rows.map((x,index)=>({...x,index})).filter(x=>!q||norm(x.basePart).includes(q)||norm(x.coreBase).includes(q));res.json({count:filtered.length,rows:filtered.slice(Math.max(0,Number(req.query.offset)||0),Math.max(0,Number(req.query.offset)||0)+100)});}catch(e){res.status(500).json({error:e.message});}});
app.post('/api/baa/prices/row',manager,json,async(req,res)=>{try{const old=await priceSheets(),rows=old.current.slice(),i=Number(req.body.index),basePart=norm(req.body.basePart),coreBase=norm(req.body.coreBase),price=num(req.body.price);if(!basePart&&!coreBase)return res.status(400).json({error:'Part or core number required'});if(!Number.isFinite(price)||price<0)return res.status(400).json({error:'Valid price required'});if(basePart.length>60||coreBase.length>60)return res.sendStatus(400);if(Number.isInteger(i)&&i>=0&&i<rows.length)rows[i]={...rows[i],basePart,coreBase,price};else rows.push({basePart,coreBase,price});await write('price-bundle',{...old,current:rows});res.json({ok:true,count:rows.length});}catch(e){res.status(500).json({error:e.message});}});
// Restore the exact 1,940-row catalog bundled in the November 10 application.
// This is a deliberate manager action; it never touches manually added parts or price lists.
app.post('/api/baa/catalog/restore-original',manager,json,async(req,res)=>{
 if(catalogMutation.busy)return res.status(409).json({error:'Another catalog change is in progress'});
 if(req.body?.confirm!=='RESTORE ORIGINAL')return res.status(400).json({error:'Restore confirmation required'});
 catalogMutation.busy=true;
 try{
  const existing=await read('catalog',seedCatalog);
  const backup='catalog-backup-'+Date.now()+'-'+require('crypto').randomBytes(3).toString('hex');
  await write(backup,existing);
  await write('catalog',seedCatalog);
  res.json({ok:true,count:(await cat()).length,restored:seedCatalog.length,backup});
 }catch(e){res.status(500).json({error:e.message});}
 finally{catalogMutation.busy=false;}
});
const catalogMutation={busy:false};
// The legacy PDF parser can recognize only a handful of rows in some PDFs.
// Reject incomplete imports before any destructive write.
app.post('/api/baa/catalog/upload',manager,require('express').raw({type:['application/pdf','application/octet-stream'],limit:'15mb'}),async(req,res)=>{
 if(catalogMutation.busy)return res.status(409).json({error:'Another catalog change is in progress'});
 catalogMutation.busy=true;
 try{
  if(!Buffer.isBuffer(req.body)||req.body.subarray(0,4).toString()!=='%PDF')return res.status(400).json({error:'Upload a PDF file'});
  const rows=parseCatalogText((await pdfParse(req.body)).text);
  const existing=await read('catalog',seedCatalog);
  if(rows.length<100||existing.length>=100&&rows.length<Math.ceil(existing.length*.8))return res.status(422).json({error:'Only '+rows.length+' database records recognized. Upload rejected; existing database unchanged. Use Add Part Number for corrections.'});
  const backup='catalog-backup-'+Date.now()+'-'+require('crypto').randomBytes(3).toString('hex');
  await write(backup,existing);
  await write('catalog',rows);
  res.json({ok:true,count:(await cat()).length,backup});
 }catch(e){res.status(422).json({error:e.message});}
 finally{catalogMutation.busy=false;}
});
app.post('/api/baa/catalog/row',manager,json,async(req,res)=>{
 if(catalogMutation.busy)return res.status(409).json({error:'Another catalog change is in progress'});
 catalogMutation.busy=true;
 try{
  const part=String(req.body?.part??'').trim(),core=String(req.body?.core??'').trim();
  if(!/^\d{4,8}$/.test(part)||!/^\d{4,12}$/.test(core))return res.status(400).json({error:'Enter a valid numeric REMAN part and core number'});
  if((await cat()).some(r=>norm(r.part)===part&&norm(r.core)===core))return res.status(409).json({error:'This REMAN/core pair already exists'});
  const manual=await read('catalog-manual',[]);
  await write('catalog-manual',manual.concat({part,core,...(catalogModels[part]?{model:catalogModels[part]}:{})}));
  res.json({ok:true,count:(await cat()).length});
 }catch(e){res.status(500).json({error:e.message});}
 finally{catalogMutation.busy=false;}
});
// All price-sheet uploads are manager-only. A and B can be seeded individually;
// a new Current rotates Current -> A -> B and discards the previous B.
app.post('/api/baa/prices/upload',manager,require('express').raw({type:['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/octet-stream'],limit:'12mb'}),async(req,res)=>{
 if(priceUploadLock.busy)return res.status(409).json({error:'Another price-sheet upload is in progress. Please retry.'});
 priceUploadLock.busy=true;
 try{
  const sheet=String(req.query.sheet||'current').toLowerCase();
  if(!['current','a','b'].includes(sheet))return res.status(400).json({error:'Invalid price list'});
  if(!Buffer.isBuffer(req.body)||req.body.subarray(0,2).toString()!=='PK')return res.status(400).json({error:'Upload an XLSX file'});
  const wb=new ExcelJS.Workbook();await wb.xlsx.load(req.body);
  const rows=parsePriceSheet(wb);
  if(!rows.length)return res.status(422).json({error:'No valid price rows; all existing price lists preserved'});
  const old=await priceSheets();
  const next=sheet==='current'
   ?{current:rows,a:old.current,b:old.a}
   :{current:old.current,a:sheet==='a'?rows:old.a,b:sheet==='b'?rows:old.b};
  // One atomic object replacement, rather than writing history and current separately.
  await write('price-bundle',next);
  res.json({ok:true,count:rows.length,sheet,rotated:sheet==='current'});
 }catch(e){res.status(422).json({error:e.message});}
 finally{priceUploadLock.busy=false;}
});
app.get('/api/baa/boxes',manager,async(req,res)=>{try{const ids=await read('box-index',[]);const all=await Promise.all(ids.map(id=>read('box-'+id,null)));res.json(all.filter(Boolean).map(b=>({id:b.id,name:b.name,type:b.type,status:b.status,updatedAt:b.updatedAt,orderId:b.orderId||null,orderReference:b.orderReference||null,boxNumber:b.boxNumber||null,orderComplete:Boolean(b.orderComplete),totalQty:summary(b).totalQty,pricedTotal:summary(b).pricedTotal,unpriced:summary(b).unpriced})).reverse());}catch(e){res.status(500).json({error:e.message});}});
app.post('/api/baa/boxes',manager,json,async(req,res)=>{try{const type=req.body.type;if(!['core-shipping','compressor-shipping','core-receiving'].includes(type))return res.status(400).json({error:'Invalid type'});const id=require('crypto').randomUUID();const b={id,name:String(req.body.name||type).slice(0,100),type,status:'draft',receivingTotal:null,items:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),createdBy:auth.user(req)};await write('box-'+id,b);const ids=await read('box-index',[]);ids.push(id);await write('box-index',ids);res.status(201).json(summary(b));}catch(e){res.status(500).json({error:e.message});}});
// Manager-only deletion; the index is updated before removing the stored box.
app.delete('/api/baa/boxes/:id',manager,async(req,res)=>{try{
 const id=req.params.id;if(!safeId(id))return res.sendStatus(400);
 const ids=await read('box-index',[]);
 if(!ids.includes(id))return res.status(404).json({error:'Saved box not found'});
 const box=await read('box-'+id,null);
 if(!box)return res.status(404).json({error:'Saved box not found'});
 await write('box-index',ids.filter(x=>x!==id));
 await removeStoredBox(id);
 res.json({ok:true,deleted:id});
 }catch(e){res.status(500).json({error:e.message});}
});
app.get('/api/baa/boxes/:id',manager,async(req,res)=>{if(!safeId(req.params.id))return res.sendStatus(400);const b=await read('box-'+req.params.id,null);if(!b)return res.sendStatus(404);res.json(summary(b));});
app.post('/api/baa/boxes/:id/items',manager,json,async(req,res)=>{try{const id=req.params.id;if(!safeId(id))return res.sendStatus(400);const b=await read('box-'+id,null);if(!b)return res.sendStatus(404);if(b.status!=='draft')return res.status(409).json({error:'Finished boxes cannot be edited'});const part=norm(req.body.part),core=norm(req.body.core),qty=Number(req.body.qty);if(!part&&!core)return res.status(400).json({error:'Enter a part or core number'});if(!Number.isSafeInteger(qty)||qty<1||qty>100000)return res.status(400).json({error:'Invalid quantity'});const matches=lookup(await cat(),await priceSheets(),part||core).matches.filter(x=>(!part||norm(x.part)===part)&&(!core||norm(x.core)===core));if(matches.length>1)return res.status(409).json({error:'Duplicate/ambiguous database match. Resolve before adding.'});if(matches.length===0&&b.type!=='compressor-shipping')return res.status(422).json({error:'Number not found in Born Again Air database. Add or correct the record first.'});if(matches.length===1){const m=matches[0];if(m.priceStatus==='ambiguous')return res.status(409).json({error:'Ambiguous price. Correct price sheet before adding.'});}const row=matches[0]||null;const p=part||row?.part||'',c=core||row?.core||'';const pricesRows=await priceSheets();const resolved=priceForSheets(pricesRows,p,c);if(resolved.priceStatus==='ambiguous')return res.status(409).json({error:'Conflicting prices for CORE BASE '+resolved.priceCoreBase+'. Manager review required.'});if(b.type==='core-shipping'&&resolved.priceStatus!=='matched')return res.status(422).json({error:'NOT ON PRICE SHEET — HOLD ASIDE. Print the label; do not add this core to a shipping box.'});const isCompressor=b.type==='compressor-shipping';
 const coreCharge=isCompressor?req.body.coreCharge:null;
 if(isCompressor&&typeof coreCharge!=='boolean')return res.status(400).json({error:'Choose Core Charge: Yes or No for compressor shipping.'});
 
 const unknown=isCompressor&&!row;const missingCorePrice=isCompressor&&!unknown&&coreCharge&&resolved.priceStatus!=='matched';const charge=isCompressor?(unknown||missingCorePrice?null:coreCharge?resolved.price:0):null;
 const price=isCompressor?(unknown||missingCorePrice?null:Math.round((65.5+charge)*100)/100):resolved.price;
 const sameIdentity=b.items.filter(x=>norm(x.part)===p&&norm(x.core)===c&&(!isCompressor||Boolean(x.coreChargeApplied)===coreCharge));
 // One physical part/core pair is one line. Never silently change a recorded
 // non-null price: if prices differ, ask the manager to review the saved box.
 if(sameIdentity.some(x=>x.price!==null&&price!==null&&x.price!==price))return res.status(409).json({error:'This item already exists at a different saved price. Review the box before adding more.'});
 if(sameIdentity.some(x=>x.priceSource&&resolved.priceSource&&x.priceSource!==resolved.priceSource))return res.status(409).json({error:'This item already exists with a different price-sheet source. Review the box before adding more.'});
 const existing=sameIdentity[0];
 if(existing){existing.qty+=qty;if(existing.price===null&&price!==null)existing.price=price;
  for(const extra of sameIdentity.slice(1)){existing.qty+=extra.qty;b.items=b.items.filter(x=>x.id!==extra.id);}
 }else b.items.push({id:require('crypto').randomUUID(),part:p,core:c,qty,price,...(isCompressor?{basePrice:65.5,coreChargeApplied:coreCharge,coreCharge:charge,unknownPart:unknown,missingCorePrice:missingCorePrice,model:row?.model||catalogModels[p]||null,priceSource:resolved.priceSource}:{priceSource:resolved.priceSource})});b.audit=b.audit||[];b.audit.push({action:'add',part:p,core:c,qty,by:auth.user(req),at:new Date().toISOString()});b.updatedAt=new Date().toISOString();await write('box-'+id,b);res.json(summary(b));}catch(e){res.status(500).json({error:e.message});}});
// Editing a finished box requires explicit reopening and is recorded in its audit history.
app.post('/api/baa/boxes/:id/reopen',manager,json,async(req,res)=>{try{if(!safeId(req.params.id))return res.sendStatus(400);const b=await read('box-'+req.params.id,null);if(!b)return res.sendStatus(404);if(b.status!=='finished')return res.status(409).json({error:'Box is not finished'});b.audit=b.audit||[];b.audit.push({action:'reopen',by:auth.user(req),at:new Date().toISOString()});b.status='draft';b.updatedAt=new Date().toISOString();await write('box-'+b.id,b);res.json(summary(b));}catch(e){res.status(500).json({error:e.message});}});
app.patch('/api/baa/boxes/:id',manager,json,async(req,res)=>{try{if(!safeId(req.params.id))return res.sendStatus(400);const b=await read('box-'+req.params.id,null);if(!b)return res.sendStatus(404);if(b.status!=='draft')return res.status(409).json({error:'Reopen finished box before editing'});if(b.type==='core-receiving'&&Object.prototype.hasOwnProperty.call(req.body,'receivingTotal')){const v=num(req.body.receivingTotal);if(v!==null&&(!Number.isFinite(v)||v<0))return res.status(400).json({error:'Enter a valid total dollar amount'});b.audit=b.audit||[];b.audit.push({action:'receiving-total',from:b.receivingTotal??null,to:v,by:auth.user(req),at:new Date().toISOString()});b.receivingTotal=v;b.updatedAt=new Date().toISOString();await write('box-'+b.id,b);return res.json(summary(b));}const name=String(req.body.name||'').trim();if(!name||name.length>100)return res.status(400).json({error:'Box name required (max 100 characters)'});b.audit=b.audit||[];b.audit.push({action:'rename',from:b.name,to:name,by:auth.user(req),at:new Date().toISOString()});b.name=name;b.updatedAt=new Date().toISOString();await write('box-'+b.id,b);res.json(summary(b));}catch(e){res.status(500).json({error:e.message});}});
app.patch('/api/baa/boxes/:id/items/:item',manager,json,async(req,res)=>{try{if(!safeId(req.params.id))return res.sendStatus(400);const b=await read('box-'+req.params.id,null);if(!b)return res.sendStatus(404);if(b.status!=='draft')return res.status(409).json({error:'Reopen finished box before editing'});const x=b.items.find(x=>x.id===req.params.item);if(!x)return res.sendStatus(404);const qty=Number(req.body.qty);if(!Number.isSafeInteger(qty)||qty<1||qty>100000)return res.status(400).json({error:'Invalid quantity'});b.audit=b.audit||[];b.audit.push({action:'quantity',item:x.id,from:x.qty,to:qty,by:auth.user(req),at:new Date().toISOString()});x.qty=qty;b.updatedAt=new Date().toISOString();await write('box-'+b.id,b);res.json(summary(b));}catch(e){res.status(500).json({error:e.message});}});
app.delete('/api/baa/boxes/:id/items/:item',manager,async(req,res)=>{const b=await read('box-'+req.params.id,null);if(!b)return res.sendStatus(404);if(b.status!=='draft')return res.sendStatus(409);b.audit=b.audit||[];b.audit.push({action:'remove',item:req.params.item,by:auth.user(req),at:new Date().toISOString()});b.items=b.items.filter(x=>x.id!==req.params.item);b.updatedAt=new Date().toISOString();await write('box-'+b.id,b);res.json(summary(b));});
app.post('/api/baa/boxes/:id/finish',manager,async(req,res)=>{const b=await read('box-'+req.params.id,null);if(!b)return res.sendStatus(404);if(!b.items.length)return res.status(400).json({error:'Box is empty'});if(b.type==='core-shipping'&&b.items.some(x=>x.price===null||x.price===undefined))return res.status(409).json({error:'Unpriced cores cannot be shipped. Remove and label them for HOLD ASIDE.'});if(b.type==='core-shipping'&&b.items.some(x=>x.price===null)&&!req.body?.acknowledgeUnpriced)return res.status(409).json({error:'Some items have no price. Confirm explicitly before finishing.'});b.status='finished';b.finishedBy=auth.user(req);b.finishedAt=new Date().toISOString();b.updatedAt=b.finishedAt;await write('box-'+b.id,b);res.json(summary(b));});
function compressorSheet(wb,b,models,sheetName){
 const sh=wb.addWorksheet(sheetName);
  // Compressor purchase order only. Other box exports retain their existing path.
  // Purchase-order heading: three merged white sections, then one blank row.
  for(const [range,anchor,label] of [['A1:D1','A1','REMAN. COMPRESSORS'],['E1:H1','E1','R&R Reynosa'],['I1:L1','I1','Date']]){
   sh.mergeCells(range);const cell=sh.getCell(anchor);cell.value=label;cell.font={name:'Calibri',bold:true,size:13,color:{argb:'FF111111'}};cell.alignment={vertical:'middle',horizontal:'left',indent:1};cell.border={bottom:{style:'thin',color:{argb:'FF9AA4AE'}}};
  }
  sh.getRow(1).height=27;sh.getRow(2).height=16;
  const headings=['QTY','PART #','400#','PART','CORE PRICE','REBUILD PRICE','UNIT TOTAL','LINE TOTAL','','OIL','CORES LOST','CORES USED'];
  const widths=[9,17,20,20,16,18,16,18,5,12,16,16];
  headings.forEach((heading,i)=>{const col=i+1;sh.getColumn(col).width=widths[i];const c=sh.getCell(3,col);c.value=heading;c.font={bold:true,color:{argb:'FFFFFFFF'},size:10};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF142743'}};c.alignment={horizontal:'center',vertical:'middle',wrapText:true};});
  sh.getRow(3).height=20;
  const money='"$"#,##0.00';
  // Catalog currently stores part/core; model appears only if the catalog actually has one.
  [...b.items].sort((a,b)=>String(a.core??'').localeCompare(String(b.core??''),undefined,{numeric:true,sensitivity:'base'})).forEach((x,i)=>{
   const n=i+4,qty=Number(x.qty),unknown=Boolean(x.unknownPart),missing=Boolean(x.missingCorePrice),base=unknown?null:Number(x.basePrice??65.5),charge=unknown||missing?null:Number(x.coreCharge??Math.max(0,Number(x.price)-base));
   sh.getCell(`A${n}`).value=qty;
   sh.getCell(`B${n}`).value=x.part||null;
   sh.getCell(`C${n}`).value=unknown?null:x.part?'400'+String(x.part):null;
   sh.getCell(`D${n}`).value=unknown?null:x.model||models.get(norm(x.part))||catalogModels[norm(x.part)]||null;
   sh.getCell(`E${n}`).value=missing?'?':charge;
   sh.getCell(`F${n}`).value=base;
   sh.getCell(`G${n}`).value={formula:`IF(OR(NOT(ISNUMBER(E${n})),NOT(ISNUMBER(F${n}))),"",E${n}+F${n})`,result:(!unknown&&!missing&&Number.isFinite(charge)&&Number.isFinite(base))?charge+base:''};
   sh.getCell(`H${n}`).value={formula:`IF(OR(NOT(ISNUMBER(A${n})),NOT(ISNUMBER(G${n}))),"",A${n}*G${n})`,result:(!unknown&&!missing&&Number.isFinite(charge)&&Number.isFinite(base))?qty*(charge+base):''};
   sh.getCell(`I${n}`).value=unknown?null:x.priceSource==='a'?'*':x.priceSource==='b'?'**':null;
   sh.getCell(`J${n}`).value={formula:`IF(ISNUMBER(A${n}),A${n}*4,"")`,result:qty*4};
   for(const col of ['E','F','G','H'])sh.getCell(`${col}${n}`).numFmt=money;
   sh.getCell(`J${n}`).numFmt='0" oz"';
   for(let c=1;c<=12;c++){const cell=sh.getCell(n,c);cell.alignment={vertical:'middle',horizontal:[1,5,6,7,8,9,10].includes(c)?'center':'left'};cell.border={bottom:{style:'hair',color:{argb:'FFDCE5EF'}}};if(i%2===1)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF3F7FC'}};}
   if(missing){for(const col of ['B','E']){const cell=sh.getCell(`${col}${n}`);cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFFF00'}};cell.font={bold:true,color:{argb:'FF000000'}};}}if(unknown){const cell=sh.getCell(`B${n}`);cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFF0000'}};cell.font={bold:true,color:{argb:'FFFFFFFF'}};}sh.getRow(n).height=22;
  });
  // Keep the existing three blank spacer rows before totals.
  const t=b.items.length+7;
  // No colored footer: quantity and price totals only, three blank rows below items.
  sh.getCell(`B${t}`).value=null;
  sh.getCell(`A${t}`).value={formula:`SUM(A4:A${t-1})`,result:b.items.reduce((v,x)=>v+Number(x.qty||0),0)};
  sh.getCell(`H${t}`).value={formula:`SUM(H4:H${t-1})`,result:b.items.reduce((sum,x)=>{if(x.unknownPart||x.missingCorePrice)return sum;const qty=Number(x.qty),base=Number(x.basePrice??65.5),charge=Number(x.coreCharge??Math.max(0,Number(x.price)-base));return sum+(Number.isFinite(qty)&&Number.isFinite(base)&&Number.isFinite(charge)?qty*(base+charge):0);},0)};
  sh.getCell(`H${t}`).numFmt=money;
  for(const col of ['A','H']){const cell=sh.getCell(`${col}${t}`);cell.font={bold:true,color:{argb:'FF111111'},underline:col==='H'?'double':false};cell.alignment={horizontal:'center'};}
  sh.getCell(`H${t}`).border={bottom:{style:'double',color:{argb:'FF111111'}}};
  sh.getRow(t).height=23;
  sh.views=[{state:'frozen',ySplit:3}];sh.pageSetup={fitToPage:true,fitToWidth:1,fitToHeight:0,printArea:`A1:L${t}`,orientation:'landscape'};

}
// Compressor orders reuse the existing BAA box-index and box objects. No new storage keys.
app.post('/api/baa/compressor-orders',manager,json,async(req,res)=>{try{
 const reference=String(req.body.reference||'').trim();if(!reference||reference.length>75)return res.status(400).json({error:'Order reference required (max 75 characters)'});
 const id=require('crypto').randomUUID(),now=new Date().toISOString();
 const b={id,name:`${reference} - Box 1`,type:'compressor-shipping',status:'draft',orderId:id,orderReference:reference,boxNumber:1,orderComplete:false,receivingTotal:null,items:[],createdAt:now,updatedAt:now,createdBy:auth.user(req)};
 await write('box-'+id,b);const ids=await read('box-index',[]);ids.push(id);await write('box-index',ids);res.status(201).json(summary(b));
 }catch(e){res.status(500).json({error:e.message});}});
app.get('/api/baa/compressor-orders/:id',manager,async(req,res)=>{try{
 if(!safeId(req.params.id))return res.sendStatus(400);const ids=await read('box-index',[]);const all=(await Promise.all(ids.map(id=>read('box-'+id,null)))).filter(b=>b?.orderId===req.params.id&&b.type==='compressor-shipping').sort((a,b)=>a.boxNumber-b.boxNumber);
 if(!all.length)return res.sendStatus(404);res.json({reference:all[0].orderReference,complete:Boolean(all[0].orderComplete),boxes:all.map(summary)});
 }catch(e){res.status(500).json({error:e.message});}});
app.post('/api/baa/compressor-orders/:id/next-box',manager,json,async(req,res)=>{try{
 if(!safeId(req.params.id))return res.sendStatus(400);const ids=await read('box-index',[]);const all=(await Promise.all(ids.map(id=>read('box-'+id,null)))).filter(b=>b?.orderId===req.params.id&&b.type==='compressor-shipping').sort((a,b)=>a.boxNumber-b.boxNumber);
 if(!all.length)return res.sendStatus(404);if(all[0].orderComplete)return res.status(409).json({error:'Order already complete'});
 if(all.some(b=>b.status!=='finished'))return res.status(409).json({error:'Finish the current box first'});
 const number=all.length+1,id=require('crypto').randomUUID(),now=new Date().toISOString();const b={id,name:`${all[0].orderReference} - Box ${number}`,type:'compressor-shipping',status:'draft',orderId:req.params.id,orderReference:all[0].orderReference,boxNumber:number,items:[],createdAt:now,updatedAt:now,createdBy:auth.user(req)};
 await write('box-'+id,b);ids.push(id);await write('box-index',ids);res.status(201).json(summary(b));
 }catch(e){res.status(500).json({error:e.message});}});
app.post('/api/baa/compressor-orders/:id/complete',manager,json,async(req,res)=>{try{
 if(!safeId(req.params.id))return res.sendStatus(400);const ids=await read('box-index',[]);const all=(await Promise.all(ids.map(id=>read('box-'+id,null)))).filter(b=>b?.orderId===req.params.id&&b.type==='compressor-shipping');
 if(!all.length)return res.sendStatus(404);if(all.some(b=>b.status!=='finished'))return res.status(409).json({error:'Finish every box first'});
 const first=all.find(b=>b.id===req.params.id);if(!first)return res.sendStatus(404);first.orderComplete=true;first.updatedAt=new Date().toISOString();await write('box-'+first.id,first);res.json({ok:true});
 }catch(e){res.status(500).json({error:e.message});}});
// Delete a complete shipping order (all its boxes), manager-only; no other tenants touched.
async function deleteShippingOrder(req,res,type){try{
 const id=req.params.id;if(!safeId(id))return res.sendStatus(400);
 const ids=await read('box-index',[]);
 const all=(await Promise.all(ids.map(boxId=>read('box-'+boxId,null)))).filter(b=>b?.orderId===id&&b.type===type);
 if(!all.length)return res.status(404).json({error:'Order not found'});
 const removing=new Set(all.map(b=>b.id));
 await write('box-index',ids.filter(boxId=>!removing.has(boxId)));
 for(const b of all)await removeStoredBox(b.id);
 res.json({ok:true,deletedBoxes:all.length});
 }catch(e){res.status(500).json({error:e.message});}}
app.delete('/api/baa/compressor-orders/:id',manager,(req,res)=>deleteShippingOrder(req,res,'compressor-shipping'));
app.delete('/api/baa/core-orders/:id',manager,(req,res)=>deleteShippingOrder(req,res,'core-shipping'));
app.get('/api/baa/compressor-orders/:id/export',manager,async(req,res)=>{try{
 if(!safeId(req.params.id))return res.sendStatus(400);const ids=await read('box-index',[]);const boxes=(await Promise.all(ids.map(id=>read('box-'+id,null)))).filter(b=>b?.orderId===req.params.id&&b.type==='compressor-shipping').sort((a,b)=>a.boxNumber-b.boxNumber);
 if(!boxes.length)return res.sendStatus(404);const catalog=await cat();const models=new Map(catalog.filter(r=>r.model).map(r=>[norm(r.part),String(r.model)]));const wb=new ExcelJS.Workbook();wb.calcProperties.fullCalcOnLoad=true;
 boxes.forEach(b=>compressorSheet(wb,b,models,`Box ${b.boxNumber}`));const data=await wb.xlsx.writeBuffer();const filename=String(boxes[0].orderReference).replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,60);
 res.set({'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="BAA-${filename}.xlsx"`});res.send(Buffer.from(data));
 }catch(e){res.status(500).json({error:e.message});}});
app.post('/api/baa/core-orders',manager,json,async(req,res)=>{try{
 const reference=String(req.body.reference||'').trim();if(!reference||reference.length>75)return res.status(400).json({error:'Order reference required (max 75 characters)'});
 const id=require('crypto').randomUUID(),now=new Date().toISOString();
 const b={id,name:`${reference} - Box 1`,type:'core-shipping',status:'draft',orderId:id,orderReference:reference,boxNumber:1,orderComplete:false,receivingTotal:null,items:[],createdAt:now,updatedAt:now,createdBy:auth.user(req)};
 await write('box-'+id,b);const ids=await read('box-index',[]);ids.push(id);await write('box-index',ids);res.status(201).json(summary(b));
 }catch(e){res.status(500).json({error:e.message});}});
app.get('/api/baa/core-orders/:id',manager,async(req,res)=>{try{
 if(!safeId(req.params.id))return res.sendStatus(400);const ids=await read('box-index',[]);const all=(await Promise.all(ids.map(id=>read('box-'+id,null)))).filter(b=>b?.orderId===req.params.id&&b.type==='core-shipping').sort((a,b)=>a.boxNumber-b.boxNumber);
 if(!all.length)return res.sendStatus(404);res.json({reference:all[0].orderReference,complete:Boolean(all[0].orderComplete),boxes:all.map(summary)});
 }catch(e){res.status(500).json({error:e.message});}});
app.post('/api/baa/core-orders/:id/next-box',manager,json,async(req,res)=>{try{
 if(!safeId(req.params.id))return res.sendStatus(400);const ids=await read('box-index',[]);const all=(await Promise.all(ids.map(id=>read('box-'+id,null)))).filter(b=>b?.orderId===req.params.id&&b.type==='core-shipping').sort((a,b)=>a.boxNumber-b.boxNumber);
 if(!all.length)return res.sendStatus(404);if(all[0].orderComplete)return res.status(409).json({error:'Order already complete'});
 if(all.some(b=>b.status!=='finished'))return res.status(409).json({error:'Finish the current box first'});
 const number=all.length+1,id=require('crypto').randomUUID(),now=new Date().toISOString();const b={id,name:`${all[0].orderReference} - Box ${number}`,type:'core-shipping',status:'draft',orderId:req.params.id,orderReference:all[0].orderReference,boxNumber:number,items:[],createdAt:now,updatedAt:now,createdBy:auth.user(req)};
 await write('box-'+id,b);ids.push(id);await write('box-index',ids);res.status(201).json(summary(b));
 }catch(e){res.status(500).json({error:e.message});}});
app.post('/api/baa/core-orders/:id/complete',manager,json,async(req,res)=>{try{
 if(!safeId(req.params.id))return res.sendStatus(400);const ids=await read('box-index',[]);const all=(await Promise.all(ids.map(id=>read('box-'+id,null)))).filter(b=>b?.orderId===req.params.id&&b.type==='core-shipping');
 if(!all.length)return res.sendStatus(404);if(all.some(b=>b.status!=='finished'))return res.status(409).json({error:'Finish every box first'});
 const first=all.find(b=>b.id===req.params.id);if(!first)return res.sendStatus(404);first.orderComplete=true;first.updatedAt=new Date().toISOString();await write('box-'+first.id,first);res.json({ok:true});
 }catch(e){res.status(500).json({error:e.message});}});
function coreShippingWorksheet(wb,b,sheetName){
 const sh=wb.addWorksheet(sheetName);
 // Core Shipping and Core Receiving only: merged identification row and white spacer.
 const coreHeading=b.type==='core-receiving'?'CORES RECEIVING':'CORES';
 for(const [range,anchor,label] of [['A1:D1','A1',coreHeading],['E1:H1','E1','CUSTOMER'],['I1:K1','I1','DATE']]){
  sh.mergeCells(range);const cell=sh.getCell(anchor);cell.value=label;
  cell.font={name:'Calibri',bold:true,size:13,color:{argb:'FF111111'}};
  cell.alignment={vertical:'middle',horizontal:'left',indent:1};
  cell.border={bottom:{style:'thin',color:{argb:'FF9AA4AE'}}};
 }
 sh.getRow(1).height=27;sh.getRow(2).height=16;
 for(const [col,title] of (b.type==='compressor-shipping'?[['A','Core Number'],['C','Part Number'],['E','Qty'],['G','Price Per Unit'],['I','Core Charge'],['K','Total Price']]:[['A','Core Number'],['C','Part Number'],['E','Qty'],['G','Price Per Unit'],['I','Total Price']]))sh.getCell(col+'3').value=title;
 for(const [col,width] of [['A',20],['B',5],['C',20],['D',5],['E',12],['F',5],['G',20],['H',5],['I',20],['J',5],['K',20]])sh.getColumn(col).width=width;
 for(const col of (b.type==='compressor-shipping'?['A','C','E','G','I','K']:['A','C','E','G','I'])){const c=sh.getCell(col+'3');c.font={bold:true,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF142743'}};c.alignment={vertical:'middle'};}
 sh.getRow(3).height=23;const money='"$"#,##0.00';
 [...b.items].sort((a,b)=>{const x=String(a.core??""),y=String(b.core??"");return x.localeCompare(y,undefined,{numeric:true,sensitivity:"base"});}).forEach((x,i)=>{const n=i+4;sh.getCell(`A${n}`).value=x.core||null;sh.getCell(`C${n}`).value=x.part||null;sh.getCell(`E${n}`).value=x.qty;
  if(x.price!==null&&x.price!==undefined){const unit=Number(x.price);if(b.type==='compressor-shipping'){const base=Number(x.basePrice??65.5),charge=Number(x.coreCharge??Math.max(0,unit-base));sh.getCell(`G${n}`).value=base;sh.getCell(`I${n}`).value=charge;sh.getCell(`K${n}`).value={formula:`E${n}*(G${n}+I${n})`,result:Number(x.qty)*(base+charge)};sh.getCell(`J${n}`).value=x.priceSource==='a'?'*':x.priceSource==='b'?'**':null;}else{sh.getCell(`G${n}`).value=unit;sh.getCell(`I${n}`).value={formula:`E${n}*G${n}`,result:Number(x.qty)*unit};sh.getCell(`H${n}`).value=x.priceSource==='a'?'*':x.priceSource==='b'?'**':null;}}
  sh.getCell(`G${n}`).numFmt=money;sh.getCell(`I${n}`).numFmt=money;sh.getCell(`K${n}`).numFmt=money;
 });
 // Three completely blank rows between the final item and the totals row.
 const t=b.items.length+7;sh.getCell(`C${t}`).value='TOTAL';
 sh.getCell(`E${t}`).value={formula:`SUM(E4:E${t-1})`,result:b.items.reduce((sum,x)=>sum+Number(x.qty||0),0)};
 sh.getCell(`${b.type==='compressor-shipping'?'K':'I'}${t}`).value={formula:`SUM(${b.type==='compressor-shipping'?'K':'I'}4:${b.type==='compressor-shipping'?'K':'I'}${t-1})`,result:b.items.reduce((sum,x)=>sum+(x.price===null||x.price===undefined?0:Number(x.qty)*Number(x.price)),0)};
 sh.getCell(`${b.type==='compressor-shipping'?'K':'I'}${t}`).numFmt=money;sh.getCell(`${b.type==='compressor-shipping'?'K':'I'}${t}`).font={bold:true,underline:'double'};sh.getCell(`C${t}`).font={bold:true};sh.getCell(`E${t}`).font={bold:true};
 const missing=b.items.some(x=>x.price===null||x.price===undefined);
 if(missing)sh.getCell(`A${t+2}`).value='WARNING: Missing prices; total excludes unpriced items.';
 sh.views=[{state:'frozen',ySplit:3}];sh.pageSetup={fitToPage:true,fitToWidth:1,fitToHeight:0,printArea:`A1:${b.type==='compressor-shipping'?'K':'I'}${missing?t+2:t}`};
}

app.get('/api/baa/core-orders/:id/export',manager,async(req,res)=>{try{
 if(!safeId(req.params.id))return res.sendStatus(400);
 const ids=await read('box-index',[]);const boxes=(await Promise.all(ids.map(id=>read('box-'+id,null)))).filter(b=>b?.orderId===req.params.id&&b.type==='core-shipping').sort((a,b)=>a.boxNumber-b.boxNumber);
 if(!boxes.length)return res.sendStatus(404);const wb=new ExcelJS.Workbook();wb.calcProperties.fullCalcOnLoad=true;
 for(const b of boxes)coreShippingWorksheet(wb,b,`Box ${b.boxNumber}`);
 const data=await wb.xlsx.writeBuffer();const filename=String(boxes[0].orderReference).replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,60);
 res.set({'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="BAA-Cores-${filename}.xlsx"`});res.send(Buffer.from(data));
 }catch(e){res.status(500).json({error:e.message});}});
app.get('/api/baa/boxes/:id/export',manager,async(req,res)=>{try{
 const b=await read('box-'+req.params.id,null);if(!b)return res.sendStatus(404);
 const wb=new ExcelJS.Workbook();wb.calcProperties.fullCalcOnLoad=true;
 if(b.type==='compressor-shipping'){
  const catalog=await cat();const models=new Map(catalog.filter(r=>r.model).map(r=>[norm(r.part),String(r.model)]));
  compressorSheet(wb,b,models,'Buy List');
  const data=await wb.xlsx.writeBuffer();res.set({'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="BAA-${b.type}-${b.id.slice(0,8)}.xlsx"`});return res.send(Buffer.from(data));
 }

 coreShippingWorksheet(wb,b,'Buy List');
 const data=await wb.xlsx.writeBuffer();res.set({'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="BAA-${b.type}-${b.id.slice(0,8)}.xlsx"`});res.send(Buffer.from(data));
 }catch(e){res.status(500).json({error:e.message});}});

// Printable Core Shipping PDF, with source marks in the narrow column next to price.
// This is additive: existing Excel exports are untouched.
function makeCorePdf(box){
 const sorted=[...box.items].filter(x=>Number.isFinite(x.price)).sort((a,b)=>String(a.core||'').localeCompare(String(b.core||''),undefined,{numeric:true}));
 const pages=[];for(let i=0;i<sorted.length;i+=35)pages.push(sorted.slice(i,i+35));if(!pages.length)pages.push([]);
 const objs=[null],add=v=>(objs.push(v),objs.length-1);
 const font=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
 const streams=[];const pageIds=[];
 const escPdf=x=>String(x??'').replace(/[^\x20-\x7e]/g,'?').replace(/([\\()])/g,'\\$1');
 const txt=(x,y,v,size=10)=>`BT /F1 ${size} Tf ${x} ${y} Td (${escPdf(v)}) Tj ET\n`;
 for(let i=0;i<pages.length;i++){
  let body=txt(40,750,'BORN AGAIN AIR - CORE SHIPPING',15)+txt(40,728,box.name||'',10)+txt(40,701,'CORE NUMBER',9)+txt(175,701,'PART NUMBER',9)+txt(300,701,'QTY',9)+txt(360,701,'UNIT PRICE',9)+txt(480,701,'TOTAL',9);
  pages[i].forEach((x,j)=>{const y=680-j*18;body+=txt(40,y,x.core||'')+txt(175,y,x.part||'')+txt(300,y,x.qty)+txt(360,y,'$'+Number(x.price).toFixed(2))+txt(448,y,x.priceSource==='a'?'*':x.priceSource==='b'?'**':'')+txt(480,y,'$'+(Number(x.price)*Number(x.qty)).toFixed(2));});
  body+=txt(40,34,`Page ${i+1} of ${pages.length}`,9);
  const len=Buffer.byteLength(body,'latin1');const stream=add(`<< /Length ${len} >>\nstream\n${body}endstream`);streams.push(stream);
  pageIds.push(add(''));
 }
 const kids=pageIds.map(id=>`${id} 0 R`).join(' ');const pagesId=add(`<< /Type /Pages /Kids [${kids}] /Count ${pageIds.length} >>`);
 pageIds.forEach((id,i)=>objs[id]=`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${streams[i]} 0 R >>`);
 const root=add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
 let out='%PDF-1.4\n';const offsets=[0];for(let i=1;i<objs.length;i++){offsets.push(Buffer.byteLength(out,'latin1'));out+=`${i} 0 obj\n${objs[i]}\nendobj\n`;}
 const start=Buffer.byteLength(out,'latin1');out+=`xref\n0 ${objs.length}\n0000000000 65535 f \n`;
 for(let i=1;i<objs.length;i++)out+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;
 out+=`trailer\n<< /Size ${objs.length} /Root ${root} 0 R >>\nstartxref\n${start}\n%%EOF`;
 return Buffer.from(out,'latin1');
}
app.get('/api/baa/boxes/:id/export.pdf',manager,async(req,res)=>{try{
 const b=await read('box-'+req.params.id,null);if(!b)return res.sendStatus(404);
 if(b.type!=='core-shipping')return res.status(400).json({error:'PDF is available for Core Shipping only'});
 const data=makeCorePdf(b);res.set({'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="BAA-core-shipping-${b.id.slice(0,8)}.pdf"`});res.send(data);
}catch(e){res.status(500).json({error:e.message});}});

};
