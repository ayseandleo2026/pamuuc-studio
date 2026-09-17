/* ============================================================================
   PAMUUC SUITE — public website
   One domain, two businesses. The root is a service choice; past it you are in
   Pamuk Studio (custom uniform development) or Pamuk Merchandise (catalogue
   products personalised to order). Structure follows the website structure and
   conversion specification of 11 September 2026.

   Two rules that specification is strict about and that the code enforces:
   - An enquiry creates an enquiry. A quote request creates a quote request.
     Neither is an order, an account, or a project.
   - Nothing states a number the business has not approved. Where a figure is
     unconfirmed the copy says it is confirmed on review.
   ========================================================================= */

const PUB_BRANCH = {
  custom:'custom', sectors:'custom', sector:'custom', process:'custom',
  work:'custom', case:'custom', form:'custom', review:'custom', done:'custom',
  studiohelp:'custom',
  merch:'merch', collections:'merch', collection:'merch', products:'merch',
  product:'merch', search:'merch', method:'merch', howto:'merch',
  merchhelp:'merch', quote:'merch', qcontact:'merch', qreview:'merch', qdone:'merch',
};

const BRANCH_NAV = {
  custom:[{p:'sectors',n:'Sectors'},{p:'process',n:'Process'},{p:'work',n:'Work'},{p:'blog',n:'Journal'}],
  merch: [{p:'products',n:'Products'},{p:'collections',n:'Collections'},
          {p:'method',n:'Personalisation'},{p:'howto',n:'How to order'},{p:'blog',n:'Journal'}],
};

const BRANCH_META = {
  custom:{name:'Pamuk Studio', short:'Studio', home:'custom', other:'merch',
          cta:{p:'form', n:'Start your project brief'}},
  merch: {name:'Pamuk Merchandise', short:'Merchandise', home:'merch', other:'custom',
          cta:null},
};

/* ---- collections -------------------------------------------------------- */
const CAT_ORDER = ['T-shirts','Polos','Shirts','Sweatshirts','Outerwear','Pants & shorts','Accessories'];
const CAT_LABEL = {'Pants & shorts':'Trousers and shorts'};
const CAT_COPY = {
  'T-shirts':      'Compare fits, weights and colours for your next branded run.',
  'Polos':         'Explore collared options for teams and everyday brand wear.',
  'Shirts':        'Choose shirts to personalise for a consistent team presence.',
  'Sweatshirts':   'Explore layers for your team, audience or next event.',
  'Outerwear':     'Find jackets and outer layers with suitable branding options.',
  'Pants & shorts':'Complete a coordinated selection with the right lower layers.',
  'Accessories':   'Add the details that carry your brand beyond the garment.',
};
const CAT_COVER = {
  'T-shirts':'m_asher', 'Polos':'m_coaster_vintage', 'Shirts':'m_stanley_denim_shirt',
  'Sweatshirts':'m_astor', 'Outerwear':'m_brooker', 'Pants & shorts':'m_barreler',
  'Accessories':'m_bucket_hat',
};
const catName = (c) => CAT_LABEL[c] || c;
const catSlug = (c) => String(c).toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
const catList = (c) => S.merchProducts.filter(p => p.cat === c);
function catsInUse(){
  const present = [...new Set(S.merchProducts.map(p => p.cat).filter(Boolean))];
  return CAT_ORDER.filter(c => present.includes(c))
    .concat(present.filter(c => !CAT_ORDER.includes(c)).sort());
}
const catFromSlug = (s) => catsInUse().find(c => catSlug(c) === s) || null;
const catCopy = (c) => CAT_COPY[c] ||
  `Products in the ${String(catName(c)).toLowerCase()} collection, quoted and decorated on the same terms as the rest of the catalogue.`;

function prodImg(p){
  if(!p) return null;
  const pi = p.img || {};
  return (p.imgOrder || []).map(c => pi[c]).find(Boolean) || null;
}
const imgOf  = (id) => prodImg(by(S.merchProducts, id));
const catImg = (c)  => imgOf(CAT_COVER[c]) || prodImg(S.merchProducts.find(p => p.cat === c && prodImg(p)));

/* ---- sectors ------------------------------------------------------------ */
const SECTORS = [
  {id:'hospitality', n:'Hotels and restaurants',
   d:'A coordinated identity across reception, service and the teams behind the scenes.',
   roles:['Reception and guest services','Restaurant and bar','Kitchen and pass','Housekeeping and operations'],
   req:['Guest-facing identity alongside an industrial laundry cycle','Movement and layering across an eleven-hour split shift','Food service exposure and frequent replacement','Departmental distinction without four separate wardrobes'],
   tags:['High laundry cycles', 'Split shifts', 'Guest-facing identity', 'Departmental distinction']},
  {id:'wellness', n:'Wellness and spas',
   d:'Uniforms considered around treatments, movement and the atmosphere of your space.',
   roles:['Therapists','Reception','Treatment support'],
   req:['Bending and reach through the shoulder and bicep','Coverage that stays correct during treatment','Product contact and frequent cleaning','A quiet register that suits the room'],
   tags:['Range of movement', 'Treatment coverage', 'Product contact', 'Quiet colour']},
  {id:'healthcare', n:'Healthcare teams',
   d:'Garment requirements shaped around your roles and working environment.',
   roles:['Clinical','Support','Hospitality','Administration'],
   req:['Care routines and laundry compatibility','Fit and wearer dignity across a wide size range','Role recognition without a visible hierarchy','Any specialist standard identified and assessed separately'],
   tags:['Industrial wash', 'Wide size range', 'Role recognition', 'Documented materials']},
  {id:'retail', n:'Retail teams',
   d:'Clothing that connects your team with the brand and the experience in store.',
   roles:['Floor','Stockroom','Visual','Management'],
   req:['Standing and reaching through a full shift','Role recognition on a busy floor','Replenishment against a fixed core','Seasonal layers over a consistent base'],
   tags:['All-day standing', 'Seasonal layers', 'Fixed core', 'Floor recognition']},
  {id:'corporate', n:'Corporate teams and events',
   d:'A consistent team presence across meetings, service and public facing occasions.',
   roles:['Hosts','Crew','Stand teams','Hospitality'],
   req:['A programme or a single event, priced differently','Reuse after storage between occasions','A size range wider than the headcount suggests','Short lead times against a fixed date'],
   tags:['Short lead times', 'Storage between events', 'Wide size curve', 'One-off or programme']},
  {id:'food', n:'Food production teams',
   d:'A brief built around the tasks, care requirements and conditions of your workplace.',
   roles:['Line','Packing','Quality','Visitors'],
   req:['Hygiene and laundry requirements to assess','Colour-coded zones where they apply','A scheduled replacement cycle','A specification that can be reproduced exactly'],
   tags:['Hygiene requirements', 'Colour-coded zones', 'Scheduled replacement', 'Reproducible spec']},
];
const sectorById = (id) => SECTORS.find(s => s.id === id) || null;

/* ---- chrome ------------------------------------------------------------- */
function pubShell(inner, page){
  const branch = PUB_BRANCH[page] || null;
  const meta   = branch ? BRANCH_META[branch] : null;
  const other  = meta ? BRANCH_META[meta.other] : null;
  const nav    = branch ? BRANCH_NAV[branch] : [];
  const lines  = quoteCount();
  return `
  <a class="skip" href="#main" data-act="skip">Skip to content</a>
  <div class="pub">
    <header class="pub-hd glass">
      <div class="pub-hd-in">
        <span class="brand" data-go="public:${meta ? meta.home : 'home'}">PAMUUC<span class="brand-bar">|</span><span class="brand-sub">${meta ? esc(meta.short.toUpperCase()) : 'STUDIO'}</span></span>
        <nav class="pub-nav" aria-label="${meta ? esc(meta.name) : 'Main'}">
          ${nav.map(x => `<a data-go="public:${x.p}" class="${page === x.p ? 'on' : ''}">${x.n}</a>`).join('')}
        </nav>
        <span class="spacer"></span>
        ${branch === 'merch' ? `<button class="btn btn--quiet btn--sm hd-hide-md" data-go="public:search" aria-label="Search products">Search</button>` : ''}
        ${meta ? `<button class="btn btn--quiet btn--sm hd-hide-lg" data-go="public:home">Choose a service</button>` : ''}
        ${other ? `<button class="btn btn--quiet btn--sm hd-hide-md" data-go="public:${other.home}">${other.short}</button>` : ''}
        <button class="btn btn--quiet btn--sm hd-hide-md" data-act="lang">EN</button>
        <button class="btn btn--quiet btn--sm" data-act="theme" aria-label="Switch light and dark">◐</button>
        <button class="btn btn--ghost btn--sm hd-hide-sm" data-go="public:login">Customer login</button>
        ${branch === 'merch'
          ? `<button class="btn btn--primary btn--sm" data-act="openDrawer" aria-haspopup="dialog"
              aria-expanded="${UI.drawer ? 'true' : 'false'}">Quote${lines ? ` <span class="badge-n">${lines}</span>` : ''}</button>`
          : meta && meta.cta ? `<button class="btn btn--primary btn--sm hd-hide-sm" data-go="public:${meta.cta.p}">${meta.cta.n}</button>` : ''}
        <button class="btn btn--ghost btn--sm hd-menu-btn" data-act="menu"
          aria-expanded="${UI.menu ? 'true' : 'false'}">${UI.menu ? 'Close' : 'Menu'}</button>
      </div>
    </header>
    ${UI.menu ? menuSheet(branch, meta, other) : ''}
    <main id="main">${inner}</main>
    ${pubFooter(branch)}
  </div>
  ${UI.drawer ? quoteDrawer() : ''}`;
}

function menuSheet(branch, meta, other){
  const nav = branch ? BRANCH_NAV[branch] : [];
  return `
  <div class="hd-sheet">
    <div class="hd-sheet-in">
      ${meta ? `
        <div class="eyebrow">${esc(meta.name)}</div>
        <a class="hd-sheet-link" data-go="public:${meta.home}">${esc(meta.name)} home</a>
        ${nav.map(x => `<a class="hd-sheet-link" data-go="public:${x.p}">${x.n}</a>`).join('')}
        ${branch === 'merch'
          ? `<a class="hd-sheet-link" data-go="public:search">Search products</a>
             <a class="hd-sheet-link hd-sheet-link--cta" data-go="public:quote">Your quote request${quoteCount() ? ' (' + quoteCount() + ')' : ''}</a>`
          : `<a class="hd-sheet-link hd-sheet-link--cta" data-go="public:${meta.cta.p}">${meta.cta.n}</a>`}
      ` : ''}
      <div class="eyebrow hd-sheet-eyebrow">${other ? 'The other service' : 'Choose a service'}</div>
      ${other
        ? `<a class="hd-sheet-link" data-go="public:${other.home}">${esc(other.name)}</a>
           <a class="hd-sheet-link" data-go="public:home">Choose a service</a>`
        : `<a class="hd-sheet-link" data-go="public:custom">Pamuk Studio — custom uniforms</a>
           <a class="hd-sheet-link" data-go="public:merch">Pamuk Merchandise</a>`}
      <a class="hd-sheet-link" data-go="public:contact">Contact</a>
      <a class="hd-sheet-link" data-go="public:login">Customer login</a>
    </div>
  </div>`;
}

/* Three compact groups: the current branch, the other service and company,
   then help, legal and account. */
function pubFooter(branch){
  const col = (title, links) => `
    <div class="ft-col">
      <div class="eyebrow">${title}</div>
      ${links.map(([n, p]) => `<a class="ft-link" data-go="public:${p}">${n}</a>`).join('')}
    </div>`;
  const studioCol = col('Pamuk Studio', [['Custom uniforms','custom'],['Sectors','sectors'],
    ['Process','process'],['Work','work'],['Start your project brief','form'],['Journal','blog'],['Studio help','studiohelp']]);
  const merchCol = col('Pamuk Merchandise', [['Merchandise','merch'],['Products','products'],
    ['Collections','collections'],['Personalisation','method'],['How to order','howto'],['Journal','blog'],['Merchandise help','merchhelp']]);
  return `
  <footer class="pub-ft">
    <div class="pub-wrap">
      <div class="ft-grid">
        ${branch === 'merch' ? merchCol + studioCol : studioCol + merchCol}
        <div class="ft-col">
          <div class="eyebrow">Company</div>
          <a class="ft-link" data-go="public:about">About Pamuk</a>
          <a class="ft-link" data-go="public:contact">Contact</a>
          <a class="ft-link" data-go="public:login">Customer login</a>
          <a class="ft-link" data-go="public:accessibility">Accessibility</a>
        </div>
        <div class="ft-col ft-col--legal">
          <div class="eyebrow">Legal</div>
          <a class="ft-link" data-go="public:privacy">Privacy notice</a>
          <a class="ft-link" data-go="public:cookies">Cookie settings</a>
          <a class="ft-link" data-go="public:terms">Terms</a>
          <p class="t-xs muted ft-addr">Pamuk Studio S.L · Barcelona<br>
            Legal and registration details are confirmed before publication.</p>
        </div>
      </div>
      <div class="ft-base">
        <span class="t-xs muted">© ${new Date().getFullYear()} Pamuk Studio S.L.</span>
        <span class="ft-base-links">
          <a class="ft-link ft-link--inline" data-go="public:home">Choose a service</a>
          <a class="ft-link ft-link--inline" data-act="lang">English · Español · Français</a>
        </span>
      </div>
    </div>
  </footer>`;
}


/* The gateway carries no navigation bar. The wordmark sits centred over the
   two images and the whole of each half is the control, so a header would
   only compete with the one decision the page exists to ask for. */
function pubShellGate(inner){
  return `
  <a class="skip" href="#main" data-act="skip">Skip to content</a>
  <div class="pub pub--gate">
    <main id="main">${inner}</main>
    ${pubFooter(null)}
  </div>`;
}

/* A page heading. Title and the sentence under it both run the full width. */
function pageHead(eyebrow, title, desc, opts){
  const o = opts || {};
  return `
  <section class="page-head ${o.red ? 'page-head--red' : ''}">
    <div class="pub-wrap">
      ${o.crumb ? `<nav class="crumb" aria-label="Breadcrumb">${o.crumb}</nav>` : ''}
      <div class="eyebrow ${o.red ? 'eyebrow-red' : ''}">${eyebrow}</div>
      <h1 class="page-title">${title}</h1>
      ${desc ? `<p class="page-desc">${desc}</p>` : ''}
      ${o.after || ''}
    </div>
  </section>`;
}

function crumb(trail, here){
  return trail.map(([n, p]) => `<a data-go="public:${p}">${n}</a><span class="crumb-sep">/</span>`).join('')
       + `<span class="crumb-here">${esc(here)}</span>`;
}

/* FAQ: six headings visible, six more on demand. Native disclosure, so the
   keyboard and expanded state come from the browser. Answers may all be open
   at once — visitors compare them. */
function faqBlock(items, id){
  return `
  <div class="faq" id="${id}">
    ${items.map((q, i) => `
      <details class="faq-i ${i >= 6 ? 'faq-i--more' : ''}">
        <summary class="faq-q">${q[0]}</summary>
        <div class="faq-a"><p class="t-sm">${q[1]}</p></div>
      </details>`).join('')}
    ${items.length > 6 ? `<button class="btn btn--quiet btn--sm faq-more" data-act="faqMore" data-f="${id}"
      aria-controls="${id}" aria-expanded="false">Show ${items.length - 6} more questions</button>` : ''}
  </div>`;
}

/* ---- product card, one contract everywhere ----------------------------- */
function pcard(p){
  const im = prodImg(p);
  const nc = (p.colours || []).length;
  return `
  <div class="pcard" data-go="public:product:${p.id}">
    <div class="pcard-img">
      ${im ? `<img src="${im}" alt="${esc(p.name)}" loading="lazy">`
           : `<span class="pcard-ph">${p.glyph}</span>`}
    </div>
    <div class="pcard-b">
      <div class="t-h5">${esc(p.name)}</div>
      <div class="t-xs muted">Ref. ${esc(p.ref)}${p.weight ? ' · ' + esc(p.weight) + ' g/m²' : ''}</div>
      <div class="pcard-price num">
        ${p.quoteOnly
          ? `<span class="chip">Price on request</span>`
          : `<b>${money(p.from)}</b> <span class="t-sm muted">per piece at ${p.moq}</span>`}
      </div>
      <div class="t-xs muted pcard-basis">${p.quoteOnly
        ? 'Quoted on review · excl. VAT'
        : 'Product only; personalisation extra · excl. VAT'}</div>
      <div class="t-xs muted">Minimum ${p.moq} pieces · ${nc} colour${nc === 1 ? '' : 's'}</div>
      <span class="btn btn--ghost btn--sm pcard-cta">Configure for a quote</span>
    </div>
  </div>`;
}


/* A section chapter head: index, label, and a hairline. Each section reads as
   its own chapter rather than another block on a long page. */
function secIx(n, label, meta){
  return `<div class="sec-ix">
    <span class="sec-ix-n">${n}</span>
    <span class="sec-ix-l">${label}</span>
    <span class="spacer"></span>
    ${meta ? `<span class="sec-ix-m">${meta}</span>` : ''}
  </div>`;
}

/* An art-directed slot for photography that has not been shot yet. It carries
   the asset ID from the content plan so it is never mistaken for finished. */
function ph(id, ratio, desc){
  return `<div class="ph ph--${ratio}" role="img" aria-label="Image placeholder: ${esc(desc)}">
    <div class="ph-in">
      <div class="ph-id">${esc(id)}</div>
      <div class="ph-d">${esc(desc)}</div>
    </div>
  </div>`;
}

/* Real catalogue photography, with the caption that says what it actually is. */
function fig(src, alt, kind, note, ratio){
  if(!src) return ph('ASSET PENDING', ratio || '4x5', alt);
  return `<figure class="fig">
    <div class="media media--${ratio || '4x5'}"><img src="${src}" alt="${esc(alt)}" loading="lazy"></div>
    <figcaption class="cap"><b>${esc(kind)}</b><span>${esc(note)}</span></figcaption>
  </figure>`;
}

const arrow = (label) => `<span class="lnk-a">${label}<span></span></span>`;

/* ---- the shared root: a service choice, not a third homepage ----------- */
function pubHome(){
  const halves = [
    {page:'custom', t:'Custom Uniforms', img:imgOf('m_stanley_oxford_shirt'),
     alt:'A uniform shirt worn on shift'},
    {page:'merch', t:'Merchandise', img:imgOf('m_bomber_2_0'),
     alt:'Decorated jackets from the catalogue'},
  ];
  return pubShellGate(`
  <section class="gate2">
    <span class="gate2-mark" data-go="public:home">PAMUUC<em>STUDIO</em></span>
    ${halves.map(h => `
    <button class="gate2-h" data-go="public:${h.page}">
      ${h.img ? `<img class="gate2-img" src="${h.img}" alt="${esc(h.alt)}">` : ''}
      <span class="gate2-veil"></span>
      <span class="gate2-t">${h.t}</span>
    </button>`).join('')}
  </section>

  <section class="pub-sec pub-sec--tight">
    <div class="pub-wrap">
      ${secIx('—', 'Barcelona · since 2019', 'Pamuk Studio S.L')}
      <h1 class="display">Uniforms and merchandise for your business.</h1>
      <div class="split split--wide gate-intro-row">
        <p class="lede">Develop uniforms around your team’s work, or choose products to personalise with your brand.
          Pamuk Studio designs, develops and produces from Barcelona; Pamuk Merchandise configures and decorates a
          catalogue we already stand behind. Two services, one workshop, one standard of record keeping.</p>
        <div class="split-b">
          <div class="chip-row">
            ${SECTORS.map(x => `<span class="chip chip--lg">${x.n}</span>`).join('')}
          </div>
          <div class="btn-row btn-row--top">
            <button class="btn btn--ghost btn--sm" data-go="public:login">Customer login</button>
            <button class="btn btn--quiet btn--sm" data-act="theme" aria-label="Switch light and dark">◐</button>
            <button class="btn btn--quiet btn--sm" data-act="lang">EN</button>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="pub-sec pub-sec--tight sec--dark">
    <div class="pub-wrap">
      ${secIx('—', 'Which service fits your project')}
      <div class="split split--bottom">
        <div class="split-b">
          <h2 class="pull">Choose Pamuk Studio when you need a uniform programme developed around specific roles, fits, fabrics or garment details.</h2>
          <div class="btn-row btn-row--top"><button class="btn btn--onphoto btn--lg" data-go="public:custom">Explore custom uniforms</button></div>
        </div>
        <div class="split-b">
          <h2 class="pull">Choose Pamuk Merchandise when you want to select existing products and add your logo or artwork.</h2>
          <div class="btn-row btn-row--top"><button class="btn btn--onphoto btn--lg" data-go="public:merch">Browse merchandise</button></div>
        </div>
      </div>
      <p class="t-sm assist" style="color:var(--on-band-dim)">Unsure where to start?
        <a class="lnk" data-go="public:contact" style="color:var(--on-band)">Tell us what you need.</a></p>
    </div>
  </section>
  `);
}

/* ---- Studio FAQ, twelve questions, six shown ---------------------------- */
const STUDIO_FAQ = [
  ['What is the difference between custom uniforms and personalised merchandise?',
   'Custom uniforms are developed around your team’s roles, garment requirements and brand. Merchandise starts with existing products that you select and personalise. If you are unsure which route fits, describe the outcome you need and we’ll help you identify the next step.'],
  ['What is the minimum quantity for a custom project?',
   'Minimum quantities depend on the garments and production requirements. Tell us your team size, roles and approximate quantities in the brief. We’ll review whether the project is a fit and explain the relevant minimums before you commit.'],
  ['How much does a uniform project cost?',
   'As a guide, a custom project generally starts around €120 per person across the garments in the range. Where it lands depends on the development scope, fabrics, quantities and personalisation. Share a range if you have one, or select “Not decided yet”, and we’ll discuss a suitable scope before confirming costs.'],
  ['How long does a project take?',
   'Timing depends on development, prototype review, material availability, approvals and production. Include your preferred date when you enquire. We’ll assess it with the project scope and confirm the schedule before the work moves into the relevant stages.'],
  ['Do we need a finished design before contacting you?',
   'No. You can start with your team, the work they do and the result you want. If design work is needed, we’ll discuss whether it should be included in your project scope. Existing references and brand guidelines can be shared when useful.'],
  ['What happens after we send the brief?',
   'The Studio reviews your information and contacts you about the next step. Where the project is a fit, this includes discovery before an account and custom project are set up. Sending the brief does not place an order.'],
  ['Can different roles have different garments?',
   'Your brief can include different positions, garment types and approximate quantities. We’ll use that information to define the proposed range. The Studio sets up the project and publishes the agreed options so the team can review the relevant decisions.'],
  ['How do prototypes and fittings work?',
   'The project sets out the prototype and fitting arrangements. Feedback and approval are recorded for each garment, so an approved item does not need to restart when another needs changes. The scope explains the included review rounds and how additional work is handled.'],
  ['How are fabrics and care requirements chosen?',
   'Tell us how the garments will be used and cleaned, including any workplace requirements. These inform development and material choices. Specific performance or certification requirements must be assessed and confirmed for the proposed garments.'],
  ['Can you use our colours, logos and brand details?',
   'Share your guidelines or references if available. We’ll review the relevant colours, trims and personalisation within the project scope. Proposed details and any limitations are confirmed through the appropriate review and approval steps.'],
  ['Can we request reorders or supply more than one location?',
   'Include expected repeat needs and delivery locations in the brief. We’ll review the requirements with the project. A reorder is checked against the approved garment record, current availability, pricing and timing before it is confirmed.'],
  ['Can we start before every detail is decided?',
   'Yes. Answer what you know and use “Not sure yet” where offered. You can explain what still needs deciding. If you only need an initial conversation, use the advice enquiry below and we’ll follow up with the appropriate questions.'],
];

