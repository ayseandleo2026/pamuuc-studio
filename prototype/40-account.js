/* ============================================================================
   PAMUUC SUITE — Customer Account
   Selective, guided, action-focused. Everything here is a projection of the
   same records the Studio operates. There is no "create project" action.
   ========================================================================= */

/* ---- shared application shell (account + studio) ----------------------- */
function appShell(o){
  const u = user(SESSION.user);
  const side = u.side;
  const unread = unreadCount(side);
  return `
  <div class="app">
    <aside class="side">
      <div class="side-hd">
        <div class="brand brand--sm" data-go="${side==='customer'?'account:overview':'studio:overview'}">PAMUUC<span class="brand-bar">|</span><span class="brand-sub">${side==='customer'?'ACCOUNT':'STUDIO'}</span></div>
        <div class="side-scope">${o.scope}</div>
      </div>
      <nav class="side-nav">
        ${o.nav.map(g => g.group
          ? `<div class="side-grp">${esc(g.group)}</div>`
          : `<button class="nv ${o.page===g.p?'nv--on':''}" data-go="${side==='customer'?'account':'studio'}:${g.p}">
               <span class="nv-i">${g.i}</span><span class="nv-n">${esc(g.n)}</span>
               ${g.badge ? `<span class="badge-n">${g.badge}</span>` : ''}
             </button>`).join('')}
      </nav>
      <div class="side-ft">
        <button class="ub" data-act="userMenu" style="width:100%">
          <span class="av ${side==='studio'?'av--studio':''}">${u.init}</span>
          <span style="flex:1;text-align:left;min-width:0">
            <span style="display:block;font-weight:500;font-size:13px;overflow:hidden;text-overflow:ellipsis">${esc(u.name)}</span>
            <span style="display:block;color:var(--muted);font-size:11px">${ROLE_NAMES[u.role]}</span>
          </span>
        </button>
      </div>
    </aside>

    <div class="main">
      <header class="top glass">
        <span class="top-t">${esc(o.title)}</span>
        <span class="spacer"></span>
        <button class="btn btn--quiet btn--sm" data-act="theme" title="Light / dark">◐</button>
        <button class="iconbtn" data-go="${side==='customer'?'account:messages':'studio:comms'}" title="Messages">✉</button>
        <button class="iconbtn" data-go="${side==='customer'?'account:notifications':'studio:notifications'}" title="Notifications">
          ◔${unread ? `<span class="badge-n">${unread}</span>` : ''}</button>
        <button class="btn btn--ghost btn--sm" data-act="logout">Sign out</button>
      </header>
      <main class="body ${o.narrow?'body--narrow':''}">${o.body}</main>
    </div>

    <nav class="mob-nav glass">
      ${o.nav.filter(g => !g.group).slice(0,5).map(g => `
        <button class="nv ${o.page===g.p?'nv--on':''}" data-go="${side==='customer'?'account':'studio'}:${g.p}" style="flex:1">
          <span class="nv-i">${g.i}</span><span>${esc(g.n.split(' ')[0])}</span></button>`).join('')}
    </nav>
  </div>`;
}

function accNav(page){
  const u = user(SESSION.user);
  const acc = myAccount();
  const actions = myOpenItems().length;
  const nav = [
    {p:'overview',  n:'Overview',    i:'◎', badge:actions || 0},
    {p:'projects',  n:'Projects',    i:'▤'},
    {p:'reorders',  n:'Reorders',    i:'↻'},
  ];
  if(acc.modules.merchandise) nav.push({p:'merchandise', n:'Merchandise', i:'◈'});
  nav.push({p:'documents', n:'Documents', i:'▣'});
  nav.push({group:'Communication'});
  nav.push({p:'messages', n:'Messages', i:'✉'});
  nav.push({p:'notifications', n:'Notifications', i:'◔', badge:unreadCount('customer') || 0});
  nav.push({group:'Account'});
  nav.push({p:'settings', n:'Team & settings', i:'⚙'});
  return nav;
}

function accShell(page, title, body){
  const acc = myAccount();
  return appShell({page, title, body, nav:accNav(page),
    scope:`${esc(acc.name)}<br><span class="faint">${ROLE_NAMES[user(SESSION.user).role]} · ${esc(acc.country)}</span>`});
}

