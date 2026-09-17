/* ============================================================================
   PAMUUC SUITE — router, modals, event wiring
   ========================================================================= */

let MODAL = null;

/* The hash is a convenience for deep links only. Inside an about:srcdoc frame
   (the artifact viewer) writing location.hash throws, and inside a sandboxed
   frame reading it can too — neither may ever stop the app from rendering. */
function go(surface, page, param){
  /* a new list starts at the first page rather than inheriting the last one */
  if(page !== ROUTE.page || param !== ROUTE.params.id) UI.shown = null;
  ROUTE = {surface, page, params:{id:param}};
  try{ location.hash = '#/' + surface + '/' + page + (param ? '/' + param : ''); }catch(e){}
  try{ window.scrollTo(0,0); }catch(e){}
  render();
}

function readHash(){
  let raw = '';
  try{ raw = location.hash || ''; }catch(e){}
  const parts = raw.replace(/^#\/?/,'').split('/').filter(Boolean);
  if(!parts.length) return {surface:'public', page:'home', params:{}};
  return {surface:parts[0] || 'public', page:parts[1] || 'home', params:{id:parts[2]}};
}


/* ---- quote basket ---------------------------------------------------------
   Adding a line saves a requested configuration. It does not contact anyone.
   The request becomes a lead only when contact details are captured and the
   submission is accepted — a button click is not a conversion. */
function addToQuote(id){
  const p = by(S.merchProducts, id); if(!p) return;
  const c = UI.cfg;
  const rq = S.decoRates && !p.quoteOnly ? quoteLines(p, S.decoRates, c) : null;
  const line = {
    product:p.id, productName:p.name, ref:p.ref, img:prodImg(p),
    qty:c.qty, colour:c.colour, colourName:(COLOURS[c.colour] || {}).name || c.colour,
    placements:(c.placements || []).map(pl => ({
      pos:pl.pos, posName:S.positions_lib[pl.pos] || pl.pos,
      method:pl.method, methodName:(S.personalization[pl.method] || {}).name || pl.method,
      size:pl.size, colours:pl.colours, art:pl.art})),
    art:(c.placements || []).some(pl => pl.art),
    artHelp:!!c.artHelp, sizes:false,
    unit:rq ? rq.unit : null, total:rq ? rq.total : null,
    quoteOnly:!!p.quoteOnly, cfg:JSON.parse(JSON.stringify(c)),
  };
  UI.quote = UI.quote || [];
  if(UI.editLine != null && UI.quote[UI.editLine]){ UI.quote[UI.editLine] = line; UI.editLine = null; }
  else UI.quote.push(line);
  render();
  toast('Added to your quote', lineSummary(line) + ' — nothing is ordered or charged.');
}

function collectContact(){
  const q = UI.qc = UI.qc || {}, err = {};
  ['name','email','company','postcode','phone','date'].forEach(n => {
    const el = document.querySelector('[name="' + n + '"]');
    if(el) q[n] = el.value;
  });
  const sel = document.querySelector('[name="country"]'); if(sel) q.country = sel.value;
  const notes = document.querySelector('[name="notes"]'); if(notes) q.notes = notes.value;
  if(!q.name)    err.name = 'Enter a name so we know who to reply to.';
  if(!q.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(q.email))
    err.email = 'Enter an email address so we can send the quote.';
  if(!q.company) err.company = 'Enter the company or organisation this is for.';
  UI.qcErr = err;
  if(Object.keys(err).length){ render(); const s = $('qerrsum'); if(s) s.scrollIntoView({block:'center'}); return false; }
  return true;
}

function submitQuoteRequest(){
  const q = UI.qc || {}, lines = UI.quote || [];
  if(!lines.length || !q.email) return;
  let ref = '';
  lines.forEach(l => {
    const rec = act.submitMerchQuote({
      account: SESSION && user(SESSION.user).account || null,
      product:l.product, productName:l.productName, ref:l.ref, qty:l.qty,
      colour:l.colour, colourName:l.colourName, placements:l.placements,
      express:false, unit:l.unit, total:l.total, quoteOnly:l.quoteOnly,
      method:(l.placements[0] || {}).method, methodName:(l.placements[0] || {}).methodName || '',
      pos:(l.placements[0] || {}).pos, posName:(l.placements[0] || {}).posName || '',
      art:l.art ? 'attached' : (l.artHelp ? 'help requested' : 'to follow'),
      contact:{name:q.name, email:q.email, company:q.company,
               country:q.country || 'Spain', postcode:q.postcode || '',
               phone:q.phone || '', date:q.noDate ? 'Not fixed' : (q.date || 'Not provided'),
               notes:q.notes || ''},
    });
    if(!ref) ref = rec.id;
  });
  UI.qDone = {ref:String(ref).toUpperCase(), email:q.email, lines:lines.length,
    units:quoteUnits(), country:q.country || 'Spain',
    date:q.noDate ? 'Date not fixed' : (q.date || 'Not provided')};
  UI.quote = []; UI.qc = {}; UI.qcErr = {};
  go('public','qdone');
}

/* One assisted enquiry path. It records a real enquiry, marked as awaiting
   qualification — it never counts as a completed nine topic brief. */
function assistedEnquiry(kind, fields){
  const v = {}; let missing = 0;
  fields.forEach(n => {
    const el = document.querySelector('[name="' + n + '"]');
    v[n] = el ? el.value.trim() : '';
    if(el && el.required && !v[n]) missing++;
  });
  if(missing){
    modalStub('A few details are still needed',
      'Name, email and company are needed before we can reply. Nothing you have typed has been lost.');
    return;
  }
  const label = {advice:'Initial advice request', help:'Help choosing merchandise', contact:'Contact message'}[kind];
  emit('public.enquiry', {
    text: label + ' from ' + (v[fields[2]] || 'an unnamed company'),
    notify:'studio', kind:'action', actionRequired:true,
    notifyText: label + ' — awaiting qualification',
    audit:label, record:v[fields[1]] || '—', was:'—', now:'awaiting qualification'});
  save();
  openModal({title:'Request sent',
    sub:label + ' · awaiting qualification',
    body:`<div class="stack">
      <div class="banner banner--go"><div>
        <div class="banner-t">We have your message and we will reply by email</div>
        <div class="banner-d">This is an enquiry, not an order and not an account. It joins the qualification
          queue with the questions we still need to ask marked against it.</div></div></div>
      <p class="t-sm muted">If a uniform project is what you need, the nine topic brief asks the questions we
        would ask on a first call, and it is faster than a conversation that has to cover them anyway.</p></div>`,
    actions:`<button class="btn btn--quiet" data-act="closeModal">Close</button>
      <button class="btn btn--primary" data-go="public:form">Start your project brief</button>`});
}


/* Repricing a line from the drawer runs the same calculation the product page
   runs, so the drawer and the product page can never disagree. */
function setLineQty(i, qty){
  const l = (UI.quote || [])[i]; if(!l || !qty) return;
  const p = by(S.merchProducts, l.product);
  l.qty = qty; if(l.cfg) l.cfg.qty = qty;
  const rq = p && S.decoRates && !p.quoteOnly ? quoteLines(p, S.decoRates, l.cfg || {qty}) : null;
  l.unit = rq ? rq.unit : null;
  l.total = rq ? rq.total : null;
  render();
}


/* ---- the brief ----------------------------------------------------------
   Answers live in UI.answers under the key each question declares, so the
   review, the submission and the studio back office all read one shape. */
function quizAnswered(q){
  const a = UI.answers || {};
  return q.mode === 'many' ? (a[q.key] || []).length > 0 : !!a[q.key];
}

function pickAnswer(v){
  const step = UI.formStep || 0;
  const qs = quizQs();
  const q = qs[step - 1]; if(!q) return;
  const a = UI.answers = UI.answers || {};

  if(q.mode === 'many'){
    const cur = a[q.key] = a[q.key] || [];
    const i = cur.indexOf(v);
    if(i > -1) cur.splice(i, 1);
    else {
      /* a capped question rolls: choosing a third drops the first */
      if(q.max && cur.length >= q.max) cur.shift();
      cur.push(v);
    }
    render();
    return;
  }

  const wasType = q.key === 'Establishment';
  const before = a[q.key];
  a[q.key] = v;
  /* changing the establishment changes which two questions come next, so the
     old branch answers cannot be carried across */
  if(wasType && before && before !== v){
    const old = BRANCHES[BRANCH_OF[before]] || [];
    old.forEach(x => { delete a[x.key]; });
  }
  render();
  /* a single choice advances on its own, the way this kind of form behaves */
  setTimeout(() => {
    const now = UI.formStep || 0;
    const list = quizQs();
    if(ROUTE.page === 'form' && now >= 1 && now <= list.length && list[now - 1].key === q.key){
      UI.formStep = now + 1; render();
    }
  }, 260);
}

function readCompanyFields(){
  const a = UI.answers = UI.answers || {};
  ['Company','Email','VAT','Phone','Contact name','Role'].forEach(n => {
    const el = document.querySelector('[name="' + n + '"]');
    if(el) a[n] = el.value.trim();
  });
  const c = document.querySelector('[name="Country"]');
  if(c) a['Country'] = c.value;
}

function collectAboutYou(){
  const a = UI.answers = UI.answers || {}, err = {};
  readCompanyFields();
  if(!a['Contact name']) err['Contact name'] = 'Enter a name so we know who to reply to.';
  if(!a['Role'])         err['Role'] = 'Enter your role.';
  if(!a['Authority'])    err['Authority'] = 'Tell us whether this is your decision to make.';
  UI.formErr = err;
  if(Object.keys(err).length){ render(); const s = $('ferr'); if(s) s.scrollIntoView({block:'center'}); return false; }
  return true;
}

function collectAboutCompany(){
  const a = UI.answers = UI.answers || {}, err = {};
  readCompanyFields();
  if(!a['Company']) err['Company'] = 'Enter the company or organisation we would invoice.';
  if(!a['Email'] || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a['Email']))
    err['Email'] = 'Enter a company email address so we can send the proposal.';
  /* a wrong VAT number is worse than none: it blocks, a missing one does not */
  const v = vatState(a);
  if(v.state === 'format-invalid') err['VAT'] = v.text;
  a['VAT status'] = v.state;
  a['VAT checked'] = v.state === 'pending' ? v.value : '';
  UI.formErr = err;
  if(Object.keys(err).length){ render(); const s = $('ferr'); if(s) s.scrollIntoView({block:'center'}); return false; }
  return true;
}