/* ---- adapted reference sections -----------------------------------------
   Six devices taken from a reference set Leo supplied, rebuilt around what a
   uniform studio actually has: sectors, roles, requirements, stages and the
   archived specification. No performance statistics, because none are
   measured; the figures below are structural facts about the method. */

/* 1. A directory of everything the site covers. Real routes, crawlable,
      grouped the way a buyer thinks: by sector, by role, by requirement. */
function dirBlock(){
  const dim = UI.dirDim || 'roles';
  const tab = UI.dirTab || 'all';
  const dims = [['sectors','Sectors'],['roles','Roles'],['reqs','Requirements']];
  const inTab = (s) => tab === 'all' || s.id === tab;
  let links = [];
  if(dim === 'sectors')
    links = SECTORS.filter(inTab).map(s => [`${s.n} uniforms`, s.id]);
  if(dim === 'roles')
    SECTORS.filter(inTab).forEach(s => s.roles.forEach(r =>
      links.push([`Uniforms for ${r.toLowerCase()}`, s.id])));
  if(dim === 'reqs')
    SECTORS.filter(inTab).forEach(s => (s.tags || []).forEach(t =>
      links.push([`${t} — ${s.n.toLowerCase()}`, s.id])));
  return `
  <section class="pub-sec pub-sec--tight surface-2 dirsec">
    <div class="pub-wrap">
      <h2 class="t-h2 dir-t">Explore uniform projects</h2>
      <div class="dir-pills">
        ${dims.map(([v, n]) => `<button class="pill ${dim === v ? 'pill--on' : ''}"
          data-act="dirDim" data-v="${v}" aria-pressed="${dim === v}">${n}</button>`).join('')}
      </div>
      <div class="dir-tabs" role="tablist">
        ${[['all','All sectors'], ...SECTORS.map(s => [s.id, s.n])].map(([v, n]) =>
          `<button class="dtab ${tab === v ? 'dtab--on' : ''}" data-act="dirTab" data-v="${v}"
            role="tab" aria-selected="${tab === v}">${n}</button>`).join('')}
      </div>
      <div class="dir-grid">
        ${links.map(([n, id]) => `<a class="dir-l" data-go="public:sector:${id}">${esc(n)}</a>`).join('')}
      </div>
      <p class="t-xs muted note">Every link opens the sector it belongs to. We publish a page only where we
        have something specific to say about the work, rather than generating one per search term.</p>
    </div>
  </section>`;
}

/* 2. Four steps. The public summary of a process the process page sets out
      in six formal stages. */
const START_STEPS = [
  ['Share your brief in nine short topics',
   'Your roles, sites, approximate quantities and timing. Answer what you know and mark what is still undecided — “Not sure yet” is a real answer.'],
  ['We review it and come back to you',
   'We read the brief, decide whether the project is a fit, and arrange discovery where it is. If it is not right for us, we say so then rather than after three weeks.'],
  ['Develop the garments and fit them',
   'Fabric and construction are chosen against your wash cycle. Prototypes are fitted on your own people, doing the actual work, and approved one garment at a time.'],
  ['Approve, produce, and keep the record',
   'Production follows the approved specification once the required approvals and payment are in place. The approved revision is archived so a reorder matches.'],
];

function stepsBlock(ix){
  return `
  <section class="pub-sec pub-sec--tight">
    <div class="pub-wrap">
      ${secIx(ix || '—', 'How a project starts', 'Four steps')}
      <h2 class="display steps-t">Start a uniform project in four steps.</h2>
      <div class="grid grid-4 gap-lg steps-g">
        ${START_STEPS.map(([h, p], k) => `
        <div class="scard">
          <div class="scard-n">${String(k + 1).padStart(2, '0')}</div>
          <h3 class="scard-h">${h}</h3>
          <p class="scard-p">${p}</p>
        </div>`).join('')}
      </div>
      <div class="btn-row btn-row--top steps-cta">
        <button class="btn btn--primary btn--lg" data-go="public:form">Start your project brief</button>
        <button class="btn btn--quiet" data-go="public:process">See the six formal stages</button>
      </div>
    </div>
  </section>`;
}

/* 3. Four figures. Structural facts about how a project runs, not measured
      performance — we publish no statistic we cannot trace to a record. */
function figuresBlock(ix){
  const figs = [
    ['€120', 'Per person, from', 'Where a custom project generally starts, across the garments in the range. Development, fabric and quantity move it from there.'],
    ['6', 'Stages', 'Each one ends in a decision that is yours to make, and every approval is recorded against the project.'],
    ['3', 'Prototype rounds', 'Included per garment and stated in your proposal. A further round is an authorised exception, not a silent cost.'],
    ['0', 'Charged at enquiry', 'The brief starts a review and a conversation. Nothing is ordered and nothing is charged.'],
  ];
  return `
  <section class="pub-sec sec--dark">
    <div class="pub-wrap">
      <div class="fig-h">
        ${secIx(ix || '—', 'How the work is governed', 'Facts, not forecasts')}
      </div>
      <div class="figs">
        ${figs.map(([v, l, n]) => `
        <div class="figc">
          <div class="figc-v">${v}</div>
          <div class="figc-l">${l}</div>
          <p class="figc-n">${n}</p>
        </div>`).join('')}
      </div>
      <p class="t-xs fig-note">These are properties of the process, not performance claims. Where we cannot
        trace a number to a stored record, we do not publish it.</p>
    </div>
  </section>`;
}

/* 4. What a project includes: six cards, each carrying a small artefact of
      the actual method rather than a stock illustration. */
function includesBlock(ix){
  const art = {
    plan: `<div class="art art--rows">
      ${[['Reception','Shirt · apron'],['Restaurant','Jacket · trouser'],['Kitchen','Chef jacket'],['Housekeeping','Tunic']]
        .map(([r, g]) => `<div class="art-r"><span>${r}</span><span class="art-m">${g}</span></div>`).join('')}
    </div>`,
    fabric: `<div class="art art--chips">
      ${[['Twill','280 g/m²'],['Piqué','220 g/m²'],['Melton','480 g/m²'],['Poplin','130 g/m²']]
        .map(([n, w]) => `<div class="art-chip"><b>${n}</b><span>${w}</span></div>`).join('')}
    </div>`,
    proto: `<div class="art art--rows">
      ${[['Chef jacket','Approved','go'],['Service trouser','Approved','go'],['Wrap jacket','Changes requested','wait'],['Apron','Round 2','flow']]
        .map(([n, st, k]) => `<div class="art-r"><span>${n}</span><span class="pill-s pill-s--${k}">${st}</span></div>`).join('')}
    </div>`,
    brand: `<div class="art art--brand">
      <div class="art-label">YOUR MARK<span>woven label · 40 × 12 mm</span></div>
      <div class="art-sw">${['#13304F','#002B2A','#7F1D16','#F3EDE4'].map(c =>
        `<span style="background:${c}"></span>`).join('')}</div>
    </div>`,
    spec: `<div class="art art--spec">
      <div class="art-spec-h"><b>Chef jacket</b><span class="pill-s pill-s--go">Revision 4</span></div>
      ${[['Fabric','Cotton twill 280 g/m²'],['Colour','Custom navy · lab dip 3'],['Positions','Chest · collar'],['Sizes','XS–3XL, 9 steps']]
        .map(([k, v]) => `<div class="art-r"><span class="art-m">${k}</span><span>${v}</span></div>`).join('')}
    </div>`,
    reorder: `<div class="art art--reorder">
      <div class="art-r"><span class="art-m">Approved revision</span><span>Rev. 4</span></div>
      <div class="art-r"><span class="art-m">Reordered</span><span>88 pieces</span></div>
      <div class="art-r"><span class="art-m">Unit price</span><span>Unchanged</span></div>
      <div class="art-check">Produced against the archived file, not a memory</div>
    </div>`,
  };
  const items = [
    ['Role and garment plan','Who needs what, from individual positions to a coordinated team wardrobe. Roles first, garments second.', art.plan],
    ['Fabric and construction','Weight, composition and finish selected against your wash cycle and climate, not against a mood board.', art.fabric],
    ['Prototypes and fitting','Samples tried on the people who will wear them, doing the actual work. Feedback recorded per garment.', art.proto],
    ['Brand details','Colours, trims and personalisation developed within the agreed scope, at a size that survives laundry.', art.brand],
    ['An archived specification','The approved revision stored with its measurements, fabrics, colours and suppliers.', art.spec],
    ['A reorder that matches','Produced against the archived file, then rechecked for availability, price and timing.', art.reorder],
  ];
  return `
  <section class="pub-sec">
    <div class="pub-wrap">
      ${secIx(ix || '—', 'What a project includes', 'Six parts')}
      <div class="split split--bottom sol-h">
        <h2 class="display sol-t">The details that make the uniform yours.</h2>
        <div class="split-b">
          <p class="lede">Your brief defines what we develop, which decisions need your approval, and what is
            included. Every part below produces something you can hold or read — a sample, a record, a decision.</p>
          <div class="btn-row btn-row--top">
            <button class="btn btn--ghost" data-go="public:process">See the development process</button>
          </div>
        </div>
      </div>
      <div class="sol-g">
        ${items.map(([h, p, a]) => `
        <article class="sol">
          <h3 class="sol-ht">${h}</h3>
          <p class="sol-p">${p}</p>
          ${a}
        </article>`).join('')}
      </div>
    </div>
  </section>`;
}

/* 5. The opening: copy on the left, the work on the right, and the artefact
      the whole method turns on floating over it. */
function studioHero(){
  return `
  <section class="shero">
    <div class="pub-wrap shero-in">
      <div class="shero-copy">
        <span class="news"><b>Barcelona</b>Uniform design and production since 2019</span>
        <h1 class="display shero-t">Custom uniforms for the way your team works.</h1>
        <p class="lede shero-d">Developed around your roles, working conditions and brand. Six stages, each one
          ending in an approval you give — and an archived specification so the second order matches the first.</p>
        <div class="btn-row btn-row--top">
          <button class="btn btn--primary btn--lg" data-go="public:form">Start your project brief</button>
          <button class="btn btn--ghost btn--lg" data-go="public:work">See our work</button>
        </div>
      </div>
      <div class="shero-media">
        <div class="media media--4x5 shero-img">
          ${imgOf('m_palmer') ? `<img src="${imgOf('m_palmer')}" alt="A shirt developed for service roles, worn on shift">` : ''}
        </div>
        <div class="shero-card">
          <div class="shero-card-h">
            <span class="eyebrow">Archived specification</span>
            <span class="pill-s pill-s--go">Approved</span>
          </div>
          <div class="shero-card-t">Chef jacket · Revision 4</div>
          ${[['Fabric','Cotton twill 280 g/m²'],['Colour','Custom navy · lab dip 3'],['Fitted on','11 wearers, 2 rounds'],['Reorder','At the same specification']]
            .map(([k, v]) => `<div class="art-r"><span class="art-m">${k}</span><span>${v}</span></div>`).join('')}
          <div class="shero-card-f">An example of the record a project leaves behind.</div>
        </div>
      </div>
    </div>
  </section>`;
}

/* ---- S1 to S8 -----------------------------------------------------------
   Eight chapters, each with a different composition: a full-bleed opening,
   an asymmetric case split, a sector index, offset scope cards, a dark
   process band, oversized practical facts, the FAQ, and the invitation. */
function pubCustom(){
  const c0 = CASES[0];
  return pubShell(`
  ${studioHero()}

  <section class="pub-sec">
    <div class="pub-wrap">
      ${secIx('01', 'Selected work', 'Three projects published')}
      <div class="split split--wide">
        <div class="split-b hovr" data-go="public:case:${c0.id}">
          ${fig(imgOf(c0.img), c0.title, c0.status, c0.sector, '3x2')}
        </div>
        <div class="split-b">
          <div class="shead"><h2 class="display">See how a brief becomes a uniform.</h2><p class="lede" style="margin-top:var(--sp-5)">${c0.constraint}</p></div>
          <div class="ilist" style="margin-top:var(--sp-6)">
            ${CASES.slice(1, 3).map((c, k) => `
            <div class="ilist-r" data-go="public:case:${c.id}" style="cursor:pointer;grid-template-columns:44px 1fr">
              <span class="ilist-n">0${k + 2}</span>
              <div><div class="eyebrow">${esc(c.sector)} · ${esc(c.status)}</div>
                <div class="ilist-h" style="margin-top:6px">${esc(c.title)}</div>
                <p class="t-sm muted" style="margin-top:6px">${c.scope}</p></div>`).join('')}
          </div>
          <div style="margin-top:var(--sp-5)" data-go="public:work">${arrow('All projects and development work')}</div>
        </div>
      </div>
    </div>
  </section>

  <section class="pub-sec pub-sec--tight surface-2">
    <div class="pub-wrap">
      ${secIx('02', 'Roles and sectors', 'Six environments')}
      <div class="split split--narrow split--sticky">
        <div class="split-b">
          <h2 class="pull">Start with the people wearing the uniform.</h2>
          <p class="t-sm muted" style="margin-top:var(--sp-4)">Different roles place different demands on clothing.
            We begin with the work, the setting and the team.</p>
        </div>
        <div class="ilist split-b">
          ${SECTORS.map((x, k) => `
          <div class="ilist-r sect" data-go="public:sector:${x.id}">
            <span class="ilist-n">${String(k + 1).padStart(2, '0')}</span>
            <div class="ilist-h">${x.n}</div>
            <div><p class="t-sm muted">${x.d}</p>${arrow('Explore')}</div>
          </div>`).join('')}
        </div>
      </div>
    </div>
  </section>

  ${includesBlock('03')}

  ${stepsBlock('04')}

  ${figuresBlock('05')}

  <section class="pub-sec pub-sec--tight surface-2">
    <div class="pub-wrap">
      ${secIx('06', 'Questions before starting', 'Twelve answers')}
      <div class="split split--narrow split--sticky">
        <div class="split-b">
          <h2 class="pull">Questions before you start?</h2>
          <p class="t-sm muted" style="margin-top:var(--sp-4)">The essentials about scope, development and the next step.</p>
          <div style="margin-top:var(--sp-5)" data-go="public:studiohelp">${arrow('All Studio questions')}</div>
        </div>
        <div class="split-b">${faqBlock(STUDIO_FAQ, 'faq-studio')}</div>
      </div>
    </div>
  </section>

  <section class="pub-sec">
    <div class="pub-wrap">
      ${secIx('07', 'Start the conversation', 'Nine short topics')}
      <div class="split">
        <div class="split-b">
          <div class="shead"><h2 class="display" >Tell us what your team needs.</h2><p class="lede" style="margin-top:var(--sp-5)">Start with your roles, approximate quantities and preferred timing.
            You can leave undecided details open and review your answers before sending.</p></div>
          <div class="btn-row btn-row--top">
            <button class="btn btn--primary btn--lg" data-go="public:form">Start your project brief</button>
          </div>
          <p class="t-sm muted s8-sup">Nine short topics, then a review. No account needed.</p>
        </div>
        <div class="split-b">
          <details class="disc">
            <summary class="disc-q">Prefer an initial conversation?</summary>
            <div class="disc-b">
              <p class="t-sm muted">Send a short introduction. We’ll follow up with the questions needed to assess the project.</p>
              <form class="stack-3 adv-form" onsubmit="return false">
                ${[['adv_name','Your name','text'],['adv_email','Email','email'],
                   ['adv_co','Company or organisation','text']].map(([n, l, t]) => `
                  <label class="fld"><span class="fld-l">${l}</span>
                    <input class="inp" type="${t}" name="${n}" required></label>`).join('')}
                <label class="fld"><span class="fld-l">What do you need?</span>
                  <textarea class="inp" name="adv_msg" rows="3"
                    placeholder="For example, the team you want to dress and what you would like to change."></textarea></label>
                <label class="chk"><input type="checkbox" data-act="advCall"> <span>I would prefer a call</span></label>
                ${UI.advCall ? `<label class="fld"><span class="fld-l">Phone</span><input class="inp" type="tel" name="adv_phone"></label>` : ''}
                <div class="btn-row">
                  <button class="btn btn--ghost" data-act="advSubmit">Request initial advice</button>
                </div>
                <p class="t-xs muted">We use these details to respond to your enquiry.
                  <a class="lnk" data-go="public:privacy">Read our Privacy Notice.</a></p>
              </form>
            </div>
          </details>
        </div>
      </div>
    </div>
  </section>
  ${dirBlock()}
  `, 'custom');
}

/* ---- cases -------------------------------------------------------------- */
const CASES = [
  {id:'maritim_hotels', title:'Grup Marítim Hotels', sector:'Hotels and restaurants',
   status:'In production', img:'m_coaster_vintage',
   scope:'102 people · 5 garments · 4 roles across three Barcelona properties',
   constraint:'Three properties needed one wardrobe without erasing what makes each property different. A custom blue is used only at the Barceloneta site, carried in a trim rather than a whole garment.',
   decision:'The range was built per role rather than per property, with one colour variable. That kept five garments in production instead of fifteen.',
   result:'Three of the five garments were approved at the first fitting. The wrap jacket failed because the sleeve bound through the bicep during service — a fault that only appears when the sample is fitted on someone doing the actual work. The wool overcoat is unresolved at six pieces, because melton will not hang correctly below twenty.',
   media:'Development example · garment shown in use'},
  {id:'bonanova', title:'Clínica Bonanova', sector:'Healthcare teams',
   status:'In production', img:'m_asher',
   scope:'140 people · 1 garment · two colourways across every department',
   constraint:'Four incompatible legacy garments were in use across departments, with no reproducible specification for any of them.',
   decision:'One clinical tunic in two colourways encodes department without reading as a hierarchy. Ordinary professional clothing only; no protective or certified specification is claimed.',
   result:'Two prototype rounds. The first was rejected on pocket depth — a pen fell out when staff bent over a bed, which nobody predicted in the specification review and no amount of drawing would have caught.',
   media:'Development example · tunic construction'},
  {id:'restaurant_maritim', title:'Restaurant Marítim', sector:'Hotels and restaurants',
   status:'Delivered', img:'m_brooker',
   scope:'22 people · 3 garments · 88 pieces, single site',
   constraint:'A kitchen and pass wardrobe that had to survive a service laundry cycle and be reorderable by someone who was not involved in the first order.',
   decision:'Chef jacket, apron and service trouser were specified against the actual laundry contract, and the approved revision was archived with its measurements and fabrics.',
   result:'Reordered once already, from the archived revision-4 specification, at the same unit price. That is the point of archiving the snapshot rather than the design.',
   media:'Delivered project · service wardrobe'},
];
const caseById = (id) => CASES.find(c => c.id === id) || null;

function pubSectors(){
  return pubShell(`
  ${pageHead('Pamuk Studio · Sectors', 'Custom uniforms for your working environment.',
    'Explore the roles and requirements that shape a uniform project, then tell us about your team.',
    {crumb: crumb([['Pamuk Studio','custom']], 'Sectors')})}
  <section class="pub-sec pub-sec--top">
    <div class="pub-wrap">
      <div class="grid grid-3 gap-lg">
        ${SECTORS.map(s => `
        <div class="card sect" data-go="public:sector:${s.id}">
          <h2 class="t-h4 card-t">${s.n}</h2>
          <p class="t-sm muted">${s.d}</p>
          <span class="lnk">${esc(s.n)} uniforms</span>
        </div>`).join('')}
      </div>
    </div>
  </section>
  <section class="pub-sec pub-sec--tight surface-2">
    <div class="pub-wrap">
      <div class="shead"><h2 class="sec-title">Role specific development</h2><p class="sec-desc">A uniform programme is built from roles, not from a single garment repeated across a team. The brief asks which positions you need to dress so the proposed range matches how the work is actually divided.</p></div>
      <div class="btn-row btn-row--top">
        <button class="btn btn--primary" data-go="public:form">Start your project brief</button>
      </div>
    </div>
  </section>
  ${dirBlock()}
  ${faqSection('custom', '—')}
  `, 'sectors');
}

function pubSector(id){
  const s = sectorById(id);
  if(!s) return pubShell(pageHead('Pamuk Studio', 'That sector page does not exist.',
    'Every sector we work in is listed on the sectors overview.',
    {after:`<div class="btn-row btn-row--top"><button class="btn btn--primary" data-go="public:sectors">See all sectors</button></div>`}), 'sectors');
  const c = CASES.find(x => x.sector === s.n) || CASES[0];
  return pubShell(`
  ${pageHead('Pamuk Studio · Sector', `Custom uniforms for ${s.n.toLowerCase()}.`, s.d,
    {crumb: crumb([['Pamuk Studio','custom'],['Sectors','sectors']], s.n)})}

  <section class="pub-sec pub-sec--top">
    <div class="pub-wrap">
      ${secIx('01', 'Roles and garments', s.roles.length + ' role groups')}
      <div class="split split--narrow split--sticky">
        <div class="split-b">
          <h2 class="pull">One team identity, different roles.</h2>
          <p class="t-sm muted" style="margin-top:var(--sp-4)">These are the role groups a brief in this sector
            usually covers. The garment list is developed with you; it is not a fixed package.</p>
        </div>
        <div class="ilist split-b">
          ${s.roles.map((r, k) => `<div class="ilist-r" style="grid-template-columns:44px 1fr">
            <span class="ilist-n">${String(k + 1).padStart(2, '0')}</span>
            <div class="ilist-h">${r}</div></div>`).join('')}
        </div>
      </div>
      <div style="margin-top:var(--sp-8)">
        ${ph('SECTOR_' + s.id.toUpperCase(), '21x9', 'A real supported role context in this sector. No protective or certified implication without evidence.')}
      </div>
    </div>
  </section>

  <section class="pub-sec pub-sec--tight sec--dark">
    <div class="pub-wrap">
      ${secIx('02', 'Working requirements', 'Assessed before design')}
      <div class="shead"><h2 class="display" >Built around the work.</h2><p class="lede" style="margin-top:var(--sp-5)">The considerations we assess before proposing
        fabric, cut or construction for this environment.</p></div>
      <div class="nums" style="margin-top:var(--sp-8)">
        ${s.req.map((r, k) => `<div class="num-b"><div class="num-v">${String(k + 1).padStart(2, '0')}</div>
          <div class="num-n">${r}</div></div>`).join('')}
      </div>
      ${s.id === 'healthcare' || s.id === 'food' ? `
      <div class="banner banner--wait banner--top"><div>
        <div class="banner-t">Specialist requirements are assessed, not assumed</div>
        <div class="banner-d">This is ordinary professional clothing. Protective, sterile, flame resistant or certified garments are a separate assessment, and any required standard has to be confirmed for the proposed garments before it is offered.</div>
      </div></div>` : ''}
    </div>
  </section>

  <section class="pub-sec">
    <div class="pub-wrap">
      ${secIx('03', 'Relevant evidence', esc(c.status))}
      <div class="shead"><h2 class="display" >A closer look at the project.</h2>
      <div class="feat" style="margin-top:var(--sp-7)">
        <article class="feat-main" data-go="public:case:${c.id}">
          <div class="feat-img"><img src="${imgOf(c.img) || ''}" alt="${esc(c.title)}" loading="lazy"></div>
          <div class="feat-b">
            <div class="eyebrow">${esc(c.sector)} · ${esc(c.status)}</div>
            <h3 class="t-h3 card-t">${esc(c.title)}</h3>
            <p class="t-sm muted">${c.scope}</p>
            <p class="t-body feat-p">${c.constraint}</p>
            <span class="lnk">View project — ${esc(c.title)}</span>
          </div>
        </article>
        <div class="feat-side">
          <div class="card">
            <div class="eyebrow">How we develop the range</div>
            <ol class="steps">
              <li><b>Define the project.</b> Brief review and discovery establish scope and suitability.</li>
              <li><b>Develop and review.</b> Garments are developed and prototypes fitted on your people.</li>
              <li><b>Approve and deliver.</b> Production follows the approved details and commercial requirements.</li>
            </ol>
            <div class="card-foot t-xs">Minimums and timing are confirmed on review of your brief.</div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="pub-sec pub-sec--tight surface-2">
    <div class="pub-wrap">
      ${secIx('04', 'Enquiry', 'Sector prefilled, and editable')}
      <h2 class="display" >Tell us about your team.</h2><p class="lede" style="margin-top:var(--sp-5);max-width:62ch">Your sector is already filled in on the brief,
        and you can change it. Nine short topics, then a review.</p></div>
      <div class="btn-row btn-row--top">
        <button class="btn btn--primary btn--lg" data-act="briefSector" data-s="${s.id}">Start your project brief</button>
        <button class="btn btn--quiet" data-go="public:contact">Ask a question first</button>
      </div>
    </div>
  </section>
  ${faqSection('custom', '—')}
  `, 'sector');
}