/* ---- Overview ---------------------------------------------------------- */
function accOverview(){
  const u = user(SESSION.user);
  const acc = myAccount();
  const items = myOpenItems();
  const projs = myProjects().filter(p => !p.completed);
  const done = myProjects().filter(p => p.completed);
  const delivered = S.shipments.filter(s => s.account === acc.id).reduce((t,s)=>t+s.pieces,0);
  const roles = new Set(); S.projects.filter(p=>p.account===acc.id&&p.completed)
    .forEach(p => p.positions.forEach(x => roles.add(x.name)));
  const approved = S.garments.filter(g => {
    const p = project(g.project); return p && p.account===acc.id && g.state==='approved';}).length;
  const feed = S.events.filter(e => e.account === acc.id && e.customerVisible).slice(0,8);

  return accShell('overview', 'Overview', `
    <div class="page-hd">
      <div class="eyebrow">${esc(acc.name)}</div>
      <h1 class="t-h2">Good morning, ${esc(u.name.split(' ')[0])}.</h1>
      <p class="page-sub">With PAMUUC since ${dateShort(acc.since)} · Your Account Manager is
        <span class="med">${esc(user(acc.am).name)}</span> · Last activity ${ago(S.events[0]?.at)}</p>
    </div>

    ${items.length ? `
    <section class="stack-3" style="margin-bottom:32px">
      <div class="row-between">
        <h2 class="t-h4">Needs your attention</h2>
        <span class="chip">${items.length} open</span>
      </div>
      <div class="rows">
        ${items.map(i => `
          <button class="rw" data-act="openItem" data-kind="${i.kind}" data-id="${i.id}" data-project="${i.project||''}">
            <span class="rw-flag rw-flag--${i.urgency}"></span>
            <span class="rw-main">
              <span class="rw-t">${esc(i.title)}</span>
              <span class="rw-s">${esc(i.sub)}${i.project ? ' · ' + esc(project(i.project).name) : ''}</span>
            </span>
            <span class="rw-side"><span class="btn btn--ghost btn--sm">${i.cta}</span></span>
          </button>`).join('')}
      </div>
    </section>` : `
    <div class="banner banner--go" style="margin-bottom:32px"><div>
      <div class="banner-t">You are up to date</div>
      <div class="banner-d">Nothing is waiting on you. We will tell you when something is.</div></div></div>`}

    <section class="stack-3" style="margin-bottom:32px">
      <h2 class="t-h4">Active projects</h2>
      ${projs.length ? `<div class="grid grid-2">${projs.map(p => {
        const v = views.customerProject(p);
        return `<button class="card" data-go="account:project:${p.id}" style="text-align:left;cursor:pointer">
          <div class="row-between" style="align-items:flex-start">
            <div><div class="t-h5">${esc(p.name)}</div>
              <div class="mono-ref">${p.ref}</div></div>
            ${pill(p.opStatus)}
          </div>
          <div class="tl" style="margin:16px 0">
            ${p.stages.map(sid => {
              const i = p.stages.indexOf(sid), cur = p.stages.indexOf(p.stage);
              return `<div class="tl-s ${i<cur?'tl-s--done':i===cur?'tl-s--now':''}" style="min-width:0">
                <div class="tl-n" style="font-size:11px">${stageDef(sid).name}</div></div>`;}).join('')}
          </div>
          <div class="stack-2">
            <div class="factline"><span>Now</span><span>${esc(v.doing)}</span></div>
            <div class="factline"><span>You</span><span class="med">${esc(v.youDo)}</span></div>
            ${p.nextMilestone ? `<div class="factline"><span>Next</span><span class="muted">${esc(p.nextMilestone)}</span></div>` : ''}
          </div>
        </button>`;}).join('')}</div>`
        : `<div class="empty"><div class="empty-t">No active projects</div>
           <div class="empty-d">Your completed garments remain available in Reorders. Contact ${esc(user(acc.am).name)} to begin a new project.</div>
           <button class="btn btn--ghost" data-go="account:reorders">Go to Reorders</button></div>`}
    </section>

    <section class="stack-3" style="margin-bottom:32px">
      <h2 class="t-h4">Your account in numbers</h2>
      <div class="grid grid-4">
        ${[[projs.length,'Active projects','Projects in an active stage'],
           [done.length,'Completed projects','Delivered and closed'],
           [approved,'Approved garments','Locked at an approved revision'],
           [delivered.toLocaleString('en-GB'),'Garments delivered','Delivered units, net of returns'],
           [roles.size,'Roles dressed','Distinct positions in completed deliveries'],
           [S.reorders.filter(r=>r.account===acc.id).length,'Reorders placed','From archived specifications'],
           [acc.locations.length,'Locations served','Delivery destinations on file'],
           ['81%','Documented provenance','Share of delivered units with mill and country on file']]
          .map(([v,l,n]) => `<div class="tile"><div class="tile-v num">${v}</div>
            <div class="tile-l">${l}</div><div class="tile-n">${n}</div></div>`).join('')}
      </div>
    </section>

    <section class="stack-3" style="margin-bottom:32px">
      <div class="row-between"><h2 class="t-h4">Commercial position</h2>
        <span class="t-xs faint">Calculated ${dateShort(S.today)}</span></div>
      <div class="grid grid-3">
        <div class="tile"><div class="tile-v num">${money(acc.balance)}</div>
          <div class="tile-l">Outstanding balance</div>
          <div class="tile-n">Issued minus recorded payments and credits</div></div>
        <div class="tile"><div class="tile-v num">${money(S.documents.filter(d=>d.account===acc.id&&d.state==='paid').reduce((t,d)=>t+(d.amount||0),0))}</div>
          <div class="tile-l">Paid to date</div>
          <div class="tile-n">All settled invoices on this account</div></div>
        <div class="tile"><div class="tile-v num">${money(64.00)}</div>
          <div class="tile-l">Chef jacket — last reorder unit price</div>
          <div class="tile-n">Same as the original approved unit price. No development fee was charged on the reorder.</div></div>
      </div>
      <p class="t-xs muted">Every figure links back to stored records. We do not show an estimated saving as a confirmed one — where a comparison cannot be defended, we show spend history instead.</p>
    </section>

    <section class="stack-3">
      <h2 class="t-h4">Recent activity</h2>
      <div class="card"><div class="feed">
        ${feed.map((e,i) => `<div class="fe ${i===0?'fe--now':''}">
          <div>${esc(e.text)}</div>
          <div class="fe-m">${dateTime(e.at)} · ${esc(user(e.actor).name)}</div></div>`).join('')}
      </div></div>
    </section>
  `);
}

/* ---- Projects list ----------------------------------------------------- */
function accProjects(){
  const ps = myProjects();
  return accShell('projects', 'Projects', `
    <div class="page-hd">
      <h1 class="t-h2">Projects</h1>
      <p class="page-sub">Each project shows the stage it is in now. Completed stages stay available inside the project, in History.</p>
    </div>
    ${ps.length ? `<div class="stack">${ps.map(p => {
      const v = views.customerProject(p);
      return `<div class="card">
        <div class="row-between" style="align-items:flex-start;flex-wrap:wrap">
          <div>
            <div class="row" style="gap:8px"><h2 class="t-h4">${esc(p.name)}</h2>${pill(p.opStatus)}</div>
            <div class="mono-ref" style="margin-top:4px">${p.ref} · target ${dateShort(p.target)}</div>
          </div>
          <button class="btn btn--primary btn--sm" data-go="account:project:${p.id}">Open project</button>
        </div>
        <div class="tl" style="margin:20px 0">
          ${p.stages.map(sid => {
            const i = p.stages.indexOf(sid), cur = p.stages.indexOf(p.stage);
            return `<div class="tl-s ${i<cur?'tl-s--done':i===cur?'tl-s--now':''}">
              <div class="tl-n">${stageDef(sid).name}</div>
              <div class="tl-m">${i<cur?'Complete':i===cur?st(p.opStatus).label:''}</div></div>`;}).join('')}
        </div>
        <div class="grid grid-3" style="gap:20px">
          <div><div class="stage-lbl">What we are doing</div><div class="stage-txt">${esc(v.doing)}</div></div>
          <div><div class="stage-lbl">What you need to do</div><div class="stage-txt med">${esc(v.youDo)}</div></div>
          <div><div class="stage-lbl">Next milestone</div><div class="stage-txt muted">${esc(p.nextMilestone || '—')}</div></div>
        </div>
        <div class="row" style="margin-top:16px;gap:16px">
          <span class="t-xs faint">Responsible now: <span class="med">${esc(v.responsible)}</span></span>
          <span class="t-xs faint">Updated ${ago(p.lastUpdate)}</span>
          <span class="t-xs faint">Version ${p.version}</span>
        </div>
      </div>`;}).join('')}</div>`
    : `<div class="empty"><div class="empty-t">No projects yet</div>
       <div class="empty-d">PAMUUC creates every project after a first call. When yours is ready it will appear here.</div></div>`}
    <p class="t-xs muted" style="margin-top:24px">There is no "new project" action here, and there will not be. A uniform project has too many dependent decisions to be assembled from a form — we build it with you and publish it when it is ready.</p>
  `);
}

