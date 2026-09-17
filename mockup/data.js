/* ============================================================================
   PAMUUC SUITE — canonical fixture
   ONE dataset. The public site, the Customer Account and the Studio Back
   Office are three projections of this object, never three copies of it.

   The story is chosen to exercise every hard rule in the specification:
   conditional Design, per-garment prototype rounds incl. the round-3 limit,
   multi-colourway garments with size splits that must sum, a blocked
   commercial gate, open change requests, and a completed project feeding
   Reorders. If the fixture can hold the story, the data model is right.
   ========================================================================= */

const STATUS = {
  /* the controlled status dictionary — §12.4. Every state in the system is
     declared here once, with its colour family and its plain-language
     customer sentence. Nothing renders a state that is not in this table. */
  not_started:     {label:'Not started',        fam:'idle', say:'Not started yet.'},
  in_progress:     {label:'In progress',        fam:'flow', say:'We are working on this now.'},
  /* Neutral label, personal sentence. One name on every surface (§12.4); the
     `say` line carries the direct address so the customer still reads plainly. */
  waiting_customer:{label:'Waiting on customer',fam:'wait', say:'We need something from you before this can move.'},
  waiting_pamuuc:  {label:'Waiting on PAMUUC',  fam:'flow', say:'With us — nothing needed from you.'},
  waiting_supplier:{label:'Waiting on supplier',fam:'flow', say:'With our supplier.'},
  ready_approval:  {label:'Ready for approval', fam:'wait', say:'Ready for your decision.'},
  approved:        {label:'Approved',           fam:'go',   say:'Approved and locked.'},
  at_risk:         {label:'At risk',            fam:'wait', say:'A date or decision is slipping. We will contact you.'},
  blocked:         {label:'Blocked',            fam:'stop', say:'Something must be resolved before this can continue.'},
  complete:        {label:'Complete',           fam:'go',   say:'Finished.'},

  draft:           {label:'Draft',              fam:'idle', say:'Not submitted.'},
  submitted:       {label:'Submitted',          fam:'flow', say:'Received. We will review it.'},
  /* Merchandise runs its own short path — submitted, quoted, then won or lost.
     It is deliberately not the uniform pipeline: a merchandise request is a
     price on a catalogue garment, not a project to be qualified. */
  quoted:          {label:'Quoted',             fam:'wait', say:'Your price is ready. It is with you to decide.'},
  won:             {label:'Confirmed',          fam:'go',   say:'Confirmed. We are putting it into production.'},
  lost:            {label:'Closed',             fam:'idle', say:'Closed without an order. Ask us any time to reopen it.'},
  under_review:    {label:'Under review',       fam:'flow', say:'We are assessing this.'},
  clarification:   {label:'Clarification needed',fam:'wait',say:'We have asked you a question.'},
  partially_approved:{label:'Partially approved',fam:'go',  say:'Some of what you asked for was accepted.'},
  declined:        {label:'Declined',           fam:'stop', say:'We could not accept this.'},
  incorporated:    {label:'Incorporated',       fam:'go',   say:'Built into the approved specification.'},
  withdrawn:       {label:'Withdrawn',          fam:'idle', say:'You withdrew this.'},

  planned:         {label:'Planned',            fam:'idle', say:'Scheduled, not started.'},
  in_development:  {label:'In development',     fam:'flow', say:'Being made.'},
  ready_fitting:   {label:'Ready for fitting',  fam:'flow', say:'The sample is ready.'},
  fitting_scheduled:{label:'Fitting scheduled', fam:'flow', say:'A fitting is booked.'},
  feedback_required:{label:'Your feedback needed',fam:'wait',say:'Tell us how this one fit.'},
  changes_requested:{label:'Changes requested', fam:'wait', say:'You asked for changes. We are making them.'},
  new_round:       {label:'New round required', fam:'wait', say:'A new sample is being made.'},
  manual_resolution:{label:'Manual resolution', fam:'stop', say:'We will contact you directly about this garment.'},
  superseded:      {label:'Superseded',         fam:'idle', say:'Replaced by a newer version.'},

  awaiting_customer:{label:'Awaiting your approval',fam:'wait',say:'Waiting for you to approve.'},
  sent:            {label:'Sent',               fam:'flow', say:'Sent to you.'},
  viewed:          {label:'Viewed',             fam:'flow', say:'You have opened this.'},
  accepted:        {label:'Accepted',           fam:'go',   say:'Accepted.'},
  expired:         {label:'Expired',            fam:'idle', say:'This is no longer valid.'},

  published:       {label:'Published',          fam:'flow', say:'Available to you.'},
  signature_required:{label:'Signature required',fam:'wait',say:'Needs your signature.'},
  signed:          {label:'Signed',             fam:'go',   say:'Signed.'},
  issued:          {label:'Issued',             fam:'flow', say:'Issued, not yet due for payment.'},
  payment_due:     {label:'Payment due',        fam:'wait', say:'Payment is due.'},
  payment_sent:    {label:'Transfer sent',      fam:'flow', say:'The customer has sent it; we confirm once it reaches the bank.'},
  partially_paid:  {label:'Partially paid',     fam:'wait', say:'Part of this has been paid.'},
  paid:            {label:'Paid',               fam:'go',   say:'Paid in full.'},
  overdue:         {label:'Overdue',            fam:'stop', say:'This payment is late.'},
  cancelled:       {label:'Cancelled',          fam:'idle', say:'Cancelled.'},
  not_required:    {label:'Not required',       fam:'idle', say:'Does not apply to this project.'},

  proposed:        {label:'Proposed',           fam:'wait', say:'We have proposed times.'},
  alternative:     {label:'Alternative requested',fam:'wait',say:'You asked for a different time.'},
  completed:       {label:'Completed',          fam:'go',   say:'This happened.'},
  /* import report severities — so the CSV screen uses the one status
     component too, rather than borrowing project states that mean
     something else entirely. */
  error:           {label:'Error',              fam:'stop', say:'This must be fixed before it will import.'},
  warning:         {label:'Warning',            fam:'wait', say:'Worth checking. It will still import.'},

  qualified:       {label:'Accepted for discovery',fam:'go',say:'Accepted.'},
  call_scheduled:  {label:'First call scheduled',fam:'flow',say:'A first call is booked.'},
  call_done:       {label:'First call completed',fam:'flow',say:'The first call happened.'},
  ready_account:   {label:'Ready for account',  fam:'go',   say:'Ready to open an account.'},
  converted:       {label:'Converted',          fam:'go',   say:'An account was opened.'},
  archived:        {label:'Archived',           fam:'idle', say:'Closed.'},
  active:          {label:'Active',             fam:'go',   say:'Active.'},
  hidden:          {label:'Hidden',             fam:'idle', say:'Not shown.'},
  restricted:      {label:'Restricted',         fam:'wait', say:'Limited use.'},
  in_production:   {label:'In production',      fam:'flow', say:'Being manufactured.'},
  dispatched:      {label:'Dispatched',         fam:'flow', say:'On its way.'},
  delivered:       {label:'Delivered',          fam:'go',   say:'Delivered.'},
};

/* The six stages. `design` is conditional — a project declares which apply. */
/* The whole journey, from the first message to the last delivery. The three
   steps before Design happen before an account exists — they are still the
   project's own history, so the project carries them and shows them closed
   with the dates they actually closed on.

   `pay` is how that step is billed, and it is a property of the step rather
   than of an invoice, because it is the same for every project: design and
   development are taken in full up front, production runs on the account's
   own terms, and nothing else is billed at all. */
const STAGES = [
  {id:'enquiry',       name:'Enquiry',
   blurb:'You tell us what you need. We read it properly rather than sending a price list back.'},
  {id:'qualification', name:'Qualification',
   blurb:'We work out the shape of the job — positions, volumes, timing — and whether it is one we can do well.'},
  {id:'first_call',    name:'First Call',
   blurb:'Half an hour together: what you are trying to achieve, roughly what it costs, and how we would work.'},
  {id:'design',        name:'Design',
   blurb:'An external designer draws the direction. You receive it as a single document you can keep.',
   pay:{kind:'advance', label:'Design fee'}},
  {id:'project_build', name:'Project Build',
   blurb:'Positions, garments, fabrics, colours, accessories and quantities — the whole specification, settled with you.'},
  {id:'development',   name:'Development',
   blurb:'Patterns, technical files and prototypes. You fit each sample on real people and approve them one at a time.',
   pay:{kind:'advance', label:'Development'}},
  {id:'production',    name:'Production',
   blurb:'Your approved garments are manufactured against the locked specification.',
   pay:{kind:'terms', label:'Production'}},
  {id:'delivery',      name:'Delivery',
   blurb:'Garments ship to your locations. Approved styles become available to reorder.'},
];

