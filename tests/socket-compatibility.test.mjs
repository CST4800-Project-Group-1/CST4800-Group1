import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateSocketCompatibility as check} from '../public/socket-compatibility.js';
const part=(category,socket)=>({id:category,name:`Selected ${category}`,category,specs:{socket}});
test('waits when either or both selections are absent',()=>{
  for(const [cpu,board] of [[null,null],[part('cpu','AM5'),null],[null,part('motherboard','AM5')]])assert.equal(check(cpu,board).status,'waiting');
});
test('matching recognized sockets return a socket-only match',()=>{
  const result=check(part('cpu',' am5 '),part('motherboard','AM5'));
  assert.equal(result.status,'match');assert.equal(result.ruleId,'cpu-motherboard-socket');
  assert.match(result.message,/Sockets match/);assert.equal(result.cpuSocket,'am5');
});
test('mismatch names both sockets and selected parts',()=>{
  const result=check(part('cpu','AM5'),part('motherboard','LGA1700'));
  assert.equal(result.status,'mismatch');
  for(const text of ['AM5','LGA1700','Selected cpu','Selected motherboard'])assert.ok(result.message.includes(text));
});
test('missing, malformed, placeholder and unrecognized socket data never matches',()=>{
  for(const value of [undefined,null,'', '  ', 'unknown','N/A','TBD','AM999',{},42]){
    assert.equal(check(part('cpu',value),part('motherboard',value)).status,'unknown');
  }
  assert.equal(check(part('ram','AM5'),part('motherboard','AM5')).status,'unknown');
});
test('replacing either component changes the result without cached decisions',()=>{
  const cpu=part('cpu','AM5');
  assert.equal(check(cpu,part('motherboard','AM5')).status,'match');
  assert.equal(check(cpu,part('motherboard','LGA1700')).status,'mismatch');
  assert.equal(check(part('cpu','LGA1700'),part('motherboard','LGA1700')).status,'match');
  assert.equal(check(null,part('motherboard','LGA1700')).status,'waiting');
});