/* ---- Project detail: stage-driven -------------------------------------- */
function accProject(id){
  const p = project(id);
  if(!p || p.account !== user(SESSION.user).account) return accShell('projects','Project', '<div class="empty">Not found.</div>');
  if(!can(user(SESSION.user),'project','view',{project:p.id}))
    return accShell('projects','Project', `<div class="empty"><div class="empty-t">Not shared with you</div>
      <div class="empty-d">Your account administrator controls which projects you can see. Ask ${esc(user(myAccount().am).name)} or your admin for access.</div></div>`);

  const v = views.customerProject(p);
  const cur = p.stages.indexOf(p.stage);
  const cv = S.conversations.find(c => c.project === p.id);
  const files = S.documents.filter(d => d.project === p.id && d.visible);
  const feed = S.events.filter(e => e.project === p.id && e.customerVisible).slice(0,10);

  return accShell('projects', p.name, `
    <div class="crumbs" style="margin-bottom:16px">
      <a data-go="account:projects">Projects</a><span>›</span><span>${esc(p.name)}</span>
    </div>

    <div class="stagehd" style="margin-bottom:24px">
      <div class="row-between" style="align-items:flex-start;flex-wrap:wrap;margin-bottom:20px">
        <div>
          <div class="row" style="gap:8px"><h1 class="t-h3">${esc(p.name)}</h1>${pill(p.opStatus)}</div>
          <div class="mono-ref" style="margin-top:4px">${p.ref} · version ${p.version}, published ${dateTime(p.publishedAt)}</div>
        </div>
        ${v.approvals.length ? `<button class="btn btn--primary" data-act="openApproval" data-id="${v.approvals[0].id}">
          ${esc(v.approvals[0].kind.length > 34 ? 'Review approval' : v.approvals[0].kind)}</button>` : ''}
      </div>
      <div class="tl">
        ${p.stages.map(sid => {
          const i = p.stages.indexOf(sid);
          return `<div class="tl-s ${i<cur?'tl-s--done':i===cur?'tl-s--now':''}">
            <div class="tl-n">${stageDef(sid).name}</div>
            <div class="tl-m">${i<cur?'✓ Complete':i===cur?st(p.opStatus).label:'Not started'}</div></div>`;}).join('')}
      </div>
      <p class="t-sm muted" style="margin-top:16px;max-width:80ch">${esc(v.stageBlurb)}</p>
      <div class="stage-now">
        <div class="stage-col"><div class="stage-lbl">What PAMUUC is doing</div><div class="stage-txt">${esc(v.doing)}</div></div>
        <div class="stage-col"><div class="stage-lbl">What you need to do</div><div class="stage-txt med">${esc(v.youDo)}</div></div>
        <div class="stage-col"><div class="stage-lbl">Responsible now</div><div class="stage-txt">${esc(v.responsible)}</div></div>
        <div class="stage-col"><div class="stage-lbl">What happens next</div><div class="stage-txt muted">${esc(v.next)}</div></div>
      </div>
    </div>

    ${v.gate.blocked ? `
      <div class="banner banner--wait" style="margin-bottom:24px"><div>
        <div class="banner-t">${esc(v.gate.label)} — ${st(v.gate.state).label.toLowerCase()}</div>
        <div class="banner-d">${esc(v.gate.why)}</div>
        <div class="btn-row" style="margin-top:12px">
          <button class="btn btn--primary btn--sm" data-go="account:documents">Go to Documents</button></div>
      </div></div>` : ''}

    <div class="cols">
      <div class="stack-6">
        ${accStageWorkspace(p, v)}

        <section>
          <h2 class="t-h4" style="margin-bottom:12px">Project conversation</h2>
          <div class="card">
            ${cv && cv.messages.filter(m=>!m.internal).length ? cv.messages.filter(m=>!m.internal).map(m => `
              <div class="msg">
                <span class="av ${user(m.by).side==='studio'?'av--studio':''}">${user(m.by).init}</span>
                <div class="msg-b">
                  <div class="msg-h"><span class="msg-a">${esc(user(m.by).name)}</span>
                    <span class="msg-r">${user(m.by).side==='studio'?'PAMUUC':esc(myAccount().name)} · ${dateTime(m.at)}</span></div>
                  <div class="msg-t">${esc(m.text)}</div>
                </div>
              </div>`).join('') : '<p class="t-sm muted">No messages yet.</p>'}
            <div style="margin-top:16px">
              <textarea class="inp" id="msgbox" placeholder="Write to ${esc(user(p.am).name)}…"></textarea>
              <div class="btn-row" style="margin-top:8px;justify-content:space-between">
                <span class="t-xs faint">You will get an email saying we replied, with a link back here. We keep the detail on the platform.</span>
                <button class="btn btn--primary btn--sm" data-act="send" data-cv="${cv?cv.id:''}">Send</button>
              </div>
            </div>
          </div>
        </section>

        ${cur > 0 ? `
        <section>
          <details class="card">
            <summary style="cursor:pointer" class="t-h5">History — ${cur} completed stage${cur>1?'s':''}</summary>
            <div class="stack-3" style="margin-top:16px">
              ${p.stages.slice(0,cur).map(sid => `
                <div class="row-between" style="padding:10px 0;border-bottom:1px solid var(--line)">
                  <div><div class="t-sm med">${stageDef(sid).name}</div>
                    <div class="t-xs muted">${esc(stageDef(sid).blurb)}</div></div>
                  ${pill('complete')}</div>`).join('')}
              ${S.changeRequests.filter(c=>c.project===p.id&&c.state==='incorporated').map(c => `
                <div class="row-between" style="padding:10px 0;border-bottom:1px solid var(--line)">
                  <div><div class="t-sm med">${esc(c.title)}</div>
                    <div class="t-xs muted">${esc(c.outcome||'')}</div></div>${pill('incorporated')}</div>`).join('')}
            </div>
          </details>
        </section>` : ''}
      </div>

      <div class="stack">
        <div class="card">
          <div class="eyebrow">Your Account Manager</div>
          <div class="row" style="margin-top:12px">
            <span class="av av--studio">${user(p.am).init}</span>
            <div><div class="t-sm med">${esc(user(p.am).name)}</div>
              <div class="t-xs muted">${esc(user(p.am).title)}</div></div>
          </div>
        </div>

        <div class="card">
          <div class="eyebrow">Files and documents</div>
          <div class="stack-2" style="margin-top:12px">
            ${files.length ? files.map(d => `
              <button class="row-between" data-go="account:documents" style="width:100%;background:transparent;border:0;padding:8px 0;cursor:pointer;text-align:left;border-bottom:1px solid var(--line)">
                <span><span class="t-sm">${esc(d.title)}</span>
                  <span class="mono-ref" style="display:block">${d.num}</span></span>
                ${pill(d.state)}</button>`).join('')
              : '<p class="t-sm muted">Nothing shared yet.</p>'}
          </div>
        </div>

        <div class="card">
          <div class="eyebrow">Activity</div>
          <div class="feed" style="margin-top:12px">
            ${feed.map((e,i) => `<div class="fe ${i===0?'fe--now':''}">
              <div class="t-sm">${esc(e.text)}</div>
              <div class="fe-m">${dateTime(e.at)}</div></div>`).join('')}
          </div>
        </div>
      </div>
    </div>
  `);
}

/* ---- Stage workspaces --------------------------------------------------- */
function accStageWorkspace(p, v){
  if(p.stage === 'design')            return accWsDesign(p, v);
  if(p.stage === 'development')       return accWsDevelopment(p, v);
  if(p.stage === 'prototype_fitting') return accWsFitting(p, v);
  if(p.stage === 'pre_production')    return accWsPrePro(p, v);
  if(p.stage === 'production')        return accWsProduction(p, v);
  return accWsDelivery(p, v);
}

