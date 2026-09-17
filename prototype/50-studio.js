/* ============================================================================
   PAMUUC SUITE — Studio Back Office
   Dense and operational. Same records, same components, more control.
   Everything it can do is gated by can() — the roles differ, the code does not.
   ========================================================================= */

function stNav(page){
  const u = user(SESSION.user);
  const q = studioQueues(u);
  const nav = [
    {p:'overview',  n:'Overview',   i:'◎'},
    {p:'inquiries', n:'Inquiries',  i:'✧', badge:q.inquiries.length || 0},
    {p:'customers', n:'Customers',  i:'⌂'},
    {p:'projects',  n:'Projects',   i:'▤'},
    {group:'Library'},
    {p:'bases',     n:'Pamuuc Bases', i:'▧'},
    {p:'merch',     n:'Merchandising', i:'◈'},
    {group:'Commercial'},
    {p:'finance',   n:'Finance',    i:'€'},
    {p:'billing',   n:'Documents & Billing', i:'▣', badge:q.overdue.length || 0},
    {group:'Operations'},
    {p:'comms',     n:'Communications', i:'✉', badge:q.threads.length || 0},
    {p:'team',      n:'Team & Access', i:'⚇'},
    {p:'settings',  n:'Content & Settings', i:'⚙'},
    {p:'audit',     n:'Audit Log',  i:'⧉'},
  ];
  /* a role that cannot open a section does not see it */
  return nav.filter(g => {
    if(g.group) return true;
    if(g.p === 'team')     return can(u,'team','view');
    if(g.p === 'settings') return can(u,'settings','view');
    if(g.p === 'audit')    return can(u,'audit_all','view');
    if(g.p === 'finance')  return can(u,'finance','view');
    return true;
  });
}

function stShell(page, title, body, narrow){
  const u = user(SESSION.user);
  const scopeText = u.role === 'master' ? 'Master View<br><span class="faint">Full authority · all customers</span>'
    : u.role === 'am' ? `Account Manager<br><span class="faint">${S.projects.filter(p=>p.am===u.id).length} assigned projects</span>`
    : 'Finance Director<br><span class="faint">Financial authority · read-only operations</span>';
  return appShell({page, title, body, narrow, nav:stNav(page), scope:scopeText});
}

/* ---- Overview: exceptions and decisions, not every record -------------- */
function stOverview(){
  const u = user(SESSION.user);
  const q = studioQueues(u);
  const f = financeTotals();
  const queue = (title, items, render, empty) => `
    <section class="stack-3">
      <div class="row-between"><h2 class="t-h4">${title}</h2>
        ${items.length ? `<span class="chip">${items.length}</span>` : ''}</div>
      ${items.length ? `<div class="rows">${items.map(render).join('')}</div>`
        : `<div class="card card--quiet"><span class="t-sm muted">${empty}</span></div>`}
    </section>`;

  return stShell('overview', 'Overview', `
    <div class="page-hd">
      <h1 class="t-h2">Overview</h1>
      <p class="page-sub">Exceptions and decisions. Everything that is running normally is deliberately not on this page.</p>
    </div>

    <div class="grid grid-4" style="margin-bottom:32px">
      ${[[q.inquiries.length,'Inquiries to qualify'],
         [q.requests.length,'Customer requests to review'],
         [q.approvals.length,'Approvals with the customer'],
         [q.exceptions.length,'Garments needing resolution']]
        .map(([v,l]) => `<div class="tile"><div class="tile-v num">${v}</div><div class="tile-l">${l}</div></div>`).join('')}
    </div>

    ${can(u,'finance','view') ? `<div class="grid grid-4" style="margin-bottom:32px">
      ${[[money(f.issued),'Issued'],[money(f.collected),'Collected'],
         [money(f.outstanding),'Outstanding'],[money(f.overdue),'Overdue']]
        .map(([v,l],i) => `<div class="tile"><div class="tile-v num" ${i===3&&f.overdue?'style="color:var(--stop)"':''}>${v}</div>
          <div class="tile-l">${l}</div></div>`).join('')}
    </div>` : ''}

    <div class="grid grid-2" style="align-items:start;gap:32px">
      <div class="stack-8">
        ${queue('New inquiries awaiting qualification', q.inquiries, i => `
          <button class="rw" data-go="studio:inquiry:${i.id}">
            <span class="rw-flag rw-flag--wait"></span>
            <span class="rw-main"><span class="rw-t">${esc(i.company)}</span>
              <span class="rw-s">${i.ref} · ${esc(i.sector)} · ${esc(i.people)} people · ${ago(i.submitted)}</span></span>
            <span class="rw-side">${pill(i.state)}</span></button>`,
          'Nothing waiting to be qualified.')}

        ${queue('Customer requests awaiting review', q.requests, c => `
          <button class="rw" data-go="studio:project:${c.project}">
            <span class="rw-flag rw-flag--wait"></span>
            <span class="rw-main"><span class="rw-t">${esc(c.title)}</span>
              <span class="rw-s">${esc(account(c.account).name)} · ${esc(project(c.project).ref)} · ${ago(c.at)}</span></span>
            <span class="rw-side">${pill(c.state)}</span></button>`,
          'No open customer requests.')}

        ${queue('Garments needing a Master resolution', q.exceptions, g => `
          <button class="rw" data-go="studio:project:${g.project}">
            <span class="rw-flag rw-flag--stop"></span>
            <span class="rw-main"><span class="rw-t">${esc(g.name)} — round ${g.round}</span>
              <span class="rw-s">${esc(project(g.project).ref)} · ${esc(account(project(g.project).account).name)}</span></span>
            <span class="rw-side">${pill(g.state)}</span></button>`,
          'No garments have reached the round limit.')}
      </div>

      <div class="stack-8">
        ${queue('Projects blocked or at risk', [...new Set([...q.blocked,...q.atRisk])], p => `
          <button class="rw" data-go="studio:project:${p.id}">
            <span class="rw-flag rw-flag--${p.risk?'wait':'stop'}"></span>
            <span class="rw-main"><span class="rw-t">${esc(p.name)}</span>
              <span class="rw-s">${p.ref} · ${stageDef(p.stage).name} · ${gateBlockers(p).length} blocker${gateBlockers(p).length===1?'':'s'}</span></span>
            <span class="rw-side">${p.risk?pill('at_risk'):pill('blocked')}</span></button>`,
          'Nothing blocked.')}

        ${queue('Approvals sitting with customers', q.approvals, a => `
          <button class="rw" data-go="studio:project:${a.project}">
            <span class="rw-main"><span class="rw-t">${esc(a.kind)}</span>
              <span class="rw-s">${esc(account(a.account).name)} · due ${dateShort(a.due)}</span></span>
            <span class="rw-side">${pill(a.state)}</span></button>`,
          'No approvals outstanding.')}

        ${can(u,'finance','view') ? queue('Overdue invoices', q.overdue, d => `
          <button class="rw" data-go="studio:billing">
            <span class="rw-flag rw-flag--stop"></span>
            <span class="rw-main"><span class="rw-t">${esc(d.title)}</span>
              <span class="rw-s">${d.num} · ${esc(account(d.account).name)} · due ${dateShort(d.due)}</span></span>
            <span class="rw-side"><span class="t-sm num med">${money(d.amount)}</span>${pill(d.state)}</span></button>`,
          'Nothing overdue.') : ''}

        <section class="stack-3">
          <h2 class="t-h4">Workload by Account Manager</h2>
          <div class="card">
            ${S.users.filter(x => ['master','am'].includes(x.role)).map(x => {
              const n = S.projects.filter(p => p.am === x.id && !p.completed).length;
              return `<div class="row-between" style="padding:8px 0">
                <span class="row"><span class="av av--studio">${x.init}</span>
                  <span class="t-sm">${esc(x.name)}</span></span>
                <span class="row" style="gap:12px"><span class="bar" style="width:100px">
                  <span class="bar-f" style="display:block;width:${Math.min(100,n*33)}%"></span></span>
                  <span class="t-sm num">${n}</span></span></div>`;}).join('')}
          </div>
        </section>
      </div>
    </div>
  `);
}

/* ---- Inquiries ---------------------------------------------------------- */
function stInquiries(){
  return stShell('inquiries', 'Inquiries', `
    <div class="page-hd"><h1 class="t-h2">Inquiries</h1>
      <p class="page-sub">The qualification queue. An inquiry cannot become a project without a decision, a first call, an owner and a discovery summary.</p></div>
    <div class="tw"><table class="tbl">
      <thead><tr><th>Reference</th><th>Company</th><th>Type</th><th>Sector</th><th>People</th>
        <th>Submitted</th><th>Status</th><th>Reviewer</th></tr></thead>
      <tbody>${S.inquiries.map(i => `<tr class="clickable" data-go="studio:inquiry:${i.id}">
        <td class="num">${i.ref}</td><td class="med">${esc(i.company)}</td>
        <td>${i.type === 'Merchandise' ? pillMerch('Merchandise') : 'Custom uniforms'}</td>
        <td>${esc(i.sector)}</td><td class="num">${esc(i.people)}</td>
        <td>${dateShort(i.submitted)}</td><td>${pill(i.state)}</td>
        <td>${i.reviewer ? esc(user(i.reviewer).name) : '<span class="faint">Unassigned</span>'}</td>
      </tr>`).join('')}</tbody></table></div>
  `);
}