const COLOURS = {
  white:      {name:'Optic white',      hex:'#F7F4EE'},
  ecru:       {name:'Ecru',             hex:'#E4DCCB'},
  sand:       {name:'Sand',             hex:'#C9B79A'},
  clay:       {name:'Clay',             hex:'#A9765C'},
  navy:       {name:'Deep navy',        hex:'#1B2A44'},
  ink:        {name:'Ink',              hex:'#161A19'},
  forest:     {name:'Forest',           hex:'#20372E'},
  olive:      {name:'Olive',            hex:'#5E6244'},
  stone:      {name:'Stone grey',       hex:'#8C8B85'},
  maritime:   {name:'Marítim blue',     hex:'#2F5D74', custom:true},
  terracotta: {name:'Terracotta',       hex:'#9C4A2F'},
  black:      {name:'Black',            hex:'#0E0E0E'},

  /* ---- Stanley/Stella live palette, keyed by their colour code -----------
     The NAME and the code are authoritative, taken from their catalogue.
     The hex is approximated from the name for the mockup swatch only —
     replace with Stanley/Stella's published values before a customer sees
     one. `ss` carries the supplier code so the mapping stays traceable. */
  c001:    {name:'White'                   , hex:'#F7F4EE', ss:'C001'},
  c002:    {name:'Black'                   , hex:'#0E0E0E', ss:'C002'},
  c004:    {name:'Red'                     , hex:'#C0242E', ss:'C004'},
  c005:    {name:'Cotton Pink'             , hex:'#E7C3C0', ss:'C005'},
  c007:    {name:'Natural'                 , hex:'#E6DCC6', ss:'C007'},
  c008:    {name:'British Khaki'           , hex:'#8A8360', ss:'C008'},
  c013:    {name:'Bright Orange'           , hex:'#EE7623', ss:'C013'},
  c018:    {name:'Off White'               , hex:'#F2EFE8', ss:'C018'},
  c028:    {name:'Desert Dust'             , hex:'#DCCBB0', ss:'C028'},
  c036:    {name:'Glazed Green'            , hex:'#2F5E45', ss:'C036'},
  c038:    {name:'Canyon Pink'             , hex:'#C98E86', ss:'C038'},
  c039:    {name:'Lava Grey'               , hex:'#55585C', ss:'C039'},
  c047:    {name:'Sage'                    , hex:'#A8B79B', ss:'C047'},
  c048:    {name:'Ochre'                   , hex:'#C08A2E', ss:'C048'},
  c053:    {name:'Bright Blue'             , hex:'#1F6FD0', ss:'C053'},
  c054:    {name:'Natural Raw'             , hex:'#E8DFCC', ss:'C054'},
  c057:    {name:'Serene Blue'             , hex:'#6E93B0', ss:'C057'},
  c059:    {name:'Stem Green'              , hex:'#7FA85C', ss:'C059'},
  c060:    {name:'Teal Monstera'           , hex:'#24685F', ss:'C060'},
  c062:    {name:'Hibiscus Rose'           , hex:'#C94F72', ss:'C062'},
  c063:    {name:'Lavender'                , hex:'#B3A6D1', ss:'C063'},
  c068:    {name:'Orchid Flower'           , hex:'#B268A6', ss:'C068'},
  c072:    {name:'Olive Oil'               , hex:'#7C7A50', ss:'C072'},
  c078:    {name:'Butter'                  , hex:'#F0E2A8', ss:'C078'},
  c080:    {name:'Deep Metal'              , hex:'#3E4548', ss:'C080'},
  c081:    {name:'Flame Orange'            , hex:'#E2622B', ss:'C081'},
  c082:    {name:'Lime Flash'              , hex:'#B9D437', ss:'C082'},
  c084:    {name:'Heather Rainbow'         , hex:'#AFAAA6', ss:'C084'},
  c085:    {name:'Kaffa Coffee'            , hex:'#4A3527', ss:'C085'},
  c086:    {name:'Red Earth'               , hex:'#9C4A38', ss:'C086'},
  c087:    {name:'Day Fall'                , hex:'#8C7E6A', ss:'C087'},
  c088:    {name:'Worker Blue'             , hex:'#3E5A7A', ss:'C088'},
  c089:    {name:'Aloe'                    , hex:'#9FB79A', ss:'C089'},
  c100:    {name:'Go Green'                , hex:'#3FA35A', ss:'C100'},
  c101:    {name:'Fraiche Peche'           , hex:'#F0A986', ss:'C101'},
  c102:    {name:'G. Dyed Hydro'           , hex:'#5E9BAE', ss:'C102'},
  c103:    {name:'G. Dyed Swimmer Blue'    , hex:'#5E86AE', ss:'C103'},
  c109:    {name:'G. Dyed Khaki'           , hex:'#7E7A58', ss:'C109'},
  c112:    {name:'Latte'                   , hex:'#C9AE8E', ss:'C112'},
  c115:    {name:'Purple Love'             , hex:'#6B4C86', ss:'C115'},
  c116:    {name:'Red Brown'               , hex:'#7A3B2C', ss:'C116'},
  c129:    {name:'Bubble Pink'             , hex:'#EFB2C4', ss:'C129'},
  c130:    {name:'G. Dyed Bubble Pink'     , hex:'#EFB2C4', ss:'C130'},
  c133:    {name:'Lemon Sorbet'            , hex:'#F3E28A', ss:'C133'},
  c134:    {name:'Violet'                  , hex:'#5E4B8B', ss:'C134'},
  c135:    {name:'Mocha'                   , hex:'#8A6A52', ss:'C135'},
  c136:    {name:'Deep Teal'               , hex:'#1E4B4F', ss:'C136'},
  c137:    {name:'Verdant Green'           , hex:'#31694A', ss:'C137'},
  c138:    {name:'Misty Grey'              , hex:'#B9BCBE', ss:'C138'},
  c140:    {name:'G. Dyed Black Rock'      , hex:'#1E1C1B', ss:'C140'},
  c141:    {name:'G. Dyed Gold Ochre'      , hex:'#C08A2E', ss:'C141'},
  c142:    {name:'Nispero'                 , hex:'#E08A4C', ss:'C142'},
  c143:    {name:'Fiesta'                  , hex:'#C2452E', ss:'C143'},
  c144:    {name:'Green Bay'               , hex:'#4E7A5C', ss:'C144'},
  c145:    {name:'Aqua Blue'               , hex:'#6FC2CF', ss:'C145'},
  c146:    {name:'Cool Heather Grey'       , hex:'#A9AFB3', ss:'C146'},
  c147:    {name:'Eco-Heather'             , hex:'#B0ADA4', ss:'C147'},
  c149:    {name:'Blue soul'               , hex:'#5A6E88', ss:'C149'},
  c150:    {name:'Earthy Red'              , hex:'#8E3A33', ss:'C150'},
  c151:    {name:'Deep Plum'               , hex:'#4E2B42', ss:'C151'},
  c152:    {name:'Grounded Beige'          , hex:'#D6C6AC', ss:'C152'},
  c153:    {name:'Faded Olive'             , hex:'#6E6B4A', ss:'C153'},
  c155:    {name:'Honey Paper'             , hex:'#E9DCC0', ss:'C155'},
  c156:    {name:'Blue Grey'               , hex:'#7C8A96', ss:'C156'},
  c157:    {name:'G. Dyed Misty Grey'      , hex:'#B9BCBE', ss:'C157'},
  c158:    {name:'G. Dyed Blue Grey'       , hex:'#7C8A96', ss:'C158'},
  c160:    {name:'G. Dyed Green Bay'       , hex:'#4E7A5C', ss:'C160'},
  c161:    {name:'G. Dyed Purple Love'     , hex:'#6B4C86', ss:'C161'},
  c162:    {name:'G. Dyed Anthracite'      , hex:'#33383B', ss:'C162'},
  c171:    {name:'Mosstone'                , hex:'#7A8B6B', ss:'C171'},
  c172:    {name:'Passionate Red'          , hex:'#B5202C', ss:'C172'},
  c173:    {name:'Pebble Blue'             , hex:'#8FA3B3', ss:'C173'},
  c174:    {name:'G.Dyed Mocha'            , hex:'#8A6A52', ss:'C174'},
  c175:    {name:'G.Dyed Blush'            , hex:'#E6C3BE', ss:'C175'},
  c176:    {name:'Bronze'                  , hex:'#8C6239', ss:'C176'},
  c177:    {name:'G.Dyed Bronze'           , hex:'#8C6239', ss:'C177'},
  c204:    {name:'Spectra Yellow'          , hex:'#F2C230', ss:'C204'},
  c223:    {name:'Khaki'                   , hex:'#7E7A58', ss:'C223'},
  c224:    {name:'Bottle Green'            , hex:'#1F4B34', ss:'C224'},
  c230:    {name:'Royal Blue'              , hex:'#2D4FA8', ss:'C230'},
  c232:    {name:'Sky blue'                , hex:'#8FC0DE', ss:'C232'},
  c244:    {name:'Burgundy'                , hex:'#6B2333', ss:'C244'},
  c250:    {name:'Heather Grey'            , hex:'#A3A6A8', ss:'C250'},
  c253:    {name:'Anthracite'              , hex:'#33383B', ss:'C253'},
  c355:    {name:'Lilac Dream'             , hex:'#C7B9DE', ss:'C355'},
  c356:    {name:'Viva Yellow'             , hex:'#F5CE3E', ss:'C356'},
  c357:    {name:'Pool Blue'               , hex:'#5BB7D4', ss:'C357'},
  c358:    {name:'Stone'                   , hex:'#B5AA9A', ss:'C358'},
  c359:    {name:'Dusk'                    , hex:'#6B6E8A', ss:'C359'},
  c360:    {name:'Pink Joy'                , hex:'#E8899F', ss:'C360'},
  c361:    {name:'Cream'                   , hex:'#EFE6D4', ss:'C361'},
  c362:    {name:'Beige Oxford'            , hex:'#D3C6AE', ss:'C362'},
  c363:    {name:'Blue Oxford'             , hex:'#41536B', ss:'C363'},
  c366:    {name:'Summer Blue'             , hex:'#7FA8C9', ss:'C366'},
  c367:    {name:'Soft Khaki'              , hex:'#9A9A78', ss:'C367'},
  c370:    {name:'Light Wash'              , hex:'#A8BCD0', ss:'C370'},
  c371:    {name:'Mid Wash'                , hex:'#6E88A6', ss:'C371'},
  c372:    {name:'G. Dyed Black'           , hex:'#141414', ss:'C372'},
  c373:    {name:'G.Dyed Navy'             , hex:'#1E2A44', ss:'C373'},
  c375:    {name:'Rinse Wash'              , hex:'#3E5670', ss:'C375'},
  c504:    {name:'Vintage White'           , hex:'#EFEAE0', ss:'C504'},
  c591:    {name:'Midnight Blue'           , hex:'#1B2740', ss:'C591'},
  c592:    {name:'Heather Sand'            , hex:'#CFC3AE', ss:'C592'},
  c600:    {name:'RE-Black'                , hex:'#151515', ss:'C600'},
  c601:    {name:'RE-Navy'                 , hex:'#1E2A44', ss:'C601'},
  c602:    {name:'RE-White'                , hex:'#F7F5F0', ss:'C602'},
  c650:    {name:'Mid Heather Grey'        , hex:'#8A8D90', ss:'C650'},
  c651:    {name:'Dark Heather Grey'       , hex:'#4C4F52', ss:'C651'},
  c652:    {name:'Dark Heather Blue'       , hex:'#46566B', ss:'C652'},
  c680:    {name:'Cream Heather Grey'      , hex:'#DED9CF', ss:'C680'},
  c682:    {name:'Cream Heather Pink'      , hex:'#E4D3CC', ss:'C682'},
  c702:    {name:'Stargazer'               , hex:'#3C4C6E', ss:'C702'},
  c710:    {name:'Ocean Depth'             , hex:'#1F3A4D', ss:'C710'},
  c715:    {name:'India Ink Grey'          , hex:'#3B3F45', ss:'C715'},
  c724:    {name:'Caribbean Blue'          , hex:'#3FA9C9', ss:'C724'},
  c727:    {name:'French Navy'             , hex:'#22304C', ss:'C727'},
  c728:    {name:'Blue Ice'                , hex:'#C3D9E6', ss:'C728'},
  c729:    {name:'Mindful Blue'            , hex:'#4C6B86', ss:'C729'},
  c730:    {name:'Heritage Brown'          , hex:'#6B4A35', ss:'C730'},
  c731:    {name:'Heather Haze'            , hex:'#B7B2AC', ss:'C731'},
  c732:    {name:'G. Dyed Blue Stone'      , hex:'#6E8296', ss:'C732'},
  c733:    {name:'G. Dyed Latte'           , hex:'#C9AE8E', ss:'C733'},
  c735:    {name:'Misty Jade'              , hex:'#8FB5A6', ss:'C735'},
  c805:    {name:'Camouflage'              , hex:'#6B6A4E', ss:'C805'},

  /* 89 colours arriving with the new catalogue, names and hex as supplied */
  c806:{name:'White', hex:'#FFFFFF'},
  c811:{name:'Sand', hex:'#C09F80'},
  c841:{name:'Angora (Natural)', hex:'#D9B8A7'},
  c878:{name:'Walnut', hex:'#766D4B'},
  c892:{name:'Chocolate', hex:'#683C2E'},
  c808:{name:'Yellow', hex:'#FFE400'},
  c862:{name:'Orange', hex:'#F08927'},
  c875:{name:'Red', hex:'#DC002E'},
  c873:{name:'Garnet', hex:'#8C1713'},
  c883:{name:'Rosette', hex:'#DC006B'},
  c869:{name:'Light Pink', hex:'#F8CCD5'},
  c880:{name:'Purple', hex:'#750D68'},
  c843:{name:'Orchid', hex:'#C57AB0'},
  c809:{name:'Royal Blue', hex:'#0060A9'},
  c813:{name:'Sky Blue', hex:'#C4DDF1'},
  c819:{name:'Turquoise', hex:'#00A0D1'},
  c814:{name:'Ocean Blue', hex:'#008FC1'},
  c891:{name:'Denim Blue', hex:'#4C6781'},
  c871:{name:'Navy Blue', hex:'#001D43'},
  c818:{name:'Lime Yellow', hex:'#ECE562'},
  c817:{name:'Oasis Green', hex:'#C1D784'},
  c847:{name:'Irish Green', hex:'#7DB955'},
  c890:{name:'Grass Green', hex:'#51A025'},
  c837:{name:'Tropical Green', hex:'#008C15'},
  c872:{name:'Bottle Green', hex:'#004237'},
  c826:{name:'Army Green', hex:'#938E4F'},
  c827:{name:'Venture Green', hex:'#535F49'},
  c874:{name:'Heather Grey', hex:'#C4C4C4'},
  c816:{name:'Stone Grey', hex:'#B4AFAB'},
  c844:{name:'Ebony', hex:'#374047'},
  c867:{name:'Dark Lead', hex:'#484E41'},
  c807:{name:'Black', hex:'#000000'},
  c854:{name:'Greek Orange', hex:'#C1916D'},
  c831:{name:'Pale Red', hex:'#A4777E'},
  c857:{name:'Lavender', hex:'#A6929E'},
  c821:{name:'Lilac', hex:'#6A6378'},
  c834:{name:'Calm Blue', hex:'#879BA3'},
  c856:{name:'Dusty Blue', hex:'#659A9E'},
  c853:{name:'Mist Green', hex:'#D4DDC4'},
  c824:{name:'Vintage White', hex:'#EFE6E5'},
  c882:{name:'Sweet Yellow', hex:'#EFE1A7'},
  c859:{name:'Ochre', hex:'#C5A251'},
  c820:{name:'Coral', hex:'#FF6D6A'},
  c860:{name:'Brick Red', hex:'#AF6C67'},
  c876:{name:'Burgundy', hex:'#771E1E'},
  c870:{name:'Silk Pink', hex:'#E982A0'},
  c881:{name:'Iris Purple', hex:'#5A5B9F'},
  c815:{name:'Sweet Blue', hex:'#B5CEDF'},
  c864:{name:'Deep Blue', hex:'#008FC1'},
  c866:{name:'Moonlight Blue', hex:'#0F4E67'},
  c893:{name:'Green Mint', hex:'#9FD9D7'},
  c836:{name:'Kelly Green', hex:'#008F4F'},
  c812:{name:'Moca', hex:'#A38068'},
  c855:{name:'Clay Orange', hex:'#CE8477'},
  c851:{name:'Chrysanthemum Red', hex:'#BE444F'},
  c850:{name:'Riviera Blue', hex:'#5A77A8'},
  c852:{name:'Zen Blue', hex:'#A1A9BE'},
  c823:{name:'Washed Blue', hex:'#70A4B0'},
  c865:{name:'Blue Lake', hex:'#39505C'},
  c858:{name:'Laurel Green', hex:'#616F65'},
  c829:{name:'Opal', hex:'#9F9C99'},
  c822:{name:'Fluor Lady Pink', hex:'#FF5FA2'},
  c863:{name:'Fire Orange', hex:'#EB3C27'},
  c877:{name:'Plum Red', hex:'#5A2F43'},
  c861:{name:'Jade', hex:'#00AE99'},
  c832:{name:'Berry Red', hex:'#865560'},
  c833:{name:'Storm Blue', hex:'#587284'},
  c830:{name:'Dark Mint', hex:'#70A390'},
  c879:{name:'Mantis Green', hex:'#D3DF89'},
  c884:{name:'Sweet Yellow Wash', hex:'#EFE1A7'},
  c888:{name:'Light Papaya Wash', hex:'#FFA266'},
  c887:{name:'Light Khaki Wash', hex:'#A39264'},
  c889:{name:'Duck Green Wash', hex:'#53665C'},
  c885:{name:'Stone Grey Wash', hex:'#A09E9C'},
  c886:{name:'Sky Grey Wash', hex:'#3B3B48'},
  c825:{name:'Blue Jeans', hex:'#1E2C48'},
  c894:{name:'Electric Blue', hex:'#334A97'},
  c828:{name:'Pine Green', hex:'#515748'},
  c842:{name:'Lead', hex:'#67726B'},
  c838:{name:'Dark Sand', hex:'#9A8A70'},
  c846:{name:'Aquamarine', hex:'#00A4B5'},
  c845:{name:'Punch Lime', hex:'#C0D725'},
  c835:{name:'Curry Yellow', hex:'#BB7A2C'},
  c848:{name:'Heather Black', hex:'#2A2A2A'},
  c868:{name:'Grey', hex:'#C4C4C4'},
  c839:{name:'Fluor Yellow', hex:'#E9E568'},
  c849:{name:'Heather Denim', hex:'#666F95'},
  c810:{name:'Beige', hex:'#D3BF96'},
  c840:{name:'Fern Green', hex:'#009A44'},
};

