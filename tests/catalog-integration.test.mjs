import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {evaluateSocketCompatibility} from '../public/socket-compatibility.js';
import {createBuildPdf as generateRealBuildPdf} from '../public/build-pdf.js';
import {verifiedPart} from './fixtures/socket-parts.mjs';

const categories = ['cpu','motherboard','graphics_card','ram','storage','power_supply','case'];
const part = (category, suffix = '', socket = 'AM5') => ({...verifiedPart(category,socket,Date.now(),suffix),name:category+suffix,manufacturer:'Example',priceCents:100});
const source = readFileSync(new URL('../public/app.js',import.meta.url),'utf8').replace(/^import [^\r\n]*\r?\n/gm,'');
async function setup() {
  const elements = new Map(), storage = new Map();
  const timers = new Map();
  const requests = [];
  let timerId=0;
  const el = () => ({value:'',dataset:{},classList:{toggle(){}},focus(){},showModal(){this.open=true},children:[],append(...items){this.children.push(...items)},replaceChildren(){this.children=[]},setAttribute(key,value){this[key]=value},click(){}});
  const get = id => {if(!elements.has(id)) elements.set(id,el()); return elements.get(id)};
  let respond = category => ({status:'success',data:{isSampleData:false,parts:[part(category),part(category,'-2','LGA1700')]}});
  let exported;
  const context = {evaluateSocketCompatibility, createBuildPdf: args => new Blob([JSON.stringify({...args, compatibilityChecked:false})], {type:'application/json'}), document:{getElementById:get,createElement:el},
    setTimeout:(callback,delay)=>{timers.set(++timerId,{callback,delay});return timerId},
    clearTimeout:id=>timers.delete(id),
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},Intl,Blob,console,Set,JSON,
    URL:class extends URL {static createObjectURL(blob){exported=blob;return 'blob:test'} static revokeObjectURL(){}},
    fetch:async (url, options) => {requests.push({url,options});const category=new URL(url,'http://local').searchParams.get('category');const data=respond(category,new URL(url,'http://local'));return data===null?{ok:false}:{ok:data?.httpStatus===undefined,status:data?.httpStatus||200,json:async()=>data}}};
  vm.createContext(context);
  vm.runInContext(source+'\n globalThis.inspect = () => ({parts,build,isSampleData}); globalThis.refresh=load;',context);
  await new Promise(resolve=>setImmediate(resolve));
  const add = async id => {
    const details=get('parts').children.map(card=>card.children[1].children.at(-1).children[0]).find(button=>button['aria-label']===`View details for ${id}`);
    details.onclick();
    const offers=get('part-dialog-content').children.find(child=>child.className==='retailer-offers');
    const select=offers.children[0].children[1].children[1];
    select.onclick();
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(select['aria-checked'],'true');
  };
  return {context,get,add,storage,timers,requests,setResponse:fn=>respond=fn,download:async()=>{get('export').onclick();return JSON.parse(await exported.text())}};
}

test('all seven categories, add, replace, remove, clear, persistence, refresh and download',async()=>{
  const h=await setup();
  assert.equal(h.context.inspect().parts.length,14);
  for(const category of categories) await h.add(category);
  assert.equal(h.get('total').textContent,'$7.00');
  assert.equal(h.get('build-count').textContent,7);
  assert.equal(h.get('socket-compatibility').dataset.state,'match');
  await h.add('motherboard-2');
  assert.equal(h.get('socket-compatibility').dataset.state,'mismatch');
  assert.equal(h.get('build-count').textContent,7);
  const data=await h.download();
  assert.equal(data.totalCents,700); assert.equal(data.parts.length,7);
  assert.equal(data.compatibilityChecked,false);assert.equal(data.isSampleData,false);
  assert.equal(data.socketCompatibility.status,'mismatch');
  await h.context.refresh();
  assert.equal(h.context.inspect().build.motherboard,'motherboard-2');
  assert.equal(JSON.parse(h.storage.get('buildlab-build')).cpu,'cpu');
  h.get('build-items').children[1].children[1].onclick();
  assert.equal(h.get('socket-compatibility').dataset.state,'waiting');
  assert.equal(h.get('total').textContent,'$6.00');
  h.get('clear').onclick();
  assert.equal(h.get('total').textContent,'$0.00');
  assert.equal(h.get('export').disabled,true);assert.equal(h.get('build-count').textContent,0);
});