function stInquiry(id){
  const i = by(S.inquiries, id);
  if(!i) return stShell('inquiries','Inquiry','<div class="empty">Not found.</div>');
  const u = user(SESSION.user);
  const isMaster = u.role === 'master';
  const steps = [
    ['submitted','Submitted'],['qualified','Accepted for discovery'],
    ['call_scheduled','First call scheduled'],['ready_account','Ready for account'],
    ['converted','Converted']];
  const at = steps.findIndex(s => s[0] === i.state);

  return stShell('inquiries', i.company, `
    <div class="crumbs" style="margin-bottom:16px">
      <a data-go="studio:inquiries">Inquiries</a><span>›</span><span>${i.ref}</span></div>

    <div class="row-between" style="align-items:flex-start;flex-wrap:wrap;margin-bottom:24px">
      <div><div class="row" style="gap:8px"><h1 class="t-h3">${esc(i.company)}</h1>${pill(i.state)}</div>
        <div class="mono-ref" style="margin-top:4px">${i.ref} · ${esc(i.contact)} · ${esc(i.email)} · submitted ${dateTime(i.submitted)}</div></div>
    </div>

    <div class="tl" style="margin-bottom:24px">
      ${steps.map((s,ix) => `<div class="tl-s ${ix<at?'tl-s--done':ix===at?'tl-s--now':''}">
        <div class="tl-n">${s[1]}</div></div>`).join('')}
    </div>

    ${i.qualification ? (() => {
      const q = i.qualification;
      const tone = q.verdict === 'stop' ? 'stop' : q.verdict === 'warn' ? 'wait' : 'go';
      const head = q.verdict === 'stop' ? 'Does not qualify as scoped'
                 : q.verdict === 'warn' ? 'Qualifies with questions to resolve'
                 : 'Qualifies';
      return `
      <div class="card" style="margin-bottom:24px">
        <div class="row-between" style="align-items:flex-start;flex-wrap:wrap;gap:12px">
          <div>
            <div class="eyebrow">Qualification</div>
            <h2 class="t-h4" style="margin-top:6px">${head}</h2>
          </div>
          <div class="row" style="gap:8px">
            ${q.per !== null ? `<span class="chip">${q.per} people per design</span>` : ''}
            ${q.head !== null ? `<span class="chip">${q.head} people</span>` : ''}
            ${q.designs !== null ? `<span class="chip">${q.designs} design${q.designs === 1 ? '' : 's'}</span>` : ''}
            <span class="pill-s pill-s--${tone === 'go' ? 'go' : tone === 'wait' ? 'wait' : 'flow'}">score ${q.score > 0 ? '+' : ''}${q.score}</span>
          </div>
        </div>
        <div class="stack-2" style="margin-top:16px">
          ${q.flags.map(f => `<div class="banner banner--${f.level === 'stop' ? 'stop' : f.level === 'warn' ? 'wait' : 'go'}">
            <div><div class="banner-d">${esc(f.text)}</div></div></div>`).join('')
            || '<p class="t-sm muted">No flags raised.</p>'}
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:16px">
          ${i.authority && i.authority !== '—' ? `<span class="chip">${esc(i.authority)}</span>` : ''}
          ${i.vatStatus === 'pending' ? `<span class="chip">VAT ${esc(i.vat)} · verify on VIES</span>`
            : i.vatStatus === 'not-registered' ? `<span class="chip">Not VAT registered</span>`
            : i.vatStatus === 'not-required' ? `<span class="chip">VAT not required</span>`
            : i.vatStatus === 'missing' ? `<span class="chip">No VAT number</span>` : ''}
        </div>
        <p class="t-xs muted" style="margin-top:12px">People divided by designs is the qualifier: it decides
          whether each garment reaches a quantity it can be made well at. Everything else is context.</p>
      </div>`;
    })() : ''}

    ${i.state === 'archived' ? `<div class="banner banner--stop" style="margin-bottom:24px"><div>
      <div class="banner-t">Declined and archived</div>
      <div class="banner-d">${esc(i.declineReason || '')}</div></div></div>` : ''}

    <div class="cols">
      <div class="stack-6">
        <section>
          <h2 class="t-h4" style="margin-bottom:12px">Submitted answers</h2>
          <div class="card"><dl class="kv">
            ${Object.entries(i.answers || {}).map(([k,v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}
          </dl>
          ${(i.files||[]).length ? `<div class="sep"></div><div class="eyebrow">Uploaded files</div>
            <div class="wrap-row" style="margin-top:8px">${i.files.map(f => `<span class="chip">▣ ${esc(f)}</span>`).join('')}</div>` : ''}
          </div>
        </section>

        ${i.discovery ? `<section><h2 class="t-h4" style="margin-bottom:12px">Discovery notes</h2>
          <div class="card"><p class="t-sm" style="white-space:pre-wrap">${esc(i.discovery)}</p></div></section>` : ''}

        <section>
          <h2 class="t-h4" style="margin-bottom:12px">Decisions</h2>
          <div class="card">
            ${i.state === 'submitted' ? `
              <p class="t-sm muted" style="margin-bottom:16px">${isMaster ? 'Accept or decline. Either way the applicant hears from us.' :
                'Only Master can accept or decline an inquiry. You can add notes and prepare it.'}</p>
              <div class="btn-row">
                <button class="btn btn--primary" data-act="inqAccept" data-id="${i.id}" ${isMaster?'':'disabled'}>Accept for discovery</button>
                <button class="btn btn--ghost" data-act="inqInfo" data-id="${i.id}">Request more information</button>
                <button class="btn btn--danger" data-act="inqDecline" data-id="${i.id}" ${isMaster?'':'disabled'}>Decline</button>
              </div>`
            : i.state === 'qualified' ? `
              <p class="t-sm muted" style="margin-bottom:16px">Accepted. Arrange the first discovery call — an account is not opened before it happens.</p>
              <button class="btn btn--primary" data-act="inqSchedule" data-id="${i.id}">Schedule the first call</button>`
            : i.state === 'call_scheduled' ? `
              <p class="t-sm muted" style="margin-bottom:16px">Call booked for ${dateTime(i.callAt)}. Record the discovery once it happens.</p>
              <button class="btn btn--primary" data-act="inqComplete" data-id="${i.id}">Record discovery and complete</button>`
            : i.state === 'ready_account' ? `
              <div class="banner banner--go" style="margin-bottom:16px"><div>
                <div class="banner-t">Ready for an account and a project</div>
                <div class="banner-d">Activating the account and creating the project are two separate recorded actions. Neither happens automatically.</div></div></div>
              <button class="btn btn--primary" data-act="inqActivate" data-id="${i.id}" ${isMaster?'':'disabled'}>Activate customer account</button>
              ${isMaster?'':'<p class="t-xs muted" style="margin-top:8px">Master activates accounts.</p>'}`
            : i.state === 'converted' ? `
              <div class="banner banner--go"><div><div class="banner-t">Account activated</div>
                <div class="banner-d">Open the customer to build and publish the first project.</div>
                <div class="btn-row" style="margin-top:12px">
                  <button class="btn btn--primary btn--sm" data-go="studio:customer:${i.accountId}">Open customer →</button></div></div></div>`
            : '<p class="t-sm muted">No further action.</p>'}
          </div>
        </section>
      </div>

      <div class="stack">
        <div class="card"><div class="eyebrow">Routing</div>
          <dl class="kv" style="margin-top:12px">
            <dt>Type</dt><dd>${esc(i.type)}</dd>
            <dt>Country</dt><dd>${esc(i.country)}</dd>
            <dt>Scope</dt><dd>${esc(i.scope)}</dd>
            <dt>Reviewer</dt><dd>${i.reviewer ? esc(user(i.reviewer).name) : 'Unassigned'}</dd>
            <dt>Existing match</dt><dd>${S.accounts.some(a => a.name === i.company) ? 'Matched to an existing account' : 'No match found'}</dd>
          </dl>
        </div>
        <div class="card"><div class="eyebrow">Why this is gated</div>
          <p class="t-xs muted" style="margin-top:8px">The public questionnaire creates an inquiry and nothing else. It does not open an account, and it never creates a project. That boundary is what stops an unqualified form submission becoming an operational commitment.</p>
        </div>
      </div>
    </div>
  `);
}

/* ---- Customers ---------------------------------------------------------- */
function stCustomers(){
  return stShell('customers', 'Customers', `
    <div class="page-hd"><h1 class="t-h2">Customers</h1>
      <p class="page-sub">Every account, with what is waiting on each side.</p></div>
    <div class="tw"><table class="tbl">
      <thead><tr><th>Customer</th><th>Country</th><th>Manager</th><th class="tnum">Active</th>
        <th class="tnum">Waiting on them</th><th class="tnum">Waiting on us</th><th class="tnum">Balance</th>
        <th>Last activity</th><th>Status</th></tr></thead>
      <tbody>${S.accounts.map(a => {
        const ps = S.projects.filter(p => p.account === a.id && !p.completed);
        const theirs = S.approvals.filter(x => x.account === a.id && x.state === 'awaiting_customer').length;
        const ours = S.changeRequests.filter(c => c.account === a.id && ['submitted','under_review'].includes(c.state)).length;
        const last = S.events.find(e => e.account === a.id);
        return `<tr class="clickable" data-go="studio:customer:${a.id}">
          <td class="med">${esc(a.name)}</td><td>${esc(a.country)}</td><td>${esc(user(a.am).name)}</td>
          <td class="tnum num">${ps.length}</td>
          <td class="tnum num">${theirs || '—'}</td><td class="tnum num">${ours || '—'}</td>
          <td class="tnum num">${a.balance ? money(a.balance, a.currency) : '—'}</td>
          <td>${ago(last?.at)}</td><td>${pill(a.status)}</td></tr>`;}).join('')}</tbody></table></div>
  `);
}

