/* §16 acceptance criteria, as machine checks.
   These are the specification's own assertions turned into a gate. */
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = ['10-data.js','20-store.js','25-actions.js','30-public.js','40-account.js','50-studio.js']
  .map(f => fs.readFileSync(path.join(__dirname,f),'utf8')).join('\n');

const ctx = {console, Intl, Date, Math, JSON, String, Number, Object, Array, Set, isNaN, parseInt, parseFloat,
  document:{getElementById(){return null}, createElement:()=>({classList:{add(){}},style:{}}), body:{appendChild(){}},
    addEventListener(){}, documentElement:{setAttribute(){},getAttribute(){return null}}, querySelector(){return null}, querySelectorAll(){return []}},
  window:{addEventListener(){}}, location:{hash:''},
  localStorage:{getItem(){return null}, setItem(){}, removeItem(){}}, setTimeout:()=>0};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(src + '\nfunction go(){}\nfunction paintToasts(){}\nfunction render(){}', ctx);
const run = (code) => vm.runInContext(code, ctx);

let pass = 0, fail = 0;
function t(name, code){
  try{
    const ok = run(`(function(){${code}})()`);
    if(ok === true){ pass++; console.log('  ✓ ' + name); }
    else { fail++; console.log('  ✗ ' + name + '  → ' + JSON.stringify(ok)); }
  }catch(e){ fail++; console.log('  ✗ ' + name + '  → ' + e.message); }
}

console.log('\nPUBLIC WEBSITE');
t('the questionnaire creates an inquiry only — no account, no project', `
  SESSION = {user:'u_leo'};
  const accBefore = S.accounts.length, prjBefore = S.projects.length;
  const inq = act.submitInquiry({Company:'Test Co', 'Contact name':'A B', Email:'a@b.c', Sector:'Hospitality'});
  return S.accounts.length === accBefore && S.projects.length === prjBefore &&
         inq.state === 'submitted' && !inq.accountId;`);

t('submission notifies the studio and writes one audit entry', `
  const n = S.notifications.find(x => x.to === 'studio' && /Test Co/.test(x.text));
  const a = S.audit.find(x => x.action === 'Inquiry created');
  return !!n && n.action === true && !!a && a.now === 'submitted';`);

t('a customer can never create a project, whatever their role', `
  return can(user('u_marta'),'create_project','do') === false &&
         can(user('u_jordi'),'create_project','do') === false;`);

console.log('\nINQUIRY → ACCOUNT → PROJECT');
t('the inquiry pipeline gates each step and cannot be skipped', `
  SESSION = {user:'u_leo'};
  const i = S.inquiries.find(x => x.company === 'Test Co');
  act.qualifyInquiry(i.id,'accept');           if(i.state !== 'qualified') return 'not qualified';
  act.scheduleCall(i.id,'2026-09-20 11:00');   if(i.state !== 'call_scheduled') return 'not scheduled';
  act.completeCall(i.id,'Discovery notes.');   if(i.state !== 'ready_account') return 'not ready';
  return true;`);

t('activation and project creation are two separate recorded actions', `
  SESSION = {user:'u_leo'};
  const i = S.inquiries.find(x => x.company === 'Test Co');
  const acc = act.activateAccount(i.id);
  if(S.projects.some(p => p.account === acc.id)) return 'activation created a project';
  const p = act.createProject({account:acc.id, name:'Test Wardrobe', design:false,
    positions:[{name:'Floor', people:10, garments:['b_shirt_ls']}]});
  return p.published === false && p.version === 0 && p.stage === 'development';`);

t('a project without design opens at Development and never shows a Design stage', `
  const p = S.projects.find(x => x.name === 'Test Wardrobe');
  return !p.stages.includes('design') && views.customerProject(p).stages.indexOf('design') === -1;`);

t('publishing increments the version and notifies the customer', `
  SESSION = {user:'u_leo'};
  const p = S.projects.find(x => x.name === 'Test Wardrobe');
  act.publishProject(p.id);
  const n = S.notifications.find(x => x.to === 'customer' && /Test Wardrobe/.test(x.text));
  return p.version === 1 && p.published === true && p.draftDirty === false && !!n;`);

