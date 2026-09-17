/* ============================================================================
   PAMUUC SUITE — store, permissions, projections
   One dataset. One emit(). Three views. Nothing else may write state.
   ========================================================================= */

let S = JSON.parse(JSON.stringify(SEED));
/* the generated catalogue ships its rate card with it */
if(S.decoRatesSeed){ S.decoRates = S.decoRatesSeed; }
let SESSION = null;          // {user, surface}
let ROUTE = {surface:'public', page:'home', params:{}};
let UI = {};                 // transient per-screen scratch (form drafts etc.)
const TOASTS = [];

/* ---- tiny helpers ------------------------------------------------------ */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => (
  {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const by = (arr, id) => arr.find(x => x.id === id);
const user = (id) => by(S.users, id) || {name:'System', init:'··', role:'system'};
const account = (id) => by(S.accounts, id);
const project = (id) => by(S.projects, id);
const garment = (id) => by(S.garments, id);
const base = (id) => by(S.bases, id);
const doc = (id) => by(S.documents, id);
const stageDef = (id) => STAGES.find(s => s.id === id);
const st = (k) => STATUS[k] || {label:k, fam:'idle', say:''};
const money = (n, cur) => n == null ? '—' :
  new Intl.NumberFormat('en-GB',{style:'currency',currency:cur||'EUR',minimumFractionDigits:2}).format(n);
const uid = (p) => p + '_' + Math.random().toString(36).slice(2,8);

function dateShort(d){
  if(!d) return '—';
  const dt = new Date(String(d).replace(' ','T'));
  if(isNaN(dt)) return d;
  return dt.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
}
function dateTime(d){
  if(!d) return '—';
  const dt = new Date(String(d).replace(' ','T'));
  if(isNaN(dt)) return d;
  return dt.toLocaleDateString('en-GB',{day:'numeric',month:'short'}) + ', ' +
         dt.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
}
function ago(d){
  if(!d) return '—';
  const dt = new Date(String(d).replace(' ','T'));
  if(isNaN(dt)) return d;
  const days = Math.round((new Date(S.today) - dt)/86400000);
  if(days <= 0) return 'today';
  if(days === 1) return 'yesterday';
  if(days < 30) return days + ' days ago';
  if(days < 60) return 'last month';
  return Math.round(days/30) + ' months ago';
}
function nowStamp(){
  const d = new Date();
  const p = n => String(n).padStart(2,'0');
  return `${S.today} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ---- the one status component ----------------------------------------- */
function pill(key, extra){
  const s = st(key);
  return `<span class="pill pill--${s.fam}"${extra ? ' title="'+esc(extra)+'"' : ''}>${esc(s.label)}</span>`;
}
function pillMerch(text){ return `<span class="pill pill--merch">${esc(text)}</span>`; }

/* ============================================================================
   PERMISSIONS — role template × scope × module × action
   One function. Every surface asks it; none of them decide for themselves.
   ========================================================================= */
const ROLE_NAMES = {
  master:'Master', am:'Account Manager', finance:'Finance Director',
  cust_admin:'Account Admin', cust_member:'Member',
};

function can(u, module, action, ctx){
  if(!u) return false;
  const r = u.role;
  ctx = ctx || {};

  if(r === 'master') return true;

  if(r === 'am'){
    const mine = !ctx.project || project(ctx.project)?.am === u.id;
    switch(module){
      case 'cost_margin':        return false;
      case 'settings': case 'team': case 'audit_all': return false;
      case 'merch_publish':      return false;
      case 'phase_override':     return false;
      case 'phase_advance':      return mine;
      case 'project':            return mine;
      case 'change_request':     return mine;
      case 'publish':            return mine;
      case 'invoice':            return action === 'view';
      case 'finance':            return action === 'view' && mine;
      default:                   return true;
    }
  }

  if(r === 'finance'){
    switch(module){
      case 'finance': case 'invoice': case 'cost_margin': case 'payments': return true;
      case 'project':        return action === 'view';
      case 'phase_advance': case 'phase_override': case 'publish': return false;
      case 'change_request': return action === 'view';
      case 'team': case 'settings': case 'merch_publish': return false;
      case 'audit_all':      return action === 'view';
      default:               return action === 'view';
    }
  }

  /* customers */
  if(r === 'cust_admin' || r === 'cust_member'){
    const acc = account(u.account);
    if(module === 'create_project')  return false;            // §5.3 — never
    if(module === 'payments')        return r === 'cust_admin' && acc.modules.payments;
    if(module === 'approve')         return r === 'cust_admin' || (ctx.project && (u.projects||[]).includes(ctx.project));
    if(module === 'customer_team')   return r === 'cust_admin';
    if(module === 'merchandise')     return acc.modules.merchandise;
    if(module === 'project')         return r === 'cust_admin' || (u.projects||[]).includes(ctx.project);
    if(module === 'change_request')  return true;             // draft + submit
    return true;
  }
  return false;
}

/* ============================================================================
   EVENTS — one emit(). Rules decide activity / notification / task / audit.
   ========================================================================= */
function emit(type, o){
  o = o || {};
  const ev = {
    id: uid('ev'), type, at: o.at || nowStamp(),
    actor: o.actor || (SESSION && SESSION.user) || 'system',
    account: o.account || null, project: o.project || null,
    text: o.text || type, customerVisible: o.customerVisible !== false,
  };
  S.events.unshift(ev);

  if(o.notify){
    S.notifications.unshift({
      id: uid('nt'), at: ev.at, to: o.notify,          // 'customer' | 'studio' | both
      kind: o.kind || 'update', text: o.notifyText || o.text,
      account: ev.account, project: ev.project, read: false,
      action: o.actionRequired || false, link: o.link || null,
    });
  }
  if(o.audit){
    S.audit.unshift({
      id: uid('au'), at: ev.at, actor: ev.actor,
      role: ROLE_NAMES[user(ev.actor).role] || '—',
      record: o.record || (ev.project || ev.account || '—'),
      action: o.audit, was: o.was ?? null, now: o.now ?? null,
      reason: o.reason || null, source: 'user',
    });
  }
  return ev;
}

function toast(title, detail){
  const t = {id:uid('t'), title, detail};
  TOASTS.push(t);
  setTimeout(() => { const i = TOASTS.indexOf(t); if(i>-1) TOASTS.splice(i,1); paintToasts(); }, 4200);
  paintToasts();
}

/* ============================================================================
   PROJECTIONS — the load-bearing file.
   The same record, projected for three audiences. If a record cannot be
   written as these three functions, it is not specified well enough.
   ========================================================================= */
const views = {

  /* what the customer is allowed to see and do on a project right now */
  customerProject(p){
    const gs = S.garments.filter(g => g.project === p.id);
    const openCRs = S.changeRequests.filter(c => c.project === p.id &&
      ['submitted','under_review','clarification'].includes(c.state));
    const myApprovals = S.approvals.filter(a => a.project === p.id && a.state === 'awaiting_customer');
    const stage = stageDef(p.stage);
    const gate = gateFor(p);

    let doing = '', youDo = '', responsible = 'PAMUUC', next = '';
    if(p.stage === 'design'){
      doing = 'Our design partner is developing the direction from your brief.';
      youDo = 'Nothing yet. We will publish the concepts for review when they arrive.';
      next  = 'Design concepts published for your review.';
    } else if(p.stage === 'development'){
      if(gate.blocked){
        doing = 'Waiting for the development invoice to be approved and paid before technical files begin.';
        youDo = 'Approve the development invoice in Documents.';
        responsible = 'You'; next = 'Technical files and the first prototype round.';
      } else {
        doing = 'Turning the approved direction into technical files, fabrics and quantities.';
        youDo = openCRs.length ? 'Nothing right now — we are reviewing your open requests.' :
          'Check your positions, garments, fabrics, colours and quantities, and tell us about anything that should change.';
        responsible = openCRs.length ? 'PAMUUC' : 'You';
        next = 'Prototypes are made and a fitting is arranged.';
      }
    } else if(p.stage === 'prototype_fitting'){
      const waiting = gs.filter(g => ['feedback_required','ready_fitting','fitting_scheduled'].includes(g.state));
      const stuck = gs.filter(g => g.state === 'manual_resolution');
      doing = 'Making and revising samples, one garment at a time.';
      youDo = waiting.length ? `Give fitting feedback on ${waiting.length} garment${waiting.length>1?'s':''}.` :
              stuck.length ? 'Nothing — we will contact you directly about the garment that needs resolving.' :
              'Confirm the proposed fitting date.';
      responsible = waiting.length ? 'You' : 'PAMUUC';
      next = 'Every garment approved, then Pre Production.';
    } else if(p.stage === 'pre_production'){
      doing = 'Compiling the final production matrix from your approved garments.';
      youDo = 'Confirm quantities and size splits, then approve the production specification and pro forma.';
      responsible = 'You';
      next = 'Production begins once the pro forma is approved and paid.';
    } else if(p.stage === 'production'){
      doing = 'Your garments are being manufactured against the locked specification.';
      youDo = 'Nothing. We will tell you when milestones are reached.';
      next  = 'Quality review, then delivery planning.';
    } else if(p.stage === 'delivery'){
      doing = p.completed ? 'This project is complete. Approved garments are available to reorder.'
                          : 'Preparing and dispatching shipments to your locations.';
      youDo = p.completed ? 'Nothing. Reorder any approved garment when you need it.' : 'Confirm receipt when garments arrive.';
      responsible = p.completed ? '—' : 'You';
      next  = p.completed ? 'Reorder whenever you need more.' : 'Delivery confirmed and garments published to Reorders.';
    }

    return {
      id:p.id, ref:p.ref, name:p.name, stage:p.stage, stageName:stage.name, stageBlurb:stage.blurb,
      stages:p.stages, status:p.opStatus, statusSay:st(p.opStatus).say,
      version:p.version, publishedAt:p.publishedAt,
      doing, youDo, responsible, next,
      nextMilestone:p.nextMilestone, lastUpdate:p.lastUpdate, target:p.target,
      garments:gs, openCRs, approvals:myApprovals, gate,
      am:user(p.am),
      /* deliberately absent: internal tasks, margin, supplier, cost, risk notes */
    };
  },

  /* the operational view — same record, everything on it */
  studioProject(p, u){
    const c = views.customerProject(p);
    const gs = S.garments.filter(g => g.project === p.id);
    return Object.assign({}, c, {
      opStatus:p.opStatus, risk:p.risk, draftDirty:p.draftDirty,
      owner:user(p.owner), am:user(p.am),
      allCRs:S.changeRequests.filter(x => x.project === p.id),
      allApprovals:S.approvals.filter(a => a.project === p.id),
      documents:S.documents.filter(d => d.project === p.id),
      roundExceptions:gs.filter(g => g.round >= 3),
      blockers:gateBlockers(p),
      showCost:can(u,'cost_margin','view'),
      account:account(p.account),
    });
  },
};

/* ---- commercial gates -------------------------------------------------- */
function gateFor(p){
  const g = p.gates || {};
  if(p.stage === 'development' && g.development_invoice !== 'paid'){
    return {blocked:true, key:'development_invoice', state:g.development_invoice,
      label:'Development invoice', why:'Technical files and prototype authorisation begin only after the development invoice is approved and paid.'};
  }
  if(p.stage === 'pre_production' && g.production_proforma !== 'paid'){
    return {blocked:true, key:'production_proforma', state:g.production_proforma,
      label:'Production pro forma', why:'Production is released only after the production specification and pro forma are approved and the required payment is recorded.'};
  }
  return {blocked:false};
}

/* everything standing between this project and its next stage */
function gateBlockers(p){
  const out = [];
  const gs = S.garments.filter(g => g.project === p.id);
  const gate = gateFor(p);
  if(gate.blocked) out.push({kind:'commercial', text:`${gate.label} is ${st(gate.state).label.toLowerCase()}`, why:gate.why});

  if(p.stage === 'prototype_fitting'){
    gs.filter(g => g.state !== 'approved').forEach(g => {
      out.push({kind:'garment', text:`${g.name} — ${st(g.state).label.toLowerCase()} (round ${g.round})`,
        why: g.state === 'manual_resolution'
          ? 'Three prototype rounds reached without approval. A Master resolution is required before this project can advance.'
          : 'Every required garment needs an approved prototype revision.', garment:g.id});
    });
  }
  if(p.stage === 'pre_production'){
    gs.forEach(g => g.colourways.forEach(cw => {
      const sum = Object.values(cw.sizes||{}).reduce((a,b)=>a+(+b||0),0);
      if(sum !== cw.qty) out.push({kind:'data',
        text:`${g.name} — ${COLOURS[cw.colour].name}: size split sums to ${sum}, quantity is ${cw.qty}`,
        why:'Every colourway quantity must equal the sum of its size split.'});
    }));
  }
  if(p.stage === 'development'){
    const openCR = S.changeRequests.filter(c => c.project === p.id &&
      ['submitted','under_review','clarification'].includes(c.state));
    if(openCR.length) out.push({kind:'request',
      text:`${openCR.length} customer request${openCR.length>1?'s':''} unresolved`,
      why:'Development changes must be resolved before the stage closes.'});
  }
  return out;
}

function nextStage(p){
  const i = p.stages.indexOf(p.stage);
  return i > -1 && i < p.stages.length - 1 ? p.stages[i+1] : null;
}
function cwSum(cw){ return Object.values(cw.sizes||{}).reduce((a,b)=>a+(+b||0),0); }
function projectPieces(p){
  return S.garments.filter(g=>g.project===p.id)
    .reduce((t,g)=>t+g.colourways.reduce((a,c)=>a+(+c.qty||0),0),0);
}

/* ---- customer-side derived lists --------------------------------------- */
function myAccount(){ return SESSION ? account(user(SESSION.user).account) : null; }
function myProjects(){
  const u = user(SESSION.user);
  return S.projects.filter(p => p.account === u.account && p.published)
    .filter(p => can(u,'project','view',{project:p.id}));
}
function myOpenItems(){
  const u = user(SESSION.user);
  const items = [];
  S.approvals.filter(a => a.account === u.account && a.state === 'awaiting_customer').forEach(a =>
    items.push({kind:'approval', title:a.kind, sub:'Approval due ' + dateShort(a.due),
      project:a.project, cta:'Review', id:a.id, urgency:'wait'}));
  S.documents.filter(d => d.account === u.account && d.visible && d.state === 'overdue').forEach(d =>
    items.push({kind:'document', title:d.title, sub:d.num + ' — overdue since ' + dateShort(d.due),
      project:d.project, cta:'View', id:d.id, urgency:'stop'}));
  S.documents.filter(d => d.account === u.account && d.visible && d.state === 'payment_due').forEach(d =>
    items.push({kind:'document', title:d.title, sub:d.num + ' — due ' + dateShort(d.due),
      project:d.project, cta:'View', id:d.id, urgency:'wait'}));
  S.garments.filter(g => {
    const p = project(g.project);
    return p && p.account === u.account && g.state === 'feedback_required';
  }).forEach(g => items.push({kind:'fitting', title:'Fitting feedback — ' + g.name,
    sub:'Round ' + g.round, project:g.project, cta:'Give feedback', id:g.id, urgency:'wait'}));
  S.meetings.filter(m => m.account === u.account && m.state === 'proposed').forEach(m =>
    items.push({kind:'meeting', title:m.kind, sub:m.slots.length + ' dates proposed',
      project:m.project, cta:'Choose a date', id:m.id, urgency:'wait'}));
  return items;
}
function myReorderables(){
  const u = user(SESSION.user);
  return S.garments.filter(g => {
    const p = project(g.project);
    return g.reorderable && p && p.account === u.account;
  });
}
function unreadCount(side){
  return S.notifications.filter(n => n.to === side && !n.read).length;
}

/* ---- studio-side queues ------------------------------------------------ */
function studioQueues(u){
  const scope = (p) => u.role === 'master' || u.role === 'finance' || p.am === u.id;
  return {
    inquiries: S.inquiries.filter(i => ['submitted'].includes(i.state)),
    requests:  S.changeRequests.filter(c => ['submitted','under_review'].includes(c.state)),
    approvals: S.approvals.filter(a => a.state === 'awaiting_customer'),
    atRisk:    S.projects.filter(p => p.risk && scope(p)),
    blocked:   S.projects.filter(p => gateBlockers(p).length && !p.completed && scope(p)),
    overdue:   S.documents.filter(d => d.state === 'overdue'),
    due:       S.documents.filter(d => d.state === 'payment_due'),
    threads:   S.conversations.filter(c => c.state === 'waiting_customer' || c.state === 'needs_reply'),
    exceptions:S.garments.filter(g => g.state === 'manual_resolution'),
  };
}
function financeTotals(){
  const issued = S.documents.filter(d => d.amount && ['payment_due','paid','overdue','partially_paid'].includes(d.state));
  const collected = issued.filter(d => d.state === 'paid');
  const out = issued.filter(d => d.state !== 'paid');
  const sum = a => a.reduce((t,d)=>t+(d.amount||0),0);
  return {issued:sum(issued), collected:sum(collected), outstanding:sum(out),
    overdue:sum(out.filter(d=>d.state==='overdue')), count:issued.length};
}

/* ---- seeded history so activity feeds are not empty -------------------- */
function seedHistory(){
  const h = [
    ['2026-04-02 09:00','Project created in the Studio Back Office','prj_2418','u_nuria'],
    ['2026-04-08 16:20','Contract CTR-2026-018 published','prj_2418','u_sergi'],
    ['2026-06-12 10:05','Version 5 published to the customer','prj_2418','u_nuria'],
    ['2026-06-24 14:22','Marta Riera approved the project structure','prj_2418','u_marta'],
    ['2026-07-09 08:40','Development invoice INV-2026-0258 recorded as paid','prj_2418','u_sergi'],
    ['2026-07-11 11:00','Stage advanced: Development → Prototype Fitting','prj_2418','u_nuria'],
    ['2026-08-22 11:00','Change request accepted: third colourway in Marítim blue','prj_2418','u_nuria'],
    ['2026-08-28 17:30','First fitting completed at Hotel Marítim Barceloneta','prj_2418','u_nuria'],
    ['2026-08-28 17:45','Long sleeve shirt approved at round 1','prj_2418','u_marta'],
    ['2026-08-28 17:46','Tailored apron approved at round 1','prj_2418','u_marta'],
    ['2026-08-29 09:05','Service tunic approved at round 1','prj_2418','u_marta'],
    ['2026-09-02 12:10','Wrap jacket: changes requested, round 2 authorised','prj_2418','u_marta'],
    ['2026-09-08 15:00','Wool overcoat: round 3 not approved — manual resolution required','prj_2418','u_nuria'],
    ['2026-09-04 11:20','Version 7 published to the customer','prj_2418','u_nuria'],
    ['2026-08-26 09:00','Project created in the Studio Back Office','prj_2455','u_nuria'],
    ['2026-09-05 12:00','Version 2 published to the customer','prj_2455','u_nuria'],
    ['2026-09-08 17:30','Customer request: rename position','prj_2455','u_marta'],
    ['2026-09-09 10:14','Customer request: add Sand colourway','prj_2455','u_marta'],
    ['2026-03-19 09:30','Delivery confirmed — 88 pieces received','prj_2201','u_marta'],
    ['2026-03-19 09:35','3 garments published to Reorders','prj_2201','u_nuria'],
  ];
  h.forEach(([at,text,proj,actor]) => S.events.push({
    id:uid('ev'), type:'history', at, actor, project:proj,
    account:project(proj)?.account, text, customerVisible:true}));
  S.events.sort((a,b) => String(b.at).localeCompare(String(a.at)));

  /* a small standing audit trail */
  [['2026-07-11 11:00','u_nuria','prj_2418','Stage advanced','development','prototype_fitting',null],
   ['2026-08-22 11:00','u_nuria','cr_3','Change request decided','submitted','approved',null],
   ['2026-09-04 11:20','u_nuria','prj_2418','Published version','6','7',null],
   ['2026-09-08 15:00','u_leo','g_coat','Garment state changed','changes_requested','manual_resolution','Round limit reached at round 3'],
   ['2026-02-11 10:00','u_leo','acc_maritim','Account activated','—','active',null],
  ].forEach(([at,actor,record,action,was,now,reason]) => S.audit.push({
    id:uid('au'), at, actor, role:ROLE_NAMES[user(actor).role], record, action, was, now, reason, source:'user'}));

  /* standing notifications */
  S.notifications.push(
    {id:uid('nt'), at:'2026-09-09 16:55', to:'customer', kind:'action', read:false, action:true,
     text:'Choose a date for the second fitting on the Wrap jacket', project:'prj_2418', account:'acc_maritim'},
    {id:uid('nt'), at:'2026-09-05 12:02', to:'customer', kind:'action', read:false, action:true,
     text:'Development invoice INV-2026-0311 is ready for your approval', project:'prj_2455', account:'acc_maritim'},
    {id:uid('nt'), at:'2026-08-29 09:06', to:'customer', kind:'update', read:true, action:false,
     text:'Three garments were approved at the first fitting', project:'prj_2418', account:'acc_maritim'},
    {id:uid('nt'), at:'2026-09-09 08:31', to:'studio', kind:'action', read:false, action:true,
     text:'New inquiry INQ-0148 from Casa Vela Restaurants', project:null, account:null},
    {id:uid('nt'), at:'2026-09-09 10:14', to:'studio', kind:'action', read:false, action:true,
     text:'Change request from Grup Marítim: add a Sand colourway', project:'prj_2455', account:'acc_maritim'},
  );
}
seedHistory();

/* ---- persistence: per-viewer convenience only, never load-bearing ------ */
const SKEY = 'pamuuc_suite_v1';
function save(){
  try{ localStorage.setItem(SKEY, JSON.stringify({S, SESSION})); }catch(e){}
}
function restore(){
  try{
    const raw = localStorage.getItem(SKEY);
    if(!raw) return false;
    const o = JSON.parse(raw);
    if(o && o.S && o.S.projects){ S = o.S; SESSION = o.SESSION || null; return true; }
  }catch(e){}
  return false;
}
function resetAll(){
  try{ localStorage.removeItem(SKEY); }catch(e){}
  S = JSON.parse(JSON.stringify(SEED));
  seedHistory();
  SESSION = null; UI = {};
  go('public','home');
  toast('Prototype reset', 'Every record is back to its seeded state.');
}