function stCustomer(id){
  const a = account(id);
  if(!a) return stShell('customers','Customer','<div class="empty">Not found.</div>');
  const u = user(SESSION.user);
  const ps = S.projects.filter(p => p.account === a.id);
  const docs = S.documents.filter(d => d.account === a.id);
  const tab = UI.custTab || 'Overview';
  const tabs = ['Overview','Projects','Documents','Account configuration'];

  const cfgRow = (label, val, note) => `
    <div class="row-between" style="padding:10px 0;border-bottom:1px solid var(--line);gap:16px;align-items:flex-start">
      <div style="flex:1"><div class="t-sm med">${label}</div>
        ${note?`<div class="t-xs muted" style="margin-top:2px">${note}</div>`:''}</div>
      <div style="flex:none">${val}</div></div>`;

  return stShell('customers', a.name, `
    <div class="crumbs" style="margin-bottom:16px">
      <a data-go="studio:customers">Customers</a><span>›</span><span>${esc(a.name)}</span></div>

    <div class="row-between" style="align-items:flex-start;flex-wrap:wrap;gap:16px;margin-bottom:24px">
      <div><div class="row" style="gap:8px"><h1 class="t-h3">${esc(a.name)}</h1>${pill(a.status)}</div>
        <div class="mono-ref" style="margin-top:4px">${esc(a.city)}, ${esc(a.country)} · customer since ${dateShort(a.since)} · ${esc(user(a.am).name)}</div></div>
      <div class="btn-row">
        <button class="btn btn--ghost btn--sm" data-act="previewAs" data-acc="${a.id}">Preview the customer account</button>
        ${can(u,'project','create') ? `<button class="btn btn--primary btn--sm" data-act="newProject" data-acc="${a.id}">Create a project</button>` : ''}
      </div>
    </div>

    <div class="grid grid-4" style="margin-bottom:24px">
      ${[[ps.filter(p=>!p.completed).length,'Active projects'],
         [ps.filter(p=>p.completed).length,'Completed'],
         [S.garments.filter(g=>ps.some(p=>p.id===g.project)&&g.state==='approved').length,'Approved garments'],
         [money(a.balance,a.currency),'Outstanding']]
        .map(([v,l]) => `<div class="tile"><div class="tile-v num">${v}</div><div class="tile-l">${l}</div></div>`).join('')}
    </div>

    <div class="tabs" style="margin-bottom:20px">
      ${tabs.map(t => `<button class="tab ${tab===t?'tab--on':''}" data-act="custTab" data-t="${esc(t)}">${t}</button>`).join('')}
    </div>

    ${tab === 'Overview' ? `
      <div class="cols">
        <div class="stack-6">
          <section><h2 class="t-h4" style="margin-bottom:12px">Projects</h2>
            <div class="rows">${ps.map(p => `<button class="rw" data-go="studio:project:${p.id}">
              <span class="rw-main"><span class="rw-t">${esc(p.name)}</span>
                <span class="rw-s">${p.ref} · ${stageDef(p.stage).name} · v${p.version} · updated ${ago(p.lastUpdate)}</span></span>
              <span class="rw-side">${p.risk?pill('at_risk'):''}${pill(p.opStatus)}</span></button>`).join('')}</div>
          </section>
          <section><h2 class="t-h4" style="margin-bottom:12px">Locations</h2>
            <div class="rows">${a.locations.length ? a.locations.map(l => `<div class="rw rw--static">
              <span class="rw-main"><span class="rw-t">${esc(l.name)}</span><span class="rw-s">${esc(l.addr)}</span></span>
              <span class="rw-side"><span class="t-sm num">${l.people} people</span></span></div>`).join('')
              : '<div class="tbl-empty">No locations recorded yet.</div>'}</div>
          </section>
          <section><h2 class="t-h4" style="margin-bottom:12px">Internal notes</h2>
            <div class="card"><p class="t-sm muted">Marta decides; Jordi is consulted on anything touching F&amp;B. Procurement is light — no tender process. Prefers a call to a document.</p>
            <p class="t-xs faint" style="margin-top:8px">Never visible to the customer.</p></div>
          </section>
        </div>
        <div class="stack">
          <div class="card"><div class="eyebrow">Commercial</div>
            <dl class="kv" style="margin-top:12px">
              <dt>Terms</dt><dd>${esc(a.terms)}</dd>
              <dt>Currency</dt><dd>${a.currency}</dd>
              <dt>VAT</dt><dd class="num">${esc(a.vat)}</dd>
              <dt>Balance</dt><dd class="num">${money(a.balance,a.currency)}</dd>
            </dl></div>
          <div class="card"><div class="eyebrow">People</div>
            <div class="stack-2" style="margin-top:12px">
              ${S.users.filter(x => x.account === a.id).map(x => `<div class="row">
                <span class="av">${x.init}</span><div><div class="t-sm">${esc(x.name)}</div>
                  <div class="t-xs muted">${ROLE_NAMES[x.role]}</div></div></div>`).join('')}
            </div></div>
        </div>
      </div>`
    : tab === 'Projects' ? `
      <div class="rows">${ps.map(p => `<button class="rw" data-go="studio:project:${p.id}">
        <span class="rw-main"><span class="rw-t">${esc(p.name)}</span>
          <span class="rw-s">${p.ref} · ${stageDef(p.stage).name} · ${gateBlockers(p).length} blockers</span></span>
        <span class="rw-side">${pill(p.opStatus)}</span></button>`).join('')}</div>`
    : tab === 'Documents' ? `
      <div class="tw"><table class="tbl">
        <thead><tr><th>Document</th><th>Number</th><th>Type</th><th>Issued</th><th class="tnum">Amount</th><th>Status</th><th>Visible</th></tr></thead>
        <tbody>${docs.map(d => `<tr><td>${esc(d.title)}</td><td class="num">${d.num}</td><td>${esc(d.type)}</td>
          <td>${dateShort(d.issued)}</td><td class="tnum num">${money(d.amount,a.currency)}</td>
          <td>${pill(d.state)}</td><td>${d.visible?'Yes':'<span class="faint">Internal</span>'}</td></tr>`).join('')}</tbody></table></div>`
    : `
      <div class="cols">
        <div class="card">
          <div class="eyebrow">What this customer can see and do</div>
          <p class="t-xs muted" style="margin:8px 0 16px">These settings drive the real Customer Account. The preview uses the same rules — there is no separately maintained mock view to drift out of date.</p>
          ${cfgRow('Account status', pill(a.status))}
          ${Object.entries(a.modules).map(([k,on]) =>
            cfgRow(k[0].toUpperCase()+k.slice(1), on?pill('active'):pill('hidden'),
              k==='merchandise'?'Hidden accounts see no merchandise navigation at all.':'')).join('')}
          ${cfgRow('Payment terms', `<span class="t-sm">${esc(a.terms)}</span>`)}
          ${cfgRow('Approval authority', '<span class="t-sm">Account Admin only</span>', 'Members can comment but not approve for the company.')}
          ${cfgRow('Account Manager shown', `<span class="t-sm">${esc(user(a.am).name)}</span>`)}
        </div>
        <div class="stack">
          <div class="cvp">
            <div class="cvp-hd"><span class="eyebrow" style="color:var(--navy)">Preview as</span></div>
            <div class="stack-2">
              ${S.users.filter(x => x.account === a.id).map(x => `
                <button class="btn btn--ghost btn--block btn--sm" data-act="previewAs" data-acc="${a.id}" data-u="${x.id}">
                  ${esc(x.name)} — ${ROLE_NAMES[x.role]}</button>`).join('')}
            </div>
            <p class="t-xs muted" style="margin-top:12px">Opens the real Customer Account under that person's permissions.</p>
          </div>
          <div class="card"><div class="eyebrow">Deferred, deliberately</div>
            <p class="t-xs muted" style="margin-top:8px">Per-customer field overrides and custom catalogues are specified but not built here. Global defaults plus this preview cover almost every real case; the override matrix is the most expensive thing in the spec relative to what a studio with a handful of accounts needs.</p></div>
        </div>
      </div>`}
  `);
}

/* ---- Projects list ------------------------------------------------------ */
function stProjects(){
  const u = user(SESSION.user);
  const ps = S.projects.filter(p => u.role === 'master' || u.role === 'finance' || p.am === u.id);
  return stShell('projects', 'Projects', `
    <div class="page-hd"><div class="row-between" style="flex-wrap:wrap;gap:12px">
      <div><h1 class="t-h2">Projects</h1>
        <p class="page-sub">${u.role === 'am' ? 'Your assigned projects.' : 'Every project, with its blockers and its next commercial gate.'}</p></div>
    </div></div>
    <div class="tw"><table class="tbl">
      <thead><tr><th>Project</th><th>Customer</th><th>Manager</th><th>Stage</th>
        <th>Internal status</th><th>Customer sees</th><th class="tnum">Blockers</th><th>Next gate</th><th>Updated</th></tr></thead>
      <tbody>${ps.map(p => {
        const b = gateBlockers(p); const g = gateFor(p);
        return `<tr class="clickable" data-go="studio:project:${p.id}">
          <td><span class="med">${esc(p.name)}</span><br><span class="mono-ref">${p.ref}</span></td>
          <td>${esc(account(p.account).name)}</td><td>${esc(user(p.am).name)}</td>
          <td>${stageDef(p.stage).name}</td>
          <td>${p.risk?pill('at_risk'):pill(p.opStatus)}</td>
          <td>${pill(p.opStatus)}${p.draftDirty?'<br><span class="t-xs" style="color:var(--wait)">draft ahead of v'+p.version+'</span>':''}</td>
          <td class="tnum num" ${b.length?'style="color:var(--stop);font-weight:700"':''}>${b.length||'—'}</td>
          <td>${g.blocked?esc(g.label):'<span class="faint">—</span>'}</td>
          <td>${ago(p.lastUpdate)}</td></tr>`;}).join('')}</tbody></table></div>
  `);
}