test('all seven listings load before optional socket failure and remain visible',async()=>{
  const h=await setup();
  const requests=[];
  h.setResponse((category,url)=>{
    requests.push(url);
    if(url.searchParams.get('metadata')!=='0')return null;
    return {status:'success',data:{parts:[part(category)]}};
  });
  await h.context.refresh();
  assert.deepEqual(requests.slice(0,7).map(url=>url.searchParams.get('category')),categories);
  assert.ok(requests.slice(0,7).every(url=>url.searchParams.get('metadata')==='0'));
  assert.equal(h.context.inspect().parts.length,7);
  await h.add('cpu');await h.add('motherboard');
  assert.equal(h.get('socket-compatibility').dataset.state,'unknown');
  assert.equal((await h.download()).socketCompatibility.status,'unknown');
});

for(const failedCategory of ['cpu','motherboard']) test(`${failedCategory} refresh failure cannot match or export cached compatibility`,async()=>{
  const h=await setup();await h.add('cpu');await h.add('motherboard');
  h.setResponse(category=>category===failedCategory?null:{status:'success',data:{parts:[part(category)]}});
  await h.context.refresh();
  assert.equal(h.get('socket-compatibility').dataset.state,'unknown');
  assert.equal(h.get('retry').hidden,false);
  assert.equal((await h.download()).socketCompatibility.status,'unknown');
  assert.equal(h.context.inspect().build[failedCategory],failedCategory);
});

for(const invalid of ['missing socket','missing provenance','unsupported socket','stale socket','wrong category','error envelope','invalid price','duplicate IDs']) test(`${invalid} never enables a match`,async()=>{
  const h=await setup();await h.add('cpu');await h.add('motherboard');
  h.setResponse(category=>{
    const p=part(category);
    if(invalid==='missing socket')p.specs={feature1:'AM5 text is not verified socket data'};
    if(invalid==='missing provenance')delete p.specs.socketProvenance;
    if(invalid==='unsupported socket')p.specs.socket='AM999';
    if(invalid==='stale socket')p.specs.socketProvenance.expiresAt=new Date(Date.now()-1000).toISOString();
    if(invalid==='wrong category')p.category='ram';
    if(invalid==='invalid price')p.priceCents=-1;
    return {status:invalid==='error envelope'?'error':'success',data:{parts:invalid==='duplicate IDs'?[p,p]:[p]}};
  });
  await h.context.refresh();
  assert.equal(h.get('socket-compatibility').dataset.state,'unknown');
  assert.equal((await h.download()).socketCompatibility.status,'unknown');
  // PDF blob URLs are revoked asynchronously; that timer is not socket expiry.
  assert.equal([...h.timers.values()].filter(timer=>timer.delay!==60000).length,0);
});

test('an open page drops a match when selected socket evidence expires',async()=>{
  const h=await setup();await h.add('cpu');await h.add('motherboard');
  assert.equal(h.get('socket-compatibility').dataset.state,'match');
  const timer=[...h.timers.values()][0];
  assert.ok(timer.delay>0&&timer.delay<=3600000);
  const cpu=h.context.inspect().parts.find(part=>part.id==='cpu');
  cpu.specs.socketProvenance.expiresAt=new Date(Date.now()-1).toISOString();
  timer.callback();
  assert.equal(h.get('socket-compatibility').dataset.state,'unknown');
  const exported=await h.download();
  assert.equal(exported.socketCompatibility.status,'unknown');
  assert.equal(exported.compatibilityChecked,false);
});

