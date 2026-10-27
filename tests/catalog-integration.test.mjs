import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {evaluateSocketCompatibility} from '../public/socket-compatibility.js';
test('SCRUM-16 categories refresh SCRUM-15 status and export provenance', async () => {
 const elements = new Map();
 const el = () => ({value:'',dataset:{},children:[],append(...items){this.children.push(...items)},replaceChildren(){this.children=[]},setAttribute(){},click(){}});
 const get = id => {if(!elements.has(id))elements.set(id,el());return elements.get(id)};
 let fail = false;
 const context = {evaluateSocketCompatibility, document:{getElementById:get,createElement:el},localStorage:{getItem(){return null},setItem(){}},Intl,URL,Blob,console,Set,JSON,
 fetch:async url => {const category=new URL(url,'http://local').searchParams.get('category');if(fail && category==='cpu')return {ok:false};return {ok:true,json:async()=>({status:'success',data:{isSampleData:false,parts:[{id:category,name:category,category,manufacturer:'Example',priceCents:100,specs:{socket:'AM5'}}]}})}}};
 vm.createContext(context);
 const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8').replace(/^import .*\n/,'');
 vm.runInContext(source+'\n globalThis.inspect = () => ({parts,build,isSampleData}); globalThis.refresh=load; globalThis.choose=()=>{build={cpu:"cpu",motherboard:"motherboard"};renderBuild()};',context);
 await new Promise(resolve => setImmediate(resolve));
 context.choose();
 assert.equal(get('socket-compatibility').dataset.state,'match');
 assert.equal(context.inspect().parts.length,7);
 assert.equal(context.inspect().isSampleData,false);
 fail=true; await context.refresh();
 assert.equal(get('socket-compatibility').dataset.state,'unknown');
 assert.equal(get('retry').hidden,false);
 assert.equal(context.inspect().parts.length,7);
});