/* ---- Project detail ------------------------------------------------------ */
function stProject(id){
  const p = project(id);
  if(!p) return stShell('projects','Project','<div class="empty">Not found.</div>');
  const u = user(SESSION.user);
  const v = views.studioProject(p, u);
  const cur = p.stages.indexOf(p.stage);
  const tab = UI.prjTab || 'Overview';
  const tabs = ['Overview','Roles & garments','Changes & approvals','Commercials','Conversation','Activity & audit'];
  const cv = S.conversations.find(c => c.project === p.id);
  const ns = nextStage(p);

  return stShell('projects', p.name, `
    <div class="crumbs" style="margin-bottom:16px">
      <a data-go="studio:projects">Projects</a><span>›</span>
      <a data-go="studio:customer:${p.account}">${esc(account(p.account).name)}</a><span>›</span><span>${p.ref}</span></div>

    <div class="stagehd" style="margin-bottom:24px">
      <div class="row-between" style="align-items:flex-start;flex-wrap:wrap;gap:16px;margin-bottom:20px">
        <div>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <h1 class="t-h3">${esc(p.name)}</h1>${pill(p.opStatus)}${p.risk?pill('at_risk'):''}
            ${p.draftDirty?'<span class="chip" style="color:var(--wait)">Draft ahead of published v'+p.version+'</span>':''}
          </div>
          <div class="mono-ref" style="margin-top:4px">${p.ref} · ${esc(account(p.account).name)} · owner ${esc(v.owner.name)} · published v${p.version} on ${dateTime(p.publishedAt)}</div>
        </div>
        <div class="btn-row">
          ${can(u,'publish','do',{project:p.id}) ? `<button class="btn ${p.draftDirty?'btn--primary':'btn--ghost'} btn--sm" data-act="publish" data-p="${p.id}">
            ${p.draftDirty?'Publish version '+(p.version+1):'Republish'}</button>` : ''}
          ${ns && can(u,'phase_advance','do',{project:p.id}) ? `<button class="btn btn--ghost btn--sm" data-act="advance" data-p="${p.id}"
            ${v.blockers.length?'':''}>Advance to ${stageDef(ns).name}</button>` : ''}
        </div>
      </div>
      <div class="tl">
        ${p.stages.map(sid => {
          const i = p.stages.indexOf(sid);
          return `<div class="tl-s ${i<cur?'tl-s--done':i===cur?'tl-s--now':''}">
            <div class="tl-n">${stageDef(sid).name}</div>
            <div class="tl-m">${i<cur?'✓':i===cur?st(p.opStatus).label:''}</div></div>`;}).join('')}
      </div>
      <div class="stage-now">
        <div class="stage-col"><div class="stage-lbl">Waiting on</div><div class="stage-txt med">${esc(v.responsible)}</div></div>
        <div class="stage-col"><div class="stage-lbl">Next milestone</div><div class="stage-txt">${esc(p.nextMilestone || '—')}</div></div>
        <div class="stage-col"><div class="stage-lbl">Next commercial gate</div>
          <div class="stage-txt">${v.gate.blocked ? esc(v.gate.label)+' — '+st(v.gate.state).label.toLowerCase() : 'None outstanding'}</div></div>
        <div class="stage-col"><div class="stage-lbl">Open blockers</div>
          <div class="stage-txt ${v.blockers.length?'':''}">${v.blockers.length || 'None'}</div></div>
      </div>
    </div>

    ${v.blockers.length ? `<div class="banner banner--stop" style="margin-bottom:24px"><div>
      <div class="banner-t">${v.blockers.length} thing${v.blockers.length>1?'s':''} between this project and ${ns?stageDef(ns).name:'completion'}</div>
      <ul class="stack-2" style="margin-top:8px">
        ${v.blockers.map(b => `<li class="t-sm">· ${esc(b.text)}<br><span class="t-xs muted">${esc(b.why)}</span></li>`).join('')}
      </ul>
      ${can(u,'phase_override','do') ? `<div class="btn-row" style="margin-top:12px">
        <button class="btn btn--danger btn--sm" data-act="override" data-p="${p.id}">Override the gate with a recorded reason</button>
      </div>` : '<p class="t-xs muted" style="margin-top:8px">Only Master can override a gate.</p>'}
    </div></div>` : ''}

    <div class="tabs" style="margin-bottom:20px">
      ${tabs.map(t => `<button class="tab ${tab===t?'tab--on':''}" data-act="prjTab" data-t="${esc(t)}">${t}
        ${t==='Changes & approvals' && v.allCRs.filter(c=>['submitted','under_review'].includes(c.state)).length
          ? ` (${v.allCRs.filter(c=>['submitted','under_review'].includes(c.state)).length})` : ''}</button>`).join('')}
    </div>

    <div class="cols cols--wide">
      <div>${stProjectTab(p, v, tab, u, cv)}</div>
      <div class="stack">
        <div class="cvp">
          <div class="cvp-hd">
            <span class="eyebrow" style="color:var(--navy)">What the customer sees</span>
            <span class="t-xs num">v${p.version}</span>
          </div>
          <div class="stack-2">
            <div class="factline"><span>Stage</span><span class="med">${stageDef(p.stage).name}</span></div>
            <div class="factline"><span>Status</span><span>${st(p.opStatus).label}</span></div>
            <div class="factline"><span>They must</span><span>${esc(v.youDo)}</span></div>
            <div class="factline"><span>Published</span><span>${dateTime(p.publishedAt)}</span></div>
          </div>
          ${p.draftDirty ? `<div class="banner banner--wait" style="margin-top:12px;padding:10px"><div>
            <div class="banner-t">Draft ahead of published</div>
            <div class="banner-d">Your working changes are not visible. Publish to release them.</div></div></div>` : ''}
          <button class="btn btn--ghost btn--sm btn--block" style="margin-top:12px"
            data-act="previewAs" data-acc="${p.account}">Open the customer view →</button>
        </div>

        <div class="card"><div class="eyebrow">Ownership</div>
          <dl class="kv" style="margin-top:12px">
            <dt>Owner</dt><dd>${esc(v.owner.name)}</dd>
            <dt>Account Manager</dt><dd>${esc(v.am.name)}</dd>
            <dt>Created</dt><dd>${dateShort(p.created)}</dd>
            <dt>Target</dt><dd>${dateShort(p.target)}</dd>
            <dt>Pieces</dt><dd class="num">${projectPieces(p)}</dd>
          </dl></div>

        ${v.showCost ? `<div class="card"><div class="eyebrow">Cost and margin</div>
          <dl class="kv" style="margin-top:12px">
            <dt>Estimated cost</dt><dd class="num">${money(projectPieces(p)*22.4)}</dd>
            <dt>Customer value</dt><dd class="num">${money(projectPieces(p)*57.9)}</dd>
            <dt>Gross margin</dt><dd class="num" style="color:var(--go)">61.3%</dd>
          </dl>
          <p class="t-xs faint" style="margin-top:8px">Hidden from Account Managers by default and never projected into the customer view.</p>
        </div>` : `<div class="card card--quiet"><div class="eyebrow">Cost and margin</div>
          <p class="t-xs muted" style="margin-top:8px">Hidden for your role. The field is not fetched, not just visually suppressed.</p></div>`}
      </div>
    </div>
  `);
}

