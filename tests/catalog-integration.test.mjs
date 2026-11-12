import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {evaluateSocketCompatibility} from '../public/socket-compatibility.js';
import {verifiedPart} from './fixtures/socket-parts.mjs';

const categories = ['cpu','motherboard','graphics_card','ram','storage','power_supply','case'];
const part = (category, suffix = '', socket = 'AM5') => ({...verifiedPart(category,socket,Date.now(),suffix),name:category+suffix,manufacturer:'Example',priceCents:100});
const source = readFileSync(new URL('../public/app.js',import.meta.url),'utf8').replace(/^import [^\r\n]*\r?\n/,'');
async function setup() {
  const elements = new Map(), storage = new Map();
  const timers = new Map();
  let timerId=0;
  const el = () => ({value:'',dataset:{},classList:{toggle(){}},focus(){},showModal(){this.open=true},children:[],append(...items){this.children.push(...items)},replaceChildren(){this.children=[]},setAttribute(key,value){this[key]=value},click(){}});
  const get = id => {if(!elements.has(id)) elements.set(id,el()); return elements.get(id)};
  let respond = category => ({status:'success',data:{isSampleData:false,parts:[part(category),part(category,'-2','LGA1700')]}});
  let exported;
  const context = {evaluateSocketCompatibility, document:{getElementById:get,createElement:el},
    setTimeout:(callback,delay)=>{timers.set(++timerId,{callback,delay});return timerId},
    clearTimeout:id=>timers.delete(id),
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},Intl,Blob,console,Set,JSON,
    URL:class extends URL {static createObjectURL(blob){exported=blob;return 'blob:test'} static revokeObjectURL(){}},
    fetch:async url => {const category=new URL(url,'http://local').searchParams.get('category');const data=respond(category,new URL(url,'http://local'));return data===null?{ok:false}:{ok:true,json:async()=>data}}};
  vm.createContext(context);
  vm.runInContext(source+'\n globalThis.inspect = () => ({parts,build,isSampleData}); globalThis.refresh=load;',context);
  await new Promise(resolve=>setImmediate(resolve));
  const add = id => {
    const details=get('parts').children.map(card=>card.children[1].children.at(-1).children[0]).find(button=>button['aria-label']===`View details for ${id}`);
    details.onclick();
    const offers=get('part-dialog-content').children.find(child=>child.className==='retailer-offers');
    const select=offers.children[0].children[1].children[1];
    select.onclick();
    assert.equal(select['aria-checked'],'true');
  };
  return {context,get,add,storage,timers,setResponse:fn=>respond=fn,download:async()=>{get('export').onclick();return JSON.parse(await exported.text())}};
}

test('all seven categories, add, replace, remove, clear, persistence, refresh and download',async()=>{
  const h=await setup();
  assert.equal(h.context.inspect().parts.length,14);
  for(const category of categories) h.add(category);
  assert.equal(h.get('total').textContent,'$7.00');
  assert.equal(h.get('build-count').textContent,7);
  assert.equal(h.get('socket-compatibility').dataset.state,'match');
  h.add('motherboard-2');
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

for(const failedCategory of ['cpu','motherboard']) test(`${failedCategory} refresh failure cannot match or export cached compatibility`,async()=>{
  const h=await setup();h.add('cpu');h.add('motherboard');
  h.setResponse(category=>category===failedCategory?null:{status:'success',data:{parts:[part(category)]}});
  await h.context.refresh();
  assert.equal(h.get('socket-compatibility').dataset.state,'unknown');
  assert.equal(h.get('retry').hidden,false);
  assert.equal((await h.download()).socketCompatibility.status,'unknown');
  assert.equal(h.context.inspect().build[failedCategory],failedCategory);
});

for(const invalid of ['missing socket','missing provenance','unsupported socket','stale socket','wrong category','error envelope','invalid price','duplicate IDs']) test(`${invalid} never enables a match`,async()=>{
  const h=await setup();h.add('cpu');h.add('motherboard');
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
  assert.equal(h.timers.size,0);
});

test('an open page drops a match when selected socket evidence expires',async()=>{
  const h=await setup();h.add('cpu');h.add('motherboard');
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

test('popup never uses retailer search URLs as product links',async()=>{
  const h=await setup();
  h.get('parts').children[0].children[1].children.at(-1).children[0].onclick();
  const rows=h.get('part-dialog-content').children.find(child=>child.className==='retailer-offers').children;
  for(const row of rows.slice(1)){
    assert.equal(row.children[0].children[0].href,undefined);
    assert.doesNotMatch(row.children[0].children[0].textContent,/Search at/);
  }
  assert.equal(h.context.verifiedProductUrl('Amazon','https://www.amazon.com/s?k=W6400'),null);
  assert.equal(h.context.verifiedProductUrl('Best Buy','https://www.bestbuy.com/site/searchpage.jsp?st=W6400'),null);
  assert.equal(h.context.verifiedProductUrl('Newegg','https://www.newegg.com/p/pl?d=W6400'),null);
  assert.equal(h.context.verifiedProductUrl('Amazon','https://amazon.com.evil.example/dp/B0GCMFR35P'),null);
  assert.equal(h.context.verifiedProductUrl('Amazon','https://www.amazon.com/dp/B0GCMFR35P'),'https://www.amazon.com/dp/B0GCMFR35P');
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