function accWsDesign(p, v){
  return `<section><h2 class="t-h4" style="margin-bottom:12px">Design</h2>
    <div class="card">
      <div class="banner"><div><div class="banner-t">Waiting for design</div>
        <div class="banner-d">Our design partner is working from your brief. We will publish the concepts here for review, and propose dates for a design review meeting.</div></div></div>
      <div class="sep"></div>
      <div class="eyebrow">Confirmed brief</div>
      <p class="t-sm" style="margin-top:8px">${esc(p.brief)}</p>
    </div></section>`;
}

function accWsDevelopment(p, v){
  const editable = !v.gate.blocked;
  return `
  <section>
    <div class="row-between" style="margin-bottom:12px">
      <h2 class="t-h4">Positions and garments</h2>
      <span class="t-xs faint">${p.positions.length} positions · ${v.garments.length} garments · ${projectPieces(p)} pieces</span>
    </div>
    ${v.openCRs.length ? `<div class="banner banner--wait" style="margin-bottom:16px"><div>
      <div class="banner-t">${v.openCRs.length} request${v.openCRs.length>1?'s':''} under review</div>
      <div class="banner-d">Your approved specification is unchanged until we accept a request and build it into a new revision.</div>
      <div class="stack-2" style="margin-top:12px">
        ${v.openCRs.map(c => `<div class="row-between">
          <span class="t-sm">${esc(c.title)}</span>${pill(c.state)}</div>`).join('')}
      </div></div></div>` : ''}

    <div class="stack">
      ${p.positions.map(pos => `
        <div class="card card--flush">
          <div class="row-between" style="padding:16px 20px;border-bottom:1px solid var(--line);flex-wrap:wrap;gap:12px">
            <div>
              <div class="t-h5">${esc(pos.name)}</div>
              <div class="t-xs muted">${pos.people} people in this role</div>
            </div>
            <div class="btn-row">
              <button class="btn btn--ghost btn--sm" data-act="reqRename" data-pos="${pos.id}" data-p="${p.id}"
                ${editable?'':'disabled'}>Request a name change</button>
              <button class="btn btn--ghost btn--sm" data-act="reqGarment" data-pos="${pos.id}" data-p="${p.id}"
                ${editable?'':'disabled'}>Request another garment</button>
            </div>
          </div>
          <div style="padding:20px" class="stack">
            ${pos.garments.map(gid => accGarmentCard(garment(gid), p, editable)).join('')}
          </div>
        </div>`).join('')}
    </div>
    ${editable ? `<div class="banner" style="margin-top:16px"><div>
      <div class="banner-t">Changes you make here are drafts</div>
      <div class="banner-d">Edit quantities and colours freely. Nothing reaches production until you submit it and we accept it into a new revision.</div></div></div>` : ''}
  </section>`;
}

function accGarmentCard(g, p, editable){
  if(!g) return '';
  const b = base(g.base);
  const total = g.colourways.reduce((t,c) => t + (+c.qty||0), 0);
  const dirty = UI.dirty && UI.dirty[g.id];
  return `
  <div class="gcard">
    <div class="gcard-hd">
      <div class="gcard-th">${g.glyph}</div>
      <div style="flex:1;min-width:0">
        <div class="row-between" style="align-items:flex-start;flex-wrap:wrap;gap:8px">
          <div>
            <div class="t-h5">${esc(g.name)}</div>
            <div class="mono-ref">${b.ref} ${g.baseV} · revision ${g.rev}</div>
          </div>
          ${pill(g.state)}
        </div>
        <div class="wrap-row" style="margin-top:10px;gap:8px">
          <span class="chip">${esc(FABRICS[g.fabric].name)}</span>
          <span class="chip">${esc(S.personalization[g.pers.method].name)} · ${esc(S.positions_lib[g.pers.pos])}</span>
          ${FABRICS[g.fabric].prov ? '<span class="chip">Provenance on file</span>' : ''}
        </div>
      </div>
    </div>
    <div class="gcard-b">
      ${editable ? `
      <label class="field" style="margin-bottom:16px">
        <span class="field-l">Fabric</span>
        <span class="field-h">Only fabrics we have mapped to this garment base are offered. Ask us if you want one that is not here.</span>
        <select class="inp" data-act="pickFabric" data-g="${g.id}" style="max-width:340px">
          ${b.fabrics.map(f => `<option value="${f}" ${f===g.fabric?'selected':''}>${esc(FABRICS[f].name)} — ${esc(FABRICS[f].spec)}</option>`).join('')}
        </select>
      </label>` : ''}

      <div class="row-between" style="margin-bottom:8px">
        <span class="field-l" style="margin:0">Colours and quantities</span>
        <span class="t-sm num">Total <span class="med">${total}</span></span>
      </div>
      ${g.colourways.map(cw => `
        <div class="cw">
          <div class="row">
            <span class="sw sw--lg" style="background:${COLOURS[cw.colour].hex}"></span>
            <div>
              <div class="t-sm med">${esc(COLOURS[cw.colour].name)}
                ${COLOURS[cw.colour].custom ? '<span class="chip" style="margin-left:6px">Custom</span>':''}</div>
              <div class="t-xs muted">${cwSum(cw) === cw.qty
                ? `<span class="sum-ok">Size split sums to ${cw.qty}</span>`
                : `<span class="sum-bad">Size split sums to ${cwSum(cw)}, quantity is ${cw.qty}</span>`}</div>
            </div>
          </div>
          <input class="inp inp--num" type="number" min="0" value="${cw.qty}"
            data-act="setQty" data-g="${g.id}" data-cw="${cw.id}" ${editable?'':'disabled'}>
          ${editable && g.colourways.length > 1 ? `<button class="btn btn--quiet btn--sm" data-act="rmCw" data-g="${g.id}" data-cw="${cw.id}">Remove</button>` : '<span></span>'}
        </div>`).join('')}

      ${editable ? `
      <div class="wrap-row" style="margin-top:12px;gap:8px">
        <span class="t-xs muted">Add a colour:</span>
        ${b.colours.filter(c => !g.colourways.some(x => x.colour === c)).map(c => `
          <button class="sw-btn" data-act="addCw" data-g="${g.id}" data-c="${c}">
            <span class="sw" style="background:${COLOURS[c].hex}"></span>${esc(COLOURS[c].name)}</button>`).join('')}
        <button class="btn btn--quiet btn--sm" data-act="reqColour" data-g="${g.id}">Request another colour</button>
      </div>` : ''}

      ${dirty ? `<div class="banner banner--wait" style="margin-top:16px"><div>
        <div class="banner-t">You have unsubmitted changes on this garment</div>
        <div class="banner-d">Nothing has changed in our records yet. Submit them for review and we will tell you what we can accept.</div>
        <div class="btn-row" style="margin-top:12px">
          <button class="btn btn--primary btn--sm" data-act="submitCr" data-g="${g.id}" data-p="${p.id}">Submit changes for review</button>
          <button class="btn btn--quiet btn--sm" data-act="discardCr" data-g="${g.id}">Discard</button>
        </div></div></div>` : ''}
    </div>
  </div>`;
}

