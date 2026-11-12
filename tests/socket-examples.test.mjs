// Reuses existing sample records and the earlier preview match/mismatch examples.
// Justin retains SCRUM-14 example credit; Howard supplied the base socket rule.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateSocketCompatibility as check} from '../public/socket-compatibility.js';
import {EXAMPLE_NOW,verifiedPart} from './fixtures/socket-parts.mjs';

const cases=JSON.parse(readFileSync(new URL('./fixtures/socket-examples.json',import.meta.url),'utf8'));
const seed=JSON.parse(readFileSync(new URL('../backend/data/sample_parts.json',import.meta.url),'utf8'));

for(const example of cases) test(`documented socket example: ${example.id}`,()=>{
  const record=category=>{
    const original=seed.parts.find(part=>part.id===example[`${category}Id`]);
    if(!original)return null;
    const socket=Object.hasOwn(example,`${category}Socket`)?example[`${category}Socket`]:original.specs.socket;
    const fixture=verifiedPart(category,socket,EXAMPLE_NOW);
    const part={...original,sourceUrl:fixture.sourceUrl,specs:{...fixture.specs,socket}};
    if(example.unverified)delete part.specs.socketProvenance;
    if(example.stale===category)part.specs.socketProvenance.expiresAt=new Date(EXAMPLE_NOW).toISOString();
    return part;
  };
  const cpu=record('cpu'),motherboard=record('motherboard');
  const result=check(cpu,motherboard,{now:EXAMPLE_NOW,refreshState:example.refreshState||'ready'});
  assert.equal(result.status,example.expected);
  assert.equal(result.scope,'socket-only');
  assert.equal(result.biosChecked,false);
  assert.equal(result.fullBuildChecked,false);
  if(result.status==='mismatch')for(const text of [cpu.name,motherboard.name,'AM5','LGA1700'])assert.ok(result.message.includes(text));
});

test('live evidence rejects wrong sources, future timestamps and malformed provenance',()=>{
  for(const category of ['cpu','motherboard'])for(const update of [
    {sourceUrl:'https://other.invalid/product'}, {sourceField:'Product Name'}, {rawValue:'LGA1700'},
    {method:'inferred'}, {verifiedAt:'invalid'}, {expiresAt:'invalid'},
    {verifiedAt:new Date(EXAMPLE_NOW+1000).toISOString()},
    {expiresAt:new Date(EXAMPLE_NOW+7200000).toISOString()},
    {verifiedAt:'2026-02-30T12:00:00Z'}, {sourceField:{}},
  ]){
    const cpu=verifiedPart('cpu','AM5',EXAMPLE_NOW),board=verifiedPart('motherboard','AM5',EXAMPLE_NOW);
    Object.assign((category==='cpu'?cpu:board).specs.socketProvenance,update);
    assert.equal(check(cpu,board,{now:EXAMPLE_NOW}).status,'unknown');
  }
});

test('expiry boundary changes a previously valid match to unknown',()=>{
  const cpu=verifiedPart('cpu','AM5',EXAMPLE_NOW),board=verifiedPart('motherboard','AM5',EXAMPLE_NOW);
  const expires=Date.parse(cpu.specs.socketProvenance.expiresAt);
  assert.equal(check(cpu,board,{now:expires-1}).status,'match');
  assert.equal(check(cpu,board,{now:expires}).status,'unknown');
});

test('captured live API CPU and motherboard evaluate as a socket-only match, then expire',()=>{
  const capture=JSON.parse(readFileSync(new URL('../docs/scrum-22-live-response.json',import.meta.url),'utf8'));
  const cpu=capture.responses.cpu.body.data.parts.find(part=>part.specs.socket==='AM5');
  const board=capture.responses.motherboard.body.data.parts.find(part=>part.specs.socket==='AM5');
  assert.ok(cpu&&board,'live evidence must include a verified CPU and motherboard');
  const now=Math.max(...[cpu,board].map(part=>Date.parse(part.specs.socketProvenance.verifiedAt)));
  assert.equal(check(cpu,board,{now}).status,'match');
  assert.equal(check(cpu,board,{now,refreshState:'failed'}).status,'unknown');
  const expires=Math.min(...[cpu,board].map(part=>Date.parse(part.specs.socketProvenance.expiresAt)));
  assert.equal(check(cpu,board,{now:expires}).status,'unknown');
});