/* Colour order, most asked for first. Ranked by how many garments in the
   range carry each one — a colour stocked across sixty garments is a staple,
   one that appears on a single style is a speciality. That is breadth of
   range, which tracks demand but is not the same thing: replace this array
   with the order from real sales and every swatch on the site follows it,
   because the lists are sorted once at startup rather than at each render. */
const COLOUR_ORDER = [
  'c002', 'c727', 'c807', 'c001', 'c871', 'c054', 'c253', 'c223', 'c250', 'c875', 'c702', 'c244',
  'c806', 'c809', 'c004', 'c005', 'c028', 'c146', 'c874', 'c872', 'c730', 'c729', 'c135', 'c728',
  'c149', 'c088', 'c873', 'c147', 'c156', 'c651', 'c063', 'c359', 'c116', 'c018', 'c089', 'c036',
  'c869', 'c136', 'c144', 'c151', 'c735', 'c813', 'c819', 'c833', 'c142', 'c129', 'c361', 'c715',
  'c138', 'c731', 'c808', 'c883', 'c867', 'c112', 'c230', 'c137', 'c811', 'c824', 'c101', 'c143',
  'c358', 'c224', 'c173', 'c826', 'c155', 'c880', 'c853', 'c862', 'c232', 'c053', 'c504', 'c724',
  'c115', 'c134', 'c153', 'c172', 'c176', 'c356', 'c360', 'c841', 'c891', 'c890', 'c827', 'c816',
  'c145', 'c171', 'c204', 'c355', 'c357', 'c844', 'c866', 'c855', 'c894', 'c838', 'c837', 'c831',
  'c856', 'c820', 'c881', 'c893', 'c850', 'c852', 'c832', 'c013', 'c038', 'c048', 'c150', 'c877',
  'c008', 'c081', 'c140', 'c892', 'c857', 'c821', 'c834', 'c851', 'c858', 'c078', 'c817', 'c059',
  'c133', 'c152', 'c650', 'c652', 'c710', 'c882', 'c863', 'c861', 'c879', 'c835', 'c848', 'c868',
  'c068', 'c082', 'c158', 'c854', 'c836', 'c812', 'c823', 'c830', 'c842', 'c047', 'c057', 'c060',
  'c080', 'c085', 'c086', 'c100', 'c102', 'c109', 'c157', 'c174', 'c175', 'c177', 'c362', 'c363',
  'c366', 'c367', 'c370', 'c371', 'c372', 'c373', 'c592', 'c732', 'c878', 'c843', 'c814', 'c818',
  'c847', 'c859', 'c860', 'c876', 'c870', 'c815', 'c864', 'c865', 'c829', 'c822', 'c884', 'c888',
  'c887', 'c889', 'c885', 'c886', 'c825', 'c828', 'c846', 'c845', 'c839', 'c849', 'c810', 'c840',
  'white', 'ecru', 'sand', 'clay', 'navy', 'ink', 'forest', 'olive', 'stone', 'maritime', 'terracotta', 'black',
  'c007', 'c039', 'c062', 'c072', 'c084', 'c087', 'c103', 'c130', 'c141', 'c160', 'c161', 'c162',
  'c375', 'c591', 'c600', 'c601', 'c602', 'c680', 'c682', 'c733', 'c805',
];
const COLOUR_RANK = COLOUR_ORDER.reduce((m, k, i) => (m[k] = i, m), {});