test('entered prices survive reopening and switching retailers, and can be edited', async()=>{
  const h=await setup();
  const open=()=>h.get('parts').children[0].children[1].children.at(-1).children[0].onclick();
  const rows=()=>h.get('part-dialog-content').children.find(child=>child.className==='retailer-offers').children;
  open();
  await new Promise(resolve=>setImmediate(resolve));
  let input=rows()[1].children[1].children[0].children[0];
  input.value='49.99'; input.oninput(); input.onblur({relatedTarget:null});
  assert.equal(rows()[1].children[1].children[0].textContent,'$49.99');
  open();
  assert.equal(rows()[1].children[1].children[0].textContent,'$49.99');
  rows()[1].children[1].children[1].onclick();
  assert.equal(h.get('total').textContent,'$49.99');
  rows()[0].children[1].children[1].onclick();
  open();
  assert.equal(rows()[1].children[1].children[0].textContent,'$49.99');
  rows()[1].children[1].children[2].onclick();
  input=rows()[1].children[1].children[0].children[0];
  assert.equal(input.value,'49.99');
  input.value='59.99';input.oninput();input.onkeydown({key:'Enter',preventDefault(){}});
  assert.equal(rows()[1].children[1].children[0].textContent,'$59.99');
});

test('resolved W7500 links replace search rows without losing entered prices', async()=>{
  const h=await setup();
  const resolved=[
    {source:'Amazon',sourceUrl:'https://www.amazon.com/dp/B0CK2DB8NY'},
    {source:'Newegg',sourceUrl:'https://www.newegg.com/p/N82E16814105117'},
    {source:'Best Buy',sourceUrl:'https://www.bestbuy.com/product/w7500/JXKX9WS2K9/sku/12253096'},
  ];
  h.setResponse(category=>category===null?{offers:resolved}:{status:'success',data:{parts:[part(category)]}});
  h.get('parts').children[0].children[1].children.at(-1).children[0].onclick();
  const rows=()=>h.get('part-dialog-content').children.find(child=>child.className==='retailer-offers').children;
  await new Promise(resolve=>setImmediate(resolve));
  const input=rows()[1].children[1].children[0].children[0];
  input.value='429';input.oninput();input.onblur({relatedTarget:null});
  await new Promise(resolve=>setImmediate(resolve));
  for(let index=0;index<resolved.length;index++){
    const link=rows()[index+1].children[0].children[0];
    assert.equal(link.href,resolved[index].sourceUrl);
    assert.equal(link.textContent,resolved[index].source);
  }
  assert.equal(rows()[1].children[1].children[0].textContent,'$429.00');
});

test('unmatched retailers link to clearly labeled search results, not verified product pages',async()=>{
  const h=await setup();
  h.get('parts').children[0].children[1].children.at(-1).children[0].onclick();
  const rows=h.get('part-dialog-content').children.find(child=>child.className==='retailer-offers').children;
  for(const row of rows.slice(1)){
    assert.ok(row.children[0].children[0].href.startsWith('https://'));
    assert.match(row.children[0].children[1].textContent,/Search results/);
    assert.equal(h.context.verifiedProductUrl(row.children[0].children[0].textContent,row.children[0].children[0].href),null);
  }
  assert.equal(h.context.verifiedProductUrl('Amazon','https://www.amazon.com/s?k=W6400'),null);
  assert.equal(h.context.verifiedProductUrl('Best Buy','https://www.bestbuy.com/site/searchpage.jsp?st=W6400'),null);
  assert.equal(h.context.verifiedProductUrl('Newegg','https://www.newegg.com/p/pl?d=W6400'),null);
  assert.equal(h.context.verifiedProductUrl('Amazon','https://amazon.com.evil.example/dp/B0GCMFR35P'),null);
  assert.equal(h.context.verifiedProductUrl('Amazon','https://www.amazon.com/dp/B0GCMFR35P'),'https://www.amazon.com/dp/B0GCMFR35P');
});