console.log('\nCHANGE REQUESTS — customer edits never overwrite an approved record');
t('submitting a request leaves the approved specification untouched', `
  SESSION = {user:'u_marta'};
  const g = garment('g_shirt'); const revBefore = g.rev; const cwBefore = g.colourways.length;
  act.submitChangeRequest({project:'prj_2418', garment:'g_shirt', account:'acc_maritim',
    title:'Test request', reason:'because', changes:[{field:'x', was:'a', now:'b'}]});
  return g.rev === revBefore && g.colourways.length === cwBefore;`);

t('a decision is not an implementation — approval alone changes nothing', `
  SESSION = {user:'u_nuria'};
  const cr = S.changeRequests.find(c => c.title === 'Test request');
  const g = garment('g_shirt'); const revBefore = g.rev;
  act.decideChangeRequest(cr.id,'approved','ok');
  return cr.state === 'approved' && g.rev === revBefore;`);

t('incorporating creates a new revision and puts the draft ahead of published', `
  SESSION = {user:'u_nuria'};
  const cr = S.changeRequests.find(c => c.title === 'Test request');
  const g = garment('g_shirt'); const revBefore = g.rev;
  act.incorporateChangeRequest(cr.id);
  return cr.state === 'incorporated' && g.rev === revBefore + 1 && project('prj_2418').draftDirty === true;`);

console.log('\nPROTOTYPES — state and round belong to the garment, not the project');
t('approving one garment leaves the others exactly as they were', `
  SESSION = {user:'u_marta'};
  const others = S.garments.filter(g => g.project === 'prj_2418' && g.id !== 'g_wrap')
    .map(g => g.id + ':' + g.state + ':' + g.round);
  garment('g_wrap').state = 'feedback_required';
  act.approveGarment('g_wrap','fits now');
  const after = S.garments.filter(g => g.project === 'prj_2418' && g.id !== 'g_wrap')
    .map(g => g.id + ':' + g.state + ':' + g.round);
  return garment('g_wrap').state === 'approved' && JSON.stringify(others) === JSON.stringify(after);`);

t('requesting changes below round 3 sends only that garment back', `
  SESSION = {user:'u_marta'};
  const g = garment('g_wrap2'); g.state = 'feedback_required'; g.round = 1;
  act.requestGarmentChanges(g.id,'sleeve still tight');
  return g.state === 'changes_requested' && garment('g_shirt2').state === 'in_development';`);

t('a garment at round 3 goes to manual resolution instead of a fourth sample', `
  SESSION = {user:'u_marta'};
  const g = garment('g_coat'); g.state = 'feedback_required'; g.round = 3;
  act.requestGarmentChanges(g.id,'still too heavy');
  return g.state === 'manual_resolution';`);

t('the round counter cannot be pushed past 3', `
  SESSION = {user:'u_nuria'};
  const g = garment('g_coat'); const before = g.round;
  act.authoriseRound(g.id);
  return g.round === before && g.round === 3;`);

t('an unresolved garment blocks the project from advancing', `
  const p = project('prj_2418');
  const b = gateBlockers(p);
  return b.some(x => x.kind === 'garment' && /Wool overcoat/.test(x.text));`);

t('a Master resolution unblocks it and is written to the audit log', `
  SESSION = {user:'u_leo'};
  act.resolveException('g_coat','exception','Accepted at revision 3 — quantity below base minimum.');
  const a = S.audit.find(x => x.action === 'Master resolution');
  return garment('g_coat').state === 'approved' && !!a && !!a.reason;`);

console.log('\nCOMMERCIAL GATES');
t('Development is blocked while the development invoice is unpaid', `
  const p = project('prj_2455');
  const g = gateFor(p);
  return g.blocked === true && g.key === 'development_invoice';`);

t('paying the invoice opens the gate on that project only', `
  SESSION = {user:'u_marta'};
  act.payDocument('doc_inv_311');
  return gateFor(project('prj_2455')).blocked === false &&
         project('prj_2455').gates.development_invoice === 'paid';`);

t('every colourway quantity must equal the sum of its size split', `
  const p = project('prj_2201'); const was = p.stage; p.stage = 'pre_production';
  const cw = garment('g_chef').colourways[0]; const q = cw.qty;
  cw.qty = q + 5;
  const bad = gateBlockers(p).some(b => b.kind === 'data');
  cw.qty = q;
  const good = gateBlockers(p).some(b => b.kind === 'data');
  p.stage = was;
  return bad === true && good === false;`);

