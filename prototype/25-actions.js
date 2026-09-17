/* ============================================================================
   PAMUUC SUITE — actions
   The ONLY place state is mutated. Every action emits exactly one event,
   and the event decides activity, notification, task and audit.
   ========================================================================= */
const act = {

  /* ---- public → studio ------------------------------------------------- */
  submitInquiry(answers, verdict){
    const n = 149 + S.inquiries.filter(i => i.ref.startsWith('INQ-01') && +i.ref.slice(4) >= 149).length;
    const inq = {
      id:uid('inq'), ref:'INQ-0'+n, company:answers['Company'] || 'Unnamed company',
      contact:answers['Contact name'] || '—', email:answers['Email'] || '—',
      type:'Custom uniforms', country:answers['Country'] || 'Spain',
      sector:answers['Establishment'] || '—', people:answers['People to dress'] || '—',
      submitted:nowStamp(), state:'submitted', reviewer:null,
      scope:answers['What is not working'] ? [].concat(answers['What is not working']).join(', ') : '—',
      establishment:answers['Establishment'] || '—',
      role:answers['Role'] || '—', authority:answers['Authority'] || '—',
      vat:answers['VAT checked'] || '', vatStatus:answers['VAT status'] || 'unknown',
      designs:answers['Designs'] || '—',
      qualification:verdict || null,
      answers, files:answers.__files || [],
    };
    S.inquiries.unshift(inq);
    emit('inquiry.submitted', {
      text:`Inquiry ${inq.ref} submitted by ${inq.company}`,
      notify:'studio', kind:'action', actionRequired:true,
      notifyText:`New inquiry ${inq.ref} from ${inq.company} — qualification review`,
      audit:'Inquiry created', record:inq.ref, now:'submitted', actor:'u_leo',
    });
    save();
    return inq;
  },

  qualifyInquiry(id, decision, reason){
    const i = by(S.inquiries, id); if(!i) return;
    const was = i.state;
    if(decision === 'accept'){ i.state = 'qualified'; i.reviewer = i.reviewer || SESSION.user; }
    if(decision === 'decline'){ i.state = 'archived'; i.declineReason = reason || 'Not a fit at this time.'; }
    if(decision === 'more_info'){ i.state = 'clarification'; }
    emit('inquiry.qualified', {
      text:`Inquiry ${i.ref} — ${st(i.state).label}`,
      notify:'studio', kind:'update', notifyText:`${i.ref} moved to ${st(i.state).label}`,
      audit:'Inquiry qualification', record:i.ref, was, now:i.state, reason:reason || null,
    });
    save();
  },

  scheduleCall(id, when){
    const i = by(S.inquiries, id); if(!i) return;
    const was = i.state; i.state = 'call_scheduled'; i.callAt = when;
    emit('inquiry.call_scheduled', {text:`First discovery call scheduled for ${i.company}`,
      audit:'First call scheduled', record:i.ref, was, now:'call_scheduled'});
    save();
  },

  completeCall(id, notes){
    const i = by(S.inquiries, id); if(!i) return;
    const was = i.state; i.state = 'ready_account'; i.discovery = notes;
    emit('inquiry.call_done', {
      text:`Discovery completed for ${i.company} — ready for account and project`,
      notify:'studio', kind:'action', actionRequired:true,
      notifyText:`${i.ref} is ready for an account and project`,
      audit:'Discovery recorded', record:i.ref, was, now:'ready_account'});
    save();
  },

  activateAccount(id){
    const i = by(S.inquiries, id); if(!i) return;
    const acc = {
      id:uid('acc'), name:i.company, country:i.country, city:'—',
      since:S.today, am:i.reviewer || 'u_nuria', status:'active',
      terms:'30 days from invoice date', currency:'EUR', vat:'—',
      locations:[], modules:{projects:true,reorders:true,merchandise:true,documents:true,payments:true},
      balance:0, fromInquiry:i.ref,
    };
    S.accounts.push(acc);
    i.state = 'converted'; i.accountId = acc.id;
    emit('account.activated', {account:acc.id,
      text:`Customer account activated for ${acc.name}`,
      notify:'studio', kind:'update', notifyText:`Account activated: ${acc.name}`,
      audit:'Account activated', record:acc.name, was:'—', now:'active'});
    save();
    return acc;
  },

  /* ---- studio project builder ------------------------------------------ */
  createProject(d){
    const n = 2460 + S.projects.length;
    const p = {
      id:uid('prj'), ref:'PRJ-'+n, account:d.account, name:d.name,
      am:d.am || SESSION.user, owner:SESSION.user,
      stages:d.design ? ['design','development','prototype_fitting','pre_production','production','delivery']
                      : ['development','prototype_fitting','pre_production','production','delivery'],
      stage:d.design ? 'design' : 'development', opStatus:'not_started', risk:null,
      published:false, version:0, publishedAt:null, draftDirty:true,
      created:S.today, target:d.target || null, brief:d.brief || '',
      gates:{design_fee:d.design?'draft':'not_required', development_invoice:'draft', production_proforma:'not_required'},
      positions:(d.positions||[]).map((pos,ix) => ({
        id:uid('pos'), name:pos.name, people:+pos.people||0, garments:[]})),
      nextMilestone:null, lastUpdate:nowStamp(),
    };
    /* attach garments chosen in the builder */
    (d.positions||[]).forEach((pos, ix) => {
      (pos.garments||[]).forEach(bid => {
        const b = base(bid); if(!b) return;
        const g = {
          id:uid('g'), project:p.id, position:p.positions[ix].id, base:b.id, baseV:b.v,
          name:b.name, rev:1, state:'in_development', round:0,
          fabric:b.fabrics[0], pers:{method:b.pers[0], pos:b.pos[0], art:null},
          colourways:[{id:uid('cw'), colour:b.colours[0], qty:0, sizes:{}}],
          reorderable:false, glyph:b.glyph, notes:'',
        };
        S.garments.push(g);
        p.positions[ix].garments.push(g.id);
      });
    });
    S.projects.push(p);
    S.conversations.push({id:uid('cv'), account:p.account, project:p.id,
      owner:p.owner, state:'waiting_pamuuc', messages:[]});
    emit('project.created', {project:p.id, account:p.account,
      text:`Project ${p.ref} created`, customerVisible:false,
      notify:'studio', kind:'update', notifyText:`Project ${p.ref} — ${p.name} created`,
      audit:'Project created', record:p.ref, was:'—', now:'draft'});
    save();
    return p;
  },

  publishProject(id){
    const p = project(id); if(!p) return;
    const was = p.version;
    p.version += 1; p.published = true; p.publishedAt = nowStamp();
    p.draftDirty = false; p.lastUpdate = nowStamp();
    if(p.opStatus === 'not_started') p.opStatus = 'in_progress';
    emit('project.published', {project:p.id, account:p.account,
      text:`Version ${p.version} published to the customer`,
      notify:'customer', kind:'update',
      notifyText:`${p.name}: version ${p.version} is now available`,
      audit:'Published version', record:p.ref, was:String(was), now:String(p.version)});
    toast('Published', `${p.ref} version ${p.version} is now visible to the customer.`);
    save();
  },

  advanceStage(id, reason){
    const p = project(id); if(!p) return;
    const ns = nextStage(p); if(!ns) return;
    const blockers = gateBlockers(p);
    const was = p.stage;
    p.stage = ns; p.lastUpdate = nowStamp();
    p.opStatus = ns === 'delivery' ? 'in_progress' : 'in_progress';
    if(ns === 'pre_production') p.gates.production_proforma = 'draft';
    emit('project.stage', {project:p.id, account:p.account,
      text:`Stage advanced: ${stageDef(was).name} → ${stageDef(ns).name}` + (reason ? ' (override)' : ''),
      notify:'customer', kind:'update',
      notifyText:`${p.name} has moved to ${stageDef(ns).name}`,
      audit: reason ? 'Stage override' : 'Stage advanced', record:p.ref, was, now:ns, reason:reason || null});
    toast('Stage advanced', `${p.ref} is now in ${stageDef(ns).name}.` +
      (blockers.length && reason ? ' Gate overridden and recorded.' : ''));
    save();
  },

  /* ---- customer change requests ---------------------------------------- */
  submitChangeRequest(cr){
    const rec = Object.assign({id:uid('cr'), by:SESSION.user, at:nowStamp(),
      state:'submitted', owner:project(cr.project).am}, cr);
    S.changeRequests.unshift(rec);
    emit('cr.submitted', {project:rec.project, account:rec.account,
      text:`Change request submitted: ${rec.title}`,
      notify:'studio', kind:'action', actionRequired:true,
      notifyText:`${account(rec.account).name}: ${rec.title}`,
      audit:'Change request created', record:rec.id, was:'—', now:'submitted'});
    toast('Request submitted', 'PAMUUC will review it. Nothing has changed in your approved specification.');
    save();
    return rec;
  },

  decideChangeRequest(id, outcome, note){
    const cr = by(S.changeRequests, id); if(!cr) return;
    const was = cr.state;
    cr.state = outcome; cr.decidedAt = nowStamp(); cr.decidedBy = SESSION.user; cr.outcome = note || '';
    emit('cr.decided', {project:cr.project, account:cr.account,
      text:`Change request ${st(outcome).label.toLowerCase()}: ${cr.title}`,
      notify:'customer', kind:outcome === 'declined' ? 'update' : 'update',
      notifyText:`Your request "${cr.title}" was ${st(outcome).label.toLowerCase()}`,
      audit:'Change request decided', record:cr.id, was, now:outcome, reason:note || null});
    toast('Decision recorded', outcome === 'declined'
      ? 'The approved specification is unchanged.'
      : 'Now incorporate it into a new revision to make it real.');
    save();
  },

  incorporateChangeRequest(id){
    const cr = by(S.changeRequests, id); if(!cr) return;
    const was = cr.state; cr.state = 'incorporated';
    const p = project(cr.project);
    if(cr.garment){
      const g = garment(cr.garment);
      if(g){
        g.rev += 1;
        /* apply the one structural change this fixture knows how to apply */
        if(cr.applyColourway){
          const existing = g.colourways.find(c => c.colour === cr.applyColourway.colour);
          if(existing){ existing.qty = cr.applyColourway.qty; }
          else g.colourways.push({id:uid('cw'), colour:cr.applyColourway.colour,
            qty:cr.applyColourway.qty, sizes:{}});
        }
      }
    }
    if(cr.applyPositionName){
      const pos = p.positions.find(x => x.name === cr.applyPositionName.was);
      if(pos) pos.name = cr.applyPositionName.now;
    }
    p.draftDirty = true; p.lastUpdate = nowStamp();
    emit('cr.incorporated', {project:cr.project, account:cr.account,
      text:`Incorporated into a new revision: ${cr.title}`,
      notify:'studio', kind:'update', notifyText:`${cr.title} incorporated — publish to make it visible`,
      audit:'Change request incorporated', record:cr.id, was, now:'incorporated'});
    toast('Incorporated', 'A new revision exists. Publish the project to show it to the customer.');
    save();
  },

  /* ---- approvals -------------------------------------------------------- */
  decideApproval(id, decision, comment){
    const a = by(S.approvals, id); if(!a) return;
    const was = a.state;
    a.state = decision === 'approve' ? 'approved' : 'changes_requested';
    a.decidedAt = nowStamp(); a.decidedBy = SESSION.user; a.comment = comment || '';
    emit('approval.decided', {project:a.project, account:a.account,
      text:`${a.kind} — ${st(a.state).label.toLowerCase()} by ${user(SESSION.user).name}`,
      notify:'studio', kind:'action', actionRequired:decision !== 'approve',
      notifyText:`${account(a.account).name} ${decision === 'approve' ? 'approved' : 'requested changes on'}: ${a.kind}`,
      audit:'Approval decided', record:a.id, was, now:a.state, reason:comment || null});
    toast(decision === 'approve' ? 'Approved' : 'Changes requested',
      decision === 'approve' ? 'Recorded against this exact revision.' : 'PAMUUC has been notified.');
    save();
  },

  /* ---- prototypes: state and round belong to the GARMENT ---------------- */
  approveGarment(id, note){
    const g = garment(id); if(!g) return;
    const was = g.state;
    g.state = 'approved'; g.approvedAt = S.today;
    (g.feedback = g.feedback || []).push({by:SESSION.user, at:nowStamp(), text:note || 'Approved as sampled.', decision:'approved'});
    const p = project(g.project);
    /* close the matching approval record */
    const a = S.approvals.find(x => x.target === g.id && x.state === 'awaiting_customer');
    if(a){ a.state = 'approved'; a.decidedAt = nowStamp(); a.decidedBy = SESSION.user; }
    emit('garment.approved', {project:g.project, account:p.account,
      text:`${g.name} approved at round ${g.round} — locked at revision ${g.rev}`,
      notify:'studio', kind:'update', notifyText:`${g.name} approved by the customer`,
      audit:'Garment approved', record:g.id, was, now:'approved'});
    toast('Garment approved', `${g.name} is locked at revision ${g.rev}. Other garments are unaffected.`);
    save();
  },

  requestGarmentChanges(id, text){
    const g = garment(id); if(!g) return;
    const p = project(g.project);
    const was = g.state;
    (g.feedback = g.feedback || []).push({by:SESSION.user, at:nowStamp(), text, decision:'changes'});
    if(g.round >= 3){
      g.state = 'manual_resolution';
      emit('garment.round_limit', {project:g.project, account:p.account,
        text:`${g.name} reached round 3 without approval — manual resolution required`,
        notify:'studio', kind:'action', actionRequired:true,
        notifyText:`ROUND LIMIT: ${g.name} on ${p.ref} needs a Master decision`,
        audit:'Round limit reached', record:g.id, was, now:'manual_resolution'});
      toast('We will contact you', 'This garment has reached its third round. PAMUUC will call you about it directly.');
    } else {
      g.state = 'changes_requested';
      emit('garment.changes', {project:g.project, account:p.account,
        text:`${g.name}: changes requested — a new round will be authorised`,
        notify:'studio', kind:'action', actionRequired:true,
        notifyText:`${g.name} needs another prototype round`,
        audit:'Garment changes requested', record:g.id, was, now:'changes_requested'});
      toast('Feedback recorded', 'Approved garments are unaffected — only this one goes back into development.');
    }
    p.lastUpdate = nowStamp();
    save();
  },

  authoriseRound(id){
    const g = garment(id); if(!g) return;
    if(g.round >= 3) return;
    const was = g.round;
    g.round += 1; g.rev += 1; g.state = 'in_development';
    emit('garment.round', {project:g.project, account:project(g.project).account,
      text:`${g.name}: prototype round ${g.round} authorised (revision ${g.rev})`,
      notify:'customer', kind:'update', notifyText:`A new sample of ${g.name} is being made`,
      audit:'Prototype round authorised', record:g.id, was:String(was), now:String(g.round)});
    toast('Round authorised', `${g.name} is now at round ${g.round} of a maximum of 3.`);
    save();
  },

  readyForFitting(id){
    const g = garment(id); if(!g) return;
    const was = g.state; g.state = 'feedback_required';
    emit('garment.ready', {project:g.project, account:project(g.project).account,
      text:`${g.name}: sample ready, fitting feedback requested`,
      notify:'customer', kind:'action', actionRequired:true,
      notifyText:`Fitting feedback needed on ${g.name}`,
      audit:'Garment state changed', record:g.id, was, now:'feedback_required'});
    save();
  },

  resolveException(id, resolution, reason){
    const g = garment(id); if(!g) return;
    const was = g.state;
    if(resolution === 'exception'){ g.state = 'approved'; g.approvedAt = S.today; }
    if(resolution === 'drop'){ g.state = 'superseded'; g.dropped = true; }
    if(resolution === 'requote'){ g.state = 'in_development'; g.round = 1; g.rev += 1; g.requoted = true; }
    emit('garment.resolved', {project:g.project, account:project(g.project).account,
      text:`${g.name}: Master resolution — ${resolution}`,
      notify:'customer', kind:'update', notifyText:`We have a way forward on ${g.name}`,
      audit:'Master resolution', record:g.id, was, now:g.state, reason});
    toast('Resolution recorded', 'The project can advance once every other garment is approved.');
    save();
  },

  /* ---- meetings --------------------------------------------------------- */
  acceptSlot(id, slot){
    const m = by(S.meetings, id); if(!m) return;
    const was = m.state; m.state = 'accepted'; m.chosen = slot;
    emit('meeting.accepted', {project:m.project, account:m.account,
      text:`Fitting confirmed for ${dateTime(slot)}`,
      notify:'studio', kind:'update', notifyText:`Customer accepted ${dateTime(slot)} for ${m.kind}`,
      audit:'Meeting accepted', record:m.id, was, now:'accepted'});
    toast('Date confirmed', dateTime(slot) + ' — the other proposed times are now closed.');
    save();
  },

  requestAlternative(id, note){
    const m = by(S.meetings, id); if(!m) return;
    const was = m.state; m.state = 'alternative'; m.note = note;
    emit('meeting.alternative', {project:m.project, account:m.account,
      text:'Customer asked for a different fitting date',
      notify:'studio', kind:'action', actionRequired:true,
      notifyText:'A different fitting date was requested',
      audit:'Meeting alternative requested', record:m.id, was, now:'alternative', reason:note});
    toast('Sent', 'Your original proposals are kept. PAMUUC will propose new times.');
    save();
  },

  /* ---- documents and payments ------------------------------------------ */
  approveDocument(id){
    const d = doc(id); if(!d) return;
    const was = d.state; d.state = 'payment_due'; d.approvedAt = nowStamp();
    emit('doc.approved', {project:d.project, account:d.account,
      text:`${d.num} approved by ${user(SESSION.user).name}`,
      notify:'studio', kind:'update', notifyText:`${d.num} approved — payment now due`,
      audit:'Document approved', record:d.num, was, now:'payment_due'});
    save();
  },

  payDocument(id){
    const d = doc(id); if(!d) return;
    const was = d.state; d.state = 'paid'; d.paidAt = nowStamp();
    const p = d.project ? project(d.project) : null;
    if(p){
      if(/Development/i.test(d.title)) p.gates.development_invoice = 'paid';
      if(d.type === 'Pro forma')       p.gates.production_proforma = 'paid';
      p.lastUpdate = nowStamp();
    }
    const acc = account(d.account); if(acc) acc.balance = Math.max(0, acc.balance - (d.amount||0));
    /* close the matching approval */
    const a = S.approvals.find(x => x.target === d.id && x.state === 'awaiting_customer');
    if(a){ a.state = 'approved'; a.decidedAt = nowStamp(); a.decidedBy = SESSION.user; }
    emit('doc.paid', {project:d.project, account:d.account,
      text:`${d.num} recorded as paid — ${money(d.amount)}`,
      notify:'studio', kind:'update', notifyText:`Payment recorded: ${d.num}`,
      audit:'Payment recorded', record:d.num, was, now:'paid'});
    toast('Payment recorded', p ? 'The commercial gate on ' + p.ref + ' is now open.' : 'Thank you.');
    save();
  },

  publishDocument(id){
    const d = doc(id); if(!d) return;
    const was = d.state;
    d.visible = true; d.state = 'payment_due'; d.issued = S.today;
    if(!d.due){ const dt = new Date(S.today); dt.setDate(dt.getDate()+30); d.due = dt.toISOString().slice(0,10); }
    emit('doc.published', {project:d.project, account:d.account,
      text:`${d.num} published to the customer`,
      notify:'customer', kind:'action', actionRequired:true,
      notifyText:`${d.title} is ready for your approval`,
      audit:'Document published', record:d.num, was, now:d.state});
    toast('Published', d.num + ' is now visible in the customer account.');
    save();
  },

  /* ---- garment editing (customer draft → request, studio → direct) ----- */
  setColourwayQty(gid, cwid, qty){
    const g = garment(gid); if(!g) return;
    const cw = g.colourways.find(c => c.id === cwid); if(!cw) return;
    cw.qty = Math.max(0, +qty||0);
    project(g.project).draftDirty = true;
  },
  setSize(gid, cwid, size, n){
    const g = garment(gid); if(!g) return;
    const cw = g.colourways.find(c => c.id === cwid); if(!cw) return;
    cw.sizes = cw.sizes || {}; cw.sizes[size] = Math.max(0, +n||0);
    project(g.project).draftDirty = true;
  },
  addColourway(gid, colour){
    const g = garment(gid); if(!g) return;
    if(g.colourways.some(c => c.colour === colour)) return;
    g.colourways.push({id:uid('cw'), colour, qty:0, sizes:{}});
    project(g.project).draftDirty = true;
  },
  removeColourway(gid, cwid){
    const g = garment(gid); if(!g) return;
    g.colourways = g.colourways.filter(c => c.id !== cwid);
    project(g.project).draftDirty = true;
  },
  setFabric(gid, fid){
    const g = garment(gid); if(!g) return;
    const was = g.fabric; g.fabric = fid;
    emit('garment.fabric', {project:g.project, account:project(g.project).account,
      text:`${g.name}: fabric changed to ${FABRICS[fid].name}`,
      audit:'Fabric changed', record:g.id, was:FABRICS[was]?.name, now:FABRICS[fid].name});
    save();
  },

  /* ---- reorders --------------------------------------------------------- */
  submitReorder(gid, lines, dest){
    const g = garment(gid); if(!g) return;
    const qty = lines.reduce((t,l)=>t+(+l.qty||0),0);
    const r = {id:uid('ro'), account:user(SESSION.user).account, garment:gid,
      at:nowStamp(), qty, state:'submitted', lines, dest,
      value:qty * (g.unitPrice||0), sourceRev:g.rev};
    S.reorders.unshift(r);
    emit('reorder.submitted', {account:r.account, project:g.project,
      text:`Reorder submitted: ${qty} × ${g.name} from the approved revision ${g.rev} snapshot`,
      notify:'studio', kind:'action', actionRequired:true,
      notifyText:`Reorder request: ${qty} × ${g.name}`,
      audit:'Reorder submitted', record:r.id, was:'—', now:'submitted'});
    toast('Reorder submitted', `Cloned from the locked revision ${g.rev} specification — no substitutions.`);
    save();
    return r;
  },

  /* ---- merchandise ------------------------------------------------------ */
  submitMerchQuote(q){
    const rec = Object.assign({id:uid('mq'), at:nowStamp(), state:'submitted'}, q);
    S.merchQuotes.unshift(rec);
    emit('merch.quote', {account:rec.account || null,
      text:`Merchandise quote requested: ${rec.qty} × ${rec.productName}`,
      notify:'studio', kind:'action', actionRequired:true,
      notifyText:`Merchandise quote: ${rec.qty} × ${rec.productName}`,
      audit:'Merchandise quote requested', record:rec.id, was:'—', now:'submitted'});
    save();
    return rec;
  },

  /* ---- catalogue import ------------------------------------------------- */
  importCatalogue(v){
    const products = catalogueToProducts(v);
    const before = S.merchProducts.length;
    S.merchProducts = products;
    S.decoRates = catalogueToRates(v);
    emit('merch.imported', {
      text:`Merchandise catalogue imported — ${products.length} products, ` +
        `${v.byType.variant.length} variants, ${v.byType.image.length} images`,
      customerVisible:false,
      notify:'studio', kind:'update',
      notifyText:`Catalogue replaced: ${products.length} products imported from CSV`,
      audit:'Catalogue imported', record:'merchandise',
      was:`${before} products`, now:`${products.length} products`,
      reason:`${v.warnings} warning${v.warnings===1?'':'s'} accepted`});
    /* the import is one audit entry, not one per row — §6.13 */
    S.audit[0].source = 'import';
    toast('Catalogue imported',
      `${products.length} products are now live on the public catalogue and in every customer account.`);
    save();
  },

  /* ---- self-serve merchandise account -----------------------------------
     Merchandise opens an account immediately. A custom uniform project still
     requires qualification and a first call — the two are deliberately not
     the same gate. */
  openMerchAccount(company, email){
    const acc = {
      id:uid('acc'), name:company, country:'Spain', city:'—', since:S.today,
      am:'u_nuria', status:'active', terms:'30 days from invoice date',
      currency:'EUR', vat:'—', locations:[],
      modules:{projects:false, reorders:false, merchandise:true, documents:true, payments:true},
      balance:0, selfServe:true,
    };
    S.accounts.push(acc);
    const u = {id:uid('u'), name:email.split('@')[0], role:'cust_admin',
      title:'Account Admin', init:email.slice(0,2).toUpperCase(), side:'customer', account:acc.id};
    S.users.push(u);
    S.merchQuotes.filter(q => !q.account).forEach(q => { q.account = acc.id; });
    SESSION = {user:u.id};
    emit('account.merch', {account:acc.id,
      text:`Merchandise account opened by ${email}`,
      notify:'studio', kind:'update', notifyText:`New merchandise account: ${company}`,
      audit:'Merchandise account opened', record:company, was:'—', now:'active'});
    toast('Account created', 'Your quote request is waiting in Merchandise.');
    save();
    return acc;
  },

  /* ---- conversation ----------------------------------------------------- */
  sendMessage(cvid, text, internal){
    const cv = by(S.conversations, cvid); if(!cv || !text.trim()) return;
    cv.messages.push({by:SESSION.user, at:nowStamp(), text:text.trim(), internal:!!internal});
    const fromCustomer = user(SESSION.user).side === 'customer';
    cv.state = fromCustomer ? 'needs_reply' : 'waiting_customer';
    if(!internal){
      emit('message', {project:cv.project, account:cv.account,
        text:`${user(SESSION.user).name} sent a message`,
        notify: fromCustomer ? 'studio' : 'customer', kind:'message',
        notifyText: fromCustomer
          ? `${account(cv.account).name}: new message on ${project(cv.project)?.name || 'the account'}`
          : `PAMUUC replied about ${project(cv.project)?.name || 'your account'}`});
    }
    save();
  },

  markRead(side){
    S.notifications.filter(n => n.to === side).forEach(n => n.read = true);
    save();
  },
};
