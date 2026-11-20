'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {routesFor}=require('./automation/dispatch-policy');
const {prohibitMoneyMovement,rolePolicy}=require('./automation/rule003');
test('invoice routes to Bookkeeper regardless of LLM role suggestion',()=>assert.deepEqual(routesFor({type:'invoice',routeTo:[],confidence:.98,needsReview:false}),['bookkeeper']));
test('statement routes to Banker',()=>assert.deepEqual(routesFor({type:'statement',routeTo:[],confidence:.98,needsReview:false}),['banker']));
test('low-confidence statement is held',()=>assert.deepEqual(routesFor({type:'statement',routeTo:['banker'],confidence:.5,needsReview:false}),[]));
test('money movement forbidden',()=>{for(const op of ['ACH transfer','wire','electronic bill pay','refund','send check'])assert.throws(()=>prohibitMoneyMovement(op));});
test('all role policies ban money movement',()=>{for(const role of ['reader','bookkeeper','banker','ceo','reporter','negotiator'])assert.match(rolePolicy(role),/NEVER initiate or transmit funds/);});