function stProjectTab(p, v, tab, u, cv){
  if(tab === 'Roles & garments') return `
    <div class="stack">
      ${p.positions.map(pos => `
        <div class="card card--flush">
          <div class="row-between" style="padding:16px 20px;border-bottom:1px solid var(--line)">
            <div><div class="t-h5">${esc(pos.name)}</div>
              <div class="t-xs muted">${pos.people} people · ${pos.garments.length} garments</div></div>
            <button class="btn btn--ghost btn--sm" data-act="addGarment" data-p="${p.id}" data-pos="${pos.id}">Add a garment from Bases</button>
          </div>
          <div style="padding:16px 20px" class="stack-3">
            ${pos.garments.map(gid => { const g = garment(gid); if(!g) return '';
              return `<div class="row-between" style="padding:12px;border:1px solid var(--line);gap:12px;flex-wrap:wrap">
                <div class="row" style="gap:12px;flex:1;min-width:200px">
                  <span style="font-size:22px">${g.glyph}</span>
                  <div><div class="t-sm med">${esc(g.name)}</div>
                    <div class="mono-ref">${base(g.base).ref} ${g.baseV} · rev ${g.rev} · ${esc(FABRICS[g.fabric].name)}</div></div>
                </div>
                <div class="row" style="gap:8px;flex-wrap:wrap">
                  <span class="chip">Round ${g.round}/3</span>
                  ${pill(g.state)}
                  ${g.state==='changes_requested' && g.round < 3 ? `<button class="btn btn--primary btn--sm" data-act="authRound" data-g="${g.id}">Authorise round ${g.round+1}</button>`:''}
                  ${g.state==='in_development' && p.stage==='prototype_fitting' ? `<button class="btn btn--ghost btn--sm" data-act="readyFit" data-g="${g.id}">Mark ready for fitting</button>`:''}
                  ${g.state==='manual_resolution' ? `<button class="btn btn--danger btn--sm" data-act="resolveG" data-g="${g.id}">Resolve</button>`:''}
                </div>
              </div>`;}).join('')}
          </div>
        </div>`).join('')}
    </div>
    <p class="t-xs muted" style="margin-top:16px">Each garment carries its own state and round counter. The project stays in Prototype Fitting while any required garment is unresolved; approved garments stay locked regardless.</p>`;

  if(tab === 'Changes & approvals') return `
    <div class="stack-6">
      <section><h2 class="t-h4" style="margin-bottom:12px">Customer change requests</h2>
        ${v.allCRs.length ? `<div class="stack-3">${v.allCRs.map(c => `
          <div class="card">
            <div class="row-between" style="align-items:flex-start;flex-wrap:wrap;gap:8px">
              <div><div class="t-h5">${esc(c.title)}</div>
                <div class="t-xs muted" style="margin-top:2px">${esc(user(c.by).name)} · ${dateTime(c.at)} · owner ${esc(user(c.owner).name)}</div></div>
              ${pill(c.state)}
            </div>
            <p class="t-sm muted" style="margin-top:12px">${esc(c.reason)}</p>
            <div class="card card--quiet" style="margin-top:12px">
              <div class="eyebrow">Before → requested</div>
              <div class="diff" style="margin-top:8px">
                ${c.changes.map(ch => `<span class="diff-k">${esc(ch.field)}</span>
                  <span><span class="was">${esc(ch.was)}</span><span class="arrow">→</span><span class="now">${esc(ch.now)}</span></span>`).join('')}
              </div>
            </div>
            ${c.outcome ? `<div class="banner banner--go" style="margin-top:12px"><div>
              <div class="banner-t">${st(c.state).label} · ${dateTime(c.decidedAt)}</div>
              <div class="banner-d">${esc(c.outcome)}</div></div></div>` : ''}
            ${['submitted','under_review'].includes(c.state) && can(u,'change_request','decide',{project:p.id}) ? `
              <div class="btn-row" style="margin-top:12px">
                <button class="btn btn--primary btn--sm" data-act="crDecide" data-id="${c.id}" data-o="approved">Approve</button>
                <button class="btn btn--ghost btn--sm" data-act="crDecide" data-id="${c.id}" data-o="partially_approved">Partially approve</button>
                <button class="btn btn--ghost btn--sm" data-act="crDecide" data-id="${c.id}" data-o="clarification">Ask a question</button>
                <button class="btn btn--danger btn--sm" data-act="crDecide" data-id="${c.id}" data-o="declined">Decline</button>
              </div>` : ''}
            ${['approved','partially_approved'].includes(c.state) ? `
              <div class="banner banner--wait" style="margin-top:12px"><div>
                <div class="banner-t">Decided, but not yet real</div>
                <div class="banner-d">A decision is not an implementation. Incorporate it into a new revision to change the specification.</div>
                <div class="btn-row" style="margin-top:8px">
                  <button class="btn btn--primary btn--sm" data-act="crIncorporate" data-id="${c.id}">Incorporate into a new revision</button>
                </div></div></div>` : ''}
          </div>`).join('')}</div>` : '<div class="card card--quiet"><span class="t-sm muted">No requests on this project.</span></div>'}
      </section>

      <section><h2 class="t-h4" style="margin-bottom:12px">Approvals</h2>
        <div class="rows">${v.allApprovals.map(a => `<div class="rw rw--static">
          <span class="rw-main"><span class="rw-t">${esc(a.kind)}</span>
            <span class="rw-s">${esc(a.rev)} · due ${dateShort(a.due)}${a.decidedAt?` · decided ${dateTime(a.decidedAt)} by ${esc(user(a.decidedBy).name)}`:''}</span></span>
          <span class="rw-side">${pill(a.state)}</span></div>`).join('')}</div>
        <p class="t-xs muted" style="margin-top:12px">Every approval references a fixed revision, so a later edit cannot inherit an old approval.</p>
      </section>
    </div>`;

  if(tab === 'Commercials') return `
    <div class="stack-6">
      <section><h2 class="t-h4" style="margin-bottom:12px">Commercial gates</h2>
        <div class="rows">
          ${Object.entries(p.gates).map(([k,val]) => `<div class="rw rw--static">
            <span class="rw-main"><span class="rw-t">${k.replace(/_/g,' ').replace(/^\w/,c=>c.toUpperCase())}</span>
              <span class="rw-s">${k==='development_invoice'?'Authorises technical files and prototype rounds':
                k==='production_proforma'?'Authorises production release':'Authorises external design work'}</span></span>
            <span class="rw-side">${pill(val)}</span></div>`).join('')}
        </div></section>
      <section><h2 class="t-h4" style="margin-bottom:12px">Documents</h2>
        <div class="tw"><table class="tbl">
          <thead><tr><th>Document</th><th>Number</th><th>Issued</th><th class="tnum">Amount</th><th>Status</th><th>Visible</th><th></th></tr></thead>
          <tbody>${v.documents.map(d => `<tr>
            <td>${esc(d.title)}</td><td class="num">${d.num}</td><td>${dateShort(d.issued)}</td>
            <td class="tnum num">${money(d.amount)}</td><td>${pill(d.state)}</td>
            <td>${d.visible?'Yes':'<span class="faint">Internal</span>'}</td>
            <td>${!d.visible && can(u,'invoice','publish') ? `<button class="btn btn--ghost btn--sm" data-act="pubDoc" data-id="${d.id}">Publish</button>`:''}</td>
          </tr>`).join('')}</tbody></table></div>
        ${!can(u,'invoice','publish') ? '<p class="t-xs muted" style="margin-top:12px">Publishing invoices is a Finance or Master action. You can request one.</p>' : ''}
      </section>
    </div>`;

  if(tab === 'Conversation') return `
    <div class="card">
      ${cv ? cv.messages.map(m => `
        <div class="msg ${m.internal?'msg--internal':''}">
          <span class="av ${user(m.by).side==='studio'?'av--studio':''}">${user(m.by).init}</span>
          <div class="msg-b">
            <div class="msg-h"><span class="msg-a">${esc(user(m.by).name)}</span>
              <span class="msg-r">${m.internal?'Internal note — never customer visible':user(m.by).side==='studio'?'PAMUUC':esc(account(p.account).name)} · ${dateTime(m.at)}</span></div>
            <div class="msg-t">${esc(m.text)}</div></div>
        </div>`).join('') : '<p class="t-sm muted">No conversation yet.</p>'}
      <div style="margin-top:16px">
        <textarea class="inp" id="msgbox" placeholder="Reply to the customer…"></textarea>
        <div class="btn-row" style="margin-top:8px;justify-content:flex-end">
          <button class="btn btn--ghost btn--sm" data-act="send" data-cv="${cv?cv.id:''}" data-internal="1">Add an internal note</button>
          <button class="btn btn--primary btn--sm" data-act="send" data-cv="${cv?cv.id:''}">Send to customer</button>
        </div>
      </div>
    </div>`;

  if(tab === 'Activity & audit') return `
    <div class="stack-6">
      <section><h2 class="t-h4" style="margin-bottom:12px">Activity</h2>
        <div class="card"><div class="feed">
          ${S.events.filter(e => e.project === p.id).slice(0,20).map((e,i) => `
            <div class="fe ${i===0?'fe--now':''}"><div class="t-sm">${esc(e.text)}</div>
              <div class="fe-m">${dateTime(e.at)} · ${esc(user(e.actor).name)}${e.customerVisible?'':' · internal'}</div></div>`).join('')}
        </div></div></section>
      <section><h2 class="t-h4" style="margin-bottom:12px">Audit</h2>
        <div class="tw"><table class="tbl">
          <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Was</th><th>Now</th><th>Reason</th></tr></thead>
          <tbody>${S.audit.filter(a => a.record === p.ref || a.record === p.id ||
            S.garments.some(g => g.project === p.id && g.id === a.record)).map(a => `<tr>
            <td>${dateTime(a.at)}</td><td>${esc(user(a.actor).name)}<br><span class="t-xs muted">${esc(a.role)}</span></td>
            <td>${esc(a.action)}</td><td class="muted">${esc(a.was ?? '—')}</td><td class="med">${esc(a.now ?? '—')}</td>
            <td class="t-xs muted">${esc(a.reason || '—')}</td></tr>`).join('') || '<tr><td colspan="6" class="tbl-empty">No audit entries.</td></tr>'}
          </tbody></table></div></section>
    </div>`;

  /* Overview */
  return `
    <div class="stack-6">
      <section><h2 class="t-h4" style="margin-bottom:12px">Brief</h2>
        <div class="card"><p class="t-sm">${esc(p.brief)}</p></div></section>
      <section><h2 class="t-h4" style="margin-bottom:12px">Garment states</h2>
        <div class="tw"><table class="tbl">
          <thead><tr><th>Garment</th><th>Position</th><th>Base</th><th>Rev</th><th class="tnum">Round</th><th class="tnum">Pieces</th><th>State</th></tr></thead>
          <tbody>${v.garments.map(g => `<tr>
            <td><span class="med">${esc(g.name)}</span></td>
            <td>${esc(p.positions.find(x => x.id === g.position)?.name || '—')}</td>
            <td class="num">${base(g.base).ref} ${g.baseV}</td><td class="num">${g.rev}</td>
            <td class="tnum num" ${g.round>=3?'style="color:var(--stop);font-weight:700"':''}>${g.round}/3</td>
            <td class="tnum num">${g.colourways.reduce((t,c)=>t+c.qty,0)}</td>
            <td>${pill(g.state)}</td></tr>`).join('')}</tbody></table></div>
      </section>
      <section><h2 class="t-h4" style="margin-bottom:12px">Internal tasks</h2>
        <div class="rows">
          ${[['Chase lab-dip approval — Marítim blue','u_nuria','2026-09-12','flow'],
             ['Prepare the overcoat options paper for Marta','u_leo','2026-09-15','wait'],
             ['Confirm melton minimum with the Italian mill','u_nuria','2026-09-18','flow']]
            .map(([t,who,d,f]) => `<div class="rw rw--static">
              <span class="rw-main"><span class="rw-t">${t}</span>
                <span class="rw-s">${esc(user(who).name)} · due ${dateShort(d)}</span></span>
              <span class="rw-side">${pill(f==='wait'?'waiting_pamuuc':'in_progress')}</span></div>`).join('')}
        </div>
        <p class="t-xs muted" style="margin-top:12px">Internal tasks are never projected into the customer view.</p>
      </section>
    </div>`;
}