/* Letter keys choose, Enter continues — the brief is operable without a mouse. */
function briefKey(e){
  if(ROUTE.surface !== 'public' || ROUTE.page !== 'form') return;
  if(/^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || ''))) return;
  const step = UI.formStep || 0;
  const qs = quizQs();
  if(e.key === 'Enter'){
    if(step === 0){ e.preventDefault(); UI.formStep = 1; render(); return; }
    if(step >= 1 && step <= qs.length && quizAnswered(qs[step - 1])){
      e.preventDefault(); UI.formStep = step + 1; render();
    }
    return;
  }
  if(step < 1 || step > qs.length) return;
  const i = KEYLETTER.indexOf((e.key || '').toUpperCase());
  if(i < 0) return;
  const opts = [...document.querySelectorAll('.tf-o')];
  if(opts[i]){ e.preventDefault(); opts[i].click(); }
}

/* ---- render -------------------------------------------------------------- */
function render(){
  const r = ROUTE;
  let html = '';

  if(r.surface === 'public'){
    switch(r.page){
      case 'custom':   html = pubCustom(); break;
      case 'merch':       html = pubMerch(); break;
      case 'collections': html = pubCollections(); break;
      case 'collection':  html = pubCollection(r.params.id); break;
      case 'products':    html = pubProducts(); break;
      case 'search':      html = pubSearch(); break;
      case 'method':      html = pubMethod(); break;
      case 'howto':       html = pubHowTo(); break;
      case 'merchhelp':   html = pubMerchHelp(); break;
      case 'product':     html = pubProduct(r.params.id); break;
      case 'quote':       html = pubQuote(); break;
      case 'qcontact':    html = pubQContact(); break;
      case 'qreview':     html = pubQReview(); break;
      case 'qdone':       html = pubQDone(); break;
      case 'sector':      html = pubSector(r.params.id); break;
      case 'case':        html = pubCase(r.params.id); break;
      case 'studiohelp':  html = pubStudioHelp(); break;
      case 'about':       html = pubAbout(); break;
      case 'contact':     html = pubContact(); break;
      case 'privacy':     html = pubPrivacy(); break;
      case 'cookies':     html = pubCookies(); break;
      case 'terms':       html = pubTerms(); break;
      case 'accessibility': html = pubAccessibility(); break;
      case 'blog':        html = pubBlog(); break;
      case 'post':        html = pubPost(r.params.id); break;
      case 'sectors':  html = pubSectors(); break;
      case 'process':  html = pubProcess(); break;
      case 'work':     html = pubWork(); break;
      case 'form':     html = pubForm(); break;
      case 'review':   html = pubReview(); break;
      case 'done':     html = pubDone(); break;
      case 'login':    html = pubLogin(); break;
      default:         html = (r.page && r.page !== 'home') ? pubNotFound(r.page) : pubHome();
    }
  } else if(r.surface === 'account'){
    if(!SESSION || user(SESSION.user).side !== 'customer'){ ROUTE = {surface:'public',page:'login',params:{}}; return render(); }
    switch(r.page){
      case 'projects':      html = accProjects(); break;
      case 'project':       html = accProject(r.params.id); break;
      case 'reorders':      html = accReorders(); break;
      case 'merchandise':   html = accMerch(); break;
      case 'documents':     html = accDocuments(); break;
      case 'messages':      html = accMessages(); break;
      case 'notifications': html = accNotifications(); break;
      case 'settings':      html = accSettings(); break;
      default:              html = accOverview();
    }
  } else {
    if(!SESSION || user(SESSION.user).side !== 'studio'){ ROUTE = {surface:'public',page:'login',params:{}}; return render(); }
    switch(r.page){
      case 'inquiries':     html = stInquiries(); break;
      case 'inquiry':       html = stInquiry(r.params.id); break;
      case 'customers':     html = stCustomers(); break;
      case 'customer':      html = stCustomer(r.params.id); break;
      case 'projects':      html = stProjects(); break;
      case 'project':       html = stProject(r.params.id); break;
      case 'bases':         html = stBases(); break;
      case 'merch':         html = stMerch(); break;
      case 'finance':       html = stFinance(); break;
      case 'billing':       html = stBilling(); break;
      case 'comms':         html = stComms(); break;
      case 'team':          html = stTeam(); break;
      case 'settings':      html = stSettings(); break;
      case 'audit':         html = stAudit(); break;
      case 'notifications': html = stNotifications(); break;
      default:              html = stOverview();
    }
  }

  $('root').innerHTML = html + surfaceSwitch();
  /* the fixed action bar needs the body to reserve room for it */
  document.body.classList.toggle('has-bar', html.indexOf('class="buybar') > -1);
  /* the public site has no bottom mobile nav, so the surface switcher can stay
     at the bottom there instead of covering the top of a hero */
  document.body.classList.toggle('is-public', r.surface === 'public');
  paintModal();
  paintToasts();
  afterRender();
}

/* Behaviour that needs elements in the document. render() replaces the whole
   tree, so anything observed has to be re-attached each time. */
let MORE_OBS = null;
function afterRender(){
  if(MORE_OBS){ MORE_OBS.disconnect(); MORE_OBS = null; }
  const more = $('more');
  if(!more || typeof IntersectionObserver === 'undefined') return;
  /* the button is the real control; this just saves the reader reaching for it */
  MORE_OBS = new IntersectionObserver((entries) => {
    if(!entries.some(e => e.isIntersecting)) return;
    const btn = more.querySelector('[data-act="more"]');
    if(btn) btn.click();
  }, {rootMargin:'600px 0px'});
  MORE_OBS.observe(more);
}

/* the prototype's own affordance — not part of the product */
function surfaceSwitch(){
  const s = ROUTE.surface;
  const cust = SESSION && user(SESSION.user).side === 'customer';
  const stud = SESSION && user(SESSION.user).side === 'studio';
  const narrow = typeof window !== 'undefined' && window.innerWidth < 820;
  return `<div class="switch">
    <button class="${s==='public'?'on':''}" data-go="public:home">Website</button>
    <button class="${s==='account'?'on':''}" data-act="jumpAccount">${narrow?'Account':'Customer Account'}</button>
    <button class="${s==='studio'?'on':''}" data-act="jumpStudio">${narrow?'Studio':'Studio Back Office'}</button>
    <button data-act="reset" title="Reset every record">↺</button>
  </div>`;
}

function paintToasts(){
  let el = $('toasts');
  if(!el){ el = document.createElement('div'); el.id = 'toasts'; el.className = 'toasts'; document.body.appendChild(el); }
  el.innerHTML = TOASTS.map(t => `<div class="toast"><div class="toast-t">${esc(t.title)}</div>
    ${t.detail?`<div class="toast-d">${esc(t.detail)}</div>`:''}</div>`).join('');
}

function paintModal(){
  let el = $('modal');
  if(!el){ el = document.createElement('div'); el.id = 'modal'; document.body.appendChild(el); }
  el.innerHTML = MODAL ? `<div class="scrim" data-act="closeModalBg">
    <div class="modal ${MODAL.wide?'modal--wide':''}" role="dialog" aria-modal="true">
      <div class="modal-h">
        <div><h2 class="t-h4">${esc(MODAL.title)}</h2>
          ${MODAL.sub?`<p class="t-xs muted" style="margin-top:4px">${MODAL.sub}</p>`:''}</div>
        <button class="iconbtn" data-act="closeModal">✕</button>
      </div>
      <div class="modal-b">${MODAL.body}</div>
      ${MODAL.foot?`<div class="modal-f">${MODAL.foot}</div>`:''}
    </div></div>` : '';
}
function openModal(m){ MODAL = m; paintModal(); }
function closeModal(){ MODAL = null; paintModal(); }