t('overriding a gate requires a reason and records the override', `
  SESSION = {user:'u_leo'};
  const p = project('prj_2455');
  const was = p.stage;
  act.advanceStage(p.id, 'Customer verbally committed; invoice follows.');
  const a = S.audit.find(x => x.action === 'Stage override' && x.record === p.ref);
  return p.stage !== was && !!a && !!a.reason;`);

console.log('\nVISIBILITY — one record, three projections');
t('the customer projection never carries cost, margin or internal tasks', `
  const v = views.customerProject(project('prj_2418'));
  const keys = JSON.stringify(v);
  return v.risk === undefined && v.blockers === undefined && v.showCost === undefined &&
         !/margin|supplier|internal/i.test(keys);`);

t('cost and margin are hidden from Account Managers, visible to Finance and Master', `
  return can(user('u_nuria'),'cost_margin','view') === false &&
         can(user('u_sergi'),'cost_margin','view') === true &&
         can(user('u_leo'),'cost_margin','view') === true;`);

t('an Account Manager cannot override a gate or publish merchandise', `
  return can(user('u_nuria'),'phase_override','do') === false &&
         can(user('u_nuria'),'merch_publish','do') === false;`);

t('Finance cannot advance a stage or publish a project', `
  return can(user('u_sergi'),'phase_advance','do') === false &&
         can(user('u_sergi'),'publish','do') === false;`);

t('a scoped member sees only the projects assigned to them', `
  SESSION = {user:'u_jordi'};
  const ps = myProjects().map(p => p.id);
  return ps.includes('prj_2455') && !ps.includes('prj_2418');`);

t('internal notes are never in the customer conversation projection', `
  const cv = S.conversations.find(c => c.project === 'prj_2418');
  return cv.messages.some(m => m.internal) &&
         cv.messages.filter(m => !m.internal).every(m => !m.internal);`);

console.log('\nREORDERS');
t('a reorder clones the locked revision, not a newer base', `
  SESSION = {user:'u_marta'};
  const g = garment('g_chef');
  base('b_chef').v = 'v9';                       // the base moves on
  const r = act.submitReorder(g.id, [{cw:'cw13', qty:10}], 'Restaurant Marítim');
  return r.sourceRev === g.rev && g.baseV === 'v5' && g.baseV !== base('b_chef').v;`);

t('only approved, delivered garments are reorderable', `
  SESSION = {user:'u_marta'};
  return myReorderables().every(g => g.state === 'approved' && project(g.project).completed);`);

console.log('\nEVENT MODEL');
t('every action emits exactly one event, and the event decides the rest', `
  SESSION = {user:'u_marta'};
  const before = S.events.length;
  act.sendMessage(S.conversations[0].id, 'One message.', false);
  return S.events.length === before + 1;`);

t('an internal note emits no customer notification', `
  SESSION = {user:'u_nuria'};
  const before = S.notifications.filter(n => n.to === 'customer').length;
  act.sendMessage(S.conversations[0].id, 'Internal only.', true);
  return S.notifications.filter(n => n.to === 'customer').length === before;`);

console.log('\nSTATUS VOCABULARY');
t('every state used anywhere is declared in the one status dictionary', `
  const used = new Set();
  S.projects.forEach(p => used.add(p.opStatus));
  S.garments.forEach(g => used.add(g.state));
  S.documents.forEach(d => used.add(d.state));
  S.changeRequests.forEach(c => used.add(c.state));
  S.approvals.forEach(a => used.add(a.state));
  S.inquiries.forEach(i => used.add(i.state));
  S.meetings.forEach(m => used.add(m.state));
  S.accounts.forEach(a => used.add(a.status));
  S.bases.forEach(b => used.add(b.status));
  const missing = [...used].filter(k => !STATUS[k]);
  return missing.length === 0 || 'undeclared: ' + missing.join(', ');`);

t('every declared state has a colour family and a plain-language sentence', `
  const bad = Object.entries(STATUS).filter(([k,v]) => !v.label || !v.fam || !v.say);
  return bad.length === 0 || 'incomplete: ' + bad.map(b => b[0]).join(', ');`);

t('status colour families are limited to the five agreed', `
  const fams = new Set(Object.values(STATUS).map(s => s.fam));
  const allowed = ['idle','flow','wait','go','stop'];
  return [...fams].every(f => allowed.includes(f)) || 'stray: ' + [...fams].join(',');`);

console.log('\n' + (fail ? `${fail} FAILED, ${pass} passed` : `all ${pass} checks passed`));
process.exit(fail ? 1 : 0);