/* ---- Pamuuc Bases -------------------------------------------------------- */
function stBases(){
  const openId = UI.openBase;
  const b = openId ? base(openId) : null;
  return stShell('bases', 'Pamuuc Bases', `
    <div class="page-hd"><div class="row-between" style="flex-wrap:wrap;gap:12px">
      <div><h1 class="t-h2">Pamuuc Bases</h1>
        <p class="page-sub">The controlled library of reusable garment foundations. A project garment references a base <em>version</em> — updating a base never changes an already approved project garment.</p></div>
      <div class="btn-row">
        <button class="btn btn--ghost btn--sm" data-act="csvImport">Import CSV</button>
        <button class="btn btn--primary btn--sm" data-act="newBase">New base</button>
      </div>
    </div></div>
    <div class="cols">
      <div class="tw"><table class="tbl">
        <thead><tr><th>Ref</th><th>Base</th><th>Category</th><th>Version</th><th class="tnum">Fabrics</th>
          <th class="tnum">Colours</th><th class="tnum">Used in</th><th>Status</th></tr></thead>
        <tbody>${S.bases.map(x => `<tr class="clickable" data-act="openBase" data-id="${x.id}">
          <td class="num">${x.ref}</td><td><span class="med">${x.glyph} ${esc(x.name)}</span></td>
          <td>${esc(x.cat)}</td><td class="num">${x.v}</td>
          <td class="tnum num">${x.fabrics.length}</td><td class="tnum num">${x.colours.length}</td>
          <td class="tnum num">${x.used}</td><td>${pill(x.status)}</td></tr>`).join('')}</tbody></table></div>

      <div class="stack">
        ${b ? `
        <div class="card">
          <div class="row-between" style="align-items:flex-start">
            <div><div class="t-h4">${b.glyph} ${esc(b.name)}</div>
              <div class="mono-ref">${b.ref} · ${b.v}</div></div>
            ${pill(b.status)}
          </div>
          <p class="t-sm muted" style="margin-top:12px">${esc(b.spec)}</p>
          <div class="sep"></div>
          <div class="eyebrow">Supported fabrics</div>
          <div class="stack-2" style="margin-top:8px">
            ${b.fabrics.map(f => `<div class="row-between"><span class="t-sm">${esc(FABRICS[f].name)}</span>
              <span class="t-xs muted">${esc(FABRICS[f].ref)}</span></div>`).join('')}
          </div>
          <div class="sep"></div>
          <div class="eyebrow">Supported colours</div>
          <div class="wrap-row" style="margin-top:8px;gap:6px">
            ${b.colours.map(c => `<span class="sw-btn"><span class="sw" style="background:${COLOURS[c].hex}"></span>${esc(COLOURS[c].name)}</span>`).join('')}
          </div>
          <div class="sep"></div>
          <div class="eyebrow">Personalisation</div>
          <p class="t-sm" style="margin-top:8px">${b.pers.map(x => S.personalization[x].name).join(', ')}<br>
            <span class="muted">at ${b.pos.map(x => S.positions_lib[x]).join(', ')}</span></p>
          <div class="sep"></div>
          <div class="eyebrow">Used in</div>
          <div class="stack-2" style="margin-top:8px">
            ${S.garments.filter(g => g.base === b.id).map(g => `<button class="row-between" data-go="studio:project:${g.project}"
              style="width:100%;background:transparent;border:0;padding:6px 0;cursor:pointer;text-align:left">
              <span class="t-sm">${esc(project(g.project).ref)} — ${esc(g.name)}</span>
              <span class="t-xs muted">${g.baseV} · rev ${g.rev}</span></button>`).join('') || '<span class="t-sm muted">Not used yet.</span>'}
          </div>
        </div>` : '<div class="card card--quiet"><span class="t-sm muted">Select a base to see its options, versions and where it is used.</span></div>'}
      </div>
    </div>
  `);
}