/* ---- modal builders ------------------------------------------------------ */
function modalApproval(id){
  const a = by(S.approvals, id); if(!a) return;
  const g = a.target ? garment(a.target) : null;
  const d = a.target ? doc(a.target) : null;
  openModal({
    title:a.kind, sub:`${esc(a.rev)} · due ${dateShort(a.due)}`,
    body:`
      <div class="stack">
        <div class="banner"><div><div class="banner-t">What you are approving</div>
          <div class="banner-d">${esc(a.summary)}</div></div></div>
        ${g ? `<div class="card card--quiet">
          <div class="eyebrow">What changed since the last revision</div>
          <div class="diff" style="margin-top:8px">
            <span class="diff-k">Revision</span><span><span class="was">${g.rev-1}</span><span class="arrow">→</span><span class="now">${g.rev}</span></span>
            <span class="diff-k">Sleeve, bicep</span><span><span class="was">Standard block</span><span class="arrow">→</span><span class="now">+18 mm ease</span></span>
            <span class="diff-k">Cuff</span><span><span class="was">Two-fold</span><span class="arrow">→</span><span class="now">Soft single-fold</span></span>
            <span class="diff-k">Prototype round</span><span><span class="now">${g.round} of a maximum of 3</span></span>
          </div></div>` : ''}
        ${d ? `<div class="paper">
          <h4>PAMUUC | STUDIO</h4>
          <p style="margin-top:4px">Pamuk Studio S.L · Barcelona · ${esc(d.num)}</p>
          <table><thead><tr><th>Description</th><th class="n">Amount</th></tr></thead>
          <tbody><tr><td>${esc(d.title)}</td><td class="n">${money(d.amount)}</td></tr>
          <tr><td>VAT 21%</td><td class="n">${money(d.amount*0.21)}</td></tr>
          <tr><td><strong>Total</strong></td><td class="n"><strong>${money(d.amount*1.21)}</strong></td></tr></tbody></table>
          <p style="margin-top:8px">Issued ${dateShort(d.issued)} · due ${dateShort(d.due)}</p>
        </div>` : ''}
        <label class="field"><span class="field-l">Comment <span class="faint">(required if you request changes)</span></span>
          <textarea class="inp" id="apcomment" placeholder="Anything we should know…"></textarea></label>
        <p class="t-xs muted">Your decision is recorded against this exact revision. A later revision needs a new approval — an old approval can never carry forward.</p>
      </div>`,
    foot:`<button class="btn btn--ghost" data-act="closeModal">Cancel</button>
      <button class="btn btn--ghost" data-act="apDecide" data-id="${a.id}" data-d="changes">Request changes</button>
      <button class="btn btn--primary" data-act="apDecide" data-id="${a.id}" data-d="approve">Approve</button>`,
  });
}

function modalDoc(id){
  const d = doc(id); if(!d) return;
  const canPay = can(user(SESSION.user),'payments','act');
  openModal({
    title:d.title, sub:`${d.num} · ${esc(d.type)} · ${pill(d.state)}`,
    body:`<div class="stack">
      <div class="paper">
        <h4>PAMUUC | STUDIO</h4>
        <p style="margin-top:4px">Pamuk Studio S.L · Carrer example, Barcelona · VAT ESB00000000</p>
        <p style="margin-top:10px"><strong>${esc(d.type)} ${esc(d.num)}</strong><br>
          ${esc(account(d.account).name)}<br>${d.project?esc(project(d.project).name):''}</p>
        ${d.amount ? `<table><thead><tr><th>Description</th><th class="n">Amount</th></tr></thead>
          <tbody><tr><td>${esc(d.title)}</td><td class="n">${money(d.amount)}</td></tr>
          <tr><td>VAT 21%</td><td class="n">${money(d.amount*0.21)}</td></tr>
          <tr><td><strong>Total due</strong></td><td class="n"><strong>${money(d.amount*1.21)}</strong></td></tr></tbody></table>`
          : '<p style="margin-top:10px">Terms document — no amount.</p>'}
        <p style="margin-top:10px">Issued ${dateShort(d.issued)}${d.due?` · payable by ${dateShort(d.due)}`:''}${d.paidAt?` · paid ${dateShort(d.paidAt)}`:''}</p>
        <p style="margin-top:10px;color:#666">Version ${d.v}. Corrections are issued as a new version or a credit note; this record is never overwritten.</p>
      </div>
      ${d.state === 'payment_due' || d.state === 'overdue' ? `
        <div class="banner banner--${d.state==='overdue'?'stop':'wait'}"><div>
          <div class="banner-t">${d.state==='overdue'?'This payment is late':'Payment due '+dateShort(d.due)}</div>
          <div class="banner-d">${/Development/i.test(d.title)
            ? 'Approving and paying this authorises technical files and the first prototype round.'
            : 'Approving this releases the next stage of work.'}</div></div></div>` : ''}
    </div>`,
    foot: (d.state === 'payment_due' || d.state === 'overdue') && canPay
      ? `<button class="btn btn--ghost" data-act="closeModal">Close</button>
         <button class="btn btn--primary" data-act="payDoc" data-id="${d.id}">Approve and pay ${money(d.amount*1.21)}</button>`
      : `<button class="btn btn--ghost" data-act="closeModal">Close</button>`,
  });
}

function modalReorder(gid){
  const g = garment(gid); if(!g) return;
  UI.ro = {lines:g.colourways.map(c => ({cw:c.id, colour:c.colour, qty:0})), dest:myAccount().locations[0]?.name || ''};
  const draw = () => `
    <div class="stack">
      <div class="banner banner--go"><div>
        <div class="banner-t">Cloned from the archived revision ${g.rev} snapshot</div>
        <div class="banner-d">${esc(FABRICS[g.fabric].name)} · ${esc(S.personalization[g.pers.method].name)} at ${esc(S.positions_lib[g.pers.pos])}. We will not silently substitute a newer base, fabric or artwork — any substitution becomes an explicit change you have to accept.</div></div></div>
      <div>
        <div class="field-l">Colours and quantities</div>
        ${g.colourways.map(c => `<div class="cw">
          <span class="row"><span class="sw sw--lg" style="background:${COLOURS[c.colour].hex}"></span>
            <span class="t-sm med">${esc(COLOURS[c.colour].name)}</span></span>
          <input class="inp inp--num" type="number" min="0" value="0" data-act="roQty" data-cw="${c.id}">
          <span class="t-xs muted num">${money(g.unitPrice)} ea</span>
        </div>`).join('')}
      </div>
      <label class="field"><span class="field-l">Deliver to</span>
        <select class="inp" id="rodest">
          ${myAccount().locations.map(l => `<option>${esc(l.name)}</option>`).join('')}
        </select></label>
      <div class="card card--quiet"><div class="row-between">
        <span class="t-sm muted">Indicative at the last approved unit price</span>
        <span class="t-h4 num" id="rototal">${money(0)}</span></div>
        <div class="t-xs muted" style="margin-top:6px">We confirm availability, price and timing before anything is produced. No development fee applies to a reorder.</div></div>
    </div>`;
  openModal({title:'Reorder — ' + g.name, sub:`${base(g.base).ref} · revision ${g.rev} (locked)`,
    body:draw(),
    foot:`<button class="btn btn--ghost" data-act="closeModal">Cancel</button>
      <button class="btn btn--primary" data-act="roSubmit" data-g="${g.id}">Submit reorder request</button>`});
}

function modalRequest(kind, o){
  const titles = {rename:'Request a position name change', garment:'Request another garment', colour:'Request another colour'};
  const p = o.p ? project(o.p) : null;
  const pos = o.pos && p ? p.positions.find(x => x.id === o.pos) : null;
  const g = o.g ? garment(o.g) : null;
  let body = '';
  if(kind === 'rename') body = `
    <label class="field"><span class="field-l">Current name</span>
      <input class="inp" value="${esc(pos.name)}" disabled></label>
    <label class="field"><span class="field-l">What should it be called?</span>
      <input class="inp" id="rqval" placeholder="Treatment Team"></label>`;
  if(kind === 'garment') body = `
    <p class="t-sm muted" style="margin-bottom:16px">You are asking for another garment inside <strong>${esc(pos.name)}</strong>. We will tell you whether it is feasible, what it does to price and timing, and which base it would use.</p>
    <label class="field"><span class="field-l">What garment?</span>
      <input class="inp" id="rqval" placeholder="A lightweight gilet for the terrace shift"></label>`;
  if(kind === 'colour') body = `
    <p class="t-sm muted" style="margin-bottom:16px">The colours offered on <strong>${esc(g.name)}</strong> are the ones we have mapped and tested against its fabric. Anything else needs a lab dip.</p>
    <label class="field"><span class="field-l">What colour?</span>
      <input class="inp" id="rqval" placeholder="A warmer sand, closer to our lobby stone"></label>`;
  openModal({title:titles[kind],
    body:`<div class="stack">${body}
      <label class="field"><span class="field-l">Why? <span class="faint">(this is the part that helps us)</span></span>
        <textarea class="inp" id="rqwhy" placeholder="What changed, or what is not working…"></textarea></label>
      <div class="banner"><div><div class="banner-t">This does not change anything yet</div>
        <div class="banner-d">Your request is reviewed before it touches the approved specification. If we accept it, we build it into a new revision and publish that — so you always know exactly what is agreed.</div></div></div>
    </div>`,
    foot:`<button class="btn btn--ghost" data-act="closeModal">Cancel</button>
      <button class="btn btn--primary" data-act="rqSubmit" data-kind="${kind}" data-p="${o.p||''}" data-pos="${o.pos||''}" data-g="${o.g||''}">Submit request</button>`});
}

