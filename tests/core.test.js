import test from 'node:test';import assert from 'node:assert/strict';import {allocate,splitExpense,balances,settle,parseReceipt} from '../dist/core.js';
test('rounding reconciles in member order',()=>assert.deepEqual(allocate(10000,[1,1,1]),[3334,3333,3333]));
test('itemized tax follows item subtotals',()=>{let m=[{id:'a'},{id:'b'}],e={total:1100,mode:'itemized',items:[{qty:1,price:600,assigned:['a']},{qty:1,price:400,assigned:['b']}]};assert.deepEqual(splitExpense(e,m),{a:66000,b:44000})});
test('minimum settlement removes intermediate payments',()=>{assert.deepEqual(settle({a:-20000,b:0,c:20000}),[{from:'a',to:'c',amount:20000}])});
test('settlement finds two exact pairs',()=>{let tx=settle({a:-500,b:-300,c:300,d:500});assert.equal(tx.length,2)});
test('parse receipt totals and GST, ignore noise',()=>{let p=parseReceipt('GSTIN 12345678\nPizza 480.00\nCoffee 100.00\nCGST 14.50\nSGST 14.50\nTOTAL 609.00\nThank you');assert.equal(p.items.length,2);assert.equal(p.charges.length,2);assert.equal(p.total,609)});