function pubProcess(){
  const detail = {
    design:            ['The proposed direction is part of the purchased scope.','Review and decide on the direction.','Skipped when design is not part of what you bought.'],
    development:       ['The Studio develops the agreed garment details — positions, fabrics, colours, quantities and a technical file per style.','Review the requested decisions.','Configured development authorisation applies.'],
    prototype_fitting: ['Garments are assessed and feedback is recorded for each one individually.','Provide fitting feedback, or approve each garment.','Included rounds and fitting arrangements are stated in the project scope.'],
    pre_production:    ['Approved garments, quantities, sizes, artwork and commercial details are locked for production.','Approve the published production information and the relevant pro forma.','All required garment approvals, or recorded authorised exceptions.'],
    production:        ['Work follows the approved production version.','Respond only if a controlled change requires a decision.','Required approvals and payment received.'],
    delivery:          ['Shipment and receipt information are available.','Review delivery and report issues through support.','Agreed logistics and confirmed shipment data.'],
  };
  return pubShell(`
  ${pageHead('Pamuk Studio · Process', 'From your brief to an approved uniform range.',
    'See what happens at each stage, what you will review, and what needs to be agreed before the project moves forward.',
    {crumb: crumb([['Pamuk Studio','custom']], 'Process')})}

  <section class="pub-sec pub-sec--top">
    <div class="pub-wrap">
      ${secIx('01', 'Before the project', 'Qualification and discovery')}
      <div class="shead"><h2 class="display" >Before the project</h2><p class="sec-desc">Brief review and discovery establish scope and suitability. You supply the initial context and join discovery where appropriate. An account and a project follow qualification — they are not created by the brief.</p></div>
    </div>
  </section>

  <section class="pub-sec pub-sec--tight surface-2">
    <div class="pub-wrap">
      ${secIx('02', 'The formal project stages', 'Six stages')}
      <div class="shead"><h2 class="display" >The formal project stages</h2><p class="sec-desc">Six stages. Nothing moves on until the stage before it is approved, and every approval is recorded against the project.</p></div>
      <div class="stack proc-stack">
        ${STAGES.map((s, i) => {
          const d = detail[s.id] || [s.blurb, '—', '—'];
          return `<div class="card proc">
            <div class="grid grid-2 gap-lg">
              <div>
                <div class="eyebrow">Stage ${String(i + 1).padStart(2, '0')}${i === 0 ? ' · only if design is bought' : ''}</div>
                <h3 class="t-h3 card-t">${s.name}</h3>
                <p class="t-sm muted">${d[0]}</p>
              </div>
              <div>
                <div class="eyebrow">Your action</div>
                <p class="t-body proc-p">${d[1]}</p>
                <div class="eyebrow proc-eyebrow">Dependency</div>
                <p class="t-sm muted">${d[2]}</p>
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>
  </section>

  <section class="pub-sec">
    <div class="pub-wrap">
      ${secIx('03', 'Prototypes and approval', 'Per garment')}
      <div class="shead"><h2 class="display" >Prototypes and approval</h2><p class="sec-desc">A prototype round exists to find what a drawing cannot. Feedback and approval are recorded per garment, so an approved item is not reopened when another needs changing.</p></div>
      <div class="grid grid-2 gap-lg">
        <div class="card">
          <h3 class="t-h4 card-t">What review is for</h3>
          <p class="t-sm muted">Fit on the people who will wear the garment, doing the actual work. Most failures we see are movement faults — a sleeve that binds, a pocket that empties when someone bends — and they do not appear in a specification review.</p>
        </div>
        <div class="card">
          <h3 class="t-h4 card-t">Included rounds</h3>
          <p class="t-sm muted">The number of prototype rounds included per garment is set in your proposal. A further round is handled as an authorised exception rather than absorbed silently. We do not offer unlimited revisions.</p>
        </div>
      </div>
    </div>
  </section>

  <section class="pub-sec pub-sec--tight surface-2">
    <div class="pub-wrap">
      ${secIx('04', 'Commercial and delivery dependencies', 'Before production release')}
      <div class="shead"><h2 class="display" >Commercial and delivery dependencies</h2><p class="sec-desc">Production is released when the approvals and the required payment are in place — not when the previous stage ends.</p></div>
      <div class="grid grid-3 gap-lg">
        ${[['Approvals','Each required garment approval, or a recorded authorised exception, before the specification is locked.'],
           ['Payment','The required amount stated in your proposal, confirmed received.'],
           ['Reorders','A reorder starts from the approved garment record and is checked for current availability, price and timing.']]
          .map(([h, p]) => `<div class="card"><h3 class="t-h4 card-t">${h}</h3><p class="t-sm muted">${p}</p></div>`).join('')}
      </div>
    </div>
  </section>

  <section class="pub-sec">
    <div class="pub-wrap">
      <div class="shead"><h2 class="sec-title">Tell us about your team.</h2><p class="sec-desc">Nine short topics, then a review. Sending the brief requests a review; it does not place an order.</p></div>
      <div class="btn-row btn-row--top">
        <button class="btn btn--primary btn--lg" data-go="public:form">Start your project brief</button>
      </div>
  </section>
  ${faqSection('custom', '—')}
  `, 'process');
}

function pubWork(){
  return pubShell(`
  ${pageHead('Pamuk Studio · Work', 'Uniform projects and development work.',
    'Explore the brief, the garment decisions and the status of each project. Every case names what failed first, because that is the part of the process worth reading.',
    {crumb: crumb([['Pamuk Studio','custom']], 'Work')})}
  <section class="pub-sec pub-sec--top">
    <div class="pub-wrap">
      ${secIx('—', 'Projects', CASES.length + ' published')}
      <div class="grid grid-3 gap-lg">
        ${CASES.map(c => `
        <article class="coll" data-go="public:case:${c.id}">
          <div class="coll-img"><img src="${imgOf(c.img) || ''}" alt="${esc(c.title)}" loading="lazy"></div>
          <div class="coll-b">
            <div class="eyebrow">${esc(c.sector)} · ${esc(c.status)}</div>
            <h2 class="t-h4 card-t">${esc(c.title)}</h2>
            <p class="t-sm muted">${c.scope}</p>
            <span class="lnk">View project — ${esc(c.title)}</span>
          </div>
        </article>`).join('')}
      </div>
      <p class="t-xs muted note">Status is stated per project. A development example is labelled as one and is not presented as delivered client work.</p>
    </div>
  </section>
  ${faqSection('custom', '—')}
  `, 'work');
}

function pubCase(id){
  const c = caseById(id);
  if(!c) return pubShell(pageHead('Pamuk Studio', 'That project does not exist.',
    'Every published project is listed on the work overview.',
    {after:`<div class="btn-row btn-row--top"><button class="btn btn--primary" data-go="public:work">See all work</button></div>`}), 'work');
  return pubShell(`
  ${pageHead('Pamuk Studio · Project', esc(c.title), c.scope,
    {crumb: crumb([['Pamuk Studio','custom'],['Work','work']], c.title),
     after:`<div class="chip-row"><span class="chip">${esc(c.sector)}</span><span class="chip">${esc(c.status)}</span></div>`})}
  <section class="pub-sec pub-sec--top">
    <div class="pub-wrap">
      <div class="feat">
        <figure class="feat-main feat-main--static">
          <div class="feat-img"><img src="${imgOf(c.img) || ''}" alt="${esc(c.title)}"></div>
          <figcaption class="t-xs muted feat-cap">${esc(c.media)}</figcaption>
        </figure>
        <div class="feat-side">
          <div class="card">
            <div class="eyebrow">The requirement</div>
            <p class="t-body card-t">${c.constraint}</p>
          </div>
          <div class="card">
            <div class="eyebrow">The decision</div>
            <p class="t-body card-t">${c.decision}</p>
          </div>
        </div>
      </div>
      <div class="banner banner--wait banner--top"><div>
        <div class="banner-t">What we learned</div>
        <div class="banner-d">${c.result}</div>
      </div></div>
    </div>
  </section>
  <section class="pub-sec pub-sec--tight surface-2">
    <div class="pub-wrap">
      <div class="shead"><h2 class="sec-title">Planning uniforms for a similar team?</h2><p class="sec-desc">Tell us about your roles, scope and timing. We’ll carry this project across as context — your answers stay your own.</p></div>
      <div class="btn-row btn-row--top">
        <button class="btn btn--primary btn--lg" data-act="briefCase" data-c="${c.id}">Discuss a similar project</button>
        <button class="btn btn--quiet" data-go="public:work">See other projects</button>
      </div>
    </div>
  </section>
  ${faqSection('custom', '—')}
  `, 'case');
}

function pubStudioHelp(){
  const groups = [['Starting', STUDIO_FAQ.slice(0, 4)],
                  ['Development', STUDIO_FAQ.slice(4, 9)],
                  ['Delivery and reorders', STUDIO_FAQ.slice(9)]];
  return pubShell(`
  ${pageHead('Pamuk Studio · Help', 'Help with your uniform project.',
    'The questions we are asked before a brief is sent. If your question is not here, ask it directly and we will answer it.',
    {crumb: crumb([['Pamuk Studio','custom']], 'Help')})}
  <section class="pub-sec pub-sec--top">
    <div class="pub-wrap stack">
      ${groups.map(([g, items]) => `
        <div>
          <div class="shead"><h2 class="sec-title">${g}</h2>
          <div class="faq faq--all">
            ${items.map(q => `<details class="faq-i"><summary class="faq-q">${q[0]}</summary>
              <div class="faq-a"><p class="t-sm">${q[1]}</p></div></details>`).join('')}
          </div>
        </div>`).join('')}
      <div class="btn-row btn-row--top">
        <button class="btn btn--primary" data-go="public:form">Start your project brief</button>
        <button class="btn btn--quiet" data-go="public:contact">Ask a question</button>
      </div>
    </div>
  </section>
  `, 'studiohelp');
}

/* ---- Merchandise FAQ ---------------------------------------------------- */
const MERCH_FAQ = [
  ['Do I pay when I request a quote?',
   'No. You select and configure products, then send a request for review. We confirm the proposal and any artwork requirements before you approve the relevant details and complete the agreed payment.'],
  ['What is the minimum order quantity?',
   'Minimums depend on the product and personalisation. Check the product page for the relevant quantity. If your request is below that amount or the minimum needs review, contact us with the product and quantity you have in mind.'],
  ['Is personalisation included in the displayed price?',
   'The price explanation states what is included and the quantity it is based on. Some configurations need artwork or method review before the full amount can be confirmed. Your reviewed quote sets out the products, decoration, charges, delivery and tax treatment.'],
  ['Can I request a quote without final artwork?',
   'Yes, where the product allows a request with artwork to follow. Choose that option or ask for artwork help. We may need the file before confirming the final method, setup cost or production proof.'],
  ['How do I know which method to choose?',
   'The product shows its available options. You can select a preference or ask us to recommend a method. We assess the garment, placement, dimensions and artwork before confirming the production details.'],
  ['When will my merchandise arrive?',
   'Tell us the destination and preferred date. Any initial estimate is subject to review. The confirmed schedule depends on product availability and the required artwork approvals and payment, so a requested date is not an automatic delivery commitment.'],
  ['Can I mix sizes or colours?',
   'Size and colour options depend on the product. Add the quantities you need and provide the size breakdown where available. Minimums and pricing may apply differently across colours or decoration setups; these are checked in the quote.'],
  ['Can I see a sample before the full order?',
   'Ask about sample availability, costs and timing for the product you are considering. A blank product sample, a decoration sample and a digital proof serve different purposes. We’ll clarify what is available before you proceed.'],
  ['Will I approve the artwork before production?',
   'Where a proof is required, we share the reviewed artwork and placement details for approval. Check the dimensions, content and relevant colour information. Production requires the applicable approvals and agreed payment, not just an uploaded file.'],
  ['Can I change my request?',
   'You can edit your basket before sending it. After submission, request a change through the quote conversation. Changes to an issued proposal may affect price, artwork or timing and require a revised version and renewed approval.'],
  ['Can I reorder the same items?',
   'Use the previous order or quote reference to request a repeat. We check the approved product and artwork record against current availability, price and timing before confirming the new order.'],
  ['What if something is wrong with the delivered order?',
   'Contact us with the order reference and a description of the issue so we can review it. The applicable terms explain the process for personalised products, defects and delivery problems. Check those terms before approving the order.'],
];

const METHODS = [
  ['Embroidery','A stitched finish. Suitability depends on the fabric, detail and size of your artwork.',
   'Setup applies per artwork. Size brackets follow the product rule.'],
  ['Screen printing','Printed ink with colour and setup requirements that depend on the design and quantity.',
   'Setup applies per colour. Unit rate falls as quantity rises.'],
  ['Transfer (DTF)','A transferred design, available on compatible products and placements.',
   'No setup charge. Full colour without a colour count.'],
  ['Direct to garment','A direct print option for compatible garments and artwork.',
   'No setup charge. Compatible garments only.'],
];

const ORDER_STEPS = [
  ['Build your request','Choose products, quantities and personalisation. Add artwork now or tell us it will follow.'],
  ['Receive a reviewed quote','We check the request and confirm the price, artwork requirements and proposed timing.'],
  ['Approve and pay','Review the quote and proof where required, approve the details, and complete the agreed payment.'],
  ['Production and delivery','Production starts once the required approvals and payment are in place. We share the confirmed delivery information.'],
];

function searchBar(v){
  return `
  <div class="srch">
    <label class="fld fld--grow"><span class="fld-l">Search products</span>
      <input class="inp" type="search" id="q" value="${esc(v || '')}"
        placeholder="Try a product name, garment type or reference"></label>
    <button class="btn btn--ghost" data-act="doSearch">Search</button>
  </div>`;
}

/* ---- shared merchandise components ------------------------------------- */

/* The category strip from the reference: a row of real product thumbnails
   that act as the primary filter on every listing page. */
function catStrip(active){
  return `
  <div class="cstrip" role="navigation" aria-label="Collections">
    ${catsInUse().map(c => {
      const im = catImg(c), on = c === active;
      return `<button class="cst ${on ? 'cst--on' : ''}" data-go="public:collection:${catSlug(c)}"
        aria-current="${on ? 'true' : 'false'}">
        <span class="cst-i">${im ? `<img src="${im}" alt="" loading="lazy">` : ''}</span>
        <span class="cst-l">${esc(catName(c))}</span>
      </button>`;}).join('')}
    <button class="cst ${!active ? 'cst--on' : ''}" data-go="public:products" aria-current="${!active ? 'true' : 'false'}">
      <span class="cst-i cst-i--all">${S.merchProducts.length}</span>
      <span class="cst-l">All products</span>
    </button>
  </div>`;
}

/* A horizontal carousel. Scroll-snapped, arrow-driven, and it degrades to a
   plain scrollable row without JavaScript. */
function carousel(id, cards, label){
  return `
  <div class="carou" id="${id}">
    <div class="carou-h">
      <span class="eyebrow">${label}</span>
      <span class="spacer"></span>
      <button class="carou-b" data-act="carouPrev" data-c="${id}" aria-label="Previous products">←</button>
      <button class="carou-b" data-act="carouNext" data-c="${id}" aria-label="Next products">→</button>
    </div>
    <div class="carou-t" id="${id}-t">${cards.join('')}</div>
  </div>`;
}

/* Reviews. We hold no review data, and the specification forbids inventing
   any, so the section ships as a designed slot naming the fields a verified
   source has to supply. */
function reviewsSlot(){
  return `
  <section class="pub-sec pub-sec--tight sec--red">
    <div class="pub-wrap">
      ${secIx('—', 'Customer reviews', 'Awaiting a verified source')}
      <div class="split split--narrow split--sticky">
        <div class="split-b">
          <h2 class="pull">What customers say.</h2>
          <p class="t-sm muted" style="margin-top:var(--sp-4)">Reviews are published from a verified review
            platform, not written in-house. Until that feed is connected, these slots stay empty rather than
            carry invented praise.</p>
        </div>
        <div class="split-b">
          <div class="grid grid-2 gap-lg">
            ${[1,2,3,4].map(() => `
            <div class="ph ph--1x1 rev-ph">
              <div class="ph-in">
                <div class="ph-id">REVIEW SLOT</div>
                <div class="ph-d">Reviewer name · rating · date · title · body · link to the source review</div>
              </div>
            </div>`).join('')}
          </div>
        </div>
      </div>
    </div>
  </section>`;
}

/* FAQ appears on every page. The set is chosen by branch. */
function faqSection(branch, ix){
  const items = branch === 'merch' ? MERCH_FAQ : STUDIO_FAQ;
  const help  = branch === 'merch' ? 'merchhelp' : 'studiohelp';
  return `
  <section class="pub-sec pub-sec--tight surface-2 ${branch === 'merch' ? 'sec--red' : ''}">
    <div class="pub-wrap">
      ${secIx(ix || '—', 'Frequently asked questions', 'Twelve answers')}
      <div class="split split--narrow split--sticky">
        <div class="split-b">
          <h2 class="pull">Questions before you decide?</h2>
          <p class="t-sm muted" style="margin-top:var(--sp-4)">The essentials, answered here. Read all of them on
            the help page, or ask us something that is not covered.</p>
          <div style="margin-top:var(--sp-5)" data-go="public:${help}">${arrow('All questions')}</div>
          <div style="margin-top:var(--sp-3)" data-go="public:contact">${arrow('Contact our team')}</div>
        </div>
        <div class="split-b">${faqBlock(items, 'faq-' + branch + '-' + (ix || 'x'))}</div>
      </div>
    </div>
  </section>`;
}

/* ---- Merchandise home --------------------------------------------------- */
function pubMerch(){
  const top = ['m_asher','m_coaster_vintage','m_stanley_denim_shirt','m_archer_vintage','m_bomber',
               'm_bucket_hat','m_astor','m_barreler','m_brooker','m_duffle_bag']
    .map(id => by(S.merchProducts, id)).filter(Boolean);
  const ten = top.length >= 10 ? top.slice(0, 10)
            : S.merchProducts.filter(p => prodImg(p)).slice(0, 10);
  /* the two largest families lead the page */
  const lead = catsInUse().map(c => ({c, n: catList(c).length}))
    .sort((a, b) => b.n - a.n).slice(0, 2);
  return pubShell(`
  <section class="bleed bleed--tall">
    ${imgOf('m_bomber_2_0') ? `<img class="bleed-img" src="${imgOf('m_bomber_2_0')}" alt="Catalogue products carrying a decoration example">` : ''}
    <span class="bleed-veil"></span>
    <div class="pub-wrap bleed-in">
      <div class="eyebrow">Pamuk Merchandise</div>
      <h1 class="display" >Merchandise selected by you, personalised for your brand.</h1>
      <p class="lede" style="margin-top:var(--sp-6)">Clothing and accessories you configure and we
        review. Choose the product, the colour and the personalisation, and we quote it before anything is made.</p>
      <div class="btn-row btn-row--top">
        <button class="btn btn--primary btn--lg" data-go="public:collections">Browse the collections</button>
        <button class="btn btn--onphoto btn--lg" data-go="public:howto">How ordering works</button>
      </div>
      <p class="cap" style="margin-top:var(--sp-7)"><b>No payment when you request a quote</b><span>Catalogue products · decoration example</span></p>
    </div>
  </section>

  <section class="pub-sec pub-sec--tight sec--red">
    <div class="pub-wrap">
      ${secIx('01', 'Where most programmes start', 'Two largest families')}
    </div>
    <div class="duo">
      ${lead.map(({c, n}, k) => `
      <article class="duo-h hovr" data-go="public:collection:${catSlug(c)}">
        ${catImg(c) ? `<img class="duo-img" src="${catImg(c)}" alt="${esc(catName(c))}" loading="lazy">` : ''}
        <span class="duo-veil"></span>
        <span class="duo-ix">${String(k + 1).padStart(2, '0')}</span>
        <div class="duo-b">
          <h2 class="duo-t">${esc(catName(c))}</h2>
          <p class="duo-d">${catCopy(c)}</p>
          <span class="duo-m">${n} products · from ${money(catList(c).filter(p => !p.quoteOnly).map(p => p.from).sort((a, b) => a - b)[0])}</span>
          <span class="gate-go">View collection<span></span></span>
        </div>
      </article>`).join('')}
    </div>
  </section>

  <section class="pub-sec pub-sec--tight surface-2 sec--red">
    <div class="pub-wrap">
      ${secIx('02', 'Ten to start from', 'Chosen for how they carry decoration')}
      ${carousel('c-top', ten.map(pcard), 'Selected products')}
      <div class="btn-row btn-row--top">
        <button class="btn btn--primary" data-go="public:products">View all ${S.merchProducts.length} products</button>
      </div>
    </div>
  </section>

  <section class="pub-sec sec--red">
    <div class="pub-wrap">
      ${secIx('03', 'Quality and certification', 'What is checked, and what is claimed')}
      <div class="split">
        <div class="card card--pad">
          <div class="eyebrow">Checked on every product we list</div>
          <h2 class="t-h3 card-t">What we verify before a product reaches the catalogue</h2>
          <ul class="ticks">
            ${['Fabric weight in g/m², stated on the product, because weight changes how a print reads',
               'Composition and construction, so a decoration method can be matched to the surface',
               'The decoration methods and placements the garment actually supports',
               'Colour range and size range held against the supplier record, not a marketing page',
               'Mill and country of manufacture where the supplier documents it']
              .map(x => `<li>${x}</li>`).join('')}
          </ul>
        </div>
        <div class="card card--pad">
          <div class="eyebrow">Certification</div>
          <h2 class="t-h3 card-t">Claimed per product, never across the catalogue</h2>
          <p class="t-sm muted">Our suppliers hold recognised textile and social certifications, but they apply to
            specific products and production runs — not to everything we sell. A badge is shown on a product only
            once the certificate is on file for that product.</p>
          <div class="certs">
            ${['Organic content','Recycled content','Chemical safety','Social compliance']
              .map(x => `<div class="cert"><span class="cert-n">${x}</span>
                <span class="cert-s">Confirmed per product</span></div>`).join('')}
          </div>
          <div class="card-foot t-xs">Ask us which certifications apply to the products in your request and we
            will send the certificates that cover them.</div>
        </div>
      </div>
    </div>
  </section>

  <section class="pub-sec pub-sec--tight sec--dark sec--red">
    <div class="pub-wrap">
      <div class="reass">
        ${[['No payment at request','Configure and send. Nothing is charged until you approve a reviewed quote.'],
           ['A proof before production','Where a proof is required you approve the artwork, size and position first.'],
           ['Artwork kept on file','An approved file is archived, so a repeat run skips setup where the method is unchanged.'],
           ['One workshop','Every method is produced in house, so a t-shirt and an overcoat carry the same mark.']]
          .map(([h, p], k) => `<div class="reass-i">
            <span class="reass-n">${String(k + 1).padStart(2, '0')}</span>
            <div><div class="reass-h">${h}</div><p class="reass-p">${p}</p></div>
          </div>`).join('')}
      </div>
    </div>
  </section>

  ${faqSection('merch', '04')}
  `, 'merch');
}

function collCard(c){
  const im = catImg(c), n = catList(c).length;
  return `
  <div class="coll" data-go="public:collection:${catSlug(c)}">
    <div class="coll-img">${im ? `<img src="${im}" alt="${esc(catName(c))}" loading="lazy">` : ''}</div>
    <div class="coll-b">
      <h3 class="t-h4 card-t">${esc(catName(c))}</h3>
      <p class="t-sm muted">${catCopy(c)}</p>
      <div class="card-foot t-xs num">${n} product${n === 1 ? '' : 's'}</div>
    </div>
  </div>`;
}

/* ---- product filters: real catalogue fields, not marketing labels ------ */
function listState(){
  const f = UI.flt = UI.flt || {};
  f.cats = f.cats || []; f.methods = f.methods || []; f.sort = f.sort || 'recommended';
  f.qty = f.qty || ''; f.price = f.price || '';
  return f;
}
function applyFilters(list){
  const f = listState();
  let out = list.slice();
  if(f.cats.length)    out = out.filter(p => f.cats.includes(p.cat));
  if(f.methods.length) out = out.filter(p => (p.pers || []).some(m => f.methods.includes(m)));
  if(f.qty)            out = out.filter(p => p.moq <= (+f.qty || 0));
  if(f.price === 'u20')   out = out.filter(p => !p.quoteOnly && p.from < 20);
  if(f.price === '20_40') out = out.filter(p => !p.quoteOnly && p.from >= 20 && p.from < 40);
  if(f.price === 'o40')   out = out.filter(p => !p.quoteOnly && p.from >= 40);
  if(f.price === 'req')   out = out.filter(p => p.quoteOnly);
  /* a product with no comparable price sorts after the priced ones */
  if(f.sort === 'plh')  out.sort((a, b) => (a.quoteOnly - b.quoteOnly) || (a.from - b.from));
  if(f.sort === 'phl')  out.sort((a, b) => (a.quoteOnly - b.quoteOnly) || (b.from - a.from));
  if(f.sort === 'name') out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}
function activeChips(){
  const f = listState(), out = [];
  f.cats.forEach(c => out.push([catName(c), 'rmCat', c]));
  f.methods.forEach(m => out.push([(S.personalization[m] || {}).name || m, 'rmMethod', m]));
  if(f.qty) out.push([`Quantity ${f.qty}`, 'rmQty', '']);
  if(f.price) out.push([{u20:'Under €20', '20_40':'€20–€40', o40:'€40 and over', req:'Price on request'}[f.price], 'rmPrice', '']);
  return out;
}
function filterBar(scope){
  const f = listState(), chips = activeChips();
  const methods = Object.keys(S.personalization || {});
  return `
  <div class="flt">
    <details class="flt-d" ${UI.fltOpen ? 'open' : ''}>
      <summary class="flt-q">Filter${chips.length ? ` <span class="badge-n">${chips.length}</span>` : ''}</summary>
      <div class="flt-b">
        ${scope === 'all' ? `<fieldset class="flt-g"><legend class="eyebrow">Collection</legend>
          <div class="chip-row">${catsInUse().map(c => `<button class="tab ${f.cats.includes(c) ? 'tab--on' : ''}"
            data-act="fCat" data-v="${esc(c)}" aria-pressed="${f.cats.includes(c)}">${esc(catName(c))}</button>`).join('')}</div>
        </fieldset>` : ''}
        <fieldset class="flt-g"><legend class="eyebrow">Personalisation method</legend>
          <div class="chip-row">${methods.map(m => `<button class="tab ${f.methods.includes(m) ? 'tab--on' : ''}"
            data-act="fMethod" data-v="${esc(m)}" aria-pressed="${f.methods.includes(m)}">${esc((S.personalization[m] || {}).name || m)}</button>`).join('')}</div>
          <p class="t-xs muted">Final artwork suitability is reviewed for your design.</p>
        </fieldset>
        <fieldset class="flt-g"><legend class="eyebrow">Price at the product minimum</legend>
          <div class="chip-row">${[['u20','Under €20'],['20_40','€20–€40'],['o40','€40 and over'],['req','Price on request']]
            .map(([v, n]) => `<button class="tab ${f.price === v ? 'tab--on' : ''}" data-act="fPrice" data-v="${v}"
              aria-pressed="${f.price === v}">${n}</button>`).join('')}</div>
        </fieldset>
        <fieldset class="flt-g"><legend class="eyebrow">Quantity you need</legend>
          <label class="fld"><span class="fld-l">Show products whose minimum fits this quantity</span>
            <input class="inp inp--sm" type="number" min="1" id="fqty" value="${esc(f.qty)}" placeholder="e.g. 75"></label>
          <button class="btn btn--ghost btn--sm" data-act="fQty">Apply quantity</button>
        </fieldset>
      </div>
    </details>
    <label class="fld fld--inline"><span class="fld-l">Sort</span>
      <select class="inp inp--sm" data-act="fSort">
        ${[['recommended','Recommended'],['plh','Price low to high'],['phl','Price high to low'],['name','Name A–Z']]
          .map(([v, n]) => `<option value="${v}" ${f.sort === v ? 'selected' : ''}>${n}</option>`).join('')}
      </select></label>
  </div>
  ${chips.length ? `<div class="applied">
    <span class="t-xs muted">Applied:</span>
    ${chips.map(([n, a, v]) => `<button class="chip chip--x" data-act="${a}" data-v="${esc(v)}">${esc(n)} ✕</button>`).join('')}
    <button class="btn btn--quiet btn--sm" data-act="fClear">Clear all</button>
  </div>` : ''}`;
}

/* ---- listing pages ------------------------------------------------------
   The reference leads with a category strip and a dense grid, and pages by
   scrolling. We keep a real "Load more" control beside the observer so the
   list is operable by keyboard and the remaining count is always stated. */
const PAGE_STEP = 24;

function listBody(list, total, emptyMsg){
  const shown = Math.min(UI.shown || PAGE_STEP, list.length);
  const rest  = list.length - shown;
  if(!list.length) return `
    <div class="card card--quiet empty">
      <h3 class="t-h4">${emptyMsg}</h3>
      <p class="t-sm muted">Remove a filter, or ask us to help find an option.</p>
      <div class="btn-row btn-row--top">
        <button class="btn btn--ghost btn--sm" data-act="fClear">Clear all filters</button>
        <button class="btn btn--quiet btn--sm" data-go="public:merchhelp">Get help choosing</button>
      </div>
    </div>`;
  return `
    <div class="grid grid-auto pgrid">${list.slice(0, shown).map(pcard).join('')}</div>
    <div class="more" id="more">
      <span class="t-sm muted num">Showing ${shown} of ${list.length}${
        total && total !== list.length ? ` · ${total} in the catalogue` : ''}</span>
      ${rest > 0
        ? `<button class="btn btn--ghost" data-act="more">Load ${Math.min(rest, PAGE_STEP)} more</button>`
        : `<span class="t-sm muted">End of the list</span>`}
    </div>`;
}

function pubProducts(){
  const all = S.merchProducts, list = applyFilters(all);
  return pubShell(`
  ${pageHead('Pamuk Merchandise', 'Personalised clothing.',
    'Every product you can personalise, with its minimum, its colour range and the price basis on the card. Filter by collection, method, price or the quantity you actually need.',
    {red:true, crumb: crumb([['Pamuk Merchandise','merch']], 'Products'),
     after: catStrip(null) + searchBar('')})}
  <section class="pub-sec pub-sec--top sec--red">
    <div class="pub-wrap">
      ${filterBar('all')}
      ${listBody(list, all.length, 'No products match these filters.')}
    </div>
  </section>
  ${faqSection('merch', '—')}
  ${seoBlock('all')}
  `, 'products');
}

function pubCollection(slug){
  const c = catFromSlug(slug);
  if(!c) return pubShell(pageHead('Pamuk Merchandise', 'That collection does not exist.',
    'Every collection in the catalogue is listed on the collections page.',
    {red:true, after:`<div class="btn-row btn-row--top"><button class="btn btn--primary" data-go="public:collections">See all collections</button></div>`})
    + faqSection('merch', '—'), 'collections');
  const all = catList(c), list = applyFilters(all);
  return pubShell(`
  ${pageHead('Pamuk Merchandise', `Personalised ${catName(c).toLowerCase()}.`, catCopy(c),
    {red:true, crumb: crumb([['Pamuk Merchandise','merch'],['Collections','collections']], catName(c)),
     after: catStrip(c)})}
  <section class="pub-sec pub-sec--top sec--red">
    <div class="pub-wrap">
      ${filterBar('cat')}
      ${listBody(list, all.length, `No ${catName(c).toLowerCase()} match these filters.`)}
    </div>
  </section>
  ${faqSection('merch', '—')}
  ${seoBlock(c)}
  `, 'collection');
}

/* The reference closes a listing with a substantial written block. It is
   guidance for a buyer, not a keyword field. */
function seoBlock(scope){
  const c = scope === 'all' ? null : scope;
  return `
  <section class="pub-sec pub-sec--tight sec--red">
    <div class="pub-wrap">
      <div class="split split--narrow split--sticky guide">
        <div class="split-b">
          <span class="sec-ix">Guidance</span>
          <h2 class="sec-title">${c ? `Choosing ${catName(c).toLowerCase()} for a branded run`
            : 'Choosing personalised clothing for your company'}</h2>
          <div class="btn-row btn-row--top read-cta">
            <button class="btn btn--ghost" data-go="public:method">How personalisation is priced</button>
            <button class="btn btn--quiet" data-go="public:merchhelp">Get help choosing</button>
          </div>
        </div>
        <div class="split-b">
      <p class="t-body">${c ? catCopy(c) + ' ' : ''}The decision that matters most is
        rarely the garment — it is the weight of the fabric and the surface it gives a decoration. A light jersey
        takes a large screen print cleanly and reads as a campaign piece; a heavier loopback or a brushed fleece
        holds embroidery without puckering and survives more washes. Compare weight in g/m² before comparing the
        starting price, because two products at the same price can behave completely differently under the same mark.</p>
      <p class="t-body">Quantity changes the method as much as the cost. Below about a
        hundred pieces a transfer usually makes more sense than screens, because the setup per colour has nowhere to
        amortise. Above it, screen printing becomes the cheaper answer and stays that way as the run grows. Embroidery
        is priced on the area it covers rather than the colours it uses, which is why a small chest mark on a heavier
        garment is often the most economical way to carry an identity.</p>
      <p class="t-body">Everything in the catalogue is decorated in our own workshop and
        quoted before it is made. Minimums and lead times are stated per product, artwork is reviewed for suitability
        rather than accepted blindly, and an approved file is archived so a second run matches the first. If you are
        unsure which product suits your artwork, send us the file and the quantity and we will tell you which
        garments in this list will carry it well.</p>
        </div>
      </div>
    </div>
  </section>`;
}

function pubCollections(){
  return pubShell(`
  ${pageHead('Pamuk Merchandise', 'Explore merchandise by product.',
    'Choose a category to compare products, quantities and available personalisation.',
    {red:true, crumb: crumb([['Pamuk Merchandise','merch']], 'Collections'), after: searchBar('')})}
  <section class="pub-sec pub-sec--top sec--red">
    <div class="pub-wrap">
      <div class="grid gap-lg coll-grid" data-n="${catsInUse().length}">
        ${catsInUse().map(c => collCard(c)).join('')}
      </div>
    </div>
  </section>
  ${faqSection('merch', '—')}
  ${seoBlock('all')}
  `, 'collections');
}

function pubSearch(){
  const q = (UI.q || '').trim();
  const hit = !q ? [] : S.merchProducts.filter(p =>
    (p.name + ' ' + p.ref + ' ' + p.cat + ' ' + (p.desc || '')).toLowerCase().includes(q.toLowerCase()));
  const list = q ? applyFilters(hit) : [];
  return pubShell(`
  ${pageHead('Pamuk Merchandise', q ? `Results for “${esc(q)}”` : 'Search products',
    q ? `${hit.length} product${hit.length === 1 ? '' : 's'} match this term. Search covers product names, references and categories.`
      : 'Search by product name, garment type or reference. You can also browse the collections.',
    {red:true, crumb: crumb([['Pamuk Merchandise','merch']], 'Search'), after: catStrip(null) + searchBar(q)})}
  <section class="pub-sec pub-sec--top sec--red">
    <div class="pub-wrap">
      ${!q ? `<div class="grid gap-lg coll-grid" data-n="${catsInUse().length}">
                ${catsInUse().map(c => collCard(c)).join('')}</div>`
        : !hit.length ? `<div class="card card--quiet empty">
            <h2 class="t-h4">We couldn’t find a match for “${esc(q)}”.</h2>
            <p class="t-sm muted">Check the spelling, try a garment type such as hoodie or polo, or browse the collections.</p>
            <div class="btn-row btn-row--top">
              <button class="btn btn--ghost btn--sm" data-go="public:collections">Browse collections</button>
              <button class="btn btn--quiet btn--sm" data-go="public:merchhelp">Get help choosing</button>
            </div></div>`
        : `${filterBar('all')}${listBody(list, hit.length, 'No results match these filters.')}`}
    </div>
  </section>
  ${faqSection('merch', '—')}
  `, 'search');
}

/* ---- blog ---------------------------------------------------------------
   Written from what the workshop actually knows. Every piece answers a
   question a buyer asks before ordering, so it earns its place rather than
   filling a content calendar. */
const POSTS = [
  {id:'weight-vs-price', cat:'Merchandise', read:'6 min', date:'2 September 2026',
   title:'Fabric weight decides more than price does',
   lede:'Two t-shirts at the same price can behave completely differently under the same print. Weight, not cost, is the first number to compare.',
   img:'m_asher',
   body:[
     ['Why 150 and 220 are different products','A 150 g/m² jersey is a campaign piece: light, cheap to ship, and it takes a large screen print cleanly because the ink sits on a smooth, thin surface. A 220 g/m² tee is a wardrobe piece. It holds its shape through more washes, drapes rather than clings, and carries embroidery without the fabric puckering around the stitch. Buying the lighter one for a uniform-adjacent use, or the heavier one for a one-day event, is the most common and most expensive mistake we see.'],
     ['What weight does to a decoration','Embroidery needs something to sit on. Below roughly 180 g/m² the stitch pulls the cloth and the mark distorts after the first wash, which is why we move a chest logo to transfer or print on light garments rather than force the thread. Screen print is the opposite: a smooth, lighter surface takes flat colour better than a brushed fleece, where the pile lifts through the ink.'],
     ['How to compare honestly','Put the weight beside the price on every product you are considering, and compare those two numbers together. Our cards state g/m² for that reason. If a supplier will not tell you the weight, you cannot compare their price to anyone else’s.'],
   ]},
  {id:'quantity-changes-method', cat:'Merchandise', read:'5 min', date:'26 August 2026',
   title:'The quantity you order decides the decoration method',
   lede:'Screens have a setup cost with nowhere to amortise on a short run. Below about a hundred pieces, that single fact changes the right answer.',
   img:'m_archer_vintage',
   body:[
     ['Setup is the whole argument','Screen printing charges a setup per colour, once per artwork. At 500 pieces that cost disappears into the run. At 30 it dominates, and a four-colour design carries four of them. Transfer has no setup at all, which is exactly why a run of twenty-five is viable in the first place.'],
     ['Where the crossover sits','Roughly a hundred pieces, for most flat-colour designs. Below it, transfer usually wins. Above it, screen print takes over and the gap widens with every additional piece. The crossover moves with the colour count: a one-colour design justifies screens sooner, a six-colour design may never justify them at your volume.'],
     ['Embroidery is priced differently','Embroidery is costed on the area it covers, not the number of colours in it. A fifteen-colour crest at 60 mm can cost less than a two-colour logo at 140 mm. If your artwork is small and detailed, ask for embroidery before you assume print is cheaper.'],
   ]},
  {id:'fitting-on-shift', cat:'Custom uniforms', read:'7 min', date:'19 August 2026',
   title:'Fit the prototype on a shift, not in a meeting room',
   lede:'Almost every uniform failure we have recorded was a movement fault, and none of them appeared in a specification review.',
   img:'m_palmer',
   body:[
     ['What a fitting is actually for','A drawing shows proportion. A fitting shows whether someone can reach a top shelf, carry a tray through a doorway, or bend over a bed without the garment betraying them. Those are not aesthetic questions and they cannot be answered by looking at a sample on a hanger.'],
     ['Two faults we did not predict','A wrap jacket failed because the sleeve bound through the bicep during a treatment — the garment was correct at rest and impossible in use. A clinical tunic was rejected on pocket depth, because a pen fell out when staff leaned over a bed. Neither fault was visible in the specification review that approved both.'],
     ['Approve one garment at a time','Approving a set hides the one garment that does not work, and that is the garment you will hear about for two years. We record feedback and approval per garment so an approved piece is never reopened because another needs changing.'],
   ]},
  {id:'reorder-that-matches', cat:'Custom uniforms', read:'4 min', date:'12 August 2026',
   title:'Why the second order is the real test',
   lede:'A uniform programme succeeds the first time it is reordered by someone who was not involved in the first order.',
   img:'m_brooker',
   body:[
     ['The archive, not the design','What makes a reorder match is not the design file. It is the approved revision — measurements, fabrics, colour references, suppliers and the decoration position — stored as a snapshot at the moment it was approved. We produce against that record rather than against a memory of what was agreed.'],
     ['What is rechecked anyway','Availability, price and timing. A fabric can be discontinued and a mill can change. A reorder starts from the approved specification and then verifies those three things before it is confirmed, which is why we will not quote a repeat instantly.'],
   ]},
];
const postById = (id) => POSTS.find(p => p.id === id) || null;

function pubBlog(){
  const [lead, ...rest] = POSTS;
  return pubShell(`
  ${pageHead('Pamuk', 'What we have learned making these.',
    'Notes from the workshop on fabric, decoration, fitting and reordering. Each one answers a question we are actually asked before an order.')}
  <section class="pub-sec pub-sec--top">
    <div class="pub-wrap">
      ${secIx('—', 'Latest', POSTS.length + ' articles')}
      <article class="split split--wide hovr post-lead" data-go="public:post:${lead.id}">
        <div class="split-b">${fig(imgOf(lead.img), lead.title, lead.cat, lead.date + ' · ' + lead.read + ' read', '3x2')}</div>
        <div class="split-b">
          <div class="eyebrow">${esc(lead.cat)} · ${esc(lead.read)} read</div>
          <div class="shead"><h2 class="display" style="margin-top:var(--sp-4)">${esc(lead.title)}</h2><p class="lede" style="margin-top:var(--sp-5)">${esc(lead.lede)}</p></div></div>
          <div style="margin-top:var(--sp-5)">${arrow('Read the article')}</div>
        </div>
      </article>
      <div class="grid grid-3 gap-lg" style="margin-top:var(--sp-9)">
        ${rest.map(p => `
        <article class="coll hovr" data-go="public:post:${p.id}">
          <div class="coll-img"><img src="${imgOf(p.img) || ''}" alt="${esc(p.title)}" loading="lazy"></div>
          <div class="coll-b">
            <div class="eyebrow">${esc(p.cat)} · ${esc(p.read)} read</div>
            <h3 class="t-h4 card-t">${esc(p.title)}</h3>
            <p class="t-sm muted">${esc(p.lede)}</p>
            <div class="card-foot t-xs">${esc(p.date)}</div>
          </div>
        </article>`).join('')}
      </div>
    </div>
  </section>
  ${faqSection('merch', '—')}
  `, 'blog');
}

function pubPost(id){
  const p = postById(id);
  if(!p) return pubShell(pageHead('Pamuk', 'That article does not exist.',
    'Everything we have published is listed on the journal.',
    {after:`<div class="btn-row btn-row--top"><button class="btn btn--primary" data-go="public:blog">All articles</button></div>`}), 'blog');
  const more = POSTS.filter(x => x.id !== p.id).slice(0, 3);
  return pubShell(`
  ${pageHead(esc(p.cat) + ' · ' + esc(p.read) + ' read', esc(p.title), esc(p.lede),
    {crumb: crumb([['Journal','blog']], p.title)})}
  <section class="pub-sec pub-sec--top">
    <div class="pub-wrap">
      ${fig(imgOf(p.img), p.title, p.cat, p.date, '21x9')}
      <div class="split split--narrow split--sticky" style="margin-top:var(--sp-9)">
        <div class="split-b">
          <div class="eyebrow">Published</div>
          <p class="t-sm muted">${esc(p.date)}</p>
          <div class="eyebrow" style="margin-top:var(--sp-5)">In this article</div>
          <ol class="steps">${p.body.map(([h]) => `<li>${esc(h)}</li>`).join('')}</ol>
        </div>
        <div class="split-b read">
          ${p.body.map(([h, t]) => `<h2 class="t-h3" style="margin-top:var(--sp-7)">${esc(h)}</h2>
            <p class="t-body" style="margin-top:var(--sp-4)">${esc(t)}</p>`).join('')}
          <div class="btn-row btn-row--top">
            <button class="btn btn--primary" data-go="public:${p.cat === 'Merchandise' ? 'products' : 'form'}">
              ${p.cat === 'Merchandise' ? 'Browse products' : 'Start your project brief'}</button>
            <button class="btn btn--quiet" data-go="public:blog">More articles</button>
          </div>
        </div>
      </div>
    </div>
  </section>
  <section class="pub-sec pub-sec--tight surface-2">
    <div class="pub-wrap">
      ${secIx('—', 'Keep reading', more.length + ' articles')}
      <div class="grid grid-3 gap-lg">
        ${more.map(x => `
        <article class="coll hovr" data-go="public:post:${x.id}">
          <div class="coll-img"><img src="${imgOf(x.img) || ''}" alt="${esc(x.title)}" loading="lazy"></div>
          <div class="coll-b">
            <div class="eyebrow">${esc(x.cat)} · ${esc(x.read)} read</div>
            <h3 class="t-h4 card-t">${esc(x.title)}</h3>
            <div class="card-foot t-xs">${esc(x.date)}</div>
          </div>
        </article>`).join('')}
      </div>
    </div>
  </section>
  ${faqSection(p.cat === 'Merchandise' ? 'merch' : 'custom', '—')}
  `, 'post');
}

/* ---- merchandise support pages ----------------------------------------- */
function pubMethod(){
  const rows = [
    ['Appearance and feel','Stitched thread sitting on the surface','Ink laid into the fabric','Film bonded to the surface','Ink printed into the fibre'],
    ['Suited to','Heavier surfaces — sweatshirts, caps, outerwear, shirt chests','Flat colour artwork, larger prints, higher quantities','Short runs, many colours, small marks','Photographic artwork on cotton-rich garments'],
    ['Artwork considerations','Fine detail and small text are limited by stitch size','Each colour needs its own screen','Full colour without a colour count','Full colour; fabric affects result'],
    ['Size or colour limits','Size bracket drives the cost','Colour count drives the setup','Placement must be compatible','Compatible garments only'],
    ['Price drivers','Stitch area and setup per artwork','Setup per colour, unit rate falls with quantity','Unit rate only','Unit rate only, slower per piece'],
    ['Care','Durable through repeated industrial laundry','Durable when cured correctly','Follow the garment care instruction','Follow the garment care instruction'],
  ];
  return pubShell(`
  ${pageHead('Pamuk Merchandise · Personalisation', 'Find the right personalisation for your product.',
    'Compare the available finishes and see what information helps us review your artwork. Product compatibility and the final proof determine what can be produced.',
    {red:true, crumb: crumb([['Pamuk Merchandise','merch']], 'Personalisation')})}
  <section class="pub-sec pub-sec--top">
    <div class="pub-wrap">
      <div class="tw">
        <table class="tbl">
          <thead><tr><th scope="col">Compare</th>${METHODS.map(m => `<th scope="col">${m[0]}</th>`).join('')}</tr></thead>
          <tbody>${rows.map(r => `<tr><th scope="row">${r[0]}</th>${r.slice(1).map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
      </div>
      <p class="t-xs muted note">No method is best for every product. The available options on each product page are the ones that product supports.</p>
    </div>
  </section>
  <section class="pub-sec pub-sec--tight surface-2">
    <div class="pub-wrap">
      <h2 class="sec-title">Placement and artwork</h2>
      <div class="grid grid-3 gap-lg">
        ${[['Placements','A garment carries the placements its product rule allows — commonly a chest mark, a back mark and one more. Seams, pockets and printable area can restrict what is possible.'],
           ['Artwork we can use','Vector files reproduce at any size without redrawing. A high resolution raster file works for transfer and direct to garment. We review suitability before production.'],
           ['Proof','Where a proof is required we share the reviewed artwork, dimensions and position for approval. A proof is not a photograph of the finished product, and approving it is separate from approving the quote.']]
          .map(([h, p]) => `<div class="card"><h3 class="t-h4 card-t">${h}</h3><p class="t-sm muted">${p}</p></div>`).join('')}
      </div>
      <div class="btn-row btn-row--top">
        ${UI.mFrom ? `<button class="btn btn--primary" data-go="public:product:${esc(UI.mFrom)}">Return to ${esc((by(S.merchProducts, UI.mFrom) || {}).name || 'the product')}</button>` : ''}
        <button class="btn btn--ghost" data-go="public:products">Browse products</button>
      </div>
    </div>
  </section>
  ${faqSection('merch', '—')}
  `, 'method');
}

function pubHowTo(){
  const objects = [
    ['Blank sample','Physical product without the final decoration','Assess material, size and fit, under the approved sample policy'],
    ['Decoration sample','Physical example of a method or a specific decorated item','Assess the finish; establish whether it is the exact production sample'],
    ['Digital proof','Reviewed artwork placement and production information','Approve the specified artwork version and dimensions'],
    ['Reviewed quote','Commercial proposal for the specified scope','Accept price, terms and relevant schedule conditions'],
  ];
  return pubShell(`
  ${pageHead('Pamuk Merchandise · How to order', 'From product selection to your approved order.',
    'Four steps, and four different things you may be asked to approve. No payment is taken when you submit a quote request.',
    {red:true, crumb: crumb([['Pamuk Merchandise','merch']], 'How to order')})}
  <section class="pub-sec pub-sec--top">
    <div class="pub-wrap">
      <div class="grid grid-4 gap-lg">
        ${ORDER_STEPS.map(([h, p], i) => `<div class="card card--num">
          <div class="eyebrow">${String(i + 1).padStart(2, '0')}</div>
          <h2 class="t-h4 card-t">${h}</h2><p class="t-sm muted">${p}</p></div>`).join('')}
      </div>
    </div>
  </section>
  <section class="pub-sec pub-sec--tight surface-2">
    <div class="pub-wrap">
      <div class="shead"><h2 class="sec-title">Four things that are not the same</h2>
        <p class="sec-desc">Viewing a digital mockup does not establish fabric feel, exact colour or
          physical fit. These four objects answer different questions.</p></div>
      <div class="tw">
        <table class="tbl">
          <thead><tr><th scope="col">Object</th><th scope="col">What it is</th><th scope="col">What you decide</th></tr></thead>
          <tbody>${objects.map(r => `<tr><th scope="row">${r[0]}</th><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('')}</tbody>
        </table>
      </div>
    </div>
  </section>
  <section class="pub-sec">
    <div class="pub-wrap">
      <div class="shead"><h2 class="sec-title">What the quote includes</h2></div>
      <div class="grid grid-2 gap-lg">
        ${[['Stated in every reviewed quote','Products and quantities, decoration method and placement, setup charges, delivery basis and tax treatment, and the version the approval applies to.'],
           ['Confirmed before production','The required approvals, the artwork proof where one is needed, and the agreed payment. Production is released when those are in place, not when the quote is sent.']]
          .map(([h, p]) => `<div class="card"><h3 class="t-h4 card-t">${h}</h3><p class="t-sm muted">${p}</p></div>`).join('')}
      </div>
      <div class="btn-row btn-row--top">
        <button class="btn btn--primary" data-go="public:products">Browse products</button>
        ${quoteCount() ? `<button class="btn btn--ghost" data-go="public:quote">Review your quote request</button>` : ''}
      </div>
    </div>
  </section>
  ${faqSection('merch', '—')}
  `, 'howto');
}

function pubMerchHelp(){
  return pubShell(`
  ${pageHead('Pamuk Merchandise · Help', 'Help with your merchandise request.',
    'The questions buyers ask before sending a quote request, and a direct route if yours is not answered here.',
    {red:true, crumb: crumb([['Pamuk Merchandise','merch']], 'Help')})}
  <section class="pub-sec pub-sec--top">
    <div class="pub-wrap">
      <div class="faq faq--all">
        ${MERCH_FAQ.map(q => `<details class="faq-i"><summary class="faq-q">${q[0]}</summary>
          <div class="faq-a"><p class="t-sm">${q[1]}</p></div></details>`).join('')}
      </div>
    </div>
  </section>
  <section class="pub-sec pub-sec--tight surface-2">
    <div class="pub-wrap">
      <h2 class="sec-title">Get help choosing</h2><p class="sec-desc">Tell us the product you have in mind, your approximate quantity and preferred date. Quantity and date are optional if they are not decided.</p></div>
      ${helpForm('merch')}
    </div>
  </section>
  `, 'merchhelp');
}

/* One assisted enquiry form, used by merchandise help and contextual help. */
function helpForm(kind){
  const lines = (UI.quote || []).length;
  return `
  <form class="stack-3 help-form" onsubmit="return false">
    ${[['h_name','Your name','text'],['h_email','Email','email'],['h_co','Company or organisation','text']]
      .map(([n, l, t]) => `<label class="fld"><span class="fld-l">${l}</span>
        <input class="inp" type="${t}" name="${n}" required></label>`).join('')}
    <label class="fld"><span class="fld-l">What do you need help with?</span>
      <textarea class="inp" name="h_msg" rows="3"
        placeholder="For example, the product and quantity you have in mind, or the artwork you want to use."></textarea></label>
    ${lines ? `<p class="t-xs muted">Your quote request (${lines} configuration${lines === 1 ? '' : 's'}) is included with this message so you do not have to describe it again.</p>` : ''}
    <div class="btn-row">
      <button class="btn btn--primary" data-act="helpSubmit" data-k="${kind}">Send request</button>
    </div>
    <p class="t-xs muted">We use these details to respond to your enquiry.
      <a class="lnk" data-go="public:privacy">Read our Privacy Notice.</a></p>
  </form>`;
}

/* ---- the quote basket --------------------------------------------------- */
/* A line is a requested configuration, not an order. The badge counts
   configurations; the basket states the total units, so "3" never silently
   means three garments when it means three lines of a hundred. */
const quoteCount = () => (UI.quote || []).length;
const quoteUnits = () => (UI.quote || []).reduce((t, l) => t + (+l.qty || 0), 0);
function quoteKnown(){
  let known = 0, unresolved = 0;
  (UI.quote || []).forEach(l => { if(l.total == null) unresolved++; else known += l.total; });
  return {known, unresolved};
}
function lineSummary(l){
  const pl = (l.placements || []);
  return `${l.qty} × ${esc(l.productName)} · ${esc(l.colourName)}`
    + (pl.length ? ` · ${pl.length} placement${pl.length === 1 ? '' : 's'}` : ' · no personalisation');
}

function pubQuote(){
  const lines = UI.quote || [];
  const {known, unresolved} = quoteKnown();
  if(!lines.length) return pubShell(`
    ${pageHead('Pamuk Merchandise · Quote request', 'Your quote request is empty.',
      'Add products to compare and request a quote. Nothing is ordered or charged when you send a request.',
      {red:true, crumb: crumb([['Pamuk Merchandise','merch']], 'Quote request'),
       after:`<div class="btn-row btn-row--top">
         <button class="btn btn--primary btn--lg" data-go="public:products">Browse products</button>
         <button class="btn btn--quiet" data-go="public:merchhelp">Get help choosing</button></div>`})}
    ${faqSection('merch', '—')}
  `, 'quote');
  return pubShell(`
  ${pageHead('Pamuk Merchandise · Quote request', 'Your quote request.',
    'Review the products and personalisation you want us to assess. Nothing is ordered or charged when you send this request.',
    {red:true, crumb: crumb([['Pamuk Merchandise','merch']], 'Quote request')})}
  <section class="pub-sec pub-sec--top">
    <div class="pub-wrap">
      <div class="qlayout">
        <div class="stack-3">
          ${lines.map((l, i) => `
          <div class="qline">
            <div class="qline-img">${l.img ? `<img src="${l.img}" alt="${esc(l.productName)}" loading="lazy">` : ''}</div>
            <div class="qline-b">
              <div class="row-between qline-top">
                <div>
                  <h2 class="t-h5">${esc(l.productName)}</h2>
                  <div class="t-xs muted">Ref. ${esc(l.ref)} · ${esc(l.colourName)}</div>
                </div>
                <div class="qline-amt num">${l.total == null
                  ? `<span class="chip">Price on review</span>`
                  : `<b>${money(l.total)}</b><span class="t-xs muted"> excl. VAT</span>`}</div>
              </div>
              <div class="qline-facts">
                <span class="t-sm num">${l.qty} pieces</span>
                <span class="t-sm muted">${l.sizes ? 'Sizes provided' : 'Sizes to follow'}</span>
                <span class="t-sm muted">${(l.placements || []).length
                  ? (l.placements || []).map(p => esc(p.posName) + ' · ' + esc(p.methodName)).join(' · ')
                  : 'No personalisation'}</span>
                <span class="t-sm muted">${l.art ? 'Artwork attached' : (l.artHelp ? 'Artwork help requested' : 'Artwork to follow')}</span>
              </div>
              <details class="disc disc--sm">
                <summary class="disc-q">View configuration</summary>
                <div class="disc-b">
                  <dl class="dl">
                    ${(l.placements || []).map((p, k) => `<div class="dl-r"><dt>Placement ${k + 1}</dt>
                      <dd>${esc(p.posName)} · ${esc(p.methodName)} · ${esc(p.size)}${p.colours > 1 ? ` · ${p.colours} colours` : ''}</dd></div>`).join('')
                      || `<div class="dl-r"><dt>Personalisation</dt><dd>None requested</dd></div>`}
                    <div class="dl-r"><dt>Price basis</dt><dd>${l.total == null
                      ? 'Confirmed on review' : `${money(l.unit)} per piece at ${l.qty}, excl. VAT`}</dd></div>
                  </dl>
                </div>
              </details>
              <div class="btn-row qline-act">
                <button class="btn btn--quiet btn--sm" data-act="qEdit" data-i="${i}">Edit</button>
                <button class="btn btn--quiet btn--sm" data-act="qDup" data-i="${i}">Duplicate</button>
                <button class="btn btn--quiet btn--sm" data-act="qRemove" data-i="${i}">Remove</button>
              </div>
            </div>
          </div>`).join('')}
        </div>

        <aside class="qsum">
          <h2 class="t-h4">Request summary</h2>
          <dl class="dl">
            <div class="dl-r"><dt>Configurations</dt><dd class="num">${lines.length}</dd></div>
            <div class="dl-r"><dt>Total units</dt><dd class="num">${quoteUnits()}</dd></div>
            <div class="dl-r"><dt>${unresolved ? 'Known subtotal' : 'Products and personalisation'}</dt>
              <dd class="num">${money(known)}</dd></div>
            ${unresolved ? `<div class="dl-r"><dt>Awaiting review</dt>
              <dd>${unresolved} line${unresolved === 1 ? '' : 's'}</dd></div>` : ''}
            <div class="dl-r"><dt>Setup charges</dt><dd>Confirmed in the reviewed quote</dd></div>
            <div class="dl-r"><dt>Delivery</dt><dd>Confirmed in the reviewed quote</dd></div>
            <div class="dl-r"><dt>Tax</dt><dd>Amounts exclude VAT</dd></div>
          </dl>
          <p class="t-xs muted">${unresolved
            ? 'Some lines need review before an amount can be shown, so this is a known subtotal rather than a total.'
            : 'This is an indicative amount for the products and personalisation shown. Setup and delivery are confirmed on review.'}</p>
          <div class="btn-row qsum-act">
            <button class="btn btn--primary btn--block" data-go="public:qcontact">Continue to contact details</button>
            <button class="btn btn--ghost btn--block" data-go="public:products">Add more products</button>
          </div>
          <p class="t-xs muted"><a class="lnk" data-go="public:merchhelp">Need help completing this quote?</a></p>
        </aside>
      </div>
    </div>
  </section>
  `, 'quote');
}

/* ---- the quote drawer ---------------------------------------------------
   A slide-over summary of the request, reachable from the header on every
   merchandise page. It edits quantity and removes lines; everything else
   happens on the product page or at checkout. */
function quoteDrawer(){
  const lines = UI.quote || [];
  const {known, unresolved} = quoteKnown();
  return `
  <div class="dscrim" data-act="closeDrawer"></div>
  <aside class="drawer" role="dialog" aria-modal="true" aria-label="Products in your quote">
    <div class="drawer-h">
      <h2 class="t-h3">Products in your quote</h2>
      <button class="drawer-x" data-act="closeDrawer" aria-label="Close">✕</button>
    </div>

    <div class="drawer-body">
      ${!lines.length ? `
        <div class="drawer-empty">
          <p class="t-body">Your quote is empty.</p>
          <p class="t-sm muted">Add products to compare and request a quote. Nothing is ordered or charged when you send one.</p>
          <div class="btn-row btn-row--top">
            <button class="btn btn--primary" data-go="public:products">Browse products</button>
          </div>
        </div>`
        : lines.map((l, i) => {
          const p = by(S.merchProducts, l.product);
          const tiers = [...new Set([...(p && p.breaks ? p.breaks.map(b => b.qty) : []), l.qty])].sort((a, b) => a - b);
          return `
          <div class="dline">
            <div class="dline-img">${l.img ? `<img src="${l.img}" alt="${esc(l.productName)}" loading="lazy">` : ''}</div>
            <div class="dline-b">
              <div class="dline-top">
                <div class="dline-n">${esc(l.productName)} · ${esc(l.colourName)}</div>
                <div class="dline-p num">${l.total == null ? '<span class="chip">On review</span>' : money(l.total)}</div>
              </div>
              <div class="dline-r">
                <label class="dqty">
                  <span class="vh">Quantity for ${esc(l.productName)}</span>
                  <select class="inp inp--xs" data-act="dQty" data-i="${i}">
                    ${tiers.map(q => `<option value="${q}" ${q === l.qty ? 'selected' : ''}>${q}</option>`).join('')}
                  </select>
                </label>
                <span class="t-xs muted">${(l.placements || []).length
                  ? (l.placements || []).map(x => esc(x.posName)).join(' · ')
                  : 'No personalisation'}</span>
                <span class="spacer"></span>
                <button class="dline-x" data-act="qRemove" data-i="${i}"
                  aria-label="Remove ${esc(l.productName)} from your quote">Remove</button>
              </div>
            </div>
          </div>`;}).join('')}
    </div>

    ${lines.length ? `
    <div class="drawer-foot">
      <div class="drow"><span>Artwork review</span><span>Included</span></div>
      <div class="drow"><span>Setup charges</span><span>Confirmed on review</span></div>
      <div class="drow"><span>Delivery</span><span>Confirmed on review</span></div>
      <div class="drow drow--t">
        <span>${unresolved ? 'Known subtotal' : 'Estimated total'}</span>
        <span class="num">${money(known)}</span>
      </div>
      ${unresolved ? `<p class="t-xs muted">${unresolved} line${unresolved === 1 ? '' : 's'} priced on review, so this is a subtotal rather than a total.</p>` : ''}
      <button class="btn btn--primary btn--lg btn--block" data-go="public:qcontact">View quote</button>
      <p class="dnote t-xs">No payment is needed yet. This is a request.</p>
      <button class="btn btn--quiet btn--sm btn--block" data-go="public:quote">Open the full quote</button>
    </div>` : ''}
  </aside>`;
}

/* ---- checkout ----------------------------------------------------------
   A focused two-column completion screen: what you are sending on the left,
   who we send it to on the right. Deliberately stripped of the site header
   and footer so the only actions are finish, or go back. */
/* A completion flow keeps the wordmark and a way back, and nothing else.
   The branch decides which wordmark, and where back goes. */
function pubShellBare(inner, page){
  const studio = PUB_BRANCH[page] === 'custom';
  const home = studio ? 'custom' : 'merch';
  const back = studio ? 'custom' : 'quote';
  const label = studio ? 'Back to Pamuk Studio' : 'Back to your quote';
  return `
  <div class="pub pub--bare">
    <header class="co-hd">
      <div class="co-hd-in">
        <button class="co-back" data-go="public:${back}" aria-label="${label}">←</button>
        <span class="brand" data-go="public:${home}">PAMUUC<span class="brand-bar">|</span><span class="brand-sub">${studio ? 'STUDIO' : 'MERCHANDISE'}</span></span>
      </div>
    </header>
    <main id="main">${inner}</main>
  </div>`;
}

function pubQContact(){
  if(!quoteCount()) return pubQuote();
  const lines = UI.quote || [], c = UI.qc || {};
  const {known, unresolved} = quoteKnown();
  const errs = Object.keys(UI.qcErr || {});
  const f = (n, l, type, req, help, half) => {
    const err = (UI.qcErr || {})[n];
    return `
    <label class="fld ${err ? 'fld--err' : ''} ${half ? 'fld--half' : ''}">
      <span class="fld-l">${l}${req ? '' : ' <span class="muted">(optional)</span>'}</span>
      <input class="inp" type="${type}" name="${n}" value="${esc(c[n] || '')}"
        ${req ? 'required aria-required="true"' : ''} ${err ? 'aria-invalid="true"' : ''}>
      ${help ? `<span class="fld-h t-xs muted">${help}</span>` : ''}
      ${err ? `<span class="fld-e t-xs">${err}</span>` : ''}
    </label>`;
  };
  return pubShellBare(`
  <div class="co">
    <section class="co-left">
      <h1 class="display co-t">Summary</h1>

      <div class="co-lines">
        ${lines.map((l, i) => `
        <div class="co-line">
          <div class="co-line-img">${l.img ? `<img src="${l.img}" alt="${esc(l.productName)}" loading="lazy">` : ''}</div>
          <div class="co-line-b">
            <div class="co-line-top">
              <div class="co-line-n">${esc(l.productName)} · ${esc(l.colourName)}</div>
              <div class="num co-line-p">${l.total == null ? '<span class="chip">On review</span>' : money(l.total)}</div>
            </div>
            <div class="co-line-m">
              <span class="num">${l.qty} pieces</span>
              ${l.unit != null ? `<span class="muted">${money(l.unit)} per unit</span>` : ''}
              <span class="muted">${(l.placements || []).length
                ? (l.placements || []).map(x => esc(x.posName) + ' · ' + esc(x.methodName)).join(' · ')
                : 'No personalisation'}</span>
            </div>
            <div class="co-line-a">
              <button class="lnk lnk--sm" data-act="qEdit" data-i="${i}">Change</button>
              <button class="lnk lnk--sm" data-act="qRemove" data-i="${i}">Remove</button>
            </div>
          </div>
        </div>`).join('')}
      </div>

      <div class="co-row">
        <span class="co-row-l">Delivery</span>
        <span class="co-row-v">
          <span>Confirmed in the reviewed quote</span>
          <button class="lnk lnk--sm" data-act="askEarlier">Need it by a date?</button>
        </span>
      </div>
      <div class="co-row">
        <span class="co-row-l">Setup charges</span>
        <span class="co-row-v"><span>Confirmed in the reviewed quote</span></span>
      </div>
      <div class="co-row co-row--total">
        <span class="co-row-l">${unresolved ? 'Known subtotal' : 'Estimated total'}</span>
        <span class="co-total num">${money(known)}</span>
      </div>
      <p class="t-xs muted">Amounts exclude VAT and cover the products and personalisation shown.
        ${unresolved ? `${unresolved} line${unresolved === 1 ? '' : 's'} are priced on review.` : ''}
        Nothing is charged at this step.</p>

      <p class="t-xs muted co-legal">© ${new Date().getFullYear()} Pamuk Studio S.L ·
        <a class="lnk ft-link--inline" data-go="public:terms">Terms</a> &amp;
        <a class="lnk ft-link--inline" data-go="public:privacy">privacy notice</a> apply.</p>
    </section>

    <section class="co-right">
      <h2 class="display co-t">Your contact details</h2>
      ${errs.length ? `<div class="banner banner--stop" id="qerrsum"><div>
        <div class="banner-t">${errs.length} answer${errs.length === 1 ? '' : 's'} still needed</div>
        <div class="banner-d">${errs.map(k => esc((UI.qcErr || {})[k])).join(' ')}</div></div></div>` : ''}
      <form class="co-card" onsubmit="return false">
        <div class="co-grid">
          ${f('name', 'First name', 'text', true, '', true)}
          ${f('last', 'Last name', 'text', false, '', true)}
        </div>
        ${f('company', 'Company or organisation', 'text', true, 'Sole traders and organisations are both fine.')}
        ${f('email', 'Email', 'email', true, 'We send the reviewed quote to this address.')}
        <div class="co-grid co-grid--phone">
          <label class="fld"><span class="fld-l">Country</span>
            <select class="inp" name="country" data-act="qcSet" data-f="country">
              ${['Spain','France','Portugal','Italy','Germany','Netherlands','Other in Europe','Outside Europe']
                .map(x => `<option ${(c.country || 'Spain') === x ? 'selected' : ''}>${x}</option>`).join('')}
            </select></label>
          ${f('phone', 'Phone number', 'tel', false, 'Only if you would rather we call.')}
        </div>
        <label class="chk co-chk"><input type="checkbox">
          <span class="t-sm">Send me occasional product updates. Separate from this quote, and never required.</span></label>
        <button class="btn btn--primary btn--lg btn--block" data-act="qSubmit">Request your quote</button>
        <p class="t-xs muted">We use these details to prepare and respond to your quote request.
          <a class="lnk" data-go="public:privacy">Read our Privacy Notice.</a></p>
      </form>
      <div class="co-trust">
        <span>✓ Reviewed before you approve</span>
        <span>✓ No payment at this step</span>
        <span>✓ Artwork kept on file</span>
      </div>
    </section>
  </div>
  `, 'qcontact');
}

function pubQReview(){
  if(!quoteCount()) return pubQuote();
  const c = UI.qc || {}, {known, unresolved} = quoteKnown();
  const row = (k, v, go) => `<div class="dl-r"><dt>${k}</dt><dd>${v}
    ${go ? `<button class="lnk lnk--sm" data-go="public:${go}">Change</button>` : ''}</dd></div>`;
  return pubShell(`
  ${pageHead('Pamuk Merchandise · Quote request', 'Check your quote request.',
    'Review what we will assess. You can change any part before sending it.',
    {red:true, crumb: crumb([['Pamuk Merchandise','merch'],['Quote request','quote']], 'Check request')})}
  <section class="pub-sec pub-sec--top">
    <div class="pub-wrap">
      <div class="qlayout">
        <div class="stack-3">
          <div class="card">
            <div class="row-between"><h2 class="t-h4">Products</h2>
              <button class="lnk lnk--sm" data-go="public:quote">Change</button></div>
            <dl class="dl">
              ${(UI.quote || []).map(l => `<div class="dl-r"><dt>${esc(l.productName)}</dt>
                <dd>${lineSummary(l)}<br><span class="t-xs muted">${l.art ? 'Artwork attached'
                  : l.artHelp ? 'Artwork help requested' : 'Artwork to follow'} · ${l.sizes ? 'Sizes provided' : 'Sizes to follow'}
                  · ${l.total == null ? 'Price on review' : money(l.total) + ' excl. VAT'}</span></dd></div>`).join('')}
            </dl>
          </div>
          <div class="card">
            <div class="row-between"><h2 class="t-h4">Contact and delivery</h2>
              <button class="lnk lnk--sm" data-go="public:qcontact">Change</button></div>
            <dl class="dl">
              ${row('Name', esc(c.name || 'Not provided'))}
              ${row('Email', esc(c.email || 'Not provided'))}
              ${row('Company', esc(c.company || 'Not provided'))}
              ${row('Delivery country', esc(c.country || 'Spain'))}
              ${row('Postcode', esc(c.postcode || 'Not provided'))}
              ${row('Preferred date', c.noDate ? 'Date not fixed' : (esc(c.date || 'Not provided')))}
              ${row('Phone', esc(c.phone || 'Not provided'))}
            </dl>
          </div>
          <div class="banner banner--wait"><div>
            <div class="banner-t">What happens to this request</div>
            <div class="banner-d">We’ll review the products, artwork requirements, availability and delivery before sending the confirmed proposal. Sending this request does not place an order.</div>
          </div></div>
          <div class="btn-row">
            <button class="btn btn--primary btn--lg" data-act="qSubmit">Submit quote request</button>
            <button class="btn btn--quiet" data-go="public:qcontact">Back</button>
          </div>
        </div>
        <aside class="qsum">
          <h2 class="t-h4">Amounts</h2>
          <dl class="dl">
            <div class="dl-r"><dt>${unresolved ? 'Known subtotal' : 'Products and personalisation'}</dt>
              <dd class="num">${money(known)}</dd></div>
            ${unresolved ? `<div class="dl-r"><dt>Awaiting review</dt><dd>${unresolved} line${unresolved === 1 ? '' : 's'}</dd></div>` : ''}
            <div class="dl-r"><dt>Setup</dt><dd>Confirmed in the reviewed quote</dd></div>
            <div class="dl-r"><dt>Delivery</dt><dd>Confirmed in the reviewed quote</dd></div>
            <div class="dl-r"><dt>Tax</dt><dd>Excl. VAT</dd></div>
          </dl>
          <p class="t-xs muted">Indicative amounts for the configuration shown, subject to artwork, stock and delivery review.</p>
        </aside>
      </div>
    </div>
  </section>
  `, 'qreview');
}

function pubQDone(){
  const r = UI.qDone;
  if(!r) return pubQuote();
  return pubShell(`
  ${pageHead('Pamuk Merchandise', 'Your quote request has been received.',
    `We’ll review the details and reply to ${esc(r.email)} with the next step. Your reference is ${esc(r.ref)}.`,
    {red:true})}
  <section class="pub-sec pub-sec--top">
    <div class="pub-wrap">
      <div class="qlayout">
        <div class="stack-3">
          <div class="card">
            <h2 class="t-h4">What happens next</h2>
            <ol class="steps">
              <li>We check products, artwork requirements and availability.</li>
              <li>We confirm the proposal and any details still needed.</li>
              <li>You review and approve before payment and production.</li>
            </ol>
          </div>
          <div class="card">
            <h2 class="t-h4">What you sent</h2>
            <dl class="dl">
              <div class="dl-r"><dt>Reference</dt><dd class="num">${esc(r.ref)}</dd></div>
              <div class="dl-r"><dt>Configurations</dt><dd class="num">${r.lines}</dd></div>
              <div class="dl-r"><dt>Total units</dt><dd class="num">${r.units}</dd></div>
              <div class="dl-r"><dt>Delivery country</dt><dd>${esc(r.country)}</dd></div>
              <div class="dl-r"><dt>Requested date</dt><dd>${esc(r.date)}</dd></div>
            </dl>
            <p class="t-xs muted">The requested date is a request. The schedule is confirmed in the reviewed quote.</p>
          </div>
        </div>
        <aside class="qsum">
          <h2 class="t-h4">Keep track of it</h2>
          <p class="t-sm muted">You can manage quotes and orders in one place. Your request is saved either way — you do not need an account for us to reply.</p>
          <div class="btn-row qsum-act">
            <button class="btn btn--ghost btn--block" data-act="openMerchAcc">Set up account access</button>
            <button class="btn btn--quiet btn--block" data-go="public:products">Continue browsing</button>
          </div>
        </aside>
      </div>
    </div>
  </section>
  `, 'qdone');
}

/* ---- shared company and legal pages ------------------------------------ */
function pubAbout(){
  return pubShell(`
  ${pageHead('Pamuk', 'Meet Pamuk.',
    'Pamuk Studio S.L designs, develops and produces uniforms and branded merchandise from Barcelona. Two services share one workshop, one set of decoration rules and one standard of record keeping.')}
  <section class="pub-sec pub-sec--top">
    <div class="pub-wrap">
      <div class="grid grid-2 gap-lg">
        <div class="card">
          <div class="eyebrow">Pamuk Studio</div>
          <h2 class="t-h3 card-t">Custom uniform development</h2>
          <p class="t-sm muted">Garments developed around your roles, fitted on your own people and archived as an approved specification so a reorder matches the first run.</p>
          <a class="lnk" data-go="public:custom">Explore custom uniforms</a>
        </div>
        <div class="card">
          <div class="eyebrow eyebrow-red">Pamuk Merchandise</div>
          <h2 class="t-h3 card-t">Catalogue products, personalised</h2>
          <p class="t-sm muted">Clothing and accessories you select and configure, decorated in our workshop and quoted before anything is made.</p>
          <a class="lnk" data-go="public:merch">Browse merchandise</a>
        </div>
      </div>
      <div class="banner banner--wait banner--top"><div>
        <div class="banner-t">Company details are confirmed before publication</div>
        <div class="banner-d">Legal name, registration and tax identifiers, founding date and team information are published once verified. This prototype does not carry placeholder figures in their place.</div>
      </div></div>
    </div>
  </section>
  ${faqSection('custom', '—')}
  `, 'about');
}

function pubContact(){
  return pubShell(`
  ${pageHead('Pamuk', 'Tell us what you need.',
    'Choose the service closest to your question, or say you are not sure. We read every message and reply to the address you give us.')}
  <section class="pub-sec pub-sec--top">
    <div class="pub-wrap">
      <div class="grid grid-2 gap-lg">
        <form class="stack-3" onsubmit="return false">
          <fieldset class="flt-g"><legend class="fld-l">What is this about?</legend>
            <div class="chip-row">
              ${[['studio','Custom uniforms'],['merch','Merchandise'],['unsure','Not sure which service']]
                .map(([v, n]) => `<button class="tab ${(UI.cSvc || 'unsure') === v ? 'tab--on' : ''}"
                  data-act="cSvc" data-v="${v}" aria-pressed="${(UI.cSvc || 'unsure') === v}">${n}</button>`).join('')}
            </div>
          </fieldset>
          ${[['c_name','Your name','text'],['c_email','Email','email'],['c_co','Company or organisation','text']]
            .map(([n, l, t]) => `<label class="fld"><span class="fld-l">${l}</span>
              <input class="inp" type="${t}" name="${n}" required></label>`).join('')}
          <label class="fld"><span class="fld-l">Your message</span>
            <textarea class="inp" name="c_msg" rows="4"
              placeholder="Tell us what you are trying to do and when you need it."></textarea></label>
          <div class="btn-row">
            <button class="btn btn--primary" data-act="contactSubmit">Send message</button>
          </div>
          <p class="t-xs muted">We use these details to respond to your enquiry.
            <a class="lnk" data-go="public:privacy">Read our Privacy Notice.</a></p>
        </form>
        <div class="stack-3">
          <div class="card">
            <div class="eyebrow">Direct routes</div>
            <p class="t-sm">A uniform project starts best with the brief — it asks the questions we would ask on a first call.</p>
            <div class="btn-row btn-row--top">
              <button class="btn btn--ghost btn--sm" data-go="public:form">Start your project brief</button>
              <button class="btn btn--quiet btn--sm" data-go="public:products">Browse merchandise</button>
            </div>
          </div>
          <div class="card">
            <div class="eyebrow">Where we are</div>
            <p class="t-sm muted">Barcelona, Spain.<br>Published contact details, hours and languages are confirmed before launch, so that anyone who calls reaches someone who can help in the language stated.</p>
          </div>
        </div>
      </div>
    </div>
  </section>
  ${faqSection('custom', '—')}
  `, 'contact');
}

function legalPage(page, title, intro, body){
  return pubShell(`
  ${pageHead('Pamuk', title, intro)}
  <section class="pub-sec pub-sec--top">
    <div class="pub-wrap read">
      <div class="stack-3">${body}</div>
    </div>
  </section>
  `, page);
}

function pubPrivacy(){
  return legalPage('privacy', 'Privacy notice',
    'What we collect when you enquire or request a quote, why, and how long we keep it.',
    `<div class="banner banner--wait"><div>
      <div class="banner-t">This notice is not yet the published version</div>
      <div class="banner-d">The controller, legal bases, recipients, retention periods and your rights are drafted with the business before any live form collects data. The structure below shows what the published notice must state.</div></div></div>
     ${[['What we collect','The contact details you enter, the enquiry or quote content, any files you attach, and basic technical information needed to deliver the site.'],
        ['Why we use it','To respond to your enquiry and prepare a quote. Responding to an enquiry is separate from marketing, which is optional and never required to receive a reply.'],
        ['How long we keep it','Defined retention periods per record type, set before launch.'],
        ['Your rights','Access, correction, erasure, restriction, objection and portability, with a named contact route.']]
       .map(([h, p]) => `<div class="card"><h2 class="t-h4 card-t">${h}</h2><p class="t-sm muted">${p}</p></div>`).join('')}`);
}
function pubCookies(){
  return legalPage('cookies', 'Cookie settings',
    'Accepting and refusing are offered at the same level. Requesting a quote works without any marketing tracker.',
    `<div class="card"><h2 class="t-h4 card-t">Categories</h2>
      <p class="t-sm muted">Strictly necessary cookies keep the site working and cannot be switched off. Any analytics or marketing category is off until you choose it, and can be withdrawn as easily as it was given.</p>
      <div class="btn-row btn-row--top">
        <button class="btn btn--ghost btn--sm" data-act="cookieStub">Accept all</button>
        <button class="btn btn--ghost btn--sm" data-act="cookieStub">Reject all</button>
        <button class="btn btn--quiet btn--sm" data-act="cookieStub">Manage categories</button>
      </div></div>
     <div class="banner banner--wait"><div><div class="banner-t">Actual categories are confirmed from the implementation</div>
       <div class="banner-d">The published list names each provider and purpose. It is generated from what the live site actually loads, not written in advance.</div></div></div>`);
}
function pubTerms(){
  return legalPage('terms', 'Terms',
    'The commercial terms that apply to a reviewed quote, an approval and a delivered order.',
    `<div class="banner banner--wait"><div><div class="banner-t">Terms are drafted with the business before launch</div>
      <div class="banner-d">Quote validity, approvals, payment, delivery, changes, personalised goods and issue handling differ between a custom uniform project and a merchandise order, so the two are stated separately rather than merged.</div></div></div>
     ${[['Merchandise orders','Quote validity, what an approval covers, payment before production release, delivery basis, and how defects and delivery problems are handled for personalised goods.'],
        ['Custom uniform projects','Project scope and included rounds, approval at each stage, production authorisation, and what a reorder against an approved specification means.']]
       .map(([h, p]) => `<div class="card"><h2 class="t-h4 card-t">${h}</h2><p class="t-sm muted">${p}</p></div>`).join('')}`);
}
function pubAccessibility(){
  return legalPage('accessibility', 'Accessibility',
    'What we are building towards, what has been checked, and how to tell us something does not work.',
    `<div class="card"><h2 class="t-h4 card-t">Target</h2>
      <p class="t-sm muted">WCAG 2.2 AA is the build target. Conformance is not claimed: the pages and flows have to be tested with assistive technology before any such statement is published.</p></div>
     <div class="card"><h2 class="t-h4 card-t">What has been checked in this prototype</h2>
      <p class="t-sm muted">Every route is walked in both themes at desktop and phone widths for horizontal overflow, text below the eleven pixel floor, images without alternative text, and content covered by a fixed action bar. That is a structural check, not an accessibility audit.</p></div>
     <div class="card"><h2 class="t-h4 card-t">Tell us</h2>
      <p class="t-sm muted">If something here cannot be operated, say so through the contact page and describe what happened. That report is treated as a defect, not feedback.</p>
      <div class="btn-row btn-row--top"><button class="btn btn--ghost btn--sm" data-go="public:contact">Contact us</button></div></div>`);
}
function pubNotFound(page){
  return pubShell(`
  ${pageHead('Pamuk', 'We couldn’t find this page.',
    'The link may be out of date. Choose a service below, or search the merchandise catalogue.',
    {after:`<div class="btn-row btn-row--top">
      <button class="btn btn--primary" data-go="public:custom">Custom uniforms</button>
      <button class="btn btn--ghost" data-go="public:merch">Merchandise</button>
      <button class="btn btn--quiet" data-go="public:search">Search products</button></div>`})}
  `, page || 'home');
}

/* ---- Merchandise: one product ---------------------------------------- */
function pubProduct(id){
  const p = by(S.merchProducts, id);
  if(!p) return pubShell(pageHead('Merchandise', 'That product does not exist.',
    'The link may be out of date. Every product in the catalogue is listed on the all-products page.',
    {red:true, after:`<div class="btn-row btn-row--top"><button class="btn btn--primary" data-go="public:products">Browse all products</button></div>`}), 'products');
  const IM = p.img || {};
  const imgs = (p.imgOrder || []).filter(c => IM[c]);
  const rc = S.decoRates;

  const cfg = UI.cfg = UI.cfg && UI.cfg.id === id ? UI.cfg : {
    id, colour:(imgs[0] || p.colours[0]), qty:p.moq,
    placements:[{pos:p.pos[0], method:p.pers[0], size:'small', colours:1, art:null}],
  };
  if(!p.colours.includes(cfg.colour)) cfg.colour = p.colours[0];

  const q = rc && !p.quoteOnly ? quoteLines(p, rc, cfg) : null;
  const shot = IM[cfg.colour] || (imgs.length ? IM[imgs[0]] : null);
  const first = (p.breaks||[])[0];
  const used = cfg.placements.map(x => x.pos);
  const canAdd = cfg.placements.length < 3 && p.pos.some(x => !used.includes(x));
  const mult = (rc && rc.mult) || 1.55;
  const xp = 1;

  /* cost of one placement as configured, above what the price already covers */
  const extraFor = (pl, i) => {
    if(!rc) return 0;
    const full = placementUnit(rc, pl, cfg.qty);
    return Math.max(0, full - includedUnit(rc, cfg.qty, i)) * mult;
  };

  return pubShell(`
  <section class="pub-sec pub-sec--tight">
    <div class="pub-wrap">
      <nav class="crumb">${crumb(
        [['Merchandise','merch'], ['All products','products'],
         ...(p.cat ? [[esc(p.cat), 'collection:' + catSlug(p.cat)]] : [])], p.name)}</nav>

      <div class="pdp">
        <!-- media ------------------------------------------------------ -->
        <div class="pdp-media">
          <div class="pdp-rail">
            ${imgs.slice(0,8).map(c => `
              <button class="pdp-thumb ${c===cfg.colour?'on':''}" data-act="cfgColour" data-c="${c}"
                aria-label="${esc(COLOURS[c]?COLOURS[c].name:c)}"><img src="${IM[c]}" alt="" loading="lazy"></button>`).join('')}
          </div>
          <div class="pdp-hero">
            <div class="pdp-badges">
              <span class="chip">${esc(p.lead)}</span>
              <span class="chip">Min ${p.moq}</span>
              <span class="chip">${(p.colours || []).length} colours</span>
            </div>
            ${shot ? `<img src="${shot}" alt="${esc(p.name)} in ${esc(COLOURS[cfg.colour]?COLOURS[cfg.colour].name:'')}">`
                   : `<span style="font-size:88px">${p.glyph}</span>`}
          </div>
          <div class="place-map">
            <div class="place-map-h">
              <span class="eyebrow">Where your identity goes</span>
              <span class="t-xs muted">${cfg.placements.length} of 3</span>
            </div>
            <div class="place-grid">
              ${p.pos.map(x => {
                const ix = used.indexOf(x);
                const full = ix === -1 && cfg.placements.length >= 3;
                return `<button class="place-cell ${ix>-1?'on':''}" data-act="togglePlace" data-p="${x}"
                  ${full?'disabled':''}>
                  <span class="place-n">${ix>-1 ? ix+1 : '+'}</span>
                  <span>${esc(S.positions_lib[x]||x)}</span></button>`;}).join('')}
            </div>
          </div>
        </div>

        <!-- options ---------------------------------------------------- -->
        <div class="pdp-cfg">
          <h1 class="t-h2">${esc(p.name)}</h1>
          <div class="wrap-row" style="gap:8px;margin-top:8px">
            <span class="mono-ref">${p.ref}</span>
            <span class="t-xs muted">${esc(p.ss||'')}</span>
            ${p.weight ? `<span class="chip">${p.weight} g/m²</span>` : ''}
            <span class="chip">${p.colours.length} colours</span>
          </div>
          ${!p.quoteOnly ? `<div class="pdp-from">${money(p.from)}
            <span class="t-sm muted" style="font-size:14px">per piece from ${p.moq}</span></div>` : ''}

          <div class="pdp-step">
            <div class="step-h"><span class="step-n">1</span><span class="step-t">Colour</span>
              <span class="step-v">${esc(COLOURS[cfg.colour]?COLOURS[cfg.colour].name:cfg.colour)}</span></div>
            <div class="sw-grid">
              ${p.colours.map(c => `<button class="pdp-sw ${c===cfg.colour?'on':''}" data-act="cfgColour"
                data-c="${c}" title="${esc(COLOURS[c]?COLOURS[c].name:c)}"
                style="background:${COLOURS[c]?COLOURS[c].hex:'#ccc'}"></button>`).join('')}
            </div>
          </div>

          ${p.quoteOnly ? '' : `
          <div class="pdp-step">
            <div class="step-h"><span class="step-n">2</span><span class="step-t">Quantity</span>
              <span class="step-v">${cfg.qty} pieces</span></div>
            <div class="qgrid">
              ${p.breaks.map(b => {
                const save = first && first.price ? Math.round((1 - b.price/first.price)*100) : 0;
                return `<button class="qcard ${b.qty===cfg.qty?'on':''}" data-act="cfgQtyTier" data-q="${b.qty}">
                  <b class="num">${b.qty}</b>
                  <span class="num">${money(b.price)}</span>
                  <em>${save>0?'−'+save+'%':''}</em></button>`;}).join('')}
            </div>
            <label class="fld fld--qty"><span class="fld-l">Exact quantity</span>
              <input class="inp inp--sm" type="number" min="${p.moq}" step="1" id="cfgqty" value="${cfg.qty}"
                data-act="cfgQtyExact" aria-describedby="qtyhint">
              <span class="fld-h t-xs muted" id="qtyhint">Minimum ${p.moq} pieces. The tiers above are shortcuts — enter the number you actually need.</span></label>
            <p class="opt-hint">Price shown is per piece at that quantity, for the product and the included spec. Sizes can follow: quantity is the number of pieces.</p>
          </div>`}
          ${p.quoteOnly ? `
          <div class="pdp-step">
            <div class="step-h"><span class="step-n">2</span><span class="step-t">Quantity</span>
              <span class="step-v">${cfg.qty} pieces</span></div>
            <label class="fld fld--qty"><span class="fld-l">Exact quantity</span>
              <input class="inp inp--sm" type="number" min="1" step="1" id="cfgqty" value="${cfg.qty}"
                data-act="cfgQtyExact">
              <span class="fld-h t-xs muted">We price this product manually, and we still need the quantity to do it.</span></label>
          </div>` : ''}

          <div class="pdp-step">
            <div class="step-h"><span class="step-n">${p.quoteOnly?2:3}</span>
              <span class="step-t">Personalisation</span>
              <span class="step-v">${cfg.placements.length} placement${cfg.placements.length>1?'s':''} · two included</span></div>

            ${cfg.placements.map((pl, i) => {
              const extra = extraFor(pl, i);
              return `
              <div class="place-card">
                <div class="place-card-h">
                  <span class="place-badge">${i+1}</span>
                  <select class="inp inp--sm" data-act="plPos" data-i="${i}" style="flex:1">
                    ${p.pos.map(x => `<option value="${x}" ${x===pl.pos?'selected':''}
                      ${used.includes(x)&&x!==pl.pos?'disabled':''}>${esc(S.positions_lib[x]||x)}</option>`).join('')}
                  </select>
                  <span class="t-sm num ${extra>0.004?'':'muted'}">${extra>0.004?'+'+money(extra):'included'}</span>
                  ${cfg.placements.length > 1
                    ? `<button class="btn btn--quiet btn--sm" data-act="rmPlace" data-i="${i}">Remove</button>` : ''}
                </div>
                <div class="place-opts">
                  <div><span class="opt-lbl">Method</span>
                    <div class="wrap-row" style="gap:4px">
                      ${p.pers.map(m => `<button class="qty-pill sm ${m===pl.method?'on':''}"
                        data-act="plMethod" data-i="${i}" data-m="${m}">${esc((S.personalization[m]||{}).name||m)}</button>`).join('')}
                    </div></div>
                  <div><span class="opt-lbl">Size<span class="opt-cost">${
                      pl.size==='small'?'up to 99 mm':pl.size==='medium'?'100–150 mm':'over 150 mm'}</span></span>
                    <div class="wrap-row" style="gap:4px">
                      ${['small','medium','large'].map(z => `<button class="qty-pill sm ${z===pl.size?'on':''}"
                        data-act="plSize" data-i="${i}" data-z="${z}">${z[0].toUpperCase()+z.slice(1)}</button>`).join('')}
                    </div></div>
                  ${pl.method === 'screen' ? `
                  <div><span class="opt-lbl">Ink colours</span>
                    <div class="wrap-row" style="gap:4px">
                      ${[1,2,3,4].map(n => `<button class="qty-pill sm ${n===pl.colours?'on':''}"
                        data-act="plColours" data-i="${i}" data-n="${n}">${n}</button>`).join('')}
                    </div></div>` : ''}
                  <div><span class="opt-lbl">Artwork</span>
                    ${pl.art
                      ? `<div class="art-on"><span>▣ ${esc(pl.art)}</span>
                          <button class="btn btn--quiet btn--sm" data-act="plArtClear" data-i="${i}">Replace</button></div>`
                      : `<button class="art-drop" data-act="plArt" data-i="${i}">
                          <span class="med">Upload your logo</span>
                          <span class="opt-hint" style="margin:0">Vector preferred — AI, EPS, PDF or SVG.
                            You can also send it later.</span></button>`}
                  </div>
                </div>
              </div>`;}).join('')}

            ${canAdd ? `<button class="btn btn--ghost btn--block" data-act="addPlace">
              + Add placement ${cfg.placements.length + 1} of 3</button>`
              : `<p class="opt-hint">${cfg.placements.length >= 3
                  ? 'Three placements is the maximum on one garment.'
                  : 'Every placement on this product is in use.'}</p>`}
          </div>

          ${p.quoteOnly ? `
          <div class="pdp-sum">
            <div class="chip">Price on request</div>
            <p class="t-sm muted" style="margin-top:10px">We hold no standing cost for this one, so it is
              priced when your request is reviewed. Add it to your quote with the quantity and personalisation
              you need and the amount comes back with the reviewed quote.</p>
          </div>`
          : `<div class="pdp-sum">
            <div class="eyebrow">Your quote</div>
            <div style="margin-top:12px">
              ${q.lines.map(l => `<div class="sum-row">
                <span><span class="med">${esc(l.label)}</span><span class="sum-note">${esc(l.note)}</span></span>
                <span class="num">${l.unit >= 0.005 ? money(l.unit) : 'included'}</span></div>`).join('')}
              <div class="sum-row sum-sep"><span class="med">Per piece</span>
                <span class="num med">${money(q.unit * xp)}</span></div>
              <div class="sum-row"><span class="muted">× ${cfg.qty} pieces</span>
                <span class="num">${money(q.goods * xp)}</span></div>
              ${q.setup.map(su => `<div class="sum-row">
                <span class="muted">${esc(su.name)} setup<span class="sum-note">one-off, per job — not per piece</span></span>
                <span class="num">${su.unknown ? '<span class="chip">quoted</span>' : money(su.cost)}</span></div>`).join('')}
              <div class="sum-total"><span>Total</span><span class="num">${money(q.total * xp)}</span></div>
              <div class="sum-eff">${money(q.effective * xp)} per piece with the setup spread over ${cfg.qty} pieces · excludes VAT</div>
            </div>
            <div class="sum-row sum-sep"><span class="muted">Setup charges</span>
              <span class="num">${q.setup.length ? 'shown above' : 'none for this configuration'}</span></div>
            <div class="sum-row"><span class="muted">Delivery</span>
              <span class="num">confirmed in the reviewed quote</span></div>
            <div class="sum-row"><span class="muted">Tax</span><span class="num">excl. VAT</span></div>
            <div class="pdp-deliver" style="margin-top:16px;padding-top:16px;border-top:1px solid var(--line)">
              <div><div class="t-xs muted">Estimated production</div>
                <div class="t-sm med">${esc(p.lead)} from approval</div>
                <div class="t-xs muted">Production time is not an arrival date. Destination and schedule are confirmed with the quote.</div></div>
              <button class="btn btn--quiet btn--sm" data-act="askEarlier">Ask about an earlier date</button>
            </div>
          </div>`}

          <button class="btn btn--primary btn--lg btn--block" style="margin-top:16px"
            data-act="addToQuote" data-id="${p.id}">${UI.editLine != null ? 'Update this line' : 'Add to quote'}</button>
          <button class="btn btn--ghost btn--block" style="margin-top:8px" data-act="artHelp" data-id="${p.id}">
            Request help with this item</button>
          <p class="t-xs muted" style="margin-top:10px">Adding this to your quote does not place an order and
            nothing is charged. We review the configuration, artwork and availability before confirming the quote.</p>
        </div>
      </div>
    </div>
  </section>

  <section class="pub-sec pub-sec--tight">
    <div class="pub-wrap">
      <div class="tabs" style="margin-bottom:24px">
        ${['Specification','Decoration limits','Sizes & colours','How it works'].map(t =>
          `<button class="tab ${(UI.pdpTab||'Specification')===t?'tab--on':''}"
            data-act="pdpTab" data-t="${esc(t)}">${esc(t)}</button>`).join('')}
      </div>
      ${pdpTabBody(p, p.deco || [])}
    </div>
  </section>

  <section class="pub-sec pub-sec--tight surface-2 sec--red">
    <div class="pub-wrap">
      ${secIx('—', 'Start from a template', 'Applied to this garment')}
      <div class="grid grid-auto">
        ${['CHEST_MARK','BACK_STATEMENT','SLEEVE_DETAIL','FULL_FRONT','WOVEN_LABEL'].map(t =>
          ph('TEMPLATE_' + t, '4x5', t.replace(/_/g, ' ').toLowerCase() + ' shown on this garment, at real scale')).join('')}
      </div>
      <p class="t-xs muted note">A template is an example placement at a real size, not a proof of your artwork.
        Each one is photographed on the actual garment before it is published here.</p>
    </div>
  </section>

  <section class="pub-sec pub-sec--tight sec--red">
    <div class="pub-wrap">
      ${secIx('—', 'More in ' + esc(catName(p.cat).toLowerCase()), catList(p.cat).length + ' in this collection')}
      <div class="grid grid-auto">
        ${S.merchProducts.filter(x => x.cat === p.cat && x.id !== p.id).slice(0, 4).map(pcard).join('')}
      </div>
    </div>
  </section>

  ${(() => {
    const other = S.merchProducts.filter(x => x.cat !== p.cat && prodImg(x));
    const pick = ['Accessories','T-shirts','Sweatshirts','Outerwear','Polos']
      .filter(c => c !== p.cat)
      .map(c => other.find(x => x.cat === c)).filter(Boolean).slice(0, 5);
    const list = pick.length ? pick : other.slice(0, 5);
    return `
  <section class="pub-sec pub-sec--tight surface-2 sec--red">
    <div class="pub-wrap">
      ${secIx('—', 'Goes well with', 'Across the catalogue')}
      <div class="grid grid-auto">${list.map(pcard).join('')}</div>
    </div>
  </section>`;})()}

  ${(() => { const c = CASES[0]; return `
  <section class="pub-sec sec--red">
    <div class="pub-wrap">
      ${secIx('—', 'A programme we produced', esc(c.status))}
      <div class="split split--wide">
        <div class="split-b hovr" data-go="public:case:${c.id}">
          ${fig(imgOf(c.img), c.title, c.status, c.sector, '3x2')}
        </div>
        <div class="split-b">
          <blockquote class="pull" style="margin:0">“${esc(c.constraint)}”</blockquote>
          <p class="t-sm muted" style="margin-top:var(--sp-5)">${esc(c.title)} · ${esc(c.scope)}</p>
          <div style="margin-top:var(--sp-5)" data-go="public:case:${c.id}">${arrow('Read the full project')}</div>
        </div>
      </div>
    </div>
  </section>`;})()}

  ${reviewsSlot()}

  ${faqSection('merch', '—')}

  <div class="buybar">
    <div class="buybar-in">
      <div class="buybar-fig">
        <b class="num">${p.quoteOnly ? 'Price on request' : money(q.total * xp)}</b>
        <span>${p.quoteOnly ? 'quoted within a working day'
          : money(q.effective * xp) + ' per piece · ' + cfg.qty + ' pcs · '
            + cfg.placements.length + ' placement' + (cfg.placements.length>1?'s':'')}</span>
      </div>
      <span class="spacer"></span>
      <button class="btn btn--primary" data-act="addToQuote" data-id="${p.id}">
        ${UI.editLine != null ? 'Update this line' : 'Add to quote'}</button>
    </div>
  </div>
  `, 'product');
}

function pdpTabBody(p, decoRows){
  const tab = UI.pdpTab || 'Specification';
  if(tab === 'Decoration limits') return `
    <div class="tw"><table class="tbl">
      <thead><tr><th>Placement</th><th>Method</th><th class="tnum">Max width</th>
        <th class="tnum">Max height</th><th class="tnum">Max colours</th><th>Artwork</th></tr></thead>
      <tbody>${decoRows.length ? decoRows.map(d => `<tr>
        <td class="med">${esc(S.positions_lib[d.position]||d.position)}</td>
        <td>${esc((S.personalization[d.method]||{}).name||d.method)}</td>
        <td class="tnum num">${d.w||'—'} mm</td><td class="tnum num">${d.h||'—'} mm</td>
        <td class="tnum num">${d.colours||'—'}</td><td class="t-xs">${esc(d.artwork||'')}</td></tr>`).join('')
        : '<tr><td colspan="6" class="tbl-empty">No decoration limits recorded for this product.</td></tr>'}
      </tbody></table></div>
    <p class="t-xs muted" style="margin-top:12px">Maximums are the printable area, not a recommendation.
      We proof every placement before production.</p>`;

  if(tab === 'Sizes & colours') return `
    <div class="grid grid-2" style="align-items:start">
      <div class="card"><div class="eyebrow">Sizes</div>
        <div class="wrap-row" style="margin-top:12px;gap:6px">
          ${(p.sizes||[]).map(z => `<span class="chip">${esc(z)}</span>`).join('') || '<span class="t-sm muted">One size</span>'}
        </div>
        <p class="t-xs muted" style="margin-top:12px">Size splits are confirmed on the order, not now.
          Larger sizes may carry a surcharge, shown on the quote.</p></div>
      <div class="card"><div class="eyebrow">Colours — ${p.colours.length}</div>
        <div class="stack-2" style="margin-top:12px">
          ${p.colours.map(c => `<div class="row" style="gap:8px">
            <span class="sw" style="background:${COLOURS[c]?COLOURS[c].hex:'#ccc'}"></span>
            <span class="t-sm">${esc(COLOURS[c]?COLOURS[c].name:c)}</span>
            <span class="spacer"></span><span class="mono-ref">${(COLOURS[c]||{}).ss||''}</span></div>`).join('')}
        </div></div>
    </div>`;

  if(tab === 'How it works') return `
    <div class="grid grid-4">
      ${[['01','Configure and request','Pick the colour, the quantity and where your identity goes. Send it as a quote request — nothing is ordered.'],
         ['02','Proof within a day','We come back with a firm price and a placement proof showing your artwork at real size on the garment.'],
         ['03','You approve','Approve the proof and the price. That approval is what authorises production, and it is recorded.'],
         ['04','Production and delivery','Made, quality-checked and shipped. Your artwork stays on file, so the next run matches this one.']]
        .map(([n,h,t]) => `<div class="card"><div class="eyebrow">${n}</div>
          <div class="t-h5" style="margin-top:8px">${h}</div>
          <p class="t-sm muted" style="margin-top:8px">${t}</p></div>`).join('')}
    </div>
    <div class="banner" style="margin-top:20px"><div>
      <div class="banner-t">Setup is charged once, not per piece</div>
      <div class="banner-d">Embroidery setup is €35 and screen setup €40, per job. Reorder the same
        artwork later and you do not pay it again.</div></div></div>`;

  return `
    <div class="grid grid-2" style="align-items:start">
      <div class="card">
        <div class="eyebrow">Specification</div>
        <dl class="kv" style="margin-top:12px">
          <dt>PAMUUC reference</dt><dd class="num">${p.ref}</dd>
          <dt>Supplier reference</dt><dd class="num">${esc(p.ss||'—')}</dd>
          <dt>Category</dt><dd>${esc(p.cat)}</dd>
          ${p.weight ? `<dt>Weight</dt><dd>${p.weight} g/m²</dd>` : ''}
          ${p.materials ? `<dt>Composition</dt><dd>${esc(p.materials)}</dd>` : ''}
          <dt>Colours</dt><dd>${p.colours.length}</dd>
          <dt>Sizes</dt><dd>${(p.sizes||[]).length || 1}</dd>
          <dt>Minimum order</dt><dd>${p.moq} pieces</dd>
          <dt>Lead time</dt><dd>${esc(p.lead)} from artwork approval</dd>
          <dt>Personalisation</dt><dd>${p.pers.map(m=>(S.personalization[m]||{}).name||m).join(', ')}</dd>
        </dl>
      </div>
      <div class="card">
        <div class="eyebrow">What the price includes</div>
        <div class="stack-2" style="margin-top:12px">
          ${[['The garment itself','At the quantity break you choose.'],
             ['Two standard placements','One embroidery and one one-colour screen, up to 99 mm.'],
             ['Your own label sewn in','And the supplier\'s label removed.'],
             ['Individual packaging','Each piece bagged, ready to hand out.']]
            .map(([h,t]) => `<div class="factline"><span class="med">${h}</span><span class="muted">${t}</span></div>`).join('')}
        </div>
        <div class="sep"></div>
        <div class="eyebrow">Priced on top</div>
        <div class="stack-2" style="margin-top:10px">
          ${[['A third placement','Anything beyond the two included.'],
             ['Larger or multi-colour work','Above 99 mm, or more than one ink colour.'],
             ['Setup','Once per job, not per piece.'],
             ['Oversize and speciality colours','4XL and up, heathers and special dyes.']]
            .map(([h,t]) => `<div class="factline"><span class="med">${h}</span><span class="muted">${t}</span></div>`).join('')}
        </div>
      </div>
    </div>`;
}

/* ---- The nine-question qualification journey --------------------------- */
/* ---- the brief ----------------------------------------------------------
   Nine questions, answered by choosing. Q1 decides which two you see next,
   so nobody is asked about treatment rooms when they run a shop. Every
   question offers Other. Contact details are asked once, at the end.

   Two of the nine — headcount and how many designs — are the ones that
   actually qualify a project, because people ÷ designs decides whether each
   garment reaches a quantity it can be made well at. qualify() below turns
   that ratio into a verdict the studio sees on the inquiry. */

const KEYLETTER = 'ABCDEFGHIJ';
const O = (v, d) => ({v, d});
const OTHER = O('Other');

const Q_TYPE = {
  key:'Establishment', mode:'one',
  t:'What kind of establishment are we dressing?',
  h:'Everything after this is shaped by your answer, so the questions you see next will be specific to you.',
  opts:[O('Hotel or resort'), O('Restaurant or restaurant group'), O('Spa and wellness'),
        O('Private clinic'), O('Members club or private venue'), O('Retail or showroom'), OTHER],
};
const BRANCH_OF = {
  'Hotel or resort':'hotel', 'Restaurant or restaurant group':'restaurant',
  'Spa and wellness':'spa', 'Private clinic':'clinic',
  'Members club or private venue':'club', 'Retail or showroom':'retail', 'Other':'other',
};

const BRANCHES = {
  hotel:[
    {key:'Property size', mode:'one', t:'How many rooms does the property have?',
     h:'Room count is the quickest read on the size of the teams behind it.',
     opts:[O('Under 30', 'Boutique'), O('30 to 80'), O('80 to 150'), O('150 to 300'),
           O('300 or more'), O('Not sure'), OTHER]},
    {key:'Departments', mode:'many', t:'Which departments would wear it?',
     h:'Choose any that apply. A hotel wardrobe is usually several of these, not one.',
     opts:[O('Reception and welcome'), O('Restaurant and bar'), O('Housekeeping'),
           O('Spa and wellness'), O('Concierge and guest services'), O('Kitchen'),
           O('Management'), OTHER]},
  ],
  restaurant:[
    {key:'Venues', mode:'one', t:'How many venues are we dressing?',
     h:'One kitchen and five kitchens are different projects, even at the same headcount.',
     opts:[O('One'), O('Two or three'), O('Four to seven'), O('Eight to fifteen'),
           O('More than fifteen'), O('Still deciding'), OTHER]},
    {key:'Teams', mode:'many', t:'Which teams would wear it?',
     h:'Choose any that apply.',
     opts:[O('Front of house'), O('Bar team'), O('Kitchen'), O('Hosts and reception'),
           O('Sommelier and floor management'), O('Management'), OTHER]},
  ],
  spa:[
    {key:'Treatment rooms', mode:'one', t:'How many treatment rooms?',
     h:'It tells us the size of the therapist team, which is the hardest group to fit.',
     opts:[O('1 to 3'), O('4 to 6'), O('7 to 12'), O('More than 12'),
           O('We are inside a hotel'), O('Not sure'), OTHER]},
    {key:'Roles', mode:'many', t:'Which roles would wear it?',
     h:'Choose any that apply.',
     opts:[O('Therapists'), O('Reception'), O('Fitness and studio'),
           O('Housekeeping and laundry'), O('Retail and product'), O('Management'), OTHER]},
  ],
  clinic:[
    {key:'Practice type', mode:'one', t:'What kind of practice is it?',
     h:'This decides which requirements we have to assess before proposing anything.',
     opts:[O('Aesthetic and dermatology'), O('Dental'), O('Medical or general practice'),
           O('Surgical'), O('Multi-specialty'), O('Veterinary'), OTHER]},
    {key:'Roles', mode:'many', t:'Which roles would wear it?',
     h:'Choose any that apply.',
     opts:[O('Clinical practitioners'), O('Nursing and assistants'), O('Reception and admin'),
           O('Technicians'), O('Cleaning and sterilisation'), O('Management'), OTHER]},
  ],
  club:[
    {key:'Space use', mode:'one', t:'What does the space mainly do?',
     h:'A dining room and an events floor put very different demands on the same jacket.',
     opts:[O('Dining and bar'), O('Events and private hire'), O('Sport and wellness'),
           O('Coworking and members lounge'), O('A mix'),
           O('Residential or private household'), OTHER]},
    {key:'Teams', mode:'many', t:'Which teams would wear it?',
     h:'Choose any that apply.',
     opts:[O('Service and floor'), O('Reception and membership'), O('Kitchen'),
           O('Events team'), O('Housekeeping'), O('Management'), OTHER]},
  ],
  retail:[
    {key:'Locations', mode:'one', t:'How many locations?',
     h:'Replenishment across sites changes the specification as much as the design does.',
     opts:[O('One'), O('Two to four'), O('Five to ten'), O('More than ten'),
           O('Pop-up or seasonal'), O('Still deciding'), OTHER]},
    {key:'Roles', mode:'many', t:'Which roles would wear it?',
     h:'Choose any that apply.',
     opts:[O('Shop floor and sales'), O('Stockroom and logistics'), O('Visual merchandising'),
           O('Store management'), O('Events and activations'), O('Head office'), OTHER]},
  ],
  other:[
    {key:'Operation', mode:'one', t:'How would you describe the operation?',
     h:'Close enough is fine — we will get to the detail on the call.',
     opts:[O('Hospitality of some kind'), O('Healthcare or wellbeing'), O('A workplace or office'),
           O('Events and catering'), O('Transport or travel'),
           O('Culture, museum or venue'), OTHER]},
    {key:'Teams', mode:'many', t:'Which teams would wear it?',
     h:'Choose any that apply.',
     opts:[O('Guest or customer facing'), O('Operations'), O('Technical and maintenance'),
           O('Reception and admin'), O('Food and beverage'), O('Management'), OTHER]},
  ],
};

const COMMON = [
  {key:'Direction', mode:'many', max:2,
   t:'Which directions feel right?',
   h:'Pick one or two. Not a design brief — just a direction.',
   opts:[O('Minimalist', 'Reduced detail, clean lines, quiet'),
         O('Scandinavian', 'Light, functional, unfussy, natural materials'),
         O('Japanese', 'Layered, generous cut, considered proportion'),
         O('Mediterranean', 'Linen, warmth, relaxed formality'),
         O('Classic tailoring', 'Structured, formal, traditional hospitality'),
         O('Industrial or utility', 'Workwear roots, pockets, hard-wearing'),
         O('Warm and traditional', 'Rich colour, texture, a sense of history'),
         O('Technical or sport', 'Performance fabrics, movement, modern'), OTHER]},

  {key:'People to dress', mode:'one',
   t:'How many people would wear the uniform?',
   h:'The single most useful number: it decides whether each garment reaches a workable quantity.',
   opts:[O('Fewer than 10'), O('10 to 25'), O('26 to 60'), O('61 to 150'),
         O('More than 150'), O('Not sure yet'), OTHER]},

  {key:'Designs', mode:'one',
   t:'Would everyone wear the same thing?',
   h:'Each design is a production run of its own, so this drives cost and timing more than anything else.',
   opts:[O('Yes — one uniform for everyone', 'One design, worn by every department'),
         O('Almost — the same design in different colours', 'Still one design to make. Colour or trim tells the teams apart'),
         O('A few departments need something different', 'Roughly two or three designs'),
         O('Most departments need their own', 'Roughly four to six designs'),
         O('Every role is dressed differently', 'Seven designs or more'),
         O('We honestly do not know — advise us', 'Very common, and usually the most useful conversation to have'),
         OTHER]},

  {key:'Timing', mode:'one',
   t:'When do you need them?',
   h:'Development runs 4 to 6 weeks, production 3 to 5. Knowing the date early protects it.',
   opts:[O('Within 3 months'), O('In 3 to 6 months'), O('In 6 to 12 months'),
         O('More than 12 months away'), O('Tied to an opening or refurbishment date'),
         O('No fixed date yet'), OTHER]},

  {key:'Budget range', mode:'one',
   t:'What budget do you have in mind?',
   h:'A range is fine. It helps us propose something real rather than something aspirational.',
   guide:'As a guide, a custom project generally starts around €120 per person across the garments in the range.',
   opts:[O('Under €10,000'), O('€10,000 to €25,000'), O('€25,000 to €50,000'),
         O('€50,000 to €100,000'), O('More than €100,000'), O('Prefer to discuss it'), OTHER]},

  {key:'What is not working', mode:'many',
   t:'What is not working at the moment?',
   h:'Choose as many as apply. Usually the most useful answer on the form.',
   opts:[O('It does not look right for the space'), O('It wears out too quickly'),
         O('The team dislikes wearing it'), O('Departments look disconnected'),
         O('Reordering is difficult or inconsistent'), O('It does not fit different body types'),
         O('It does not survive our laundry'), O('Staff wear their own clothes'),
         O('Nothing — this is a new opening'), OTHER]},
];

/* The nine, assembled for whoever is answering. */
function quizQs(){
  const b = BRANCH_OF[(UI.answers || {})['Establishment']];
  return [Q_TYPE, ...(b ? BRANCHES[b] : []), ...COMMON];
}
const QUIZ_TOTAL = 9;

/* ---- company qualification ---------------------------------------------
   VAT numbers are format-checked here, per member state. The VIES lookup
   itself is a server call — a browser cannot reach VIES, and would not be
   trusted to if it could — so the field records a status and the real
   verification happens when the brief is reviewed. The screen says so. */
const EU_VAT = {
  AT:[/^U\d{8}$/, 'U12345678'],            BE:[/^[01]\d{9}$/, '0123456789'],
  BG:[/^\d{9,10}$/, '123456789'],          CY:[/^\d{8}[A-Z]$/, '12345678L'],
  CZ:[/^\d{8,10}$/, '12345678'],           DE:[/^\d{9}$/, '123456789'],
  DK:[/^\d{8}$/, '12345678'],              EE:[/^\d{9}$/, '123456789'],
  EL:[/^\d{9}$/, '123456789'],             ES:[/^[A-Z0-9]\d{7}[A-Z0-9]$/, 'B12345678'],
  FI:[/^\d{8}$/, '12345678'],              FR:[/^[A-Z0-9]{2}\d{9}$/, 'XX123456789'],
  HR:[/^\d{11}$/, '12345678901'],          HU:[/^\d{8}$/, '12345678'],
  IE:[/^(\d{7}[A-Z]{1,2}|\d[A-Z+*]\d{5}[A-Z])$/, '1234567A'],
  IT:[/^\d{11}$/, '12345678901'],          LT:[/^(\d{9}|\d{12})$/, '123456789'],
  LU:[/^\d{8}$/, '12345678'],              LV:[/^\d{11}$/, '12345678901'],
  MT:[/^\d{8}$/, '12345678'],              NL:[/^\d{9}B\d{2}$/, '123456789B01'],
  PL:[/^\d{10}$/, '1234567890'],           PT:[/^\d{9}$/, '123456789'],
  RO:[/^\d{2,10}$/, '12345678'],           SE:[/^\d{12}$/, '123456789001'],
  SI:[/^\d{8}$/, '12345678'],              SK:[/^\d{10}$/, '1234567890'],
};
const COUNTRIES = [
  ['Spain','ES'],['France','FR'],['Portugal','PT'],['Italy','IT'],['Germany','DE'],
  ['Netherlands','NL'],['Belgium','BE'],['Ireland','IE'],['Austria','AT'],['Poland','PL'],
  ['Sweden','SE'],['Denmark','DK'],['Finland','FI'],['Greece','EL'],['Czechia','CZ'],
  ['Romania','RO'],['Hungary','HU'],['Croatia','HR'],['Bulgaria','BG'],['Slovakia','SK'],
  ['Slovenia','SI'],['Lithuania','LT'],['Latvia','LV'],['Estonia','EE'],['Luxembourg','LU'],
  ['Cyprus','CY'],['Malta','MT'],
  ['United Kingdom','GB'],['Switzerland','CH'],['Norway','NO'],
  ['Outside Europe','--'],['More than one country','--'],
];
const codeFor = (name) => (COUNTRIES.find(c => c[0] === name) || [])[1] || '--';
const isEU = (name) => !!EU_VAT[codeFor(name)];

/* Returns the state of the number as typed. 'pending' means the format is
   right and the VIES lookup is still owed — never that it has passed. */
function vatState(a){
  a = a || {};
  const country = a['Country'] || 'Spain';
  const code = codeFor(country);
  if(!isEU(country)) return {state:'not-required', code,
    text:'A VAT number is not needed for this destination. We confirm the billing entity when we quote.'};
  if(a['No VAT']) return {state:'not-registered', code,
    text:'Recorded as not VAT registered. We will confirm the billing arrangement before invoicing.'};
  const raw = (a['VAT'] || '').toUpperCase().replace(/[\s.\-]/g, '');
  if(!raw) return {state:'missing', code,
    text:`Needed for an ${country} delivery, or tick that you are not registered.`};
  const body = raw.startsWith(code) ? raw.slice(code.length) : raw;
  const [re, example] = EU_VAT[code];
  if(!re.test(body)) return {state:'format-invalid', code, example,
    text:`That does not match the ${country} format. Example: ${code}${example}.`};
  return {state:'pending', code, value:code + body,
    text:`Format checks out. We verify ${code + body} against VIES when we review your brief.`};
}

/* ---- qualification ------------------------------------------------------
   Headcount and design count are worth little apart. Divided, they give
   people per design, which is what decides whether a style reaches a
   workable production quantity. */
const HEAD_N = {'Fewer than 10':7, '10 to 25':18, '26 to 60':43, '61 to 150':105, 'More than 150':220};
const DESIGN_N = {
  'Yes — one uniform for everyone':1,
  'Almost — the same design in different colours':1,
  'A few departments need something different':2.5,
  'Most departments need their own':5,
  'Every role is dressed differently':8,
};

function qualify(a){
  a = a || {};
  const head = HEAD_N[a['People to dress']] || null;
  const designs = DESIGN_N[a['Designs']] || null;
  const per = head && designs ? head / designs : null;
  const flags = [];
  const add = (level, w, text) => flags.push({level, w, text});

  if(head === null) add('warn', -1, 'Headcount not given. Ask on the call before anything else — nothing else can be sized without it.');
  else if(head < 10) add('stop', -3, 'Below the scale where per-style minimums work comfortably.');
  else if(head >= 105) add('ok', 2, 'Headcount carries a multi-garment range comfortably.');

  if(designs === null) add('warn', -1, 'Design count undecided. Usually the most useful conversation to have on the call.');

  if(per !== null){
    if(per < 10) add('stop', -3, `About ${Math.round(per)} people per design. Per-style minimums will not be met as scoped.`);
    else if(per < 25) add('warn', -1, `About ${Math.round(per)} people per design. Check per-style minimums before quoting.`);
    else add('ok', 2, `About ${Math.round(per)} people per design, comfortably above per-style minimums.`);
  }

  if(a['Budget range'] === 'Prefer to discuss it') add('warn', -1, 'No budget range given. Establish one before scoping.');
  if(a['Budget range'] === 'Under €10,000' && head && head >= 61)
    add('warn', -2, 'Budget looks light against the headcount. Worth resolving before development.');
  if(a['Timing'] === 'Within 3 months')
    add('warn', -1, 'Development is 4 to 6 weeks and production 3 to 5. Little margin at this date.');
  if(a['Timing'] === 'Tied to an opening or refurbishment date')
    add('warn', -1, 'Date is tied to an opening. Confirm the real deadline, not the target.');
  if((a['What is not working'] || []).includes('Nothing — this is a new opening'))
    add('ok', 1, 'New opening. No legacy garments to replace or match.');

  /* who is actually buying */
  const auth = a['Authority'];
  if(auth === 'I decide this') add('ok', 1, 'Speaking to the decision maker.');
  else if(auth === 'I am gathering information for someone else')
    add('warn', -1, 'Not the decision maker. Identify who signs off before scoping.');
  else if(auth === 'A committee or procurement process decides')
    add('warn', -1, 'Committee or procurement decision. Expect a longer cycle and a formal process.');
  else if(auth === 'Not sure yet') add('warn', -1, 'Decision route unclear. Establish it on the call.');

  if(a['Email'] && isFreeMail(a['Email']))
    add('warn', -1, 'Personal email domain. Confirm the trading entity before invoicing.');

  const v = vatState(a);
  if(v.state === 'pending') add('ok', 1, `VAT ${v.value} captured, format valid. Verify against VIES before invoicing.`);
  else if(v.state === 'missing') add('warn', -1, `No VAT number for an EU delivery to ${a['Country']}. Needed before invoicing.`);
  else if(v.state === 'format-invalid') add('warn', -2, 'VAT number does not match the country format. Re-check before invoicing.');
  else if(v.state === 'not-registered') add('warn', -1, 'Not VAT registered. Confirm the billing arrangement.');

  const score = flags.reduce((t, f) => t + f.w, 0);
  const verdict = flags.some(f => f.level === 'stop') ? 'stop' : score < 0 ? 'warn' : 'ok';
  return {score, verdict, flags, head, designs,
          per: per === null ? null : Math.round(per)};
}

/* ---- the screens -------------------------------------------------------- */
function quizIntro(){
  return pubShellBare(`
  <div class="tf-bar"><span style="width:0%"></span></div>
  <section class="tf">
    <div class="tf-in">
      <span class="news"><b>9 questions</b>about 90 seconds</span>
      <h1 class="tf-q tf-q--intro">Tell us what your teams do all day</h1>
      <p class="tf-h">Nine questions, one at a time. Three change with the kind of place you run.</p>
      <ol class="intro-l">
        ${[['01','Every question has an <em>Other</em>, so nothing here can block you.'],
           ['02','Your contact details come at the end — not before.'],
           ['03','We read it ourselves and reply within two working days.']]
          .map(([n, t]) => `<li><span class="intro-n">${n}</span><span>${t}</span></li>`).join('')}
      </ol>
      <div class="tf-foot">
        <button class="btn btn--quiet" data-go="public:custom">← Back</button>
        <button class="btn btn--primary btn--lg" data-act="formNext">Start</button>
        <span class="tf-hint">No account is created by answering this, and nothing is shared with anyone.</span>
      </div>
    </div>
  </section>
  `, 'form');
}

function pubForm(){
  const step = UI.formStep = UI.formStep || 0;
  if(step === 0) return quizIntro();
  const qs = quizQs();
  if(step === qs.length + 1) return pubAboutYou();
  if(step > qs.length + 1) return pubAboutCompany();
  const q = qs[step - 1];
  const a = UI.answers = UI.answers || {};
  const chosen = q.mode === 'many' ? (a[q.key] || []) : [a[q.key]];
  const done = q.mode === 'many' ? chosen.length > 0 : !!a[q.key];
  const atMax = q.max && chosen.length >= q.max;
  return pubShellBare(`
  <div class="tf-bar"><span style="width:${Math.round((step / (QUIZ_TOTAL + CONTACT_STEPS)) * 100)}%"></span></div>
  <section class="tf">
    <div class="tf-in">
      <div class="tf-n"><b>${String(step).padStart(2, '0')}</b> of ${QUIZ_TOTAL}</div>
      <h1 class="tf-q">${q.t}</h1>
      <p class="tf-h">${q.h}</p>
      ${q.guide ? `<p class="tf-guide">${q.guide}</p>` : ''}
      ${q.mode === 'many' ? `<p class="tf-multi">${q.max
        ? `Choose up to ${q.max}${atMax ? ' · choosing another replaces the first' : ''}`
        : 'Choose any that apply'}</p>` : ''}

      <div class="tf-opts ${q.opts.some(o => o.d) ? 'tf-opts--desc' : ''}" role="group" aria-label="${esc(q.t)}">
        ${q.opts.map((o, i) => {
          const on = chosen.includes(o.v);
          return `<button class="tf-o ${on ? 'tf-o--on' : ''}" data-act="pick" data-v="${esc(o.v)}"
            aria-pressed="${on}">
            <span class="tf-key">${KEYLETTER[i]}</span>
            <span class="tf-lab">${esc(o.v)}${o.d ? `<em class="tf-desc">${esc(o.d)}</em>` : ''}</span>
            <span class="tf-tick">✓</span>
          </button>`;}).join('')}
      </div>

      <div class="tf-foot">
        <button class="btn btn--quiet" data-act="formBack">← Back</button>
        <button class="btn btn--primary btn--lg" data-act="formNext"
          ${done ? '' : 'disabled'}>${done ? 'OK' : 'Choose an answer'}</button>
        <span class="tf-hint">${done ? 'Press Enter to continue'
          : `Press ${KEYLETTER[0]}–${KEYLETTER[q.opts.length - 1]} to choose`}</span>
      </div>
    </div>
  </section>
  `, 'form');
}

/* ---- the two qualification screens -------------------------------------
   Split deliberately: who is asking, then who is buying. They are different
   questions and the second one decides how an invoice can be raised. */
const CONTACT_STEPS = 2;

const AUTHORITY = [
  O('I decide this', 'The budget and the sign-off are mine'),
  O('I recommend, someone else signs off', 'Tell us who else needs to see the proposal'),
  O('I am gathering information for someone else', 'We will keep it readable for them'),
  O('A committee or procurement process decides', 'Useful to know early — it changes the timeline'),
  O('Not sure yet'),
];

const FREE_MAIL = ['gmail.com','googlemail.com','hotmail.com','hotmail.es','hotmail.fr','outlook.com',
  'live.com','yahoo.com','yahoo.es','ymail.com','icloud.com','me.com','aol.com','gmx.com','gmx.net',
  'protonmail.com','proton.me','mail.com','yandex.com','free.fr','orange.fr','wanadoo.fr'];
const isFreeMail = (e) => FREE_MAIL.includes(String(e || '').split('@')[1] ? String(e).split('@')[1].toLowerCase() : '');

function briefField(n, l, type, help, a, err){
  return `
  <label class="fld ${err[n] ? 'fld--err' : ''}">
    <span class="fld-l">${l}</span>
    <input class="inp inp--lg" type="${type}" name="${n}" value="${esc(a[n] || '')}">
    ${help ? `<span class="fld-h t-xs muted">${help}</span>` : ''}
    ${err[n] ? `<span class="fld-e t-xs">${err[n]}</span>` : ''}
  </label>`;
}

function briefErrBanner(err){
  const k = Object.keys(err || {});
  return k.length ? `<div class="banner banner--stop" id="ferr"><div>
    <div class="banner-t">${k.length} still needed</div>
    <div class="banner-d">${k.map(x => esc(err[x])).join(' ')}</div></div></div>` : '';
}

/* Screen 10 — who is asking, and whether it is their decision. */
function pubAboutYou(){
  const a = UI.answers = UI.answers || {}, err = UI.formErr || {};
  const chosen = a['Authority'];
  return pubShellBare(`
  <div class="tf-bar"><span style="width:${Math.round((QUIZ_TOTAL / (QUIZ_TOTAL + CONTACT_STEPS)) * 100)}%"></span></div>
  <section class="tf">
    <div class="tf-in">
      <div class="tf-n"><b>About you</b> · 1 of 2</div>
      <h1 class="tf-q">Who should we reply to?</h1>
      <p class="tf-h">The only place we ask for your details, and we use them only to answer you.</p>
      ${briefErrBanner(err)}
      <form class="tf-form" onsubmit="return false">
        ${briefField('Contact name', 'Your name', 'text', '', a, err)}
        ${briefField('Role', 'Your role', 'text', 'So we know who else needs to be in the conversation.', a, err)}
      </form>
      <p class="tf-multi">Is this your decision to make?</p>
      <div class="tf-opts tf-opts--desc" role="group" aria-label="Decision authority">
        ${AUTHORITY.map((o, i) => `<button class="tf-o ${chosen === o.v ? 'tf-o--on' : ''}"
          data-act="pickField" data-k="Authority" data-v="${esc(o.v)}" aria-pressed="${chosen === o.v}">
          <span class="tf-key">${KEYLETTER[i]}</span>
          <span class="tf-lab">${esc(o.v)}${o.d ? `<em class="tf-desc">${esc(o.d)}</em>` : ''}</span>
          <span class="tf-tick">✓</span></button>`).join('')}
      </div>
      <div class="tf-foot">
        <button class="btn btn--quiet" data-act="formBack">← Back</button>
        <button class="btn btn--primary btn--lg" data-act="formNext">Continue</button>
        <span class="tf-hint">We reply within two working days.</span>
      </div>
    </div>
  </section>
  `, 'form');
}

/* Screen 11 — the buying entity. This is what an invoice is raised against. */
function pubAboutCompany(){
  const a = UI.answers = UI.answers || {}, err = UI.formErr || {};
  const v = vatState(a);
  const eu = isEU(a['Country'] || 'Spain');
  const free = a['Email'] && isFreeMail(a['Email']);
  const tone = {'pending':'go', 'not-required':'flow', 'not-registered':'flow',
                'format-invalid':'stop', 'missing':'wait'}[v.state];
  return pubShellBare(`
  <div class="tf-bar"><span style="width:${Math.round(((QUIZ_TOTAL + 1) / (QUIZ_TOTAL + CONTACT_STEPS)) * 100)}%"></span></div>
  <section class="tf">
    <div class="tf-in">
      <div class="tf-n"><b>About the company</b> · 2 of 2</div>
      <h1 class="tf-q">Who are we invoicing?</h1>
      <p class="tf-h">The buying entity — not always the same site that wears the uniform.</p>
      ${briefErrBanner(err)}
      <form class="tf-form tf-form--wide" onsubmit="return false">
        ${briefField('Company', 'Company or organisation', 'text', 'The registered name, if you have one.', a, err)}
        ${briefField('Email', 'Company email', 'email', 'Where the proposal goes.', a, err)}
        ${free ? `<div class="banner banner--wait"><div>
          <div class="banner-d">That is a personal email domain. Perfectly fine for a sole trader — we will
            just confirm the billing entity before invoicing.</div></div></div>` : ''}

        <label class="fld"><span class="fld-l">Delivery country</span>
          <select class="inp inp--lg" name="Country" data-act="setCountry">
            ${COUNTRIES.map(([n]) => `<option ${(a['Country'] || 'Spain') === n ? 'selected' : ''}>${n}</option>`).join('')}
          </select>
          <span class="fld-h t-xs muted">Decides whether a VAT number is needed.</span></label>

        ${eu ? `
        <div class="vat">
          <label class="fld"><span class="fld-l">VAT number ${a['No VAT'] ? '<span class="muted">(not registered)</span>' : ''}</span>
            <div class="vat-row">
              <span class="vat-cc">${v.code}</span>
              <input class="inp inp--lg" type="text" name="VAT" value="${esc(a['VAT'] || '')}"
                placeholder="${esc((EU_VAT[v.code] || [])[1] || '')}" ${a['No VAT'] ? 'disabled' : ''}>
              <button class="btn btn--ghost" data-act="checkVat" ${a['No VAT'] ? 'disabled' : ''}>Check</button>
            </div>
            ${err['VAT'] ? `<span class="fld-e t-xs">${err['VAT']}</span>` : ''}
          </label>
          <div class="banner banner--${tone}"><div>
            <div class="banner-d">${esc(v.text)}</div></div></div>
          <label class="chk"><input type="checkbox" data-act="noVat" ${a['No VAT'] ? 'checked' : ''}>
            <span class="t-sm">We are not VAT registered</span></label>
        </div>` : `
        <div class="banner banner--flow"><div>
          <div class="banner-d">${esc(v.text)}</div></div></div>`}

        ${briefField('Phone', 'Phone', 'tel', 'Optional. Only if you would rather we call.', a, err)}
      </form>
      <div class="tf-foot">
        <button class="btn btn--quiet" data-act="formBack">← Back</button>
        <button class="btn btn--primary btn--lg" data-act="formNext">Review your brief</button>
        <span class="tf-hint">We use these details to answer you and to raise the proposal.
          <a class="lnk" data-go="public:privacy">Privacy Notice</a></span>
      </div>
    </div>
  </section>
  `, 'form');
}

function pubReview(){
  const a = UI.answers || {};
  const qs = quizQs();
  const val = (q) => {
    const v = a[q.key];
    if(q.mode === 'many') return (v || []).length ? v.join(' · ') : 'Not answered';
    return v || 'Not answered';
  };
  return pubShellBare(`
  <div class="tf-bar"><span style="width:100%"></span></div>
  <section class="tf tf--wide">
    <div class="tf-in">
      <div class="tf-n"><b>Review</b></div>
      <h1 class="tf-q">Check your brief.</h1>
      <p class="tf-h">Change anything before you send it. Sending this requests a review — it does not place an
        order or create a project.</p>
      <dl class="rv">
        ${qs.map((q, i) => `
        <div class="rv-r">
          <dt>${esc(q.t)}</dt>
          <dd><span>${esc(val(q))}</span>
            <button class="lnk lnk--sm" data-act="formGoto" data-i="${i + 1}">Change</button></dd>
        </div>`).join('')}
        <div class="rv-r">
          <dt>Who should we reply to?</dt>
          <dd><span>${esc(a['Contact name'] || '—')}${a['Role'] ? ', ' + esc(a['Role']) : ''}<br>
            <span class="t-xs muted">${esc(a['Authority'] || 'Decision route not given')}</span></span>
            <button class="lnk lnk--sm" data-act="formGoto" data-i="${qs.length + 1}">Change</button></dd>
        </div>
        <div class="rv-r">
          <dt>Who are we invoicing?</dt>
          <dd><span>${esc(a['Company'] || '—')} · ${esc(a['Email'] || '—')} · ${esc(a['Country'] || 'Spain')}<br>
            <span class="t-xs muted">${(() => { const v = vatState(a);
              return v.state === 'pending' ? 'VAT ' + esc(v.value) + ' · awaiting VIES verification'
                : v.state === 'not-registered' ? 'Not VAT registered'
                : v.state === 'not-required' ? 'VAT not required for this destination'
                : 'VAT number not provided'; })()}</span></span>
            <button class="lnk lnk--sm" data-act="formGoto" data-i="${qs.length + 2}">Change</button></dd>
        </div>
      </dl>
      <div class="tf-foot tf-foot--wide">
        <button class="btn btn--quiet" data-act="formBack">← Back</button>
        <button class="btn btn--primary btn--lg" data-act="formSubmit">Submit your brief</button>
        <span class="tf-hint">We read it ourselves and reply within two working days.</span>
      </div>
    </div>
  </section>
  `, 'review');
}

function pubDone(){
  const inq = UI.lastInquiry;
  return pubShell(`
  <div class="q-wrap" style="text-align:center">
    <div class="eyebrow" style="color:var(--go)">Received</div>
    <h1 class="t-h2" style="margin-top:16px">Thank you — your inquiry is with us.</h1>
    <p class="t-lead" style="margin-top:20px">Your reference is <strong class="num">${esc(inq ? inq.ref : 'INQ-0149')}</strong>. We review every inquiry ourselves and reply either way, usually within two working days.</p>
    <div class="card" style="margin-top:40px;text-align:left">
      <div class="eyebrow">What happens next</div>
      <div class="stack-3" style="margin-top:16px">
        ${[['Now','We read what you sent and check it against what we can genuinely do well.'],
           ['Within 2 days','You hear from us either way. If we are not the right studio we will say so, and usually suggest someone who is.'],
           ['If it is a fit','We arrange a first call — about forty-five minutes on the work itself.'],
           ['After the call','If it goes ahead, we open your account and build the project before you ever log in.']]
          .map(([w,t]) => `<div class="factline"><span class="med">${w}</span><span class="muted">${t}</span></div>`).join('')}
      </div>
    </div>
    <div class="banner banner--go" style="margin-top:24px;text-align:left">
      <div><div class="banner-t">Prototype note</div>
      <div class="banner-d">That submission wrote a real record. Switch to the Studio Back Office and open Inquiries — ${esc(inq ? inq.ref : 'the new inquiry')} is at the top of the qualification queue, with a notification and a task attached to it.</div></div>
    </div>
    <div class="btn-row" style="margin-top:32px;justify-content:center">
      <button class="btn btn--ghost" data-go="public:home">Back to the site</button>
      <button class="btn btn--primary" data-act="peekInquiry">Open it in the Studio →</button>
    </div>
  </div>
  `, 'form');
}

/* ---- Sectors / Process / Work (short editorial pages) ------------------ */
/* ---- Login -------------------------------------------------------------- */
function pubLogin(){
  const rows = (side, title, note) => `
    <div class="card">
      <div class="eyebrow">${title}</div>
      <p class="t-xs muted" style="margin:8px 0 16px">${note}</p>
      <div class="stack-2">
        ${S.users.filter(u => u.side === side).map(u => `
          <button class="rw" data-act="login" data-u="${u.id}" style="border:1px solid var(--line);padding:12px">
            <span class="av ${side==='studio'?'av--studio':''}">${u.init}</span>
            <span class="rw-main">
              <span class="rw-t">${esc(u.name)}</span>
              <span class="rw-s">${esc(u.title)} · ${ROLE_NAMES[u.role]}</span>
            </span>
            <span class="rw-side"><span class="t-xs faint">Sign in →</span></span>
          </button>`).join('')}
      </div>
    </div>`;
  return pubShell(`
  <div class="q-wrap" style="max-width:840px">
    <div class="eyebrow">Sign in</div>
    <h1 class="t-h2" style="margin-top:12px">Choose who you are</h1>
    <p class="t-sm muted" style="margin-top:12px;margin-bottom:32px">This prototype has no passwords. Pick a person and you will see exactly what their role and scope permit — the same <code style="font-size:12px">can()</code> function decides both, so the two accounts cannot drift apart.</p>
    <div class="grid grid-2">
      ${rows('customer','Customer — Grup Marítim Hotels','Marta sees everything on the company account. Jordi is a member scoped to one project only.')}
      ${rows('studio','PAMUUC — Studio Back Office','Master sees and controls everything. The Account Manager sees assigned work without cost or margin. Finance sees money and just enough operational context.')}
    </div>
  </div>`, 'login');
}