function modalBuilder(accId, step){
  step = step || 1;
  UI.build = UI.build || {account:accId, name:'', design:false, target:'', brief:'',
    positions:[{name:'', people:'', garments:[]}], am:'u_nuria'};
  const b = UI.build;
  const steps = ['Project information','Positions','Garments','Options','Quantities','Customer access','Review & publish'];
  let body = '';

  if(step === 1) body = `
    <label class="field"><span class="field-l">Project name</span>
      <input class="inp" id="bname" value="${esc(b.name)}" placeholder="Front of House Wardrobe"></label>
    <label class="field"><span class="field-l">Customer</span>
      <input class="inp" value="${esc(account(accId).name)}" disabled></label>
    <label class="field"><span class="field-l">Target delivery</span>
      <input class="inp" type="date" id="btarget" value="${esc(b.target)}"></label>
    <label class="field"><span class="field-l">Brief</span>
      <textarea class="inp" id="bbrief" placeholder="What the wardrobe has to do, and the constraints it lives under.">${esc(b.brief)}</textarea></label>
    <label class="choice ${b.design?'choice--on':''}">
      <input type="checkbox" id="bdesign" ${b.design?'checked':''}>
      <span><span class="choice-t">This project includes paid design work</span>
        <span class="choice-d">Adds the conditional Design stage. Leave it off and the project starts at Development — the customer never sees a stage that does not apply to them.</span></span></label>`;

  if(step === 2) body = `
    <p class="t-sm muted" style="margin-bottom:16px">A position is a role you are dressing. The customer can complete or request changes to these, but cannot create them.</p>
    ${b.positions.map((p,i) => `<div class="card card--quiet" style="margin-bottom:12px">
      <div class="grid grid-2">
        <label class="field" style="margin:0"><span class="field-l">Position ${i+1}</span>
          <input class="inp" data-act="bpos" data-i="${i}" data-f="name" value="${esc(p.name)}" placeholder="Front of House"></label>
        <label class="field" style="margin:0"><span class="field-l">People</span>
          <input class="inp" type="number" data-act="bpos" data-i="${i}" data-f="people" value="${esc(p.people)}" placeholder="50"></label>
      </div></div>`).join('')}
    <button class="btn btn--ghost btn--sm" data-act="bAddPos">Add another position</button>`;

  if(step === 3) body = `
    <p class="t-sm muted" style="margin-bottom:16px">Choose garments from Pamuuc Bases. Draft and restricted bases cannot be added.</p>
    ${b.positions.filter(p => p.name).map((p,i) => `
      <div class="card card--quiet" style="margin-bottom:12px">
        <div class="t-sm med" style="margin-bottom:8px">${esc(p.name)} — ${p.people} people</div>
        <div class="wrap-row">
          ${S.bases.filter(x => x.status === 'active').map(x => `
            <button class="sw-btn ${(p.garments||[]).includes(x.id)?'sw-btn--on':''}" data-act="bGarment" data-i="${i}" data-b="${x.id}">
              ${x.glyph} ${esc(x.name)}</button>`).join('')}
        </div>
      </div>`).join('') || '<p class="t-sm muted">Add a position with a name first.</p>'}`;

  if(step === 4) body = `
    <p class="t-sm muted" style="margin-bottom:16px">Map which fabrics, colours and personalisation the customer may choose from. Anything you do not map here, they must request.</p>
    ${b.positions.flatMap(p => (p.garments||[]).map(bid => { const x = base(bid); return `
      <div class="card card--quiet" style="margin-bottom:12px">
        <div class="t-sm med">${x.glyph} ${esc(x.name)} <span class="mono-ref">${x.ref} ${x.v}</span></div>
        <div class="stack-2" style="margin-top:8px">
          <div class="factline"><span>Fabrics</span><span>${x.fabrics.map(f=>FABRICS[f].name).join(', ')}</span></div>
          <div class="factline"><span>Colours</span><span class="row" style="gap:4px">${x.colours.map(c=>`<span class="sw" style="background:${COLOURS[c].hex}"></span>`).join('')}</span></div>
          <div class="factline"><span>Identity</span><span>${x.pers.map(m=>S.personalization[m].name).join(', ')}</span></div>
        </div></div>`;})).join('') || '<p class="t-sm muted">Add garments first.</p>'}`;

  if(step === 5) body = `
    <p class="t-sm muted" style="margin-bottom:16px">Seed the structure. The customer completes the detail — pieces per person, colourway lines and size splits — inside the published project.</p>
    <div class="rows">
      ${b.positions.filter(p=>p.name).map(p => `<div class="rw rw--static">
        <span class="rw-main"><span class="rw-t">${esc(p.name)}</span>
          <span class="rw-s">${p.people||0} people · ${(p.garments||[]).length} garments</span></span>
        <span class="rw-side"><span class="t-sm num">${(p.garments||[]).length * (+p.people||0)} pieces at 1 each</span></span></div>`).join('')}
    </div>
    <div class="banner" style="margin-top:16px"><div><div class="banner-t">Size splits are validated, not assumed</div>
      <div class="banner-d">Pre Production will not let the project advance while any colourway quantity disagrees with the sum of its size split.</div></div></div>`;

  if(step === 6) body = `
    <p class="t-sm muted" style="margin-bottom:16px">What the customer may do inside this project.</p>
    <div class="stack-2">
      ${[['Complete people counts and quantities','Editable'],
         ['Choose from published fabrics and colours','Editable'],
         ['Add colourway lines','Editable'],
         ['Rename a position','Request only'],
         ['Add or remove a garment','Request only'],
         ['Request an unmapped colour or fabric','Request only'],
         ['Approve revisions and commercial documents','Account Admin only'],
         ['Technical files, costs, supplier notes','Hidden']]
        .map(([n,v]) => `<div class="row-between" style="padding:8px 0;border-bottom:1px solid var(--line)">
          <span class="t-sm">${n}</span><span class="chip ${v==='Hidden'?'':'chip--on'}">${v}</span></div>`).join('')}
    </div>`;

  if(step === 7){
    const issues = [];
    if(!b.name) issues.push('The project has no name.');
    b.positions.filter(p=>p.name).forEach(p => { if(!(p.garments||[]).length) issues.push(`Position "${p.name}" has no garment.`); });
    if(!b.positions.some(p=>p.name)) issues.push('No positions have been created.');
    body = `
      ${issues.length ? `<div class="banner banner--stop" style="margin-bottom:16px"><div>
        <div class="banner-t">${issues.length} thing${issues.length>1?'s':''} block publication</div>
        <ul class="stack-2" style="margin-top:8px">${issues.map(i=>`<li class="t-sm">· ${esc(i)}</li>`).join('')}</ul>
      </div></div>` : `<div class="banner banner--go" style="margin-bottom:16px"><div>
        <div class="banner-t">Ready to publish</div>
        <div class="banner-d">This creates the project and publishes version 1 to the customer.</div></div></div>`}
      <div class="cvp">
        <div class="cvp-hd"><span class="eyebrow" style="color:var(--navy)">Exactly what the customer will see</span></div>
        <div class="stack-2">
          <div class="factline"><span>Project</span><span class="med">${esc(b.name || '—')}</span></div>
          <div class="factline"><span>Stages</span><span>${(b.design?['Design']:[]).concat(['Development','Prototype Fitting','Pre Production','Production','Delivery']).join(' → ')}</span></div>
          <div class="factline"><span>Opens in</span><span>${b.design?'Design':'Development'}</span></div>
          <div class="factline"><span>Positions</span><span>${b.positions.filter(p=>p.name).map(p=>`${p.name} (${p.people||0})`).join(', ') || '—'}</span></div>
          <div class="factline"><span>Garments</span><span>${b.positions.flatMap(p=>(p.garments||[]).map(g=>base(g).name)).join(', ') || '—'}</span></div>
        </div>
      </div>
      <p class="t-xs muted" style="margin-top:16px">Publication is a recorded action. After it, you can keep editing a working draft while the customer continues to see the last published version.</p>`;
    UI.buildIssues = issues;
  }

  openModal({wide:true, title:'Create a project — ' + account(accId).name,
    sub:`Step ${step} of 7 · ${steps[step-1]}`,
    body:`<div class="q-prog" style="margin-bottom:20px">${steps.map((_,i)=>`<i class="${i+1<step?'done':i+1===step?'on':''}"></i>`).join('')}</div>${body}`,
    foot:`<button class="btn btn--quiet" data-act="closeModal">Cancel</button>
      ${step>1?`<button class="btn btn--ghost" data-act="bStep" data-s="${step-1}">← Back</button>`:''}
      ${step<7?`<button class="btn btn--primary" data-act="bStep" data-s="${step+1}">Continue →</button>`
        :`<button class="btn btn--primary" data-act="bPublish" ${UI.buildIssues.length?'disabled':''}>Create and publish version 1</button>`}`});
}

function modalResolve(gid){
  const g = garment(gid); if(!g) return;
  openModal({title:'Manual resolution — ' + g.name,
    sub:`Round ${g.round} reached without approval · ${project(g.project).ref}`,
    body:`<div class="stack">
      <div class="banner banner--stop"><div><div class="banner-t">Why this is here</div>
        <div class="banner-d">A garment gets three prototype rounds. A fourth is not a technical decision, it is a commercial one, so the system stops and asks for an explicit Master resolution rather than quietly making another sample.</div></div></div>
      <div class="card card--quiet"><p class="t-sm">${esc(g.notes)}</p></div>
      <div class="field-l">Resolution</div>
      <div class="stack-2">
        ${[['exception','Approve as an exception','Accept the current revision and lock it. The project can advance.'],
           ['requote','Revise scope and issue a new commercial proposal','Resets to round 1 against a new agreement — a different cloth, or a higher quantity.'],
           ['drop','Close this garment','Removed from the project. The other garments are unaffected.']]
          .map(([v,t,d]) => `<label class="choice"><input type="radio" name="res" value="${v}">
            <span><span class="choice-t">${t}</span><span class="choice-d">${d}</span></span></label>`).join('')}
      </div>
      <label class="field"><span class="field-l">Reason <span style="color:var(--stop)">(required — this goes in the audit log)</span></span>
        <textarea class="inp" id="resreason" placeholder="Why this is the right call."></textarea></label>
    </div>`,
    foot:`<button class="btn btn--ghost" data-act="closeModal">Cancel</button>
      <button class="btn btn--primary" data-act="resolveDo" data-g="${g.id}">Record the resolution</button>`});
}

function modalOverride(pid){
  const p = project(pid);
  openModal({title:'Override the stage gate', sub:p.ref + ' · ' + stageDef(p.stage).name,
    body:`<div class="stack">
      <div class="banner banner--stop"><div><div class="banner-t">You are advancing past unmet conditions</div>
        <div class="banner-d">The customer will see the new stage. The override, your name and your reason are written to the audit log permanently.</div></div></div>
      <ul class="stack-2">${gateBlockers(p).map(b=>`<li class="t-sm">· ${esc(b.text)}</li>`).join('')}</ul>
      <label class="field"><span class="field-l">Reason <span style="color:var(--stop)">(required)</span></span>
        <textarea class="inp" id="ovreason" placeholder="Why this override is justified."></textarea></label>
    </div>`,
    foot:`<button class="btn btn--ghost" data-act="closeModal">Cancel</button>
      <button class="btn btn--danger" data-act="overrideDo" data-p="${p.id}">Override and advance</button>`});
}