test('search fallback encodes the model and upgrades to a matched product link',async()=>{
  const h=await setup();
  const model='CPU A&B / 123';
  const search=h.context.retailerSearchUrl('Newegg',{model,name:'Example CPU'});
  assert.equal(new URL(search).searchParams.get('d'),model);
  assert.equal(new URL(search).hostname,'www.newegg.com');
  assert.equal(h.context.retailerSearchUrl('Unknown store',{model}),null);
  assert.equal(h.context.retailerSearchUrl('Amazon',{}),null);
  let resolveLinks;
  h.setResponse((category,url)=>url.searchParams.get('links')==='1'
    ?new Promise(resolve=>{resolveLinks=resolve}):{offers:[]});
  h.get('parts').children[0].children[1].children.at(-1).children[0].onclick();
  const rows=()=>h.get('part-dialog-content').children.find(child=>child.className==='retailer-offers').children;
  assert.match(rows()[2].children[0].children[0].href,/\/p\/pl\?/);
  resolveLinks({offers:[{source:'Newegg',sourceUrl:'https://www.newegg.com/p/N82E16814105117'}]});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(rows()[2].children[0].children[0].href,'https://www.newegg.com/p/N82E16814105117');
  assert.doesNotMatch(rows()[2].children[0].children[1].textContent,/Search results/);
});

test('single direct-page price is shown and ambiguous offers retain manual input',async()=>{
  const h=await setup();
  h.setResponse(category=>category===null?{offers:[
    {source:'Amazon',sourceUrl:'https://www.amazon.com/dp/B0CK2DB8NY',priceCents:42900},
    {source:'Newegg',sourceUrl:'https://www.newegg.com/p/N82E16814105117',priceIsAmbiguous:true},
  ]}:{status:'success',data:{parts:[part(category)]}});
  h.get('parts').children[0].children[1].children.at(-1).children[0].onclick();
  const loadingRows=h.get('part-dialog-content').children.find(child=>child.className==='retailer-offers').children;
  assert.equal(loadingRows[1].children[1].children[0].textContent,'Checking price...');
  assert.equal(loadingRows[1].children[1].children[0].children.length,0);
  await new Promise(resolve=>setImmediate(resolve));
  const rows=h.get('part-dialog-content').children.find(child=>child.className==='retailer-offers').children;
  assert.equal(rows[1].children[1].children[0].textContent,'$429.00');
  assert.equal(rows[2].children[1].children[0].textContent,'Enter the Price');
});

test('retailers finish together and reopening shares pending requests',async()=>{
  const h=await setup();
  let releaseAmazon;
  const pending=new Promise(resolve=>{releaseAmazon=resolve});
  const calls=new Map();
  h.setResponse((category,url)=>{
    if(category!==null)return {status:'success',data:{parts:[part(category)]}};
    const store=url.searchParams.get('store');
    if(!store)return {offers:[]};
    calls.set(store,(calls.get(store)||0)+1);
    if(store==='Amazon')return pending;
    return {offers:store==='Newegg'?[{source:store,sourceUrl:'https://www.newegg.com/p/N82E16814105117',priceCents:42900}]:[]};
  });
  const open=()=>h.get('parts').children[0].children[1].children.at(-1).children[0].onclick();
  const rows=()=>h.get('part-dialog-content').children.find(child=>child.className==='retailer-offers').children;
  open();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(rows()[2].children[1].children[0].textContent,'Checking price...');
  assert.equal(rows()[2].children[0].children[0].href,'https://www.newegg.com/p/N82E16814105117');
  assert.equal(rows()[1].children[1].children[0].textContent,'Checking price...');
  open();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls.get('Amazon'),1);
  assert.equal(calls.get('Newegg'),1);
  releaseAmazon({offers:[]});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(rows()[2].children[1].children[0].textContent,'$429.00');
  assert.equal(rows()[1].children[1].children[0].textContent,'Enter the Price');
});