/* ---- Merchandising ------------------------------------------------------- */
function stMerch(){
  const u = user(SESSION.user);
  return stShell('merch', 'Merchandising', `
    <div class="page-hd"><div class="row-between" style="flex-wrap:wrap;gap:12px">
      <div><div class="row" style="gap:8px"><h1 class="t-h2">Merchandising</h1>${pillMerch('Merchandise')}</div>
        <p class="page-sub">The operational source for the public catalogue and for customer merchandise activity. Studio red identifies this line of business and nothing else.</p></div>
      <div class="btn-row">
        <button class="btn ${S.merchProducts.some(p=>p.imported)?'btn--ghost':'btn--primary'} btn--sm" data-act="openImport">Import catalogue CSV</button>
        ${can(u,'merch_publish','do') ? '<button class="btn btn--ghost btn--sm" data-act="newProduct">New product</button>' : ''}
      </div>
    </div></div>

    ${S.merchProducts.some(p => p.imported) ? `<div class="banner banner--go" style="margin-bottom:24px"><div>
      <div class="banner-t">Catalogue imported from CSV</div>
      <div class="banner-d">${S.merchProducts.filter(p=>p.imported).length} products are live on the public catalogue and in every customer's Merchandise section. Import again to replace them, or reset the prototype to go back to the seeded set.</div></div></div>` : ''}

    ${S.decoRates ? `<section style="margin-bottom:32px">
      <h2 class="t-h4" style="margin-bottom:12px">Decoration cost — expanded from the rate card</h2>
      <p class="t-sm muted" style="margin-bottom:12px">Cost only. Margin is applied later.</p>
      <div class="grid grid-2">${Object.entries(S.decoRates.methods).map(([meth,m]) => {
        const mine = S.decoRates.rates.filter(r => r.method === meth);
        return `<div class="card">
          <div class="row-between" style="align-items:baseline">
            <div class="t-h5">${esc(S.personalization[meth] ? S.personalization[meth].name : meth)}</div>
            <span class="t-xs muted">setup ${m.setup==null?'<span style="color:var(--wait)">none recorded</span>':money(m.setup)}</span>
          </div>
          <div class="tw" style="margin-top:12px;border:0;box-shadow:none">
          <table class="tbl" style="min-width:0"><thead><tr>
            ${m.pricedBy==='size'
              ? '<th>Band</th><th>Artwork</th><th class="tnum">Per piece</th>'
              : '<th>Qty</th>' + [1,2,3,4].filter(c=>m.mult[c]!=null).map(c=>`<th class="tnum">${c} col</th>`).join('')}
          </tr></thead><tbody>
            ${m.pricedBy==='size'
              ? ['small','medium','large'].map(b => { const r = mine.find(x=>x.band===b); if(!r) return '';
                  const range = b==='small'?`up to ${m.bandSmall} mm`:b==='medium'?`${m.bandSmall+1}–${m.bandMedium} mm`:`over ${m.bandMedium} mm`;
                  return `<tr><td>${b}${r.provisional?' <span class="chip" style="color:var(--wait)">provisional</span>':''}</td>
                    <td class="t-xs muted">${range}</td><td class="tnum num">${money(r.cost)}</td></tr>`; }).join('')
              : mine.filter(r=>r.qtyMin!=null).sort((a,b)=>a.qtyMin-b.qtyMin).map(r =>
                  `<tr><td class="num">${r.qtyMin}+${r.provisional?' <span class="chip" style="color:var(--wait)">prov.</span>':''}</td>` +
                  [1,2,3,4].filter(c=>m.mult[c]!=null).map(c=>`<td class="tnum num">${money(r.cost*m.mult[c])}</td>`).join('') + '</tr>').join('')}
          </tbody></table></div>
        </div>`; }).join('')}</div>
    </section>` : ''}

    ${S.merchQuotes.length ? `
    <section style="margin-bottom:32px">
      <h2 class="t-h4" style="margin-bottom:12px">Quote requests</h2>
      <div class="stack-3">${S.merchQuotes.map(q => `
        <div class="card">
          <div class="row-between" style="align-items:flex-start;flex-wrap:wrap;gap:8px">
            <div>
              <div class="t-h5">${q.qty} × ${esc(q.productName)}</div>
              <div class="mono-ref">${esc(q.ref||'')} · ${esc(q.colourName)}${q.express?' · express':''}</div>
            </div>
            <div class="row" style="gap:8px">
              ${q.total ? `<span class="t-sm num med">${money(q.total)}</span>` : pillMerch('To price')}
              ${pill(q.state)}
            </div>
          </div>
          <div class="tw" style="margin-top:12px;border:0;box-shadow:none">
            <table class="tbl" style="min-width:0"><thead><tr>
              <th>Placement</th><th>Method</th><th>Size</th><th class="tnum">Colours</th><th>Artwork</th></tr></thead>
            <tbody>${(q.placements||[]).map(pl => `<tr>
              <td class="med">${esc(pl.posName)}</td><td>${esc(pl.methodName)}</td>
              <td>${esc(pl.size)}</td><td class="tnum num">${pl.method==='screen'?pl.colours:'—'}</td>
              <td>${pl.art ? '▣ '+esc(pl.art) : '<span class="faint">to follow</span>'}</td></tr>`).join('')
              || '<tr><td colspan="5" class="tbl-empty">No placement detail.</td></tr>'}
            </tbody></table>
          </div>
          <div class="row-between" style="margin-top:12px">
            <span class="t-xs muted">${q.account?esc(account(q.account).name):'From the public website — no account yet'} · ${dateTime(q.at)}</span>
            <button class="btn btn--ghost btn--sm">Build a quote</button>
          </div>
        </div>`).join('')}</div>
    </section>` : ''}

    <h2 class="t-h4" style="margin-bottom:12px">Catalogue</h2>
    <div class="tw"><table class="tbl">
      <thead><tr><th>Ref</th><th>Product</th><th>Category</th><th class="tnum">Colours</th>
        <th class="tnum">MOQ</th><th class="tnum">From</th><th>Personalisation</th><th>Lead</th><th>Status</th></tr></thead>
      <tbody>${S.merchProducts.map(p => `<tr>
        <td class="num">${p.ref}</td>
        <td><span class="med">${p.glyph} ${esc(p.name)}</span>${p.handle?`<br><span class="mono-ref">/${esc(p.handle)}</span>`:''}</td>
        <td>${esc(p.cat)}</td>
        <td class="tnum num">${p.colours.length}${p.images&&p.images.length?` <span class="t-xs faint">· ${p.images.length} img</span>`:''}</td>
        <td class="tnum num">${p.moq}</td><td class="tnum num">${money(p.from)}</td>
        <td class="t-xs">${p.pers.map(x => S.personalization[x] ? S.personalization[x].name : x).join(', ')}</td>
        <td class="t-xs">${esc(p.lead)}</td><td>${pill(p.status || 'published')}</td></tr>`).join('')}</tbody></table></div>
    ${!can(u,'merch_publish','do') ? '<p class="t-xs muted" style="margin-top:12px">Publishing to the public catalogue is a Master action.</p>' : ''}
  `);
}

/* ---- Finance ------------------------------------------------------------- */
function stFinance(){
  const u = user(SESSION.user);
  const f = financeTotals();
  const showCost = can(u,'cost_margin','view');
  return stShell('finance', 'Finance', `
    <div class="page-hd"><h1 class="t-h2">Finance</h1>
      <p class="page-sub">Issued, collected and outstanding across every customer.</p></div>
    <div class="grid grid-4" style="margin-bottom:32px">
      ${[[money(f.issued),'Revenue issued',`${f.count} documents`],
         [money(f.collected),'Revenue collected','Settled in full'],
         [money(f.outstanding),'Outstanding receivables','Issued minus payments'],
         [money(f.overdue),'Overdue','Past the due date']]
        .map(([v,l,n],i) => `<div class="tile"><div class="tile-v num" ${i===3&&f.overdue?'style="color:var(--stop)"':''}>${v}</div>
          <div class="tile-l">${l}</div><div class="tile-n">${n}</div></div>`).join('')}
    </div>

    <div class="grid grid-2" style="align-items:start;gap:32px">
      <section><h2 class="t-h4" style="margin-bottom:12px">By customer</h2>
        <div class="tw"><table class="tbl" style="min-width:0">
          <thead><tr><th>Customer</th><th class="tnum">Issued</th><th class="tnum">Collected</th><th class="tnum">Outstanding</th></tr></thead>
          <tbody>${S.accounts.map(a => {
            const ds = S.documents.filter(d => d.account === a.id && d.amount);
            const iss = ds.filter(d => d.state !== 'draft').reduce((t,d)=>t+d.amount,0);
            const col = ds.filter(d => d.state === 'paid').reduce((t,d)=>t+d.amount,0);
            return `<tr><td class="med">${esc(a.name)}</td>
              <td class="tnum num">${money(iss)}</td><td class="tnum num">${money(col)}</td>
              <td class="tnum num" ${iss-col?'style="color:var(--wait)"':''}>${money(iss-col)}</td></tr>`;}).join('')}
          </tbody></table></div>
      </section>

      <section><h2 class="t-h4" style="margin-bottom:12px">${showCost ? 'Cost and margin' : 'Cost and margin — restricted'}</h2>
        ${showCost ? `<div class="tw"><table class="tbl" style="min-width:0">
          <thead><tr><th>Project</th><th class="tnum">Est. cost</th><th class="tnum">Value</th><th class="tnum">Margin</th></tr></thead>
          <tbody>${S.projects.map(p => { const pieces = projectPieces(p);
            const cost = pieces*22.4, val = pieces*57.9;
            return `<tr><td>${esc(p.ref)}</td><td class="tnum num">${money(cost)}</td>
              <td class="tnum num">${money(val)}</td>
              <td class="tnum num" style="color:var(--go)">${val?((val-cost)/val*100).toFixed(1):'—'}%</td></tr>`;}).join('')}
          </tbody></table></div>`
        : `<div class="card card--quiet"><p class="t-sm muted">Cost, margin, supplier commitments and variance are visible to Master and Finance Director only. Account Managers can be granted selected commercial permissions without receiving full company financial access.</p></div>`}
      </section>
    </div>
  `);
}

/* ---- Documents & Billing -------------------------------------------------- */
function stBilling(){
  const u = user(SESSION.user);
  const filt = UI.billFilter || 'All';
  const list = filt === 'All' ? S.documents : S.documents.filter(d => d.state === filt.toLowerCase().replace(' ','_'));
  return stShell('billing', 'Documents & Billing', `
    <div class="page-hd"><h1 class="t-h2">Documents &amp; Billing</h1>
      <p class="page-sub">Every customer-facing commercial and legal document. Issued financial and signed legal records are corrected by a new version, a credit note or a cancellation — never overwritten.</p></div>
    <div class="tabs" style="margin-bottom:20px">
      ${['All','Draft','Payment due','Paid','Overdue','Signed'].map(t =>
        `<button class="tab ${filt===t?'tab--on':''}" data-act="billFilter" data-t="${t}">${t}</button>`).join('')}
    </div>
    <div class="tw"><table class="tbl">
      <thead><tr><th>Number</th><th>Document</th><th>Customer</th><th>Project</th><th>Type</th>
        <th>Issued</th><th>Due</th><th class="tnum">Amount</th><th>Status</th><th>Visible</th><th></th></tr></thead>
      <tbody>${list.map(d => `<tr>
        <td class="num">${d.num}</td><td>${esc(d.title)}</td>
        <td>${esc(account(d.account).name)}</td>
        <td>${d.project?esc(project(d.project).ref):'—'}</td><td>${esc(d.type)}</td>
        <td>${dateShort(d.issued)}</td><td>${dateShort(d.due)}</td>
        <td class="tnum num">${money(d.amount)}</td><td>${pill(d.state)}</td>
        <td>${d.visible?'Yes':'<span class="faint">Internal</span>'}</td>
        <td>${!d.visible && can(u,'invoice','publish') ? `<button class="btn btn--ghost btn--sm" data-act="pubDoc" data-id="${d.id}">Publish</button>`:''}</td>
      </tr>`).join('')}</tbody></table></div>
  `);
}

/* ---- Communications ------------------------------------------------------- */
function stComms(){
  const openId = UI.openCv || S.conversations[0]?.id;
  const cv = by(S.conversations, openId);
  const filt = UI.cvFilter || 'All';
  const list = filt === 'All' ? S.conversations
    : filt === 'Needs reply' ? S.conversations.filter(c => c.state === 'needs_reply')
    : S.conversations.filter(c => c.state === 'waiting_customer');
  return stShell('comms', 'Communications', `
    <div class="page-hd"><h1 class="t-h2">Communications</h1>
      <p class="page-sub">Every customer thread, with internal notes in the same place and visibly separate. One history — the platform and email do not diverge.</p></div>
    <div class="tabs" style="margin-bottom:20px">
      ${['All','Needs reply','Waiting on customer'].map(t =>
        `<button class="tab ${filt===t?'tab--on':''}" data-act="cvFilter" data-t="${t}">${t}</button>`).join('')}
    </div>
    <div class="cols">
      <div class="card">
        ${cv ? `
          <div class="row-between" style="margin-bottom:16px;flex-wrap:wrap;gap:8px">
            <div><div class="t-h5">${esc(account(cv.account).name)}</div>
              <div class="mono-ref">${esc(project(cv.project)?.ref || '')} · owner ${esc(user(cv.owner).name)}</div></div>
            ${pill(cv.state === 'needs_reply' ? 'waiting_pamuuc' : 'waiting_customer')}
          </div>
          ${cv.messages.map(m => `
            <div class="msg ${m.internal?'msg--internal':''}">
              <span class="av ${user(m.by).side==='studio'?'av--studio':''}">${user(m.by).init}</span>
              <div class="msg-b">
                <div class="msg-h"><span class="msg-a">${esc(user(m.by).name)}</span>
                  <span class="msg-r">${m.internal?'Internal note':user(m.by).side==='studio'?'PAMUUC':esc(account(cv.account).name)} · ${dateTime(m.at)}</span></div>
                <div class="msg-t">${esc(m.text)}</div></div>
            </div>`).join('')}
          <div style="margin-top:16px">
            <textarea class="inp" id="msgbox" placeholder="Reply…"></textarea>
            <div class="btn-row" style="margin-top:8px;justify-content:flex-end">
              <button class="btn btn--ghost btn--sm" data-act="send" data-cv="${cv.id}" data-internal="1">Internal note</button>
              <button class="btn btn--primary btn--sm" data-act="send" data-cv="${cv.id}">Send to customer</button>
            </div>
          </div>` : '<div class="empty"><div class="empty-t">No conversation selected</div></div>'}
      </div>
      <div class="stack-2">
        ${list.map(c => `<button class="card" data-act="openCv" data-id="${c.id}"
          style="text-align:left;cursor:pointer;${c.id===openId?'border-color:var(--navy)':''}">
          <div class="row-between"><span class="t-sm med">${esc(account(c.account).name)}</span>
            ${c.state==='needs_reply'?'<span class="dot"></span>':''}</div>
          <div class="t-xs muted" style="margin-top:4px">${esc(project(c.project)?.name || '')}</div>
          <div class="t-xs faint" style="margin-top:4px">${c.messages.length} messages · ${ago(c.messages[c.messages.length-1]?.at)}</div>
        </button>`).join('')}
      </div>
    </div>
  `);
}

/* ---- Team & Access -------------------------------------------------------- */
function stTeam(){
  const modules = ['Inquiries','Customers','Projects','Phase changes','Bases','Merchandise publication',
    'Quotes','Invoices','Cost and margin','Communications','Team and roles','Settings','Audit log'];
  const matrix = {
    'Inquiries':['Full','Assigned only','View'],
    'Customers':['Full','Assigned','View + finance fields'],
    'Projects':['Full','Assigned','Read + finance fields'],
    'Phase changes':['Full + override','Advance when gates pass','No'],
    'Bases':['Full','View and use','View cost fields'],
    'Merchandise publication':['Full','No','No'],
    'Quotes':['Full','Draft, send with permission','Full review'],
    'Invoices':['Full','View assigned','Full'],
    'Cost and margin':['Full','Hidden by default','Full'],
    'Communications':['Full','Assigned','Finance threads'],
    'Team and roles':['Full','No','No'],
    'Settings':['Full','No','Finance settings only'],
    'Audit log':['Full','Own and assigned','Finance and access'],
  };
  return stShell('team', 'Team & Access', `
    <div class="page-hd"><div class="row-between" style="flex-wrap:wrap;gap:12px">
      <div><h1 class="t-h2">Team &amp; Access</h1>
        <p class="page-sub">Reusable role templates, plus scope. A role says what you can do; scope says which records you can do it to.</p></div>
      <button class="btn btn--primary btn--sm" data-act="inviteStaff">Invite an internal user</button>
    </div></div>

    <section style="margin-bottom:32px">
      <h2 class="t-h4" style="margin-bottom:12px">People</h2>
      <div class="rows">${S.users.filter(u => u.side === 'studio').map(u => `
        <div class="rw rw--static"><span class="av av--studio">${u.init}</span>
          <span class="rw-main"><span class="rw-t">${esc(u.name)}</span>
            <span class="rw-s">${esc(u.title)} · ${ROLE_NAMES[u.role]} · last access today</span></span>
          <span class="rw-side">
            <span class="t-xs muted">${u.role === 'am' ? S.projects.filter(p=>p.am===u.id).length + ' projects' : 'All records'}</span>
            ${pill('active')}<button class="btn btn--quiet btn--sm">Manage</button></span></div>`).join('')}
      </div>
    </section>

    <section>
      <h2 class="t-h4" style="margin-bottom:12px">Default permission matrix</h2>
      <div class="tw"><table class="tbl">
        <thead><tr><th>Area</th><th>Master View</th><th>Account Manager</th><th>Finance Director</th></tr></thead>
        <tbody>${modules.map(m => `<tr><td class="med">${m}</td>
          ${matrix[m].map(x => `<td class="${x==='No'?'faint':''}">${esc(x)}</td>`).join('')}</tr>`).join('')}
        </tbody></table></div>
      <p class="t-xs muted" style="margin-top:12px">This table is documentation of the same <code style="font-size:12px">can()</code> function the interface calls. Sign in as an Account Manager or Finance Director and the navigation, the buttons and the cost fields change accordingly.</p>
    </section>
  `);
}

/* ---- Settings ------------------------------------------------------------ */
function stSettings(){
  const sec = (title, rows) => `
    <section style="margin-bottom:32px">
      <h2 class="t-h4" style="margin-bottom:12px">${title}</h2>
      <div class="rows">${rows.map(([n,v,src]) => `<div class="rw rw--static">
        <span class="rw-main"><span class="rw-t">${n}</span><span class="rw-s">${v}</span></span>
        <span class="rw-side"><span class="chip ${src==='Override'?'chip--on':''}">${src}</span></span></div>`).join('')}</div>
    </section>`;
  return stShell('settings', 'Content & Settings', `
    <div class="page-hd"><h1 class="t-h2">Content &amp; Settings</h1>
      <p class="page-sub">Global defaults, and where a customer overrides one. The interface always shows which is which.</p></div>

    ${sec('Project stages', STAGES.map(s => [s.name, s.blurb, s.id==='design'?'Conditional':'Global default']))}

    ${sec('Status vocabulary', [
      ['Controlled dictionary', `${Object.keys(STATUS).length} states, each with a colour family and a plain-language customer sentence`, 'Global default'],
      ['Colour families', 'Neutral · Blue · Amber · Green · Red — colour is supporting information, never the only signal', 'Global default'],
      ['Merchandise red', 'Studio red identifies the merchandise line of business and nothing else. Danger uses a separate crimson.', 'Global default'],
    ])}

    ${sec('Libraries', [
      ['Fabrics', `${Object.keys(FABRICS).length} active fabrics`, 'Global default'],
      ['Colours', `${Object.keys(COLOURS).length} colours, 1 custom`, 'Global default'],
      ['Personalisation methods', Object.values(S.personalization).map(x=>x.name).join(', '), 'Global default'],
      ['Positions', Object.values(S.positions_lib).join(', '), 'Global default'],
      ['Size systems', SIZES.join(' · ') + ' and One size', 'Global default'],
    ])}

    ${sec('Commercial', [
      ['Default payment terms', '30 days from invoice date', 'Global default'],
      ['Grup Marítim payment terms', '30 days from invoice date', 'Override'],
      ['Clínica Bonanova payment terms', '45 days from invoice date', 'Override'],
      ['Currencies', 'EUR', 'Global default'],
      ['Prototype round limit', 'Three rounds per garment, then a recorded Master resolution', 'Global default'],
    ])}

    ${sec('Public website', [
      ['Qualification form', 'Nine question pages plus a review step', 'Global default'],
      ['Form creates', 'Inquiry only — never an account, never a project', 'Global default'],
      ['Merchandise catalogue', `${S.merchProducts.length} products published`, 'Global default'],
    ])}
  `);
}

/* ---- Audit log ------------------------------------------------------------ */
function stAudit(){
  return stShell('audit', 'Audit Log', `
    <div class="page-hd"><h1 class="t-h2">Audit Log</h1>
      <p class="page-sub">Access changes, phase overrides, visibility changes, approvals, document publication, financial status changes, specification revisions and archival. Actions taken in this prototype are appended live.</p></div>
    <div class="tw"><table class="tbl">
      <thead><tr><th>When</th><th>Actor</th><th>Role</th><th>Record</th><th>Action</th>
        <th>Previous</th><th>New</th><th>Reason</th><th>Source</th></tr></thead>
      <tbody>${S.audit.map(a => `<tr>
        <td>${dateTime(a.at)}</td><td class="med">${esc(user(a.actor).name)}</td><td>${esc(a.role)}</td>
        <td class="num">${esc(a.record)}</td><td>${esc(a.action)}</td>
        <td class="muted">${esc(a.was ?? '—')}</td><td class="med">${esc(a.now ?? '—')}</td>
        <td class="t-xs muted">${esc(a.reason || '—')}</td><td class="t-xs">${esc(a.source)}</td></tr>`).join('')}
      </tbody></table></div>
  `);
}

function stNotifications(){
  const ns = S.notifications.filter(n => n.to === 'studio');
  return stShell('notifications', 'Notifications', `
    <div class="page-hd"><div class="row-between">
      <div><h1 class="t-h2">Notifications</h1>
        <p class="page-sub">One event model. Each event decides whether it becomes an activity entry, a notification, a task or an approval — never four parallel mechanisms.</p></div>
      <button class="btn btn--ghost btn--sm" data-act="markRead">Mark all read</button></div></div>
    ${ns.length ? `<div class="rows">${ns.map(n => `<button class="rw" ${n.project?`data-go="studio:project:${n.project}"`:'data-go="studio:inquiries"'}>
      ${n.action?'<span class="rw-flag rw-flag--wait"></span>':''}
      <span class="rw-main"><span class="rw-t">${esc(n.text)}</span>
        <span class="rw-s">${dateTime(n.at)}${n.account?' · '+esc(account(n.account).name):''}</span></span>
      <span class="rw-side">${n.action?pill('waiting_pamuuc'):pill('published')}${!n.read?'<span class="dot"></span>':''}</span>
    </button>`).join('')}</div>` : '<div class="empty"><div class="empty-t">Nothing here</div></div>'}
  `);
}
