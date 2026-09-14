import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, reducer } from '../src/context/appState.js';
import { validateExpense, validateCategory } from '../src/utils/validators.js';
import { weeklySpending } from '../src/utils/statistics.js';
import { todayString, formatDate } from '../src/utils/formatters.js';
import { loadState, saveState } from '../src/services/storage.js';
import { validateRegistration } from '../src/services/auth.js';
const login = (state,email) => reducer(state,{type:'LOGIN',payload:{email,fullName:email}});
const expense = (amount=10) => ({id:'test',categoryId:'groceries',amount,date:'2026-03-02',notes:''});
const add = (state,amount) => reducer(state,{type:'ADD_EXPENSE',payload:expense(amount),meta:{categoryName:'Groceries'}});
test('account switching and reload preserve independent books',()=>{
 let s=login(createInitialState(),'a@example.com'); s=add(s,20);
 s=reducer(s,{type:'UPDATE_SETTINGS',payload:{dailyReminder:false}});
 s=reducer(s,{type:'LOGOUT'}); s=login(s,'b@example.com');
 assert.equal(s.expenses.length,0); assert.equal(s.settings.dailyReminder,true);
 s=login(createInitialState(JSON.parse(JSON.stringify(s))),'a@example.com');
 assert.equal(s.expenses[0].amount,20); assert.equal(s.settings.dailyReminder,false);
});
test('default data has no orphan expenses',()=>{
 const s=login(createInitialState(),'student@example.com');
 assert.ok(s.expenses.every(e=>s.categories.some(c=>c.id===e.categoryId)));
});
test('used categories cannot be deleted; empty categories can',()=>{
 let s=add(login(createInitialState(),'a'),10);
 s=reducer(s,{type:'DELETE_CATEGORY',payload:'groceries'});assert.ok(s.categories.some(c=>c.id==='groceries'));
 s=reducer(s,{type:'DELETE_CATEGORY',payload:'rent'});assert.ok(!s.categories.some(c=>c.id==='rent'));
});
test('alerts react to edits and budgets without duplicating at the same threshold',()=>{
 let s=login(createInitialState(),'a');s=add(s,190);assert.equal(s.notifications.filter(n=>n.type==='warning').length,0);
 s=reducer(s,{type:'UPDATE_EXPENSE',payload:expense(210),meta:{categoryName:'Groceries'}});
 assert.equal(s.notifications.filter(n=>n.type==='warning').length,1);
 s=reducer(s,{type:'UPDATE_EXPENSE',payload:expense(220),meta:{categoryName:'Groceries'}});
 assert.equal(s.notifications.filter(n=>n.type==='warning').length,1);
 s=reducer(s,{type:'UPSERT_CATEGORY',payload:{id:'groceries',name:'Groceries',budget:200}});
 assert.equal(s.notifications.filter(n=>n.type==='warning').length,2);
 s=login(s,'a');assert.equal(s.notifications.filter(n=>n.type==='warning').length,2);
});
test('enabling budget alerts checks existing expenses',()=>{
 let s=login(createInitialState(),'a');s=reducer(s,{type:'UPDATE_SETTINGS',payload:{budgetAlerts:false}});s=add(s,300);
 assert.equal(s.notifications.filter(n=>n.type==='warning').length,0);
 s=reducer(s,{type:'UPDATE_SETTINGS',payload:{budgetAlerts:true}});assert.equal(s.notifications.filter(n=>n.type==='warning').length,1);
});
test('weekly grouping uses dates, handles year boundary and ignores ordering',()=>{
 const rows=[{date:'2025-12-29',amount:10},{date:'2026-01-04',amount:20},{date:'2026-01-05',amount:5},{date:'2024-01-01',amount:99}];
 const now=new Date(2026,0,5,12);const result=weeklySpending(rows,now);
 assert.equal(result[3].total,30);assert.equal(result[4].total,5);assert.deepEqual(result,weeklySpending([...rows].reverse(),now));
});
test('invalid dates, overflow and excessive amounts are rejected',()=>{
 const form={amount:'10',categoryName:'Rent',date:'2026-03-01',notes:''};
 assert.equal(validateExpense(form),'');
 for(const date of ['', '2026-02-30','not-a-date']) assert.ok(validateExpense({...form,date}));
 for(const amount of ['9'.repeat(400),'1000000000','-1','1.234']) assert.ok(validateExpense({...form,amount}));
 assert.ok(validateCategory('Rent','9'.repeat(400),[]));
});
test('local calendar day survives UTC boundary',()=>{
 const old=process.env.TZ;process.env.TZ='Europe/London';
 try { assert.equal(todayString(new Date('2026-07-01T23:30:00Z')),'2026-07-02'); }
 finally { if(old===undefined) delete process.env.TZ;else process.env.TZ=old; }
 assert.equal(formatDate('2026-03-01'),'01/03/2026');
});
test('legacy data migrates without losing expenses',()=>{
 let s=login(createInitialState(),'student@example.com');delete s.accounts;s.expenses[0].categoryId='food';
 const migrated=createInitialState(s);assert.equal(migrated.expenses[0].categoryId,'groceries');assert.equal(migrated.expenses.length,s.expenses.length);
});
test('storage rejects broken shapes and handles write failure',()=>{
 globalThis.localStorage={getItem:()=>'{"session":{}}',setItem:()=>{throw Error('quota');}};
 assert.equal(loadState(),null);assert.equal(saveState({}),false);
 const s=createInitialState();globalThis.localStorage={getItem:()=>JSON.stringify(s),setItem:()=>{}};
 assert.deepEqual(loadState(),s);assert.equal(saveState(s),true);delete globalThis.localStorage;
});
test('registration rejects incomplete, mismatched and weak passwords',()=>{
 assert.throws(
   () => validateRegistration({fullName:'',email:'new@example.com',password:'Password1',confirmPassword:'Password1'}),
   /complete all fields/
 );
 assert.throws(
   () => validateRegistration({fullName:'New Student',email:'new@example.com',password:'Password1',confirmPassword:'Password2'}),
   /do not match/
 );
 assert.throws(
   () => validateRegistration({fullName:'New Student',email:'new@example.com',password:'password',confirmPassword:'password'}),
   /uppercase, lowercase and a number/
 );
 assert.doesNotThrow(
   () => validateRegistration({fullName:'New Student',email:'new@example.com',password:'Password1',confirmPassword:'Password1'})
 );
});
