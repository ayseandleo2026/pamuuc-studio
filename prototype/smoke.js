/* Headless render harness: every screen, for every signed-in role.
   Catches runtime errors before the thing is ever published. */
const fs = require('fs'), vm = require('vm'), path = require('path');
const dir = __dirname;
const src = ['10-data.js','12-catalogue.js','15-csv.js','20-store.js','25-actions.js','30-public.js','40-account.js','50-studio.js']
  .map(f => fs.readFileSync(path.join(dir,f),'utf8')).join('\n');

const stubEl = () => ({value:'', textContent:'', innerHTML:'', classList:{add(){},remove(){},contains(){return false}},
  dataset:{}, focus(){}, checked:false, closest(){return null}, querySelector(){return null},
  querySelectorAll(){return []}, appendChild(){}, setAttribute(){}, getAttribute(){return null}});

const ctx = {
  console,
  document:{getElementById(){return null}, createElement:stubEl, body:{appendChild(){}},
    addEventListener(){}, documentElement:stubEl(), querySelector(){return null}, querySelectorAll(){return []}},
  window:{addEventListener(){}, scrollTo(){}},
  location:{hash:''},
  localStorage:{getItem(){return null}, setItem(){}, removeItem(){}},
  setTimeout:()=>0, Intl, Date, Math, JSON, String, Number, Object, Array, Set, isNaN, parseInt, parseFloat,
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(src + '\nfunction go(){}\nfunction paintToasts(){}\nfunction render(){}', ctx);

let fails = 0, ran = 0;
function check(label, fn){
  ran++;
  try{
    const out = fn();
    if(typeof out !== 'string' || out.length < 50) throw new Error('returned ' + typeof out + ' len ' + (out||'').length);
    const probe = out.replace(/data:image\/[^"']+/g,'').replace(/data-[a-z-]+="[^"]*"/g,'');
    if(/undefined|\[object Object\]|NaN/.test(probe)){
      const m = probe.match(/.{0,60}(undefined|\[object Object\]|NaN).{0,60}/);
      console.log('  WARN ' + label + ' → ' + m[0].replace(/\s+/g,' '));
    }
  }catch(e){ fails++; console.log('  FAIL ' + label + ' → ' + e.message); }
}

function as(uid, fn){
  vm.runInContext(`SESSION = {user:'${uid}'}; UI = {};`, ctx);
  fn();
}

console.log('\nPUBLIC');
['pubHome','pubCustom','pubMerch','pubSectors','pubProcess','pubWork','pubLogin',
 'pubForm','pubReview','pubDone','pubCollections','pubProducts','pubMethod',
 'pubSearch','pubHowTo','pubMerchHelp','pubStudioHelp','pubAbout','pubContact',
 'pubPrivacy','pubCookies','pubTerms','pubAccessibility','pubQuote','pubNotFound','pubBlog']
  .forEach(f => check(f, () => vm.runInContext(`UI={formStep:0,answers:{}}; ${f}()`, ctx)));
vm.runInContext('SECTORS', ctx).forEach(sec =>
  check('pubSector ' + sec.id, () => vm.runInContext(`UI={}; pubSector(${JSON.stringify(sec.id)})`, ctx)));
check('pubSector unknown', () => vm.runInContext(`UI={}; pubSector('nope')`, ctx));
vm.runInContext('CASES', ctx).forEach(c =>
  check('pubCase ' + c.id, () => vm.runInContext(`UI={}; pubCase(${JSON.stringify(c.id)})`, ctx)));
check('pubCase unknown', () => vm.runInContext(`UI={}; pubCase('nope')`, ctx));
vm.runInContext('POSTS', ctx).forEach(x =>
  check('pubPost ' + x.id, () => vm.runInContext(`UI={}; pubPost(${JSON.stringify(x.id)})`, ctx)));
check('pubPost unknown', () => vm.runInContext(`UI={}; pubPost('nope')`, ctx));
check('pubProducts page 2', () => vm.runInContext(`UI={shown:48}; pubProducts()`, ctx));
check('pubSearch with a term', () => vm.runInContext(`UI={q:'hoodie'}; pubSearch()`, ctx));
check('pubSearch no results', () => vm.runInContext(`UI={q:'zzzzz'}; pubSearch()`, ctx));
check('pubProducts filtered', () => vm.runInContext(`UI={flt:{cats:['Polos'],methods:[],sort:'plh',qty:'',price:''}}; pubProducts()`, ctx));
check('pubProducts empty result', () => vm.runInContext(`UI={flt:{cats:['Polos'],methods:[],sort:'recommended',qty:'1',price:'o40'}}; pubProducts()`, ctx));
/* the quote journey, with a line in the basket */
const LINE = `UI.quote=[{product:'m_asher',productName:'Asher',ref:'MP-1',img:null,qty:100,
  colour:'black',colourName:'Black',placements:[{pos:'front',posName:'Front',method:'embroidery',
  methodName:'Embroidery',size:'small',colours:1,art:null}],art:false,artHelp:false,sizes:false,
  unit:12.5,total:1250,quoteOnly:false,cfg:{id:'m_asher',qty:100}}];`;
check('pubQuote with a line', () => vm.runInContext(`UI={}; ${LINE} pubQuote()`, ctx));
check('drawer open', () => vm.runInContext(`UI={drawer:true}; ${LINE} pubMerch()`, ctx));
check('drawer empty', () => vm.runInContext(`UI={drawer:true}; pubMerch()`, ctx));
check('pubQContact', () => vm.runInContext(`UI={}; ${LINE} pubQContact()`, ctx));
check('pubQContact with errors', () => vm.runInContext(`UI={qcErr:{name:'Enter a name.'}}; ${LINE} pubQContact()`, ctx));
check('pubQReview', () => vm.runInContext(`UI={qc:{name:'A',email:'a@b.c',company:'C'}}; ${LINE} pubQReview()`, ctx));
check('pubQDone', () => vm.runInContext(`UI={qDone:{ref:'Q1',email:'a@b.c',lines:1,units:100,country:'Spain',date:'Not fixed'}}; pubQDone()`, ctx));
check('pubQuote unresolved line', () => vm.runInContext(`UI={}; UI.quote=[{product:'m_asher',productName:'Asher',ref:'MP-1',img:null,qty:50,colour:'black',colourName:'Black',placements:[],art:false,artHelp:true,sizes:false,unit:null,total:null,quoteOnly:true,cfg:{}}]; pubQuote()`, ctx));
vm.runInContext('catsInUse()', ctx).forEach(c => {
  const sl = vm.runInContext(`catSlug(${JSON.stringify(c)})`, ctx);
  check('pubCollection ' + sl, () => vm.runInContext(`UI={}; pubCollection(${JSON.stringify(sl)})`, ctx));
});
check('pubCollection unknown', () => vm.runInContext(`UI={}; pubCollection('nope')`, ctx));
check('pubProducts filtered', () => vm.runInContext(`UI={merchCat:'Polos'}; pubProducts()`, ctx));
check('pubProduct', () => vm.runInContext(`UI={}; pubProduct('m_tote')`, ctx));
/* the brief: intro, every branch, every common question, contact, review */
check('brief intro', () => vm.runInContext(`UI={formStep:0,answers:{}}; pubForm()`, ctx));
vm.runInContext('Object.keys(BRANCHES)', ctx).forEach(b => {
  const type = vm.runInContext(`Object.keys(BRANCH_OF).find(k => BRANCH_OF[k] === ${JSON.stringify(b)})`, ctx);
  const base = `UI={formStep:0,answers:{'Establishment':${JSON.stringify(type)}}};`;
  const n = vm.runInContext(`${base} quizQs().length`, ctx);
  for(let st = 1; st <= n; st++)
    check(`brief ${b} step ${st}`, () => vm.runInContext(`${base} UI.formStep=${st}; pubForm()`, ctx));
  check(`brief ${b} about you`, () => vm.runInContext(`${base} UI.formStep=${n + 1}; pubForm()`, ctx));
  check(`brief ${b} about company`, () => vm.runInContext(`${base} UI.formStep=${n + 2}; pubForm()`, ctx));
  check(`brief ${b} review`, () => vm.runInContext(`${base} pubReview()`, ctx));
});
/* the two qualification screens, and the VAT states */
check('brief about you', () => vm.runInContext(`UI={formStep:10,answers:{'Establishment':'Hotel or resort'}}; pubForm()`, ctx));
check('brief about company', () => vm.runInContext(`UI={formStep:11,answers:{'Establishment':'Hotel or resort'}}; pubForm()`, ctx));
check('brief company non-EU', () => vm.runInContext(`UI={formStep:11,answers:{'Establishment':'Hotel or resort','Country':'Outside Europe'}}; pubForm()`, ctx));
check('brief company VAT valid', () => vm.runInContext(`UI={formStep:11,answers:{'Establishment':'Hotel or resort','Country':'Spain','VAT':'B12345678'}}; pubForm()`, ctx));
check('brief company VAT invalid', () => vm.runInContext(`UI={formStep:11,answers:{'Establishment':'Hotel or resort','Country':'Spain','VAT':'nope'}}; pubForm()`, ctx));
check('brief company not registered', () => vm.runInContext(`UI={formStep:11,answers:{'Establishment':'Hotel or resort','Country':'Spain','No VAT':true}}; pubForm()`, ctx));
check('brief company free mail', () => vm.runInContext(`UI={formStep:11,answers:{'Establishment':'Hotel or resort','Email':'a@gmail.com'}}; pubForm()`, ctx));

/* VAT format checking, per member state */
(() => {
  const cases = [
    ["{'Country':'Spain','VAT':'B12345678'}", 'pending'],
    ["{'Country':'Spain','VAT':'ESB12345678'}", 'pending'],
    ["{'Country':'Spain','VAT':'B123'}", 'format-invalid'],
    ["{'Country':'Netherlands','VAT':'123456789B01'}", 'pending'],
    ["{'Country':'Netherlands','VAT':'123456789'}", 'format-invalid'],
    ["{'Country':'Germany','VAT':'123456789'}", 'pending'],
    ["{'Country':'France','VAT':'XX123456789'}", 'pending'],
    ["{'Country':'Spain'}", 'missing'],
    ["{'Country':'Spain','No VAT':true}", 'not-registered'],
    ["{'Country':'Outside Europe'}", 'not-required'],
    ["{'Country':'United Kingdom'}", 'not-required'],
  ];
  cases.forEach(([ans, want]) => {
    ran++;
    const got = vm.runInContext(`vatState(${ans}).state`, ctx);
    if(got !== want){ fails++; console.log(`  FAIL vatState ${ans} → ${got}, expected ${want}`); }
  });
  ran++;
  const v = vm.runInContext(`qualify({'Authority':'I am gathering information for someone else','Email':'a@gmail.com','Country':'Spain'}).verdict`, ctx);
  if(v !== 'warn'){ fails++; console.log('  FAIL qualification of a weak buyer → ' + v); }
})();

check('brief contact errors', () => vm.runInContext(`UI={formStep:11,answers:{'Establishment':'Hotel or resort'},formErr:{Email:'Enter a company email address so we can send the proposal.'}}; pubForm()`, ctx));
check('brief direction at max', () => vm.runInContext(`UI={formStep:4,answers:{'Establishment':'Hotel or resort','Direction':['Minimalist','Japanese']}}; pubForm()`, ctx));

/* the qualification routine */
(() => {
  const cases = [
    ["{'People to dress':'Fewer than 10','Designs':'Every role is dressed differently'}", 'stop'],
    ["{'People to dress':'More than 150','Designs':'Yes — one uniform for everyone'}", 'ok'],
    ["{'People to dress':'Not sure yet','Designs':'We honestly do not know — advise us'}", 'warn'],
    ["{'People to dress':'61 to 150','Designs':'Most departments need their own','Budget range':'Under €10,000'}", 'warn'],
  ];
  cases.forEach(([ans, want], n) => {
    ran++;
    const v = vm.runInContext(`qualify(${ans}).verdict`, ctx);
    if(v !== want){ fails++; console.log(`  FAIL qualify case ${n + 1} → got ${v}, expected ${want}`); }
  });
  const per = vm.runInContext(`qualify({'People to dress':'61 to 150','Designs':'A few departments need something different'}).per`, ctx);
  ran++;
  if(per !== 42){ fails++; console.log('  FAIL people per design → ' + per + ', expected 42'); }
})();

console.log('\nCUSTOMER — Marta (admin)');
as('u_marta', () => {
  ['accOverview','accProjects','accReorders','accMerch','accDocuments','accMessages','accNotifications','accSettings']
    .forEach(f => check(f, () => vm.runInContext(`UI={}; ${f}()`, ctx)));
  ['prj_2418','prj_2455','prj_2201'].forEach(p =>
    check('accProject ' + p, () => vm.runInContext(`UI={}; accProject('${p}')`, ctx)));
  check('accDocuments tab', () => vm.runInContext(`UI={docTab:'Invoice'}; accDocuments()`, ctx));
});

console.log('\nCUSTOMER — Jordi (member, scoped)');
as('u_jordi', () => {
  ['accOverview','accProjects','accDocuments'].forEach(f => check(f, () => vm.runInContext(`UI={}; ${f}()`, ctx)));
  check('accProject allowed', () => vm.runInContext(`UI={}; accProject('prj_2455')`, ctx));
  check('accProject denied', () => vm.runInContext(`UI={}; accProject('prj_2418')`, ctx));
});

check('stInquiry with a qualification', () => vm.runInContext(`
  SESSION={user:'u_leo'}; UI={};
  S.inquiries[0].qualification = qualify({'People to dress':'Fewer than 10','Designs':'Every role is dressed differently','Budget range':'Prefer to discuss it'});
  stInquiry(S.inquiries[0].id)`, ctx));

console.log('\nSTUDIO — each role');
[['u_leo','master'],['u_nuria','am'],['u_sergi','finance']].forEach(([uid,role]) => {
  console.log(' ' + role);
  as(uid, () => {
    ['stOverview','stInquiries','stCustomers','stProjects','stBases','stMerch','stFinance',
     'stBilling','stComms','stTeam','stSettings','stAudit','stNotifications']
      .forEach(f => check(role + ':' + f, () => vm.runInContext(`UI={}; ${f}()`, ctx)));
    ['inq_148','inq_143','inq_139'].forEach(i =>
      check(role + ':stInquiry ' + i, () => vm.runInContext(`UI={}; stInquiry('${i}')`, ctx)));
    ['acc_maritim','acc_bonanova'].forEach(a =>
      check(role + ':stCustomer ' + a, () => vm.runInContext(`UI={}; stCustomer('${a}')`, ctx)));
    ['Overview','Roles & garments','Changes & approvals','Commercials','Conversation','Activity & audit'].forEach(t =>
      check(role + ':stProject ' + t, () => vm.runInContext(`UI={prjTab:${JSON.stringify(t)}}; stProject('prj_2418')`, ctx)));
    ['prj_2455','prj_2201','prj_2390'].forEach(p =>
      check(role + ':stProject ' + p, () => vm.runInContext(`UI={}; stProject('${p}')`, ctx)));
    check(role + ':stCustomer config', () => vm.runInContext(`UI={custTab:'Account configuration'}; stCustomer('acc_maritim')`, ctx));
    check(role + ':stBases open', () => vm.runInContext(`UI={openBase:'b_shirt_ls'}; stBases()`, ctx));
  });
});

console.log('\nSTAGE COVERAGE — every stage renders for a customer');
as('u_marta', () => {
  ['design','development','prototype_fitting','pre_production','production','delivery'].forEach(s => {
    check('stage ' + s, () => vm.runInContext(
      `UI={}; (function(){ const p = project('prj_2418'); const was = p.stage;
        if(!p.stages.includes('${s}')) p.stages.push('${s}');
        p.stage='${s}'; const out = accProject('prj_2418'); p.stage=was; return out; })()`, ctx));
  });
});

console.log('\n' + (fails ? `${fails} FAILED of ${ran}` : `all ${ran} screens rendered`));
process.exit(fails ? 1 : 0);