const FABRICS = {
  f_poplin:  {name:'Organic cotton poplin', ref:'FB-014', spec:'135 g/m², GOTS certified, Portugal', prov:true},
  f_twill:   {name:'Cotton–linen twill',    ref:'FB-022', spec:'240 g/m², Spain', prov:true},
  f_canvas:  {name:'Recycled canvas',       ref:'FB-031', spec:'320 g/m², 60% recycled cotton', prov:true},
  f_jersey:  {name:'Compact jersey',        ref:'FB-008', spec:'190 g/m², Turkey', prov:false},
  f_wool:    {name:'Wool melton',           ref:'FB-040', spec:'520 g/m², Italy, RWS', prov:true},
  f_tencel:  {name:'TENCEL™ lyocell twill', ref:'FB-027', spec:'165 g/m², Austria fibre', prov:true},
  f_terry:   {name:'Cotton terry',          ref:'FB-035', spec:'400 g/m², Portugal', prov:true},
};

const SIZES = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL', '0-3 m/56-62cm', '0-6 m/56-68cm', '12-13/152-158cm', '12-18 m/80-86cm', '18-24 m/86-92cm', '24-36 m/92-98cm', '3-4/98-104cm', '3-6 m/62-68cm', '5-6/110-116cm', '6-12 m/68-80cm', '6-9 m/68-74cm', '7-8/122-128cm', '9-11/134-146cm', '9-12 m/74-80cm', 'M/L', 'S/M'];


/* ============================================================================
   SEED — a clean studio.

   There are no customer accounts, no projects and no garments in here. The
   studio starts with two inquiries sitting in the qualification queue, and
   everything downstream of them — the account, the customer's login, the
   project, its garments, its prices and its payment schedule — is created by
   hand in the Back Office. That is the point: the shape of a project is not
   seeded, it is built.

   The two inquiries are deliberately different kinds of job:

     INQ-0201  Hotel Miravent — a new opening with no uniform identity of its
               own. This is the project that carries paid design work, so it
               runs the conditional Design stage and a design fee that gates
               the release of the designer's work.

     INQ-0202  Clínica Vallcarca — a large replacement for an operation that
               already has a brand book. No design stage: it starts at
               Development, and the money sits against development and
               production instead.
   ========================================================================= */