function modalStub(title, body){
  openModal({title, body:`<div class="banner"><div><div class="banner-t">Specified, not built in this prototype</div>
    <div class="banner-d">${body}</div></div></div>`,
    foot:`<button class="btn btn--primary" data-act="closeModal">Understood</button>`});
}


/* ---- catalogue CSV import (Studio → Merchandising) ----------------------- */
function modalImport(){
  const v = UI.importResult;
  const V = csvVocab();
  const ref = (label, vals) => `<div style="margin-bottom:10px">
    <div class="t-xs med">${label}</div>
    <div class="wrap-row" style="gap:4px;margin-top:4px">
      ${vals.map(x => `<code class="chip" style="font-size:11px">${esc(x)}</code>`).join('')}</div></div>`;

  const body = !v ? `
    <div class="stack">
      <div class="banner"><div>
        <div class="banner-t">Paste or drop your filled merch-catalogue.csv</div>
        <div class="banner-d">It is checked against exactly the same rules as the terminal validator — one rule set, not two. Nothing changes until you commit.</div></div></div>
      <div id="dropzone" class="empty" style="padding:32px;cursor:pointer">
        <div class="empty-t">Drop the CSV here</div>
        <div class="empty-d">or paste its contents into the box below</div>
      </div>
      <label class="field"><span class="field-l">CSV contents</span>
        <textarea class="inp" id="csvbox" style="min-height:160px;font-size:12px"
          placeholder="row_type,ref,handle,name,category,status,moq,..."></textarea></label>
      <details class="card card--quiet">
        <summary class="t-sm med" style="cursor:pointer">Allowed values</summary>
        <div style="margin-top:12px">
          ${ref('row_type', CSV_ROW_TYPES)}
          ${ref('colours / colour', V.colours)}
          ${ref('personalisation_methods / method', V.methods)}
          ${ref('personalisation_positions / position', V.positions)}
          ${ref('sizes', [...V.sizes, 'One size'])}
          ${ref('status', CSV_STATUSES)}
          ${ref('size_band', ['small','medium','large'])}
          ${ref('priced_by', ['size','quantity'])}
        </div>
      </details>
    </div>`
  : `
    <div class="stack">
      <div class="grid grid-4">
        ${[[v.byType.product.length,'Products'],[v.byType.variant.length,'Variants'],
           [v.byType.image.length,'Images'],[v.byType.deco_rate.length,'Rate rows']]
          .map(([n,l]) => `<div class="tile"><div class="tile-v num">${n}</div><div class="tile-l">${l}</div></div>`).join('')}
      </div>
      ${v.ok
        ? `<div class="banner banner--go"><div><div class="banner-t">No errors — ${v.index.size} products ready</div>
           <div class="banner-d">${v.warnings} warning${v.warnings===1?'':'s'}. Warnings never block an import.</div></div></div>`
        : `<div class="banner banner--stop"><div><div class="banner-t">${v.errors} error${v.errors===1?'':'s'} — nothing will be imported</div>
           <div class="banner-d">Fix these in the spreadsheet and paste it again.</div></div></div>`}
      ${v.report.length ? `<div class="tw" style="max-height:260px;overflow-y:auto">
        <table class="tbl" style="min-width:0"><thead><tr><th>Line</th><th>Column</th><th>What is wrong</th></tr></thead>
        <tbody>${v.report.slice(0,120).map(r => `<tr>
          <td class="num">${r.line}</td>
          <td class="t-xs"><code>${esc(r.col)}</code></td>
          <td class="t-xs">${r.sev === 'ERROR' ? pill('error') : pill('warning')} ${esc(r.msg)}</td>
        </tr>`).join('')}</tbody></table>
        ${v.report.length > 120 ? `<div class="tbl-empty">…and ${v.report.length - 120} more</div>` : ''}
      </div>` : ''}
      ${v.ok ? `<div class="card card--quiet">
        <div class="eyebrow">Preview</div>
        <div class="stack-2" style="margin-top:8px">
          ${catalogueToProducts(v).slice(0,6).map(p => `<div class="row-between">
            <span class="t-sm">${p.glyph} <span class="med">${esc(p.name)}</span>
              <span class="mono-ref">/${esc(p.handle)}</span></span>
            <span class="row" style="gap:6px">
              ${p.colours.slice(0,6).map(c => `<span class="sw" style="background:${COLOURS[c]?COLOURS[c].hex:'#ccc'};width:14px;height:14px"></span>`).join('')}
              <span class="t-xs num">${money(p.from)}</span></span></div>`).join('')}
          ${v.index.size > 6 ? `<div class="t-xs faint">…and ${v.index.size - 6} more</div>` : ''}
        </div></div>` : ''}
      <p class="t-xs muted">Images are referenced by URL. They will render on Shopify and on the real site, but not inside this published prototype — its content policy blocks external images. The URLs are still validated and carried through.</p>
    </div>`;

  openModal({wide:true, title:'Import catalogue CSV',
    sub: v ? 'Step 2 of 2 · review' : 'Step 1 of 2 · paste or drop the file',
    body,
    foot: !v
      ? `<button class="btn btn--ghost" data-act="closeModal">Cancel</button>
         <button class="btn btn--primary" data-act="csvCheck">Check the file</button>`
      : `<button class="btn btn--ghost" data-act="csvBack">← Paste a different file</button>
         <button class="btn btn--primary" data-act="csvCommit" ${v.ok?'':'disabled'}>
           Import ${v.index.size} product${v.index.size===1?'':'s'}</button>`});

  /* drag-and-drop, wired after the modal is in the DOM */
  const dz = $('dropzone');
  if(dz){
    const stop = e => { e.preventDefault(); e.stopPropagation(); };
    ['dragenter','dragover'].forEach(n => dz.addEventListener(n, e => {
      stop(e); dz.style.borderColor = 'var(--navy)'; dz.style.background = 'var(--navy-quiet)'; }));
    ['dragleave','drop'].forEach(n => dz.addEventListener(n, e => {
      stop(e); dz.style.borderColor = ''; dz.style.background = ''; }));
    dz.addEventListener('drop', e => {
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if(!f) return;
      const rd = new FileReader();
      rd.onload = () => { const box = $('csvbox'); if(box){ box.value = rd.result; }
        UI.importResult = validateCatalogue(String(rd.result)); modalImport(); };
      rd.readAsText(f);
    });
    dz.addEventListener('click', () => { const box = $('csvbox'); if(box) box.focus(); });
  }
}

