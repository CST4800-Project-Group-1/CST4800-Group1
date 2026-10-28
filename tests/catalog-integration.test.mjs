import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {evaluateSocketCompatibility} from '../public/socket-compatibility.js';

const categories = ['cpu','motherboard','graphics_card','ram','storage','power_supply','case'];
const part = (category, suffix = '', socket = 'AM5') => ({id:category+suffix,name:category+suffix,category,manufacturer:'Example',priceCents:100,specs:{socket}});
const source = readFileSync(new URL('../public/app.js',import.meta.url),'utf8').replace(/^import [^\r\n]*\r?\n/,'');
async function setup() {
  const elements = new Map(), storage = new Map();
  const el = () => ({value:'',dataset:{},children:[],append(...items){this.children.push(...items)},replaceChildren(){this.children=[]},setAttribute(key,value){this[key]=value},click(){}});
  const get = id => {if(!elements.has(id)) elements.set(id,el()); return elements.get(id)};
  let respond = category => ({status:'success',data:{isSampleData:false,parts:[part(category),part(category,'-2','LGA1700')]}});
  let exported;
  const context = {evaluateSocketCompatibility, document:{getElementById:get,createElement:el},
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},Intl,Blob,console,Set,JSON,
    URL:{createObjectURL(blob){exported=blob;return 'blob:test'},revokeObjectURL(){}},
    fetch:async url => {const category=new URL(url,'http://local').searchParams.get('category');const data=respond(category);return data===null?{ok:false}:{ok:true,json:async()=>data}}};
  vm.createContext(context);
  vm.runInContext(source+'\n globalThis.inspect = () => ({parts,build,isSampleData}); globalThis.refresh=load;',context);
  await new Promise(resolve=>setImmediate(resolve));
  const add = id => {
    const button=get('parts').children.map(card=>card.children[1].children.at(-1).children[1]).find(button=>button['aria-label']===`Add ${id} to build`);
    button.onclick();
  };
  return {context,get,add,storage,setResponse:fn=>respond=fn,download:async()=>{get('export').onclick();return JSON.parse(await exported.text())}};
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

for(const invalid of ['missing socket','wrong category','error envelope','invalid price','duplicate IDs']) test(`${invalid} never enables a match`,async()=>{
  const h=await setup();h.add('cpu');h.add('motherboard');
  h.setResponse(category=>{
    const p=part(category);
    if(invalid==='missing socket')p.specs={feature1:'AM5 text is not verified socket data'};
    if(invalid==='wrong category')p.category='ram';
    if(invalid==='invalid price')p.priceCents=-1;
    return {status:invalid==='error envelope'?'error':'success',data:{parts:invalid==='duplicate IDs'?[p,p]:[p]}};
  });
  await h.context.refresh();
  assert.equal(h.get('socket-compatibility').dataset.state,'unknown');
  assert.equal((await h.download()).socketCompatibility.status,'unknown');
});