test('late product links become clickable after price failure without losing entered prices',async()=>{
  const h=await setup();
  let resolveLinks;
  const pendingLinks=new Promise(resolve=>{resolveLinks=resolve});
  h.setResponse((category,url)=>{
    if(category!==null)return {status:'success',data:{parts:[part(category)]}};
    return url.searchParams.get('links')==='1'?pendingLinks:{offers:[]};
  });
  h.get('parts').children[0].children[1].children.at(-1).children[0].onclick();
  const rows=()=>h.get('part-dialog-content').children.find(child=>child.className==='retailer-offers').children;
  await new Promise(resolve=>setImmediate(resolve));
  const input=rows()[1].children[1].children[0].children[0];
  input.value='123.45';input.oninput();input.onblur({relatedTarget:null});
  resolveLinks({offers:[{source:'Amazon',sourceUrl:'https://www.amazon.com/dp/B000000001'}]});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(rows()[1].children[0].children[0].href,'https://www.amazon.com/dp/B000000001');
  assert.equal(rows()[1].children[0].children[0].target,'_blank');
  assert.equal(rows()[1].children[0].children[0].rel,'noopener noreferrer');
  assert.equal(rows()[1].children[1].children[0].textContent,'$123.45');
});

test('supplied retailer product pages are clickable before price lookups finish',async()=>{
  const h=await setup();
  const urls={Amazon:'https://www.amazon.com/dp/B000000001',Newegg:'https://www.newegg.com/p/N82E16814105117','Best Buy':'https://www.bestbuy.com/product/example/ABC123'};
  h.setResponse(category=>({status:'success',data:{parts:[{...part(category),source:'B&H Photo',
    sourceUrl:'https://www.bhphotovideo.com/c/product/123-REG/example.html',retailerProductUrls:urls}]}}));
  await h.context.refresh();
  h.setResponse(()=>({offers:[]}));
  h.get('parts').children[0].children[1].children.at(-1).children[0].onclick();
  const rows=h.get('part-dialog-content').children.find(child=>child.className==='retailer-offers').children;
  assert.equal(rows[0].children[0].children[0].href,'https://www.bhphotovideo.com/c/product/123-REG/example.html');
  for(const [index,source] of ['Amazon','Newegg','Best Buy'].entries())assert.equal(rows[index+1].children[0].children[0].href,urls[source]);
  await new Promise(resolve=>setImmediate(resolve));
  for(const [index,source] of ['Amazon','Newegg','Best Buy'].entries())assert.equal(rows[index+1].children[0].children[0].href,urls[source]);
});

test('recent automatic prices survive a page refresh without another lookup',async()=>{
  const h=await setup();
  const model='persistent-cache-model', name='Cache test';
  const key=JSON.stringify(['Amazon',model,name]);
  h.storage.set('buildlab-retailer-prices-v1',JSON.stringify([{key,expires:Date.now()+300000,offers:[
    {source:'Amazon',sourceUrl:'https://www.amazon.com/dp/B0CK2DB8NY',priceCents:42900}
  ]}]));
  h.setResponse(()=>{throw new Error('Cached price must not fetch')});
  const result=await h.context.loadRetailerPrice('Amazon',model,name);
  assert.equal(result[0].priceCents,42900);
});

test('all seven categories use the same direct-link, price, and selection popup',async()=>{
  const h=await setup();
  h.setResponse(category=>category===null?{offers:[
    {source:'Amazon',sourceUrl:'https://www.amazon.com/dp/B0CK2DB8NY',priceCents:42900},
    {source:'Newegg',sourceUrl:'https://www.newegg.com/p/N82E16814105117',priceIsAmbiguous:true},
  ]}:{status:'success',data:{parts:[{...part(category),source:'B&H Photo',retailerSearchUrls:{},retailerProductUrls:{}}]}});
  await h.context.refresh();
  for(const category of categories){
    const details=h.get('parts').children.map(card=>card.children[1].children.at(-1).children[0]).find(button=>button['aria-label']===`View details for ${category}`);
    details.onclick();
    await new Promise(resolve=>setImmediate(resolve));
    const content=h.get('part-dialog-content');
    const rows=content.children.find(child=>child.className==='retailer-offers').children;
    assert.equal(rows.length,4);
    assert.equal(rows[1].children[0].children[0].href,'https://www.amazon.com/dp/B0CK2DB8NY');
    assert.equal(rows[1].children[1].children[0].textContent,'$429.00');
    assert.equal(rows[2].children[1].children[0].textContent,'Enter the Price');
    assert.match(rows[2].children[0].children[1].textContent,/Multiple prices available/);
    assert.ok(!content.children.some(child=>child.className==='dialog-actions'));
    rows[1].children[1].children[1].onclick();
    assert.equal(h.context.inspect().build[category],category);
  }
  assert.equal(h.get('total').textContent,'$3,003.00');
});