/* ---- event delegation ----------------------------------------------------- */
document.addEventListener('click', (e) => {
  const goEl = e.target.closest('[data-go]');
  const actEl = e.target.closest('[data-act]');

  if(actEl){
    const a = actEl.dataset.act;
    const d = actEl.dataset;

    /* --- chrome --- */
    if(a === 'theme'){
      const cur = document.documentElement.getAttribute('data-theme');
      const next = cur === 'dark' ? 'light' : cur === 'light' ? 'dark' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try{ localStorage.setItem('pamuuc_theme', next); }catch(err){}
      return;
    }
    if(a === 'closeModal' || (a === 'closeModalBg' && e.target.classList.contains('scrim'))){ closeModal(); return; }
    if(a === 'closeModalBg') return;
    if(a === 'reset'){ resetAll(); return; }
    if(a === 'logout'){ SESSION = null; save(); go('public','home'); return; }
    if(a === 'userMenu'){ modalStub('Signed in as ' + user(SESSION.user).name,
      'Profile, notification preferences and security settings live here. Use the switcher at the bottom of the screen to change who you are signed in as.'); return; }
    if(a === 'jumpAccount'){
      if(SESSION && user(SESSION.user).side === 'customer') go('account','overview');
      else { SESSION = {user:'u_marta'}; save(); go('account','overview'); }
      return;
    }
    if(a === 'jumpStudio'){
      if(SESSION && user(SESSION.user).side === 'studio') go('studio','overview');
      else { SESSION = {user:'u_leo'}; save(); go('studio','overview'); }
      return;
    }
    if(a === 'login'){ SESSION = {user:d.u}; save();
      go(user(d.u).side === 'customer' ? 'account' : 'studio', 'overview'); return; }
    if(a === 'previewAs'){
      SESSION = {user:d.u || 'u_marta'}; save(); go('account','overview');
      toast('Previewing the customer account', 'Same permissions, same published data — not a separate mock.');
      return;
    }
    if(a === 'peekInquiry'){ SESSION = {user:'u_leo'}; save(); go('studio','inquiries'); return; }
    if(a === 'toMerch'){ go('public','merch'); return; }

    /* --- public form --- */
    /* --- the brief: choose, never type (except the last screen) --- */
    if(a === 'pick'){ pickAnswer(d.v); return; }
    if(a === 'pickField'){ UI.answers = UI.answers || {}; UI.answers[d.k] = d.v; render(); return; }
    if(a === 'noVat'){
      UI.answers = UI.answers || {};
      readCompanyFields();
      UI.answers['No VAT'] = !UI.answers['No VAT'];
      render(); return;
    }
    if(a === 'checkVat'){ readCompanyFields(); render(); return; }
    if(a === 'formNext'){
      const step = UI.formStep || 0;
      if(step === 0){ UI.formStep = 1; render(); return; }        /* intro */
      const qs = quizQs();
      if(step === qs.length + 1){ if(collectAboutYou()) { UI.formStep = step + 1; render(); } return; }
      if(step > qs.length + 1){ if(collectAboutCompany()) go('public','review'); return; }
      if(!quizAnswered(qs[step - 1])) return;
      UI.formStep = step + 1; render(); return;
    }
    if(a === 'formBack'){
      if(ROUTE.page === 'review'){ UI.formStep = quizQs().length + CONTACT_STEPS; go('public','form'); return; }
      const step = UI.formStep || 0;
      if(step === 0){ go('public','custom'); return; }
      UI.formStep = step - 1; UI.formErr = null; render(); return;
    }

    if(a === 'formGoto'){ UI.formStep = +d.i; UI.formErr = null; go('public','form'); return; }
    if(a === 'formSubmit'){
      UI.lastInquiry = act.submitInquiry(UI.answers || {}, qualify(UI.answers || {}));
      UI.formStep = 0; UI.answers = {};
      go('public','done'); return;
    }

    /* --- merchandise config --- */
    if(a === 'menu'){ UI.menu = !UI.menu; render(); return; }
    if(a === 'skip'){ const m = $('main'); if(m){ m.setAttribute('tabindex','-1'); m.focus(); } return; }
    if(a === 'lang'){ modalStub('Español · Français · English',
      'Spanish and French are launch requirements, with equivalent critical flows and their own routes. The copy is not translated in this prototype, so the control shows the structure rather than pretending the translations exist.'); return; }

    /* --- FAQ: reveal the remaining questions without a re-render, so any
       answer the visitor already opened stays open --- */
    if(a === 'faqMore'){
      const box = $(d.f); if(!box) return;
      const all = box.classList.toggle('faq--all');
      actEl.textContent = all ? 'Show fewer questions'
        : 'Show ' + Math.max(0, box.querySelectorAll('.faq-i--more').length) + ' more questions';
      actEl.setAttribute('aria-expanded', all ? 'true' : 'false');
      return;
    }

    /* --- product list filters --- */
    if(a === 'fCat' || a === 'fMethod'){ UI.shown = null;
      const f = listState(), key = a === 'fCat' ? 'cats' : 'methods';
      const i = f[key].indexOf(d.v);
      if(i > -1) f[key].splice(i, 1); else f[key].push(d.v);
      UI.fltOpen = true; render(); return;
    }
    if(a === 'fPrice'){ UI.shown = null; const f = listState(); f.price = f.price === d.v ? '' : d.v; UI.fltOpen = true; render(); return; }
    if(a === 'fQty'){ UI.shown = null; const el = $('fqty'); listState().qty = el ? el.value : ''; UI.fltOpen = true; render(); return; }
    if(a === 'rmCat'){ const f = listState(); f.cats = f.cats.filter(x => x !== d.v); render(); return; }
    if(a === 'rmMethod'){ const f = listState(); f.methods = f.methods.filter(x => x !== d.v); render(); return; }
    if(a === 'rmQty'){ listState().qty = ''; render(); return; }
    if(a === 'rmPrice'){ listState().price = ''; render(); return; }
    if(a === 'fClear'){ UI.shown = null; UI.flt = null; listState(); render(); return; }
    if(a === 'dirDim'){ UI.dirDim = d.v; render(); return; }
    if(a === 'dirTab'){ UI.dirTab = d.v; render(); return; }
    if(a === 'openDrawer'){ UI.drawer = true; render(); return; }
    if(a === 'closeDrawer'){ UI.drawer = false; render(); return; }
    if(a === 'more'){ UI.shown = (UI.shown || PAGE_STEP) + PAGE_STEP; render(); return; }
    if(a === 'carouPrev' || a === 'carouNext'){
      const t = $(d.c + '-t'); if(!t) return;
      const card = t.querySelector('.pcard');
      const step = card ? card.getBoundingClientRect().width + 20 : 320;
      t.scrollBy({left:(a === 'carouNext' ? 1 : -1) * step * 2, behavior:'smooth'});
      return;
    }
    if(a === 'doSearch'){ const el = $('q'); UI.q = el ? el.value : ''; go('public','search'); return; }

    /* --- quote basket --- */
    if(a === 'addToQuote'){ addToQuote(d.id); return; }
    if(a === 'artHelp'){
      const p = by(S.merchProducts, d.id);
      UI.cfg = UI.cfg || {}; UI.cfg.artHelp = true;
      openModal({title:'Request help with this item',
        sub:p ? esc(p.name) + ' · your configuration is kept' : '',
        body:`<div class="stack">
          <p class="t-sm">What help do you need? Your colour, quantity and placements stay on the request.</p>
          <div class="chip-row">
            ${['Preparing a logo file','Adapting existing artwork','Choosing a placement','Discussing a new design']
              .map(x => `<span class="chip">${x}</span>`).join('')}
          </div>
          <p class="t-xs muted">Any chargeable design work is scoped and approved before it starts. We do not
            offer free original design or unlimited revisions.</p></div>`,
        actions:`<button class="btn btn--quiet" data-act="closeModal">Close</button>
          <button class="btn btn--primary" data-go="public:merchhelp">Describe what you need</button>`});
      return; }
    if(a === 'askEarlier'){ modalStub('Ask about an earlier date',
      'An earlier date is assessed against production capacity and material availability for your configuration, so it is a question rather than an option to select. Add the date you need to your quote request and we will answer it with the quote.'); return; }
    if(a === 'qRemove'){
      const l = (UI.quote || [])[+d.i]; if(!l) return;
      UI.quote.splice(+d.i, 1); render();
      toast('Removed from your quote', esc(l.productName) + ' is no longer in the request.');
      return; }
    if(a === 'qDup'){
      const l = (UI.quote || [])[+d.i]; if(!l) return;
      UI.quote.splice(+d.i + 1, 0, JSON.parse(JSON.stringify(l))); render(); return; }
    if(a === 'qEdit'){
      const l = (UI.quote || [])[+d.i]; if(!l) return;
      UI.cfg = JSON.parse(JSON.stringify(l.cfg)); UI.editLine = +d.i;
      go('public','product', l.product); return; }
    if(a === 'qcFixed'){ UI.qc = UI.qc || {}; UI.qc.noDate = !UI.qc.noDate; render(); return; }
    if(a === 'qcNext'){ if(collectContact()) go('public','qreview'); return; }
    if(a === 'qSubmit'){ submitQuoteRequest(); return; }
    if(a === 'openMerchAcc'){ modalStub('Account access',
      'A secure access link is sent to the address on the request. Your quote request is saved either way — declining account access never discards it.'); return; }

    /* --- assisted enquiries --- */
    if(a === 'advCall'){ UI.advCall = !UI.advCall; render(); return; }
    if(a === 'advSubmit'){ assistedEnquiry('advice', ['adv_name','adv_email','adv_co','adv_msg']); return; }
    if(a === 'helpSubmit'){ assistedEnquiry('help', ['h_name','h_email','h_co','h_msg']); return; }
    if(a === 'contactSubmit'){ assistedEnquiry('contact', ['c_name','c_email','c_co','c_msg']); return; }
    if(a === 'cSvc'){ UI.cSvc = d.v; render(); return; }
    if(a === 'askSample'){ modalStub('Ask about a sample',
      'Sample availability, cost and timing differ per product, so this is a request rather than a price. Tell us the product and quantity you are considering and we will confirm what is available.'); return; }
    if(a === 'cookieStub'){ modalStub('Cookie settings',
      'The published control records a choice per category and lets it be withdrawn as easily as it was given. The categories are generated from what the live site actually loads.'); return; }
    if(a === 'briefSector'){ UI.answers = UI.answers || {}; UI.answers['Sector'] = (sectorById(d.s) || {}).n || '';
      UI.formStep = 0; go('public','form'); return; }
    if(a === 'briefCase'){ UI.answers = UI.answers || {}; UI.caseCtx = d.c;
      UI.formStep = 0; go('public','form'); return; }
    if(a === 'merchCat'){ UI.merchCat = d.cat; render(); return; }
    if(a === 'mailStub'){ modalStub('hello@pamuuc.com',
      'In the live site this is a mail link. Here it stays inside the prototype so nothing opens a mail client you did not ask for.'); return; }
    if(a === 'legalStub'){ modalStub(d.k,
      'Legal pages are drafted outside this prototype. The footer carries the links so the structure and the crawl path are right from the start.'); return; }
    if(a === 'cfgColour'){ UI.cfg.colour = d.c; render(); return; }
    if(a === 'cfgMethod'){ UI.cfg.method = d.m;
      const p = by(S.merchProducts, UI.cfg.id);
      if(!p.pos.includes(UI.cfg.pos)) UI.cfg.pos = p.pos[0];
      render(); return; }
    if(a === 'cfgPos'){ UI.cfg.pos = d.p; render(); return; }
    if(a === 'cfgQtyTier'){ UI.cfg.qty = +d.q; render(); return; }
    if(a === 'pdpTab'){ UI.pdpTab = d.t; render(); return; }
    if(a === 'addPlace'){
      const p = by(S.merchProducts, UI.cfg.id);
      const free = p.pos.find(x => !UI.cfg.placements.some(y => y.pos === x));
      if(free) UI.cfg.placements.push({pos:free, method:p.pers[0], size:'small', colours:1, art:null});
      render(); return;
    }
    if(a === 'rmPlace'){ UI.cfg.placements.splice(+d.i,1); render(); return; }
    if(a === 'togglePlace'){
      const p = by(S.merchProducts, UI.cfg.id);
      const ix = UI.cfg.placements.findIndex(x => x.pos === d.p);
      if(ix > -1){ if(UI.cfg.placements.length > 1) UI.cfg.placements.splice(ix,1); }
      else if(UI.cfg.placements.length < 3)
        UI.cfg.placements.push({pos:d.p, method:p.pers[0], size:'small', colours:1, art:null});
      render(); return;
    }
    if(a === 'plMethod'){ UI.cfg.placements[+d.i].method = d.m;
      if(d.m !== 'screen') UI.cfg.placements[+d.i].colours = 1; render(); return; }
    if(a === 'plSize'){ UI.cfg.placements[+d.i].size = d.z; render(); return; }
    if(a === 'plColours'){ UI.cfg.placements[+d.i].colours = +d.n; render(); return; }
    if(a === 'plArtClear'){ UI.cfg.placements[+d.i].art = null; render(); return; }
    if(a === 'plArt'){
      const i = +d.i;
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.ai,.eps,.pdf,.svg,.png,.jpg,.jpeg';
      inp.addEventListener('change', () => {
        const f = inp.files && inp.files[0];
        if(f){ UI.cfg.placements[i].art = f.name; toast('Artwork attached', f.name); render(); }
      });
      inp.click(); return;
    }
    if(a === 'acCreate'){
      const email = $('acEmail') ? $('acEmail').value.trim() : '';
      const company = $('acCompany') ? $('acCompany').value.trim() : '';
      if(!email || !/@/.test(email)){ if($('acEmail')) $('acEmail').classList.add('inp--err');
        toast('A work email, please', 'It is how we send the quote and the proof.'); return; }
      const acc = act.openMerchAccount(company || email.split('@')[1], email);
      closeModal(); go('account','merchandise');
      return;
    }
    if(a === 'addCw'){ act.addColourway(d.g, d.c); (UI.dirty = UI.dirty||{})[d.g] = true; render(); return; }
    if(a === 'rmCw'){ act.removeColourway(d.g, d.cw); (UI.dirty = UI.dirty||{})[d.g] = true; render(); return; }
    if(a === 'discardCr'){ delete UI.dirty[d.g]; render(); return; }
    if(a === 'submitCr'){
      const g = garment(d.g);
      act.submitChangeRequest({project:d.p, garment:d.g, account:user(SESSION.user).account,
        title:`Quantity and colour changes on ${g.name}`,
        reason:'Submitted from the project workspace.',
        changes:g.colourways.map(c => ({field:'Colourway — ' + COLOURS[c.colour].name, was:'previous', now:c.qty + ' pieces'}))});
      delete UI.dirty[d.g]; render(); return;
    }
    if(a === 'reqRename'){ modalRequest('rename', {p:d.p, pos:d.pos}); return; }
    if(a === 'reqGarment'){ modalRequest('garment', {p:d.p, pos:d.pos}); return; }
    if(a === 'reqColour'){ modalRequest('colour', {g:d.g, p:garment(d.g).project}); return; }
    if(a === 'rqSubmit'){
      const val = $('rqval') ? $('rqval').value : '';
      const why = $('rqwhy') ? $('rqwhy').value : '';
      if(!val.trim()){ $('rqval').classList.add('inp--err'); return; }
      const p = project(d.p || garment(d.g).project);
      const pos = d.pos ? p.positions.find(x => x.id === d.pos) : null;
      const titles = {rename:`Rename position "${pos?pos.name:''}" to "${val}"`,
        garment:`Add a garment to ${pos?pos.name:''}: ${val}`, colour:`Add a colour: ${val}`};
      const changes = d.kind === 'rename' ? [{field:'Position name', was:pos.name, now:val}]
        : d.kind === 'garment' ? [{field:'Garments in ' + (pos?pos.name:''), was:String(pos?pos.garments.length:0), now:String((pos?pos.garments.length:0)+1) + ' (requested)'}]
        : [{field:'Colourway', was:'—', now:val}];
      const cr = {project:p.id, garment:d.g || null, account:user(SESSION.user).account,
        title:titles[d.kind], reason:why || 'No reason given.', changes};
      if(d.kind === 'rename') cr.applyPositionName = {was:pos.name, now:val};
      act.submitChangeRequest(cr);
      closeModal(); render(); return;
    }

    /* --- approvals, fittings, meetings --- */
    if(a === 'openApproval'){ modalApproval(d.id); return; }
    if(a === 'apDecide'){
      const c = $('apcomment') ? $('apcomment').value : '';
      if(d.d === 'changes' && !c.trim()){ $('apcomment').classList.add('inp--err'); return; }
      act.decideApproval(d.id, d.d === 'approve' ? 'approve' : 'changes', c);
      closeModal(); render(); return;
    }
    if(a === 'approveG'){
      const t = $('fb_' + d.g); act.approveGarment(d.g, t ? t.value : ''); render(); return; }
    if(a === 'changesG'){
      const t = $('fb_' + d.g);
      if(!t || !t.value.trim()){ if(t){ t.classList.add('inp--err'); t.focus(); } toast('Tell us what to change','We need the detail to make the next sample right.'); return; }
      act.requestGarmentChanges(d.g, t.value); render(); return;
    }
    if(a === 'acceptSlot'){ act.acceptSlot(d.m, d.s); render(); return; }
    if(a === 'altSlot'){ act.requestAlternative(d.m, 'None of the proposed times work for the spa team.'); render(); return; }
    if(a === 'approveSpec'){
      toast('Specification approved','A locked production snapshot now exists. The pro forma is the next gate.');
      render(); return; }
    if(a === 'confirmReceipt'){ toast('Receipt confirmed','Thank you — recorded against the shipment.'); return; }
    if(a === 'reportIssue'){ modalStub('Report an issue','An issue opens a conversation thread linked to the shipment, with an owner and a resolution state.'); return; }

    /* --- documents --- */
    if(a === 'openDoc'){ modalDoc(d.id); return; }
    if(a === 'payDoc'){ act.payDocument(d.id); closeModal(); render(); return; }
    if(a === 'pubDoc'){ act.publishDocument(d.id); render(); return; }
    if(a === 'docTab'){ UI.docTab = d.t; render(); return; }

    /* --- reorders --- */
    if(a === 'startReorder'){ modalReorder(d.g); return; }
    if(a === 'roQty'){ return; }
    if(a === 'roSubmit'){
      const lines = [...document.querySelectorAll('[data-act="roQty"]')]
        .map(i => ({cw:i.dataset.cw, qty:+i.value||0})).filter(l => l.qty > 0);
      if(!lines.length){ toast('Enter a quantity','Tell us how many of each colour you need.'); return; }
      act.submitReorder(d.g, lines, $('rodest') ? $('rodest').value : '');
      closeModal(); render(); return;
    }

    /* --- messaging --- */
    if(a === 'send'){
      const box = $('msgbox');
      if(!box || !box.value.trim()) return;
      act.sendMessage(d.cv, box.value, d.internal === '1');
      render(); return;
    }
    if(a === 'openCv'){ UI.openCv = d.id; render(); return; }
    if(a === 'cvFilter'){ UI.cvFilter = d.t; render(); return; }
    if(a === 'markRead'){ act.markRead(user(SESSION.user).side); render(); return; }
    if(a === 'nFilter'){ UI.nFilter = d.t; render(); return; }

    /* --- studio: inquiries --- */
    if(a === 'inqAccept'){ act.qualifyInquiry(d.id,'accept'); render(); return; }
    if(a === 'inqDecline'){
      openModal({title:'Decline this inquiry',
        body:`<div class="stack"><p class="t-sm muted">We reply either way. The internal reason and the customer message are separate records.</p>
          <label class="field"><span class="field-l">Internal reason</span>
            <textarea class="inp" id="decreason" placeholder="Below minimum quantity and outside lead time."></textarea></label></div>`,
        foot:`<button class="btn btn--ghost" data-act="closeModal">Cancel</button>
          <button class="btn btn--danger" data-act="inqDeclineDo" data-id="${d.id}">Decline and notify</button>`});
      return;
    }
    if(a === 'inqDeclineDo'){
      act.qualifyInquiry(d.id,'decline', $('decreason') ? $('decreason').value : '');
      closeModal(); render(); return;
    }
    if(a === 'inqInfo'){ act.qualifyInquiry(d.id,'more_info'); render(); return; }
    if(a === 'inqSchedule'){
      openModal({title:'Schedule the first discovery call',
        body:`<div class="stack"><p class="t-sm muted">An account is not opened before this call happens.</p>
          <label class="field"><span class="field-l">When</span>
            <input class="inp" type="datetime-local" id="callwhen" value="2026-09-18T11:00"></label></div>`,
        foot:`<button class="btn btn--ghost" data-act="closeModal">Cancel</button>
          <button class="btn btn--primary" data-act="inqScheduleDo" data-id="${d.id}">Schedule</button>`});
      return;
    }
    if(a === 'inqScheduleDo'){
      act.scheduleCall(d.id, ($('callwhen').value || '').replace('T',' '));
      closeModal(); render(); return;
    }
    if(a === 'inqComplete'){
      openModal({title:'Record the discovery call',
        body:`<div class="stack">
          <p class="t-sm muted">Structured notes are required before an inquiry can be marked ready for an account. This is the gate that stops a form submission becoming an operational commitment.</p>
          <label class="field"><span class="field-l">Objectives, roles, people, style, services, timing, budget, constraints</span>
            <textarea class="inp" id="discnotes" style="min-height:140px" placeholder="What they actually need, and what they think they need."></textarea></label></div>`,
        foot:`<button class="btn btn--ghost" data-act="closeModal">Cancel</button>
          <button class="btn btn--primary" data-act="inqCompleteDo" data-id="${d.id}">Mark discovery complete</button>`});
      return;
    }
    if(a === 'inqCompleteDo'){
      const n = $('discnotes').value;
      if(!n.trim()){ $('discnotes').classList.add('inp--err'); return; }
      act.completeCall(d.id, n); closeModal(); render(); return;
    }
    if(a === 'inqActivate'){
      const acc = act.activateAccount(d.id);
      closeModal(); go('studio','customer',acc.id);
      toast('Account activated','Now create the project. Activation and project creation are two separate recorded actions.');
      return;
    }

    /* --- studio: projects --- */
    if(a === 'prjTab'){ UI.prjTab = d.t; render(); return; }
    if(a === 'custTab'){ UI.custTab = d.t; render(); return; }
    if(a === 'publish'){ act.publishProject(d.p); render(); return; }
    if(a === 'advance'){
      const p = project(d.p);
      if(gateBlockers(p).length){ modalOverride(d.p); return; }
      act.advanceStage(d.p); render(); return;
    }
    if(a === 'override'){ modalOverride(d.p); return; }
    if(a === 'overrideDo'){
      const r = $('ovreason').value;
      if(!r.trim()){ $('ovreason').classList.add('inp--err'); return; }
      act.advanceStage(d.p, r); closeModal(); render(); return;
    }
    if(a === 'crDecide'){
      const notes = {approved:'Accepted in full.', partially_approved:'Accepted in part — see the revision.',
        clarification:'We have asked a question in the project conversation.', declined:'We cannot accept this as specified.'};
      act.decideChangeRequest(d.id, d.o, notes[d.o]); render(); return;
    }
    if(a === 'crIncorporate'){ act.incorporateChangeRequest(d.id); render(); return; }
    if(a === 'authRound'){ act.authoriseRound(d.g); render(); return; }
    if(a === 'readyFit'){ act.readyForFitting(d.g); render(); return; }
    if(a === 'resolveG'){ modalResolve(d.g); return; }
    if(a === 'resolveDo'){
      const sel = document.querySelector('input[name="res"]:checked');
      const reason = $('resreason').value;
      if(!sel){ toast('Choose a resolution','One of the three options must be selected.'); return; }
      if(!reason.trim()){ $('resreason').classList.add('inp--err'); return; }
      act.resolveException(d.g, sel.value, reason); closeModal(); render(); return;
    }
    if(a === 'newProject'){ UI.build = null; modalBuilder(d.acc, 1); return; }
    if(a === 'bStep'){
      const b = UI.build;
      if($('bname')) b.name = $('bname').value;
      if($('btarget')) b.target = $('btarget').value;
      if($('bbrief')) b.brief = $('bbrief').value;
      if($('bdesign')) b.design = $('bdesign').checked;
      modalBuilder(b.account, +d.s); return;
    }
    if(a === 'bAddPos'){ UI.build.positions.push({name:'',people:'',garments:[]}); modalBuilder(UI.build.account, 2); return; }
    if(a === 'bGarment'){
      const p = UI.build.positions[+d.i];
      p.garments = p.garments || [];
      const ix = p.garments.indexOf(d.b);
      if(ix > -1) p.garments.splice(ix,1); else p.garments.push(d.b);
      modalBuilder(UI.build.account, 3); return;
    }
    if(a === 'bPublish'){
      const p = act.createProject(UI.build);
      act.publishProject(p.id);
      UI.build = null; closeModal(); go('studio','project',p.id); return;
    }
    if(a === 'addGarment'){ modalStub('Add a garment from Pamuuc Bases',
      'Opens the base picker filtered to active bases compatible with this position, then attaches the chosen base version to the project as a new project garment at revision 1.'); return; }
    if(a === 'openBase'){ UI.openBase = d.id; render(); return; }
    if(a === 'newBase'){ modalStub('New Pamuuc Base','Creates a base with its fabrics, colours, personalisation options, size system, construction attributes and costing inputs, at version 1 in Draft.'); return; }
    if(a === 'openImport'){ UI.importResult = null; modalImport(); return; }
    if(a === 'csvCheck'){
      const box = $('csvbox');
      if(!box || !box.value.trim()){ toast('Nothing to check', 'Paste the CSV contents or drop the file.'); return; }
      UI.importResult = validateCatalogue(box.value);
      modalImport(); return;
    }
    if(a === 'csvBack'){ UI.importResult = null; modalImport(); return; }
    if(a === 'csvCommit'){
      const v = UI.importResult;
      if(!v || !v.ok) return;
      act.importCatalogue(v);
      UI.importResult = null; closeModal(); render(); return;
    }
    if(a === 'csvImport'){ UI.importResult = null; modalImport(); return; }
    if(a === 'newProduct'){ modalStub('New merchandise product','Creates a product with variants, colourways, minimums, price rules, personalisation compatibility, artwork requirements and lead time, in Draft.'); return; }
    if(a === 'inviteStaff'){ modalStub('Invite an internal user','Sends an invitation, assigns one or more role templates and optionally scopes access to named customers or projects.'); return; }
    if(a === 'inviteUser'){ modalStub('Invite a colleague','Account administrators can invite people from their own company and choose whether each one sees all projects or only named ones.'); return; }
    if(a === 'billFilter'){ UI.billFilter = d.t; render(); return; }
    if(a === 'openItem'){
      if(d.kind === 'approval'){ modalApproval(d.id); return; }
      if(d.kind === 'document'){ modalDoc(d.id); return; }
      if(d.kind === 'fitting' || d.kind === 'meeting'){ go('account','project',d.project); return; }
      go('account','project',d.project); return;
    }
    return;
  }

  if(goEl){
    const [surface, page, param] = goEl.dataset.go.split(':');
    /* leaving a section resets its transient tab state */
    UI.menu = false; UI.drawer = false; MODAL = null;
    if(page !== 'project') UI.prjTab = null;
    if(page !== 'customer') UI.custTab = null;
    go(surface, page, param);
  }
});