function accWsFitting(p, v){
  const meeting = S.meetings.find(m => m.project === p.id && ['proposed','alternative'].includes(m.state));
  const accepted = S.meetings.find(m => m.project === p.id && m.state === 'accepted');
  const approvedN = v.garments.filter(g => g.state === 'approved').length;
  return `
  <section>
    <div class="row-between" style="margin-bottom:12px">
      <h2 class="t-h4">Prototype fitting</h2>
      <span class="chip">${approvedN} of ${v.garments.length} approved</span>
    </div>

    ${meeting ? `
    <div class="card" style="margin-bottom:16px">
      <div class="row-between" style="align-items:flex-start;flex-wrap:wrap;gap:12px">
        <div><div class="t-h5">${esc(meeting.kind)}</div>
          <div class="t-xs muted" style="margin-top:4px">${esc(meeting.method)} · ${esc(meeting.location)}</div></div>
        ${pill(meeting.state)}
      </div>
      ${meeting.state === 'proposed' ? `
      <p class="t-sm muted" style="margin:16px 0 12px">Choose the time that works for your team. Accepting one closes the others.</p>
      <div class="wrap-row">
        ${meeting.slots.map(s => `<button class="btn btn--ghost" data-act="acceptSlot" data-m="${meeting.id}" data-s="${esc(s)}">${dateTime(s)}</button>`).join('')}
        <button class="btn btn--quiet" data-act="altSlot" data-m="${meeting.id}">None of these work</button>
      </div>` : `<p class="t-sm muted" style="margin-top:12px">We have your note and will propose new times. Your original proposals are kept.</p>`}
    </div>` : ''}

    ${accepted ? `<div class="banner banner--go" style="margin-bottom:16px"><div>
      <div class="banner-t">Fitting confirmed — ${dateTime(accepted.chosen)}</div>
      <div class="banner-d">${esc(accepted.method)} at ${esc(accepted.location)}.</div></div></div>` : ''}

    <div class="banner" style="margin-bottom:16px"><div>
      <div class="banner-t">Each garment is approved on its own</div>
      <div class="banner-d">Approving one garment locks it at its revision. Any garment you send back goes into another round without touching the ones you have already approved. Three rounds is the limit — after that we resolve it with you directly rather than making a fourth sample.</div></div></div>

    <div class="stack">
      ${v.garments.map(g => {
        const canAct = ['feedback_required','ready_fitting','fitting_scheduled'].includes(g.state);
        return `
        <div class="gcard">
          <div class="gcard-hd">
            <div class="gcard-th">${g.glyph}</div>
            <div style="flex:1;min-width:0">
              <div class="row-between" style="align-items:flex-start;flex-wrap:wrap;gap:8px">
                <div>
                  <div class="t-h5">${esc(g.name)}</div>
                  <div class="mono-ref">Revision ${g.rev} · ${esc(FABRICS[g.fabric].name)}</div>
                </div>
                <div class="row" style="gap:8px">
                  <span class="chip">Round ${g.round} of 3</span>
                  ${pill(g.state)}
                </div>
              </div>
              <div class="bar" style="margin-top:12px;max-width:180px">
                <div class="bar-f ${g.state==='approved'?'bar-f--go':g.round>=3?'bar-f--wait':''}" style="width:${Math.min(100,(g.round/3)*100)}%"></div>
              </div>
            </div>
          </div>
          <div class="gcard-b">
            <p class="t-sm muted">${esc(g.notes || '')}</p>
            ${(g.feedback||[]).length ? `<div class="stack-2" style="margin-top:12px">
              ${g.feedback.map(f => `<div class="card card--quiet" style="padding:12px">
                <div class="t-xs faint">${esc(user(f.by).name)} · ${dateShort(f.at)}</div>
                <div class="t-sm" style="margin-top:4px">${esc(f.text)}</div></div>`).join('')}
            </div>` : ''}

            ${g.state === 'manual_resolution' ? `
              <div class="banner banner--stop" style="margin-top:16px"><div>
                <div class="banner-t">We will contact you about this garment</div>
                <div class="banner-d">This is the third round and it is still not right. Rather than make a fourth sample we would like to talk about the options — a different cloth, a higher quantity, or leaving this garment out of the project. ${esc(user(p.am).name)} will call you.</div></div></div>`
            : g.state === 'approved' ? `
              <div class="banner banner--go" style="margin-top:16px"><div>
                <div class="banner-t">Approved and locked at revision ${g.rev}</div>
                <div class="banner-d">Approved ${dateShort(g.approvedAt)}. Nothing that happens to the other garments will change this one.</div></div></div>`
            : canAct ? `
              <div style="margin-top:16px">
                <label class="field"><span class="field-l">Fitting feedback</span>
                  <span class="field-h">Tell us what happened when a real person wore it doing real work. That is more useful than a measurement.</span>
                  <textarea class="inp" id="fb_${g.id}" placeholder="Where it binds, what falls out, what people said…"></textarea></label>
                <div class="btn-row">
                  <button class="btn btn--primary btn--sm" data-act="approveG" data-g="${g.id}">Approve this garment</button>
                  <button class="btn btn--ghost btn--sm" data-act="changesG" data-g="${g.id}">Request changes</button>
                </div>
              </div>`
            : `<div class="banner" style="margin-top:16px"><div>
                <div class="banner-t">${st(g.state).label}</div>
                <div class="banner-d">${esc(st(g.state).say)}</div></div></div>`}
          </div>
        </div>`;}).join('')}
    </div>
  </section>`;
}