test('SCRUM-24 downloads exactly the displayed four-state result and evaluation context', async()=>{
  for(const status of ['waiting','match','mismatch','unknown']){
    const h=await setup();
    await h.add('cpu');
    if(status!=='waiting')await h.add(status==='mismatch'?'motherboard-2':'motherboard');
    if(status==='unknown')delete h.context.inspect().parts.find(p=>p.id==='cpu').specs.socketProvenance;
    const data=await h.download();
    assert.equal(data.socketCompatibility.status,status);
    assert.equal(h.get('socket-compatibility').dataset.state,status);
    assert.equal(data.socketCompatibility.message,h.get('compatibility-message').textContent);
    assert.equal(data.socketCompatibility.scope,'socket-only');
    assert.equal(data.socketCompatibility.biosChecked,false);
    assert.equal(data.socketCompatibility.fullBuildChecked,false);
    assert.equal(data.compatibilityChecked,false);
    assert.equal(data.socketEvaluation.cpuPartId,'cpu');
    assert.equal(data.socketEvaluation.motherboardPartId,status==='waiting'?null:status==='mismatch'?'motherboard-2':'motherboard');
    assert.ok(Number.isFinite(Date.parse(data.socketEvaluation.evaluatedAt)));
    assert.equal(data.socketEvaluation.refreshState,'ready');
    assert.match(h.get('compatibility-checked-at').textContent,/Downloads include this result/);
  }
});

test('SCRUM-24 checks expiry again at download and refreshes the displayed message',async()=>{
  const h=await setup();await h.add('cpu');await h.add('motherboard');
  assert.equal(h.get('socket-compatibility').dataset.state,'match');
  h.context.inspect().parts.find(p=>p.id==='cpu').specs.socketProvenance.expiresAt=new Date(Date.now()-1).toISOString();
  const data=await h.download();
  assert.equal(data.socketCompatibility.status,'unknown');
  assert.equal(data.socketCompatibility.message,h.get('compatibility-message').textContent);
  assert.equal(h.get('socket-compatibility').dataset.state,'unknown');
});

test('SCRUM-24 retailer selection preserves socket-source identity in downloaded evidence',async()=>{
  const h=await setup();await h.add('cpu');await h.add('motherboard');
  const cpu=h.context.inspect().parts.find(p=>p.id==='cpu');
  h.setResponse(category=>category===null?{offers:[{source:'Amazon',sourceUrl:'https://www.amazon.com/dp/B0CK2DB8NY',priceCents:4999}]}:{status:'success',data:{parts:[part(category)]}});
  const details=h.get('parts').children.map(card=>card.children[1].children.at(-1).children[0]).find(button=>button['aria-label']==='View details for cpu');
  details.onclick();await new Promise(resolve=>setImmediate(resolve));
  const rows=h.get('part-dialog-content').children.find(child=>child.className==='retailer-offers').children;
  rows[1].children[1].children[1].onclick();
  await new Promise(resolve=>setImmediate(resolve));
  const data=await h.download();
  assert.equal(data.socketCompatibility.status,'match');
  assert.equal(data.totalCents,5099);
  const savedCpu=data.parts.find(p=>p.id==='cpu');
  assert.equal(savedCpu.sourceUrl,'https://www.amazon.com/dp/B0CK2DB8NY');
  assert.equal(savedCpu.catalogSourceUrl,cpu.sourceUrl);
  assert.equal(data.socketEvaluation.cpuSourceUrl,cpu.sourceUrl);
  assert.equal(savedCpu.specs.socketProvenance.sourceUrl,cpu.sourceUrl);
});