/* live inputs */
document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-act]');
  if(!el) return;
  const a = el.dataset.act, d = el.dataset;
  if(a === 'setQty'){ act.setColourwayQty(d.g, d.cw, el.value); (UI.dirty = UI.dirty||{})[d.g] = true;
    const g = garment(d.g); const cw = g.colourways.find(c=>c.id===d.cw);
    const box = el.closest('.cw').querySelector('.t-xs');
    if(box) box.innerHTML = cwSum(cw) === cw.qty
      ? `<span class="sum-ok">Size split sums to ${cw.qty}</span>`
      : `<span class="sum-bad">Size split sums to ${cwSum(cw)}, quantity is ${cw.qty}</span>`;
    return; }
  if(a === 'setSize'){ act.setSize(d.g, d.cw, d.s, el.value); render(); return; }
  if(a === 'cfgQty'){ UI.cfg.qty = +el.value||0; render(); return; }
  if(a === 'dQty'){ setLineQty(+d.i, +el.value); return; }
  if(a === 'cfgQtyExact'){
    const p = by(S.merchProducts, UI.cfg.id);
    const min = p && !p.quoteOnly ? p.moq : 1;
    const v = Math.max(0, Math.floor(+el.value || 0));
    /* keep what they typed; only warn below the minimum, never silently raise it */
    UI.cfg.qty = v; UI.cfg.qtyLow = v > 0 && v < min ? min : 0;
    return; }
  if(a === 'roQty'){
    const g = garment(document.querySelector('[data-act="roSubmit"]').dataset.g);
    const total = [...document.querySelectorAll('[data-act="roQty"]')].reduce((t,i)=>t+(+i.value||0),0);
    const el2 = $('rototal'); if(el2) el2.textContent = money(total * (g.unitPrice||0));
    return; }
  if(a === 'bpos'){ UI.build.positions[+d.i][d.f] = el.value; return; }
});