const SEED = {
  today:'2026-09-16',

  /* Only PAMUUC staff exist at the start. A customer user is created when an
     account is activated from an inquiry, from the contact who wrote in —
     which is also how they appear on the sign-in screen. */
  users:[
    {id:'u_leo',   name:'Leonardo Gobbato', role:'master',  title:'Founder',          init:'LG', side:'studio'},
    {id:'u_nuria', name:'Núria Batlle',     role:'am',      title:'Account Manager',  init:'NB', side:'studio'},
    {id:'u_sergi', name:'Sergi Roig',       role:'finance', title:'Finance Director', init:'SR', side:'studio'},
    /* One customer, so the account can be looked at before anything is in it.
       Every other account here is opened the way a real one is — out of a
       qualified inquiry — but an empty account is a state worth being able to
       see on purpose rather than only catching in the seconds after it opens. */
    {id:'u_marta', name:'Marta Serra', role:'cust_admin', title:'Operations Manager',
     init:'MS', side:'customer', account:'acc_vela', email:'marta.serra@velahotels.example'},
  ],

  accounts:[
    {id:'acc_vela', name:'Vela Hotels', country:'Spain', city:'Barcelona',
     since:'2026-08-18', am:'u_nuria', status:'active', admin:'u_marta',
     terms:'30 days from invoice date', currency:'EUR', vat:'ESB6612__47',
     locations:[], balance:3400,
     modules:{projects:true, reorders:true, merchandise:true, documents:true, payments:true}},
  ],

  bases:[
    {id:'b_shirt_ls', ref:'PB-101', name:'Long sleeve shirt', cat:'Shirting', v:'v4',
     glyph:'👔', status:'active',
     fabrics:['f_poplin','f_twill','f_tencel'], colours:['white','ecru','sand','navy','ink','maritime'],
     pers:['embroidery','woven_label'], pos:['left_chest','nape','cuff'], sizes:SIZES,
     spec:'Two-piece collar, single-needle side seams, reinforced placket. Fit block: service.',
     used:9},
    {id:'b_apron_t', ref:'PB-118', name:'Tailored apron', cat:'Service', v:'v3',
     glyph:'🩱', status:'active',
     fabrics:['f_canvas','f_twill'], colours:['ecru','clay','forest','ink','stone','terracotta'],
     pers:['embroidery','screen','woven_label'], pos:['left_chest','pocket','hem'], sizes:['One size'],
     spec:'Cross-back, adjustable, double-stitched pockets. Wash-tested to 60°C × 50 cycles.',
     used:14},
    {id:'b_tunic', ref:'PB-134', name:'Service tunic', cat:'Housekeeping', v:'v2',
     glyph:'🥼', status:'active',
     fabrics:['f_tencel','f_twill','f_jersey'], colours:['white','ecru','stone','forest','olive'],
     pers:['embroidery','woven_label'], pos:['left_chest','nape'], sizes:SIZES,
     spec:'Side-vented, concealed placket, action back. Industrial-wash compatible.',
     used:7},
    {id:'b_wrap', ref:'PB-142', name:'Wrap jacket', cat:'Wellness', v:'v2',
     glyph:'🧥', status:'active',
     fabrics:['f_tencel','f_terry','f_jersey'], colours:['white','ecru','sand','stone'],
     pers:['embroidery'], pos:['left_chest','nape'], sizes:SIZES,
     spec:'Kimono sleeve, self-tie belt, soft-hand finish for treatment work.',
     used:3},
    {id:'b_coat', ref:'PB-155', name:'Wool overcoat', cat:'Outerwear', v:'v1',
     glyph:'🧥', status:'restricted',
     fabrics:['f_wool'], colours:['navy','ink','forest'],
     pers:['embroidery','woven_label'], pos:['left_chest','nape'], sizes:SIZES,
     spec:'Half-canvas front, storm-tested seams. Restricted: minimum 20 pieces, 14-week lead.',
     used:1},
    {id:'b_chef', ref:'PB-160', name:'Chef jacket', cat:'Kitchen', v:'v5',
     glyph:'👨‍🍳', status:'active',
     fabrics:['f_twill','f_canvas'], colours:['white','ecru','ink','stone'],
     pers:['embroidery'], pos:['left_chest','sleeve'], sizes:SIZES,
     spec:'Heat-resistant, press-stud front, vented underarm.', used:11},
    {id:'b_trouser', ref:'PB-166', name:'Service trouser', cat:'Tailoring', v:'v3',
     glyph:'👖', status:'active',
     fabrics:['f_twill','f_canvas'], colours:['ink','navy','stone','forest'],
     pers:['woven_label'], pos:['pocket'], sizes:SIZES,
     spec:'Flat front, gusseted rise, stretch waistband.', used:12},
    {id:'b_polo', ref:'PB-172', name:'Piqué polo', cat:'Casual', v:'v2',
     glyph:'👕', status:'draft',
     fabrics:['f_jersey'], colours:['white','navy','forest','stone'],
     pers:['embroidery','screen'], pos:['left_chest','sleeve'], sizes:SIZES,
     spec:'Draft — fit block under revision, not available to projects.', used:0},
  ],

  personalization:{
    embroidery:{name:'Embroidery',   note:'Up to 6 colours, best for logos with clear edges.'},
    screen:    {name:'Screen print', note:'Flat colour over large areas. The setup is per ink colour, so it earns its keep in volume.'},
    woven_label:{name:'Woven label', note:'Discreet identity mark, sewn into a seam.'},
    heat:      {name:'Heat transfer',note:'Fine detail and gradients, lower wash life.'},
    dtf:       {name:'DTF',          note:'Direct-to-film. Full colour, no setup, priced by size.'},
    dtg:       {name:'DTG',          note:'Direct-to-garment. Photographic detail on cotton, priced by size.'},
  },
  positions_lib:{
    front:'Front', back:'Back',
    left_chest:'Left chest', nape:'Nape of neck', cuff:'Cuff', pocket:'Pocket',
    hem:'Hem', sleeve:'Sleeve',
    /* the joggers carry these; without them the page printed the raw keys */
    left_leg:'Left leg', right_leg:'Right leg',
  },


  /* ---- Nothing is built yet ------------------------------------------- */
  /* One project, published, so the customer account can be looked at with work
     in it rather than only empty. Built to the same shape createProject makes,
     because a seeded example that drifts from the real thing teaches the wrong
     lesson about how the platform behaves. */
  projects:[
    {id:'prj_vela', ref:'PRJ-2461', account:'acc_vela', name:'Front of house — Barceloneta',
     am:'u_nuria', owner:'u_nuria',
     stages:['enquiry','qualification','first_call','design','project_build','development','production','delivery'],
     stage:'development', opStatus:'in_progress', risk:null,
     stageLog:[{stage:'enquiry',       at:'2026-08-10 11:20', by:'u_nuria'},
               {stage:'qualification', at:'2026-08-12 09:35', by:'u_nuria'},
               {stage:'first_call',    at:'2026-08-15 16:00', by:'u_nuria'},
               {stage:'design',        at:'2026-08-29 15:10', by:'u_nuria'},
               {stage:'project_build', at:'2026-09-12 10:24', by:'u_nuria'}],
     published:true, version:2, publishedAt:'2026-09-12 10:20', draftDirty:false,
     created:'2026-08-18', target:'2026-11-28',
     brief:'Front of house for the Barceloneta property — reception, concierge and restaurant floor. ' +
           'Linen-forward, warm neutrals, must survive a commercial laundry twice a week.',
     gates:{design_fee:'paid', development_invoice:'payment_due', production_proforma:'not_required'},
     positions:[
       {id:'pos_rec', name:'Reception', people:6, garments:['g_vela_shirt']},
       {id:'pos_res', name:'Restaurant floor', people:11, garments:['g_vela_apron']},
     ],
     milestones:[
       {id:'ms_v1', label:'Design fee', what:'Concept, drawings and the first specification.',
        amount:1800, due:'2026-08-29', stage:'design', kind:'Invoice', state:'paid', docId:'doc_v1',
        at:'2026-08-20 09:00'},
       {id:'ms_v2', label:'Development invoice', what:'Patterns, first samples and fittings.',
        amount:3400, due:'2026-10-03', stage:'development', kind:'Invoice', state:'payment_due', docId:'doc_v2',
        at:'2026-09-12 10:22'},
     ],
     lines:[
       {id:'ln_v1', label:'Reception shirt — 6 people, 3 each', note:'Linen-cotton, woven label at the nape', amount:2160},
       {id:'ln_v2', label:'Restaurant apron — 11 people, 2 each', note:'Tailored, embroidered chest', amount:1694},
     ],
     boards:[],
     /* The design the fee bought. A real PDF, inline, so Download in the
        customer's account produces a file that actually opens. */
     designs:[
       {id:'dz_vela', title:'Front of house — design direction', by:'Estudi Brea',
        note:'Two pages: the direction and the palette it comes from, then the garments it implies ' +
             'for each position. The garments themselves are built at the next step, where the ' +
             'fabrics, quantities and sizes are settled one by one.',
        state:'published', at:'2026-08-29 15:05', publishedAt:'2026-08-29 15:08',
        addedBy:'u_nuria', gate:'ms_v1', images:[],
        file:{name:'PAMUUC — PRJ-2461 — design direction.pdf', size:2424, type:'application/pdf',
              src:'data:application/pdf;base64,JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFs0IDAgUiA1IDAgUl0gL0NvdW50IDIgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL0ZvbnQgL1N1YnR5cGUgL1R5cGUxIC9CYXNlRm9udCAvSGVsdmV0aWNhID4+CmVuZG9iago0IDAgb2JqCjw8IC9UeXBlIC9QYWdlIC9QYXJlbnQgMiAwIFIgL01lZGlhQm94IFswIDAgNTk1IDg0Ml0gL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgMyAwIFIgPj4gPj4gL0NvbnRlbnRzIDYgMCBSID4+CmVuZG9iago1IDAgb2JqCjw8IC9UeXBlIC9QYWdlIC9QYXJlbnQgMiAwIFIgL01lZGlhQm94IFswIDAgNTk1IDg0Ml0gL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgMyAwIFIgPj4gPj4gL0NvbnRlbnRzIDcgMCBSID4+CmVuZG9iago2IDAgb2JqCjw8IC9MZW5ndGggODczID4+CnN0cmVhbQpCVAovRjEgMjAgVGYgMSAwIDAgMSA2MCA3NjAgVG0gKFBBTVVVQyB8IFNUVURJTykgVGoKL0YxIDExIFRmIDEgMCAwIDEgNjAgNzI2IFRtIChGcm9udCBvZiBob3VzZSAtIEJhcmNlbG9uZXRhICAgUFJKLTI0NjEpIFRqCi9GMSAyNiBUZiAxIDAgMCAxIDYwIDY5NiBUbSAoRGVzaWduIGRpcmVjdGlvbikgVGoKL0YxIDEyIFRmIDEgMCAwIDEgNjAgNjU2IFRtIChWZWxhIEhvdGVscyAtIEJhcmNlbG9uZXRhIHByb3BlcnR5KSBUagovRjEgMTIgVGYgMSAwIDAgMSA2MCA2MzQgVG0gKFJlY2VwdGlvbiwgY29uY2llcmdlIGFuZCByZXN0YXVyYW50IGZsb29yKSBUagovRjEgMTIgVGYgMSAwIDAgMSA2MCA2MTIgVG0gKElzc3VlZCAyOSBBdWd1c3QgMjAyNiAtIHZlcnNpb24gMSkgVGoKL0YxIDEyIFRmIDEgMCAwIDEgNjAgNTcyIFRtIChMaW5lbi1mb3J3YXJkLCB3YXJtIG5ldXRyYWxzLiBUaGUgcGFsZXR0ZSBpcyBkcmF3biBmcm9tIHRoZSkgVGoKL0YxIDEyIFRmIDEgMCAwIDEgNjAgNTUyIFRtIChsb2JieSBzdG9uZSBhbmQgdGhlIGJhciB0aW1iZXIsIHNvIHRoZSB0ZWFtIHJlYWRzIGFzIHBhcnQgb2YpIFRqCi9GMSAxMiBUZiAxIDAgMCAxIDYwIDUzMiBUbSAodGhlIHJvb20gcmF0aGVyIHRoYW4gYWdhaW5zdCBpdC4pIFRqCi9GMSAxMiBUZiAxIDAgMCAxIDYwIDQ5MiBUbSAoRXZlcnkgZ2FybWVudCBtdXN0IHN1cnZpdmUgYSBjb21tZXJjaWFsIGxhdW5kcnkgdHdpY2UgYSB3ZWVrLCkgVGoKL0YxIDEyIFRmIDEgMCAwIDEgNjAgNDcyIFRtICh3aGljaCBzZXRzIHRoZSBmYWJyaWMgd2VpZ2h0cyBhbmQgdGhlIGZpbmlzaCBvbiBldmVyeSB0cmltLikgVGoKRVQKMC42IHcgMC4wIDAuMDcgMC4zMiBSRyA2MCA3NDIgbSA1MzUgNzQyIGwgUwoKZW5kc3RyZWFtCmVuZG9iago3IDAgb2JqCjw8IC9MZW5ndGggNzgyID4+CnN0cmVhbQpCVAovRjEgMjAgVGYgMSAwIDAgMSA2MCA3NjAgVG0gKFBBTVVVQyB8IFNUVURJTykgVGoKL0YxIDExIFRmIDEgMCAwIDEgNjAgNzI2IFRtIChGcm9udCBvZiBob3VzZSAtIEJhcmNlbG9uZXRhICAgUFJKLTI0NjEpIFRqCi9GMSAxOCBUZiAxIDAgMCAxIDYwIDY5NiBUbSAoUmVjZXB0aW9uKSBUagovRjEgMTIgVGYgMSAwIDAgMSA2MCA2NjIgVG0gKExvbmcgc2xlZXZlIHNoaXJ0LCBzb2Z0ZW5lZCBjb2xsYXIsIHdvdmVuIGxhYmVsIGF0IHRoZSBuYXBlLikgVGoKL0YxIDEyIFRmIDEgMCAwIDEgNjAgNjQyIFRtIChTYW5kLiBURU5DRUwgbHlvY2VsbCB0d2lsbC4gU2l4IHBlb3BsZSwgdGhyZWUgZWFjaC4pIFRqCi9GMSAxOCBUZiAxIDAgMCAxIDYwIDYwMiBUbSAoUmVzdGF1cmFudCBmbG9vcikgVGoKL0YxIDEyIFRmIDEgMCAwIDEgNjAgNTY4IFRtIChUYWlsb3JlZCBhcHJvbiwgZW1icm9pZGVyZWQgbGVmdCBjaGVzdCwgcGF0Y2ggcG9ja2V0LikgVGoKL0YxIDEyIFRmIDEgMCAwIDEgNjAgNTQ4IFRtIChSZWN5Y2xlZCBjYW52YXMuIEVsZXZlbiBwZW9wbGUsIHR3byBlYWNoLikgVGoKL0YxIDEyIFRmIDEgMCAwIDEgNjAgNTA4IFRtIChUaGVzZSBiZWNvbWUgdGhlIGdhcm1lbnRzIGJ1aWx0IGF0IHRoZSBuZXh0IHN0ZXAsIHdoZXJlKSBUagovRjEgMTIgVGYgMSAwIDAgMSA2MCA0ODggVG0gKHF1YW50aXRpZXMsIHNpemVzIGFuZCBmYWJyaWNzIGFyZSBjb25maXJtZWQgd2l0aCB5b3UuKSBUagpFVAowLjYgdyAwLjAgMC4wNyAwLjMyIFJHIDYwIDc0MiBtIDUzNSA3NDIgbCBTCgplbmRzdHJlYW0KZW5kb2JqCnhyZWYKMCA4CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAwMDU4IDAwMDAwIG4gCjAwMDAwMDAxMjEgMDAwMDAgbiAKMDAwMDAwMDE5MSAwMDAwMCBuIAowMDAwMDAwMzE3IDAwMDAwIG4gCjAwMDAwMDA0NDMgMDAwMDAgbiAKMDAwMDAwMTM2NyAwMDAwMCBuIAp0cmFpbGVyCjw8IC9TaXplIDggL1Jvb3QgMSAwIFIgPj4Kc3RhcnR4cmVmCjIyMDAKJSVFT0YK'}},
     ],
     proposal:{note:'Priced for the two Barceloneta floors. Second property is quoted separately once this one is proven.',
               publishedAt:'2026-09-12 10:20', version:2},
     nextMilestone:'ms_v2', lastUpdate:'2026-09-12 10:20'},
  ],
  garments:[
    {id:'g_vela_shirt', project:'prj_vela', position:'pos_rec', base:'b_shirt_ls', baseV:'v4',
     name:'Long sleeve shirt', rev:2, state:'ready_fitting', round:1,
     fabric:'f_tencel', pers:{method:'woven_label', pos:'nape', art:null},
     colourways:[{id:'cw_v1', colour:'sand', qty:18, sizes:{}}],
     reorderable:false, glyph:'▤', notes:'Second round. Collar softened, sleeve shortened 1.5cm.'},
    {id:'g_vela_apron', project:'prj_vela', position:'pos_res', base:'b_apron_t', baseV:'v3',
     name:'Tailored apron', rev:1, state:'in_development', round:0,
     fabric:'f_canvas', pers:{method:'embroidery', pos:'left_chest', art:null},
     colourways:[{id:'cw_v2', colour:'clay', qty:22, sizes:{}}],
     reorderable:false, glyph:'▥', notes:''},
  ],
  artwork:[],
  changeRequests:[],
  /* The decision the newest notification is asking about. A notification that
     points at a record that is not there is the kind of thing a mockup gets
     away with and a product does not. */
  approvals:[
    {id:'ap_vela', project:'prj_vela', account:'acc_vela',
     kind:'Restaurant apron — fabric and pocket', target:'g_vela_apron',
     state:'awaiting_customer', due:'2026-09-19', rev:'Version 2',
     summary:'Two ways to go on the apron. The heavier canvas holds its shape through the laundry ' +
             'but reads more workwear; the lighter one drapes better and will soften faster. ' +
             'The patch pocket is drawn on both — say if you would rather it were welted.',
     askedAt:'2026-09-14 11:05', askedBy:'u_nuria'},
  ],
  meetings:[],
  /* Built to the exact shape publishMilestone makes, and linked both ways —
     m.docId here, d.milestone there — because payDocument settles the pair. */
  documents:[
    {id:'doc_v1', account:'acc_vela', project:'prj_vela', milestone:'ms_v1',
     type:'Invoice', num:'INV-2026-0320', title:'Design fee', issued:'2026-08-20',
     due:'2026-08-29', amount:1800, state:'paid', v:1, visible:true,
     paidAt:'2026-08-29 14:05'},
    {id:'doc_v0', account:'acc_vela', project:'prj_vela', milestone:null,
     type:'Contract', num:'AGR-2026-0118', title:'Framework agreement',
     issued:'2026-08-18', due:'2026-08-25', amount:null, state:'signed', v:1, visible:true,
     signedAt:'2026-08-21 12:40',
     /* A contract is words, so it carries its words. The same blocks render on
        screen and in the PDF, which is the whole point of holding them here. */
     body:[
       {h:'1. What this covers',
        t:'This agreement governs every uniform project Pamuk Studio S.L (trading as PAMUUC) ' +
          'carries out for Vela Hotels, including design, development, production and delivery. ' +
          'Each project is specified and priced separately and confirmed in its own documents.'},
       {h:'2. How a project runs',
        t:'A project moves through eight steps: enquiry, qualification, first call, design where ' +
          'it is taken, project build, development, production and delivery. A step does not open ' +
          'until the step before it is complete and anything owed on it is settled.'},
       {h:'3. Payment',
        t:'Design and development are payable in full before that step begins. Production is ' +
          'invoiced on the account terms agreed below. A payment is recorded when it reaches the ' +
          'studio account, not when it is sent.'},
       {h:'4. Approvals and revisions',
        t:'Each garment is approved on its own revision. Three prototype rounds are included; a ' +
          'fourth is agreed and priced separately before it is made.'},
       {h:'5. Ownership',
        t:'Designs, patterns and technical files made for Vela Hotels remain the property of ' +
          'Pamuk Studio S.L until the development step is settled in full, at which point a ' +
          'perpetual licence to manufacture the approved garments passes to Vela Hotels.'},
       {h:'6. Account terms',
        t:'Production invoices are payable 30 days from the invoice date. Late payment pauses ' +
          'work in progress rather than cancelling it, and the schedule moves accordingly.'},
     ]},
    {id:'doc_v3', account:'acc_vela', project:'prj_vela', milestone:null,
     type:'Pro forma', num:'PF-2026-0042', title:'Production — indicative',
     issued:'2026-09-14', due:'2026-10-31', amount:3854, state:'sent', v:1, visible:true,
     /* Indicative, so it itemises what the number is made of. */
     items:[
       {label:'Reception shirt — 18 pieces', note:'Sand, TENCEL lyocell twill, woven label at the nape', amount:2160},
       {label:'Restaurant apron — 22 pieces', note:'Recycled canvas, embroidered left chest', amount:1694},
     ],
     body:[
       {h:'This is not an invoice',
        t:'A pro forma states what production will cost on the quantities as they stand today. ' +
          'The invoice is issued once the specification is locked at the end of development, and ' +
          'the final quantities may move it.'},
     ]},
    {id:'doc_v2', account:'acc_vela', project:'prj_vela', milestone:'ms_v2',
     type:'Invoice', num:'INV-2026-0321', title:'Development invoice', issued:'2026-09-12',
     due:'2026-10-03', amount:3400, state:'payment_due', v:1, visible:true},
  ],
  conversations:[],
  reorders:[],
  shipments:[],

  /* ---- Fabrics added by hand in the Back Office ------------------------ */
  customFabrics:[],

  /* ---- Inquiries: the public form writes here -------------------------- */
  inquiries:[
    {id:'inq_201', ref:'INQ-0201', company:'Hotel Miravent', contact:'Clara Ventós',
     email:'clara.ventos@miravent.example', type:'Custom uniforms', country:'Spain',
     sector:'Hotel or resort', people:'61 to 150', submitted:'2026-09-09 09:12',
     state:'submitted', reviewer:null,
     scope:'Nothing — this is a new opening',
     establishment:'Hotel or resort', role:'Operations', authority:'I decide this',
     vat:'ESB12345678', vatStatus:'pending',
     designs:'A few departments need something different',
     answers:{
       'Establishment':'Hotel or resort',
       'Property size':'80 to 150',
       'Departments':'Reception and welcome, Restaurant and bar, Housekeeping, Spa and wellness, Concierge and guest services',
       'Direction':'Mediterranean, Minimalist',
       'People to dress':'61 to 150',
       'Designs':'A few departments need something different',
       'Timing':'Tied to an opening or refurbishment date',
       'Budget range':'€50,000 to €100,000',
       'What is not working':'Nothing — this is a new opening',
       'Company':'Hotel Miravent',
       'Contact name':'Clara Ventós',
       'Email':'clara.ventos@miravent.example',
       'Country':'Spain',
       'Role':'Operations',
       'Authority':'I decide this',
       'VAT checked':'ESB12345678',
       'VAT status':'pending',
       'Anything else':'A 118-room seafront property opening in March. We are starting from nothing — there is a logo and a colour, and no wardrobe of any kind. We would want you to design it, not adapt something.',
     },
     files:['miravent-brand-mark.pdf','property-interiors.pdf'],
     qualification:{
       score:6, verdict:'ok', head:105, designs:2.5, per:42,
       flags:[
         {level:'ok',   w: 2, text:'Headcount carries a multi-garment range comfortably.'},
         {level:'ok',   w: 2, text:'About 42 people per design, comfortably above per-style minimums.'},
         {level:'warn', w:-1, text:'Date is tied to an opening. Confirm the real deadline, not the target.'},
         {level:'ok',   w: 1, text:'New opening. No legacy garments to replace or match.'},
         {level:'ok',   w: 1, text:'Speaking to the decision maker.'},
         {level:'ok',   w: 1, text:'VAT ESB12345678 captured, format valid. Verify against VIES before invoicing.'},
       ]}},

    {id:'inq_202', ref:'INQ-0202', company:'Clínica Vallcarca', contact:'Pau Sentís',
     email:'p.sentis@cvallcarca.example', type:'Custom uniforms', country:'Spain',
     sector:'Private clinic', people:'More than 150', submitted:'2026-09-08 16:40',
     state:'submitted', reviewer:null,
     scope:'It does not survive our laundry, Departments look disconnected, Reordering is difficult or inconsistent',
     establishment:'Private clinic', role:'Procurement', authority:'A committee or procurement process decides',
     vat:'ESB87654321', vatStatus:'pending',
     designs:'Almost — the same design in different colours',
     answers:{
       'Establishment':'Private clinic',
       'Practice type':'Multi-speciality clinic',
       'Roles':'Clinical staff, Reception and welcome, Housekeeping, Kitchen',
       'Direction':'Minimalist, Scandinavian',
       'People to dress':'More than 150',
       'Designs':'Almost — the same design in different colours',
       'Timing':'In 3 to 6 months',
       'Budget range':'More than €100,000',
       'What is not working':'It does not survive our laundry, Departments look disconnected, Reordering is difficult or inconsistent',
       'Company':'Clínica Vallcarca',
       'Contact name':'Pau Sentís',
       'Email':'p.sentis@cvallcarca.example',
       'Country':'Spain',
       'Role':'Procurement',
       'Authority':'A committee or procurement process decides',
       'VAT checked':'ESB87654321',
       'VAT status':'pending',
       'Anything else':'We have a brand book from 2024 and we are happy with it — we do not need a design phase, we need garments that survive an industrial wash and a way to reorder them without three emails. Four buildings, one identity.',
     },
     files:['vallcarca-brand-book-2024.pdf'],
     qualification:{
       score:4, verdict:'ok', head:220, designs:1, per:220,
       flags:[
         {level:'ok',   w: 2, text:'Headcount carries a multi-garment range comfortably.'},
         {level:'ok',   w: 2, text:'About 220 people per design, comfortably above per-style minimums.'},
         {level:'warn', w:-1, text:'Committee or procurement decision. Expect a longer cycle and a formal process.'},
         {level:'ok',   w: 1, text:'VAT ESB87654321 captured, format valid. Verify against VIES before invoicing.'},
       ]}},
  ],

  /* ---- Merchandise ----------------------------------------------------- */
  merchProducts:[
    {id:'m_tote',   ref:'MP-01', name:'Heavy canvas tote', cat:'Bags', glyph:'👜',
     colours:['ecru','ink','forest'], moq:25, from:14.50, lead:'3–4 weeks',
     pers:['screen','embroidery'], pos:['left_chest','hem'], prov:'Recycled cotton canvas, Portugal',
     desc:'A 400 g/m² canvas tote that survives a laundry cycle and a winter. Reinforced base and webbing handles.'},
    {id:'m_cap',    ref:'MP-02', name:'Six-panel cap', cat:'Headwear', glyph:'🧢',
     colours:['ecru','navy','ink','stone'], moq:25, from:11.00, lead:'3–4 weeks',
     pers:['embroidery'], pos:['left_chest','nape'], prov:'Organic cotton twill',
     desc:'Structured six-panel with a brass slider. Embroidery only — the crown holds a stitch better than a print.'},
    {id:'m_tshirt', ref:'MP-03', name:'Heavyweight T-shirt', cat:'Apparel', glyph:'👕',
     colours:['white','ecru','ink','forest','stone'], moq:25, from:12.80, lead:'2–3 weeks',
     pers:['screen','embroidery','heat'], pos:['left_chest','nape','sleeve'], prov:'GOTS organic cotton, 220 g/m²',
     desc:'220 g/m² single jersey with a set-in collar that does not curl after washing.'},
    {id:'m_hoodie', ref:'MP-04', name:'Brushed-back hoodie', cat:'Apparel', glyph:'🧥',
     colours:['ecru','ink','navy','olive'], moq:25, from:34.00, lead:'3–5 weeks',
     pers:['embroidery','screen'], pos:['left_chest','nape'], prov:'80% organic cotton',
     desc:'400 g/m² loopback with a double-layer hood. The weight most people mean when they say "good hoodie".'},
    {id:'m_bottle', ref:'MP-05', name:'Insulated bottle', cat:'Drinkware', glyph:'🍶',
     colours:['white','ink','stone'], moq:50, from:18.00, lead:'4–5 weeks',
     pers:['screen'], pos:['left_chest'], prov:'Stainless steel, 18/8',
     desc:'500 ml double-walled steel. Laser mark available on request.'},
    {id:'m_notebook',ref:'MP-06',name:'Bound notebook', cat:'Stationery', glyph:'📓',
     colours:['ecru','ink','clay'], moq:50, from:9.40, lead:'3–4 weeks',
     pers:['screen'], pos:['left_chest'], prov:'FSC paper, Spain',
     desc:'A5, sewn binding, 120 g/m² uncoated paper that takes ink without ghosting.'},
    {id:'m_apron',  ref:'MP-07', name:'Merchandise apron', cat:'Service', glyph:'🩱',
     colours:['ecru','clay','ink','terracotta'], moq:25, from:22.00, lead:'3–4 weeks',
     pers:['embroidery','screen'], pos:['left_chest','pocket'], prov:'Recycled canvas',
     desc:'The cross-back apron from the custom line, offered in stock colours at merchandise quantities.'},
    {id:'m_socks',  ref:'MP-08', name:'Ribbed socks', cat:'Apparel', glyph:'🧦',
     colours:['ecru','navy','ink'], moq:100, from:6.20, lead:'5–6 weeks',
     pers:['embroidery'], pos:['cuff'], prov:'Combed cotton, Portugal',
     desc:'Knitted-in identity at the cuff rather than a print. Minimum 100 pairs.'},
  ],


  /* Offers are authored, not coded. The bar under the header, the block on the
     merchandise home and the pop-up all read this one record, so changing the
     percentages or retiring the offer is a data edit in one place rather than
     three pieces of copy to hunt down. §17.1 */
  offers:[
    {id:'of_first', active:true, scope:'merch', code:'FIRST',
     label:'First order',
     headline:'Your first order comes with a discount.',
     line:'Tiered by quantity — the more the run, the better the rate. There is no code: we apply it to the quote, before you approve it.',
     short:'First order: 5–10% off, by quantity.',
     tiers:[
       {min:1,   max:99,   pct:5,  say:'Under 100 pieces'},
       {min:100, max:499,  pct:7,  say:'100 to 499 pieces'},
       {min:500, max:null, pct:10, say:'500 pieces and over'},
     ],
     ends:'2026-12-31',
     /* where it is allowed to appear */
     bar:true, home:true, popup:true,
     popupTitle:'Before you price it up',
     popupLine:'Tell us where to send it and we will confirm the tier your quantity falls into, with the code on your first quote.'},
  ],
  /* Everyone who has given us an address for an offer. The prototype cannot
     post email, so it keeps the record the same way the outbox does. */
  subscribers:[],
  /* What the reader has closed. Kept on the state so it survives a reload —
     a banner that returns on every page view is an advert, not an offer. */
  offerSeen:{},

  merchQuotes:[],

  /* The example account's actual history. The account home and the project
     page both read this feed, and the notifications below are the customer's
     side of the same moments — one timeline told twice, never two. */
  events:[
    {id:'ev_v8', type:'decision.requested', at:'2026-09-14 11:05', actor:'u_nuria',
     account:'acc_vela', project:'prj_vela', customerVisible:true,
     text:'Sent for decision: Restaurant apron — fabric and pocket'},
    {id:'ev_v7', type:'milestone.published', at:'2026-09-12 10:22', actor:'u_nuria',
     account:'acc_vela', project:'prj_vela', customerVisible:true,
     text:'Development invoice issued — patterns, first samples and fittings'},
    {id:'ev_v6', type:'project.published', at:'2026-09-12 10:20', actor:'u_nuria',
     account:'acc_vela', project:'prj_vela', customerVisible:true,
     text:'Version 2 published to Vela Hotels'},
    {id:'ev_v5', type:'garment.updated', at:'2026-09-04 16:10', actor:'u_nuria',
     account:'acc_vela', project:'prj_vela', customerVisible:true,
     text:'Long sleeve shirt — collar softened, sleeve shortened 1.5cm'},
    {id:'ev_v4', type:'milestone.paid', at:'2026-08-29 14:05', actor:'u_sergi',
     account:'acc_vela', project:'prj_vela', customerVisible:true,
     text:'Design fee settled'},
    {id:'ev_v3', type:'milestone.published', at:'2026-08-20 09:00', actor:'u_nuria',
     account:'acc_vela', project:'prj_vela', customerVisible:true,
     text:'Design fee issued — concept, drawings and the first specification'},
    {id:'ev_v2', type:'project.created', at:'2026-08-18 09:42', actor:'u_nuria',
     account:'acc_vela', project:'prj_vela', customerVisible:true,
     text:'PRJ-2461 Front of house — Barceloneta created'},
    {id:'ev_v1', type:'account.ready', at:'2026-08-18 09:40', actor:'u_nuria',
     account:'acc_vela', project:null, customerVisible:true,
     text:'Account opened for Vela Hotels'},
  ],
  /* What Marta sees. Written to her, not about her: the studio's own queue
     words never cross to this side of the screen. */
  notifications:[
    {id:'nt_v6', at:'2026-09-14 11:05', to:'customer', kind:'action',
     text:'Restaurant apron — we need your decision on the fabric and the pocket',
     account:'acc_vela', project:'prj_vela', read:false, action:true, link:null,
     cta:{label:'Review and decide', act:'openApproval', id:'ap_vela'}, choices:null, answered:null,
     ref:{kind:'approval', id:'ap_vela'}},
    {id:'nt_v5', at:'2026-09-12 10:22', to:'customer', kind:'action',
     text:'Development invoice — €4,114.00 is ready for your approval',
     account:'acc_vela', project:'prj_vela', read:false, action:true, link:null,
     cta:null, choices:null, answered:null, ref:{kind:'document', id:'doc_v2'}},
    {id:'nt_v4', at:'2026-09-12 10:20', to:'customer', kind:'update',
     text:'Version 2 of Front of house — Barceloneta is published',
     account:'acc_vela', project:'prj_vela', read:true, action:false, link:null,
     cta:null, choices:null, answered:null},
    {id:'nt_v3', at:'2026-09-04 16:10', to:'customer', kind:'update',
     text:'The reception shirt is back from the second round — collar softened, sleeve shortened 1.5cm',
     account:'acc_vela', project:'prj_vela', read:true, action:false, link:null,
     cta:null, choices:null, answered:null},
    {id:'nt_v2', at:'2026-08-29 14:05', to:'customer', kind:'update',
     text:'Design fee received — thank you',
     account:'acc_vela', project:'prj_vela', read:true, action:false, link:null,
     cta:null, choices:null, answered:null},
    {id:'nt_v1', at:'2026-08-18 09:40', to:'customer', kind:'update',
     text:'Your account is ready',
     account:'acc_vela', project:null, read:true, action:false, link:null,
     cta:null, choices:null, answered:null},
  ],
  /* Every message actually sent to a customer, rendered as they receive it.
     The prototype cannot post email, so it keeps the outbox instead: the copy,
     the buttons and the moment are all reviewable rather than imagined. */
  outbox:[],
  /* Messages written by the platform but not yet sent. Anything that leaves
     the studio in its name can be read first, edited, and released — or held.
     Reviewing is the default for whatever carries a price or a commitment. */
  drafts:[],
  /* Routine changes do not each earn an email. They collect here per account
     and go out as one summary, so a decision that needs answering is never
     buried among things that only needed saying. */
  digest:[],
  audit:[],
};