function accWsPrePro(p, v){
  const problems = gateBlockers(p).filter(b => b.kind === 'data');
  const pf = S.documents.find(d => d.project === p.id && d.type === 'Pro forma' && d.visible);
  return `
  <section>
    <h2 class="t-h4" style="margin-bottom:12px">Final production matrix</h2>
    ${problems.length ? `<div class="banner banner--stop" style="margin-bottom:16px"><div>
      <div class="banner-t">${problems.length} thing${problems.length>1?'s':''} to resolve before we can lock this</div>
      <div class="banner-d">Every colourway quantity must equal the sum of its size split.</div>
      <ul class="stack-2" style="margin-top:8px">${problems.map(b => `<li class="t-sm">· ${esc(b.text)}</li>`).join('')}</ul>
    </div></div>` : `<div class="banner banner--go" style="margin-bottom:16px"><div>
      <div class="banner-t">Every quantity balances</div>
      <div class="banner-d">Size splits match their colourway quantities. This is ready to lock.</div></div></div>`}

    <div class="stack">
      ${v.garments.filter(g => g.state === 'approved').map(g => `
        <div class="gcard">
          <div class="gcard-hd">
            <div class="gcard-th">${g.glyph}</div>
            <div style="flex:1">
              <div class="t-h5">${esc(g.name)}</div>
              <div class="mono-ref">Revision ${g.rev} · ${esc(FABRICS[g.fabric].name)} · ${esc(S.personalization[g.pers.method].name)} at ${esc(S.positions_lib[g.pers.pos])}</div>
            </div>
          </div>
          <div class="gcard-b">
            ${g.colourways.map(cw => `
              <div style="padding:12px 0;border-bottom:1px solid var(--line)">
                <div class="row-between">
                  <div class="row"><span class="sw" style="background:${COLOURS[cw.colour].hex}"></span>
                    <span class="t-sm med">${esc(COLOURS[cw.colour].name)}</span></div>
                  <span class="t-sm num">${cw.qty} pieces
                    ${cwSum(cw)===cw.qty?'<span class="sum-ok">· balanced</span>':`<span class="sum-bad">· split is ${cwSum(cw)}</span>`}</span>
                </div>
                <div class="sizes">
                  ${Object.keys(cw.sizes||{}).length ? Object.keys(cw.sizes).map(sz => `
                    <div class="size-f"><span class="size-l">${esc(sz)}</span>
                      <input class="size-i" type="number" min="0" value="${cw.sizes[sz]}"
                        data-act="setSize" data-g="${g.id}" data-cw="${cw.id}" data-s="${esc(sz)}"></div>`).join('')
                    : SIZES.map(sz => `<div class="size-f"><span class="size-l">${sz}</span>
                      <input class="size-i" type="number" min="0" value="0"
                        data-act="setSize" data-g="${g.id}" data-cw="${cw.id}" data-s="${sz}"></div>`).join('')}
                </div>
              </div>`).join('')}
          </div>
        </div>`).join('')}
    </div>

    <div class="card" style="margin-top:24px">
      <div class="eyebrow">Delivery destinations</div>
      <div class="stack-2" style="margin-top:12px">
        ${myAccount().locations.map(l => `<div class="row-between" style="padding:8px 0;border-bottom:1px solid var(--line)">
          <div><div class="t-sm med">${esc(l.name)}</div><div class="t-xs muted">${esc(l.addr)}</div></div>
          <span class="t-sm num">${l.people} people</span></div>`).join('')}
      </div>
    </div>

    <div class="btn-row" style="margin-top:24px">
      <button class="btn btn--primary btn--lg" data-act="approveSpec" data-p="${p.id}" ${problems.length?'disabled':''}>
        Approve the production specification</button>
      ${pf ? `<button class="btn btn--ghost btn--lg" data-go="account:documents">Review the pro forma</button>` : ''}
    </div>
    ${problems.length ? '<p class="t-xs muted" style="margin-top:8px">Resolve the quantities above to enable this.</p>' : ''}
  </section>`;
}

function accWsProduction(p, v){
  return `<section><h2 class="t-h4" style="margin-bottom:12px">Production</h2>
    <div class="card">
      <div class="banner banner--go"><div><div class="banner-t">Specification locked</div>
        <div class="banner-d">Your garments are being manufactured against the snapshot you approved. Changes at this stage affect price and timing and need a new approval.</div></div></div>
      <div class="sep"></div>
      <div class="eyebrow">Confirmed quantities</div>
      <div class="tw" style="margin-top:12px;border:0;box-shadow:none">
        <table class="tbl"><thead><tr><th>Garment</th><th>Colour</th><th class="tnum">Quantity</th><th>State</th></tr></thead>
        <tbody>${v.garments.flatMap(g => g.colourways.map(cw => `<tr>
          <td>${esc(g.name)}</td><td><span class="row"><span class="sw" style="background:${COLOURS[cw.colour].hex}"></span>${esc(COLOURS[cw.colour].name)}</span></td>
          <td class="tnum num">${cw.qty}</td><td>${pill('in_production')}</td></tr>`)).join('')}</tbody></table>
      </div>
      <div class="sep"></div>
      <div class="eyebrow">Milestones</div>
      <div class="feed" style="margin-top:12px">
        ${[['Fabric received and inspected','2026-08-14','done'],
           ['Cutting complete','2026-08-29','done'],
           ['Assembly in progress','2026-09-08','now'],
           ['Quality review','2026-10-02',''],
           ['Ready for dispatch','2026-10-10','']]
          .map(([t,d,s]) => `<div class="fe ${s==='now'?'fe--now':''}">
            <div class="t-sm ${s?'':'muted'}">${t}</div><div class="fe-m">${dateShort(d)}${s==='done'?' · complete':s==='now'?' · in progress':' · estimated'}</div></div>`).join('')}
      </div>
    </div></section>`;
}

function accWsDelivery(p, v){
  const ships = S.shipments.filter(s => s.project === p.id);
  return `<section><h2 class="t-h4" style="margin-bottom:12px">Delivery</h2>
    ${p.completed ? `<div class="banner banner--go" style="margin-bottom:16px"><div>
      <div class="banner-t">Project complete — delivered ${dateShort(p.deliveredOn)}</div>
      <div class="banner-d">${v.garments.filter(g=>g.reorderable).length} approved garments are available to reorder from their archived specifications.</div>
      <div class="btn-row" style="margin-top:12px"><button class="btn btn--primary btn--sm" data-go="account:reorders">Go to Reorders</button></div>
    </div></div>` : ''}
    <div class="card">
      ${ships.length ? ships.map(s => `
        <div class="row-between" style="padding:12px 0;border-bottom:1px solid var(--line);flex-wrap:wrap;gap:8px">
          <div><div class="t-sm med">${esc(s.dest)}</div>
            <div class="t-xs muted">${esc(s.carrier)} · ${esc(s.tracking)} · ${s.pieces} pieces</div></div>
          <div class="row" style="gap:8px">${pill(s.state)}
            <span class="t-xs muted">${dateShort(s.at)}</span></div>
        </div>`).join('') : '<p class="t-sm muted">No shipments yet.</p>'}
      <div class="btn-row" style="margin-top:16px">
        <button class="btn btn--ghost btn--sm" data-act="confirmReceipt">Confirm receipt</button>
        <button class="btn btn--quiet btn--sm" data-act="reportIssue">Report an issue</button>
      </div>
    </div></section>`;
}