document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-act]');
  if(!el) return;
  const a = el.dataset.act;
  if(a === 'pickFabric'){ act.setFabric(el.dataset.g, el.value); render(); return; }
  if(a === 'dQty'){ setLineQty(+el.dataset.i, +el.value); return; }
  if(a === 'setCountry'){
    /* the country decides whether a VAT number is asked for at all, so this
       has to re-render — and it has to be on change, not click */
    UI.answers = UI.answers || {};
    readCompanyFields();
    UI.answers['Country'] = el.value;
    render(); return;
  }
  if(a === 'qcSet'){ UI.qc = UI.qc || {}; UI.qc[el.dataset.f] = el.value; return; }
  if(a === 'fSort'){ listState().sort = el.value; UI.shown = null; render(); return; }
});

document.addEventListener('keydown', (e) => {
  briefKey(e);
  if(e.key === 'Escape' && MODAL){ closeModal(); return; }
  if(e.key === 'Escape' && UI.drawer){ UI.drawer = false; render(); }
});

window.addEventListener('hashchange', () => {
  const r = readHash();
  if(r.surface !== ROUTE.surface || r.page !== ROUTE.page || r.params.id !== ROUTE.params.id){
    ROUTE = r; render();
  }
});

/* ---- boot ----------------------------------------------------------------- */
(function boot(){
  try{
    const t = localStorage.getItem('pamuuc_theme');
    if(t) document.documentElement.setAttribute('data-theme', t);
  }catch(e){}
  try{
    restore();
    ROUTE = readHash();
    if((ROUTE.surface === 'account' || ROUTE.surface === 'studio') && !SESSION)
      ROUTE = {surface:'public', page:'login', params:{}};
    render();
  }catch(e){
    /* never leave a blank page: say what broke rather than showing nothing */
    const root = document.getElementById('root');
    if(root) root.innerHTML = '<div class="wrap" style="padding:48px 0">' +
      '<div class="banner banner--stop"><div>' +
      '<div class="banner-t">The prototype could not start</div>' +
      '<div class="banner-d">' + esc(String(e && e.message || e)) + '</div>' +
      '</div></div></div>';
    throw e;
  }
})();