test('merged loader keeps list-first requests and bypasses browser cache for both phases', async()=>{
  const h=await setup();
  const requests=h.requests.filter(request=>request.url.startsWith('/v1/parts?'));
  assert.equal(requests.length,7);
  assert.deepEqual(requests.slice(0,7).map(request=>new URL(request.url,'http://local').searchParams.get('category')),categories);
  for(const request of requests.slice(0,7))assert.equal(new URL(request.url,'http://local').searchParams.get('metadata'),'0');
  // With no CPU/motherboard selected, no optional detail request is made.
  assert.equal(requests.slice(7).length,0);
  for(const request of requests)assert.equal(request.options.cache,'no-store');
});

test('selected fourth CPU and motherboard are enriched, not merely first three',async()=>{
  const h=await setup();
  h.setResponse(category=>({status:'success',data:{parts:[
    part(category),part(category,'-2','LGA1700'),part(category,'-3','AM4'),part(category,'-4','AM4'),
  ]}}));
  await h.context.refresh();
  await h.add('cpu-4');
  await h.add('motherboard-4');
  assert.equal(h.get('socket-compatibility').dataset.state,'match');
  const targeted=h.requests.map(item=>new URL(item.url,'http://local'))
    .filter(url=>url.searchParams.has('socketPartId'));
  assert.ok(targeted.some(url=>url.searchParams.get('socketPartId')==='cpu-4'));
  assert.ok(targeted.some(url=>url.searchParams.get('socketPartId')==='motherboard-4'));
});

test('provider cooldown stops the remaining category requests',async()=>{
  const h=await setup();
  const before=h.requests.length;
  h.setResponse((category,url)=>category==='motherboard' && url.searchParams.get('metadata')==='0'
    ?{httpStatus:503,error:'Retailer fetch service is rate limited.',retryAfterSeconds:55}
    :{status:'success',data:{parts:[part(category)]}});
  await h.context.refresh();
  const requests=h.requests.slice(before).map(item=>new URL(item.url,'http://local'));
  assert.deepEqual(requests.map(url=>url.searchParams.get('category')),['cpu','motherboard']);
  assert.equal(h.get('retry').hidden,false);
});

test('provider cooldown persists and prevents repeated refresh while retaining cached parts',async()=>{
  const h=await setup();
  const originalCount=h.context.inspect().parts.length;
  h.setResponse((category,url)=>category==='cpu' && url.searchParams.get('metadata')==='0'
    ?{httpStatus:503,error:'Retailer fetch service is rate limited.',retryAfterSeconds:55}
    :{status:'success',data:{parts:[part(category)]}});
  await h.context.refresh();
  const attempted=h.requests.length;
  assert.ok(Number(h.storage.get('buildlab-provider-cooldown-v1'))>Date.now());
  await h.context.refresh();
  assert.equal(h.requests.length,attempted);
  assert.equal(h.context.inspect().parts.length,originalCount);
  assert.match(h.get('status').textContent,/rate limited.*Retry in about/);
});

test('real PDF writer includes selected prices, mismatch, specification sources and valid PDF structure',async()=>{
  const cpu=part('cpu','','AM4'), motherboard=part('motherboard','','AM5');
  const result=evaluateSocketCompatibility(cpu,motherboard);
  const blob=generateRealBuildPdf({
    parts:[cpu,motherboard],labels:{cpu:'CPU',motherboard:'Motherboard'},
    totalCents:200,socketCompatibility:result,socketEvaluation:{evaluatedAt:new Date().toISOString()},
  });
  assert.equal(blob.type,'application/pdf');
  const text=Buffer.from(await blob.arrayBuffer()).toString('latin1');
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.match(text,/SOCKET MISMATCH/);
  assert.match(text,/\$2\.00/);
  assert.match(text,/%%EOF$/);
  assert.match(text,/CPU and motherboard socket check/i);
});