/* ---- Reorders ---------------------------------------------------------- */
function accReorders(){
  const items = myReorderables();
  return accShell('reorders', 'Reorders', `
    <div class="page-hd">
      <h1 class="t-h2">Reorders</h1>
      <p class="page-sub">Garments approved and delivered in completed projects. A reorder clones the exact archived production snapshot — the same fabric, colour, artwork position and measurements. We never quietly substitute a newer base.</p>
    </div>
    ${items.length ? `<div class="grid grid-2">${items.map(g => {
      const p = project(g.project);
      return `<div class="card">
        <div class="row" style="align-items:flex-start;gap:16px">
          <div class="gcard-th" style="width:64px;height:80px;font-size:28px">${g.glyph}</div>
          <div style="flex:1;min-width:0">
            <div class="row-between" style="align-items:flex-start">
              <div><div class="t-h5">${esc(g.name)}</div>
                <div class="mono-ref">${base(g.base).ref} · revision ${g.rev} (locked)</div></div>
              ${pill('approved')}
            </div>
            <div class="stack-2" style="margin-top:12px">
              <div class="factline"><span>From</span><span>${esc(p.name)}</span></div>
              <div class="factline"><span>Fabric</span><span>${esc(FABRICS[g.fabric].name)}</span></div>
              <div class="factline"><span>Identity</span><span>${esc(S.personalization[g.pers.method].name)} at ${esc(S.positions_lib[g.pers.pos])}</span></div>
              <div class="factline"><span>Colours</span><span class="row" style="gap:6px">
                ${g.colourways.map(cw => `<span class="sw" style="background:${COLOURS[cw.colour].hex}" title="${esc(COLOURS[cw.colour].name)}"></span>`).join('')}</span></div>
              <div class="factline"><span>Last order</span><span>${g.lastQty} pieces · ${dateShort(g.lastOrdered)}</span></div>
              <div class="factline"><span>Unit price</span><span class="num med">${money(g.unitPrice)}</span></div>
            </div>
          </div>
        </div>
        <div class="btn-row" style="margin-top:16px">
          <button class="btn btn--primary btn--sm" data-act="startReorder" data-g="${g.id}">Reorder this garment</button>
          <span class="t-xs faint">Lead time confirmed on quote</span>
        </div>
      </div>`;}).join('')}</div>`
      : `<div class="empty"><div class="empty-t">Nothing to reorder yet</div>
         <div class="empty-d">When a project is delivered, its approved garments appear here and stay available at their archived specification.</div></div>`}

    ${S.reorders.length ? `
    <section style="margin-top:32px">
      <h2 class="t-h4" style="margin-bottom:12px">Reorder history</h2>
      <div class="tw"><table class="tbl">
        <thead><tr><th>Garment</th><th>Submitted</th><th class="tnum">Pieces</th><th class="tnum">Value</th><th>Status</th></tr></thead>
        <tbody>${S.reorders.filter(r => r.account === myAccount().id).map(r => `<tr>
          <td>${esc(garment(r.garment).name)}</td><td>${dateShort(r.at)}</td>
          <td class="tnum num">${r.qty}</td><td class="tnum num">${money(r.value)}</td>
          <td>${pill(r.state)}</td></tr>`).join('')}</tbody></table></div>
    </section>` : ''}
  `);
}

/* ---- Merchandise (customer side) --------------------------------------- */
function accMerch(){
  const acc = myAccount();
  const qs = S.merchQuotes.filter(q => q.account === acc.id || !q.account);
  return accShell('merchandise', 'Merchandise', `
    <div class="page-hd"><h1 class="t-h2">Merchandise</h1>
      <p class="page-sub">Quote requests, approved products and orders for ${esc(acc.name)}.</p></div>
    ${qs.length ? `
      <h2 class="t-h4" style="margin-bottom:12px">Quote requests</h2>
      <div class="stack-3">${qs.map(q => `
        <div class="card">
          <div class="row-between" style="align-items:flex-start;flex-wrap:wrap;gap:8px">
            <div><div class="t-h5">${q.qty} × ${esc(q.productName)}</div>
              <div class="mono-ref">${esc(q.ref||'')} · ${esc(q.colourName)} · requested ${dateTime(q.at)}</div></div>
            <div class="row" style="gap:8px">${pillMerch('Merchandise')}${pill(q.state)}</div>
          </div>
          <div class="stack-2" style="margin-top:12px">
            ${(q.placements||[]).map((pl,i) => `<div class="factline">
              <span>Placement ${i+1}</span>
              <span>${esc(pl.posName)} — ${esc(pl.methodName)}, ${esc(pl.size)}${
                pl.method==='screen'?', '+pl.colours+' colour'+(pl.colours>1?'s':''):''}${
                pl.art?' · '+esc(pl.art):' · artwork to follow'}</span></div>`).join('')}
            ${q.total ? `<div class="factline"><span>Indicative</span><span class="num med">${money(q.total)}</span></div>` : ''}
          </div>
        </div>`).join('')}</div>
      <p class="t-xs muted" style="margin-top:16px">Requests you send from the merchandise website appear here and in our studio at the same moment — it is one record, not two.</p>`
    : `<div class="empty">
        <div class="empty-t">No merchandise activity yet</div>
        <div class="empty-d">Browse the catalogue and send us a quote request. You will stay signed in, and what we already know about ${esc(acc.name)} is carried into the request.</div>
        <button class="btn btn--primary" data-act="toMerch">Browse merchandise</button>
      </div>`}
  `);
}

/* ---- Documents --------------------------------------------------------- */
function accDocuments(){
  const acc = myAccount();
  const tab = UI.docTab || 'Overview';
  const all = S.documents.filter(d => d.account === acc.id && d.visible);
  const tabs = ['Overview','Payment terms','Pro forma','Invoice','Contract'];
  const list = tab === 'Overview' ? all : all.filter(d => d.type === tab);
  const needs = all.filter(d => ['payment_due','overdue','signature_required'].includes(d.state));
  const canPay = can(user(SESSION.user),'payments','act');

  const row = (d) => `
    <div class="rw rw--static" style="align-items:flex-start">
      ${['overdue'].includes(d.state) ? '<span class="rw-flag rw-flag--stop"></span>' :
        ['payment_due','signature_required'].includes(d.state) ? '<span class="rw-flag rw-flag--wait"></span>' : ''}
      <span class="rw-main">
        <span class="rw-t">${esc(d.title)}</span>
        <span class="rw-s">${d.num} · ${esc(d.type)} · issued ${dateShort(d.issued)}${d.due?` · due ${dateShort(d.due)}`:''}${d.project?` · ${esc(project(d.project).name)}`:''}</span>
      </span>
      <span class="rw-side">
        ${d.amount ? `<span class="t-sm num med">${money(d.amount, acc.currency)}</span>` : ''}
        ${pill(d.state)}
        <button class="btn btn--ghost btn--sm" data-act="openDoc" data-id="${d.id}">Open</button>
      </span>
    </div>`;

  return accShell('documents', 'Documents', `
    <div class="page-hd"><h1 class="t-h2">Documents</h1>
      <p class="page-sub">Every commercial and legal record on this account. Issued documents are corrected by a new version or a credit note — never overwritten.</p></div>
    <div class="tabs" style="margin-bottom:20px">
      ${tabs.map(t => `<button class="tab ${tab===t?'tab--on':''}" data-act="docTab" data-t="${esc(t)}">${t}${t==='Overview'&&needs.length?` (${needs.length})`:''}</button>`).join('')}
    </div>

    ${tab === 'Overview' && needs.length ? `
      <h2 class="t-h4" style="margin-bottom:12px">Needs attention</h2>
      <div class="rows" style="margin-bottom:24px">${needs.map(row).join('')}</div>
      <h2 class="t-h4" style="margin-bottom:12px">All documents</h2>` : ''}

    ${list.length ? `<div class="rows">${list.map(row).join('')}</div>`
      : `<div class="empty"><div class="empty-t">Nothing here</div>
         <div class="empty-d">No ${esc(tab.toLowerCase())} documents on this account yet.</div></div>`}

    ${!canPay ? '<p class="t-xs muted" style="margin-top:16px">Payment actions are hidden for your role. Your account administrator can act on invoices.</p>' : ''}
  `);
}

/* ---- Messages ---------------------------------------------------------- */
function accMessages(){
  const acc = myAccount();
  const cvs = S.conversations.filter(c => c.account === acc.id);
  const openId = UI.openCv || (cvs[0] && cvs[0].id);
  const cv = by(S.conversations, openId);
  return accShell('messages', 'Messages', `
    <div class="page-hd"><h1 class="t-h2">Messages</h1>
      <p class="page-sub">One conversation per project. We reply here, and email you a pointer rather than reproducing project detail in your inbox.</p></div>
    <div class="cols">
      <div class="card">
        ${cv ? `
          <div class="row-between" style="margin-bottom:16px">
            <div><div class="t-h5">${esc(project(cv.project).name)}</div>
              <div class="mono-ref">${project(cv.project).ref}</div></div>
            ${pill(cv.state === 'needs_reply' ? 'waiting_pamuuc' : 'waiting_customer')}
          </div>
          ${cv.messages.filter(m=>!m.internal).map(m => `
            <div class="msg">
              <span class="av ${user(m.by).side==='studio'?'av--studio':''}">${user(m.by).init}</span>
              <div class="msg-b">
                <div class="msg-h"><span class="msg-a">${esc(user(m.by).name)}</span>
                  <span class="msg-r">${user(m.by).side==='studio'?'PAMUUC':esc(acc.name)} · ${dateTime(m.at)}</span></div>
                <div class="msg-t">${esc(m.text)}</div></div>
            </div>`).join('')}
          <div style="margin-top:16px">
            <textarea class="inp" id="msgbox" placeholder="Write a message…"></textarea>
            <div class="btn-row" style="margin-top:8px;justify-content:flex-end">
              <button class="btn btn--primary btn--sm" data-act="send" data-cv="${cv.id}">Send</button></div>
          </div>` : '<div class="empty"><div class="empty-t">No conversations</div></div>'}
      </div>
      <div class="stack-2">
        ${cvs.map(c => `<button class="card" data-act="openCv" data-id="${c.id}"
          style="text-align:left;cursor:pointer;${c.id===openId?'border-color:var(--navy)':''}">
          <div class="row-between"><span class="t-sm med">${esc(project(c.project).name)}</span>
            ${c.state==='needs_reply'?'<span class="dot"></span>':''}</div>
          <div class="t-xs muted" style="margin-top:4px">${c.messages.filter(m=>!m.internal).length} messages · ${ago(c.messages[c.messages.length-1]?.at)}</div>
        </button>`).join('')}
      </div>
    </div>
  `);
}

/* ---- Notifications ------------------------------------------------------ */
function accNotifications(){
  const ns = S.notifications.filter(n => n.to === 'customer');
  const filt = UI.nFilter || 'All';
  const list = filt === 'All' ? ns : filt === 'Action required' ? ns.filter(n=>n.action) : ns.filter(n=>!n.action);
  return accShell('notifications', 'Notifications', `
    <div class="page-hd"><div class="row-between">
      <div><h1 class="t-h2">Notifications</h1>
        <p class="page-sub">Action required is separated from updates on purpose. A badge appears only when something is genuinely waiting on you.</p></div>
      <button class="btn btn--ghost btn--sm" data-act="markRead">Mark all read</button>
    </div></div>
    <div class="tabs" style="margin-bottom:20px">
      ${['All','Action required','Updates'].map(t => `<button class="tab ${filt===t?'tab--on':''}" data-act="nFilter" data-t="${t}">${t}</button>`).join('')}
    </div>
    ${list.length ? `<div class="rows">${list.map(n => `
      <button class="rw" ${n.project?`data-go="account:project:${n.project}"`:''}>
        ${n.action ? '<span class="rw-flag rw-flag--wait"></span>' : ''}
        <span class="rw-main">
          <span class="rw-t">${esc(n.text)}</span>
          <span class="rw-s">${dateTime(n.at)}${n.project?' · '+esc(project(n.project).name):''}</span>
        </span>
        <span class="rw-side">
          ${n.action ? pill('waiting_customer') : pill('published')}
          ${!n.read ? '<span class="dot"></span>' : ''}
        </span></button>`).join('')}</div>`
      : '<div class="empty"><div class="empty-t">Nothing here</div><div class="empty-d">You are up to date.</div></div>'}
  `);
}

/* ---- Settings / team ---------------------------------------------------- */
function accSettings(){
  const acc = myAccount();
  const u = user(SESSION.user);
  const team = S.users.filter(x => x.account === acc.id);
  const isAdmin = can(u,'customer_team','manage');
  return accShell('settings', 'Team & settings', `
    <div class="page-hd"><h1 class="t-h2">Team &amp; settings</h1>
      <p class="page-sub">Who at ${esc(acc.name)} can see and do what.</p></div>
    <div class="cols">
      <div class="stack-6">
        <section>
          <div class="row-between" style="margin-bottom:12px">
            <h2 class="t-h4">People</h2>
            ${isAdmin ? '<button class="btn btn--ghost btn--sm" data-act="inviteUser">Invite someone</button>' : ''}
          </div>
          <div class="rows">
            ${team.map(x => `<div class="rw rw--static">
              <span class="av">${x.init}</span>
              <span class="rw-main"><span class="rw-t">${esc(x.name)}${x.id===u.id?' <span class="chip">You</span>':''}</span>
                <span class="rw-s">${esc(x.title)} · ${ROLE_NAMES[x.role]}</span></span>
              <span class="rw-side">
                <span class="t-xs muted">${x.role==='cust_admin'?'All company projects':`${(x.projects||[]).length} project`}</span>
                ${isAdmin && x.id!==u.id ? '<button class="btn btn--quiet btn--sm">Manage</button>' : ''}
              </span></div>`).join('')}
          </div>
          ${!isAdmin ? '<p class="t-xs muted" style="margin-top:12px">Only an account administrator can invite or manage people.</p>' : ''}
        </section>
        <section>
          <h2 class="t-h4" style="margin-bottom:12px">Locations</h2>
          <div class="rows">${acc.locations.map(l => `<div class="rw rw--static">
            <span class="rw-main"><span class="rw-t">${esc(l.name)}</span><span class="rw-s">${esc(l.addr)}</span></span>
            <span class="rw-side"><span class="t-sm num">${l.people} people</span></span></div>`).join('')}</div>
        </section>
      </div>
      <div class="stack">
        <div class="card">
          <div class="eyebrow">Account</div>
          <dl class="kv" style="margin-top:12px">
            <dt>Company</dt><dd>${esc(acc.name)}</dd>
            <dt>Customer since</dt><dd>${dateShort(acc.since)}</dd>
            <dt>Account Manager</dt><dd>${esc(user(acc.am).name)}</dd>
            <dt>Payment terms</dt><dd>${esc(acc.terms)}</dd>
            <dt>Currency</dt><dd>${acc.currency}</dd>
            <dt>VAT</dt><dd class="num">${esc(acc.vat)}</dd>
          </dl>
          <p class="t-xs muted" style="margin-top:12px">Payment terms and modules are set by PAMUUC. Ask ${esc(user(acc.am).name)} to change them.</p>
        </div>
        <div class="card">
          <div class="eyebrow">What you can see</div>
          <div class="stack-2" style="margin-top:12px">
            ${Object.entries(acc.modules).map(([k,on]) => `<div class="row-between">
              <span class="t-sm">${k[0].toUpperCase()+k.slice(1)}</span>
              ${on ? pill('active') : pill('hidden')}</div>`).join('')}
          </div>
        </div>
      </div>
    </div>
  `);
}
