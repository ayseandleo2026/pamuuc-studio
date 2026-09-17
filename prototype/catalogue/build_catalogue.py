"""Build the PAMUUC merchandise catalogue CSV from the Stanley/Stella workbook.

Pricing rule
------------
  floor  = (worst-case garment cost + worst-case decoration) / (1 - 0.35)
  bench  = median competitor price for that product and quantity (blank garment)
  price  = max(floor, bench rounded down to 0.05)

The floor always wins where the two disagree, because the 35% margin in the
worst case is the hard constraint. Every product records where it landed
relative to the market so the exposure is visible, not hidden.
"""
import sys, math, re, json
from collections import defaultdict
from read import sheet
from hexmap import hexof

SCENARIO = sys.argv[1] if len(sys.argv)>1 else 'two'
OUT      = sys.argv[2] if len(sys.argv)>2 else 'merch-catalogue.csv'

P=sheet('xl/worksheets/sheet1.xml'); C=sheet('xl/worksheets/sheet2.xml')
K=sheet('xl/worksheets/sheet3.xml'); CL=sheet('xl/worksheets/sheet4.xml'); SZ=sheet('xl/worksheets/sheet5.xml')
h=lambda r:{x:i for i,x in enumerate(r[0])}
hp,hc,hk,hcl,hsz=h(P),h(C),h(K),h(CL),h(SZ)

QTY=[25,50,100,250,500]; MARGIN=0.35
EMB={'small':0.60,'medium':0.85,'large':1.20}; EMB_SETUP=35.0
DTF={'large':1.20}; DTG={'large':1.80}
SCREEN={1:4.50,10:4.30,25:4.10,50:3.70,100:2.64,250:1.68,500:1.20}; SCR_SETUP=40.0
MULT={1:1.0,2:1.200,3:1.320,4:1.386}
def scr(q,c=4): return SCREEN[max(b for b in SCREEN if b<=q)]*MULT[c]
def places(q):
    return {'embroidery':EMB['large']+EMB_SETUP/q,'screen':scr(q,4)+SCR_SETUP/q,
            'dtf':DTF['large'],'dtg':DTG['large']}
def deco(q):
    p=places(q)
    if SCENARIO=='two':
        v=sorted(p.values(),reverse=True); return v[0]+v[1]
    if SCENARIO=='one': return max(p.values())
    if SCENARIO=='one_modest':
        return max(EMB['medium']+EMB_SETUP/q, SCREEN[max(b for b in SCREEN if b<=q)]+SCR_SETUP/q)
    return 0.0

cost=defaultdict(list)
for r in K[1:]: cost[r[hk['Product reference']]].append(r[hk['Unit cost (EUR)']])
CHI={k:max(v) for k,v in cost.items()}

comp=defaultdict(lambda: defaultdict(dict))
for r in C[1:]:
    ref,q,p,who=r[hc['Product reference']],r[hc['Quantity']],r[hc['Unit price (EUR ex VAT)']],r[hc['Competitor']]
    if p is not None: comp[ref][int(q)][who]=p
def bench(ref,q):
    d=comp.get(ref,{}).get(q)
    if not d: return None
    v=sorted(d.values()); n=len(v)
    return v[n//2] if n%2 else (v[n//2-1]+v[n//2])/2
def down05(x): return math.floor(x*20)/20

colour_of=defaultdict(list); img_of=defaultdict(dict)
for r in CL[1:]:
    ref=r[hcl['Product reference']]; code=r[hcl['Colour code']]
    key='c'+code[1:]
    if key not in colour_of[ref]: colour_of[ref].append(key)
    u=r[hcl['Primary product image URL']]
    if u: img_of[ref][key]=u
CNAME={}
for r in CL[1:]: CNAME['c'+r[hcl['Colour code']][1:]]=r[hcl['Colour name']]

size_of=defaultdict(list)
for r in SZ[1:]:
    s=r[hsz['Size']]; s='One size' if s=='OS' else s
    if s not in size_of[r[hsz['Product reference']]]: size_of[r[hsz['Product reference']]].append(s)

# decoration offered, by category (defaults — confirm per product)
DECO_BY_CAT={
 'T-shirts':      (['embroidery','screen','dtf','dtg'], ['front','back','left_chest','sleeve']),
 'Sweatshirts':   (['embroidery','screen','dtf','dtg'], ['front','back','left_chest','sleeve']),
 'Polos':         (['embroidery','screen'],             ['left_chest','back','sleeve']),
 'Shirts':        (['embroidery','screen'],             ['left_chest','back']),
 'Outerwear':     (['embroidery','screen'],             ['front','back','left_chest']),
 'Pants & shorts':(['embroidery'],                      ['left_chest','pocket']),
 'Accessories':   (['embroidery','screen'],             ['front']),
}
MAXDIM={'front':(300,400),'back':(320,420),'left_chest':(100,100),'sleeve':(80,300),'pocket':(90,90)}
EMB_MAX={'front':(160,160),'back':(200,200),'left_chest':(90,90),'sleeve':(70,70),'pocket':(80,80)}

H=['row_type','ref','handle','name','category','status','moq','currency','price_25','price_50',
'price_100','price_250','price_500','cost_price','lead_weeks_min','lead_weeks_max','colours','sizes',
'personalisation_methods','personalisation_positions','artwork_required','description','materials',
'weight_gsm','care','provenance','country_of_origin','supplier','supplier_ref','colour','sku',
'price_adjustment','stock_on_hand','reorder_point','image_url','image_alt','image_position','method',
'position','max_width_mm','max_height_mm','max_colours','artwork_format','notes','setup_cost',
'priced_by','band_small_max_mm','band_medium_max_mm','mult_2_colours','mult_3_colours','mult_4_colours',
'size_band','qty_min','unit_cost','provisional']
def cell(x):
    x='' if x is None else str(x)
    return '"'+x.replace('"','""')+'"' if re.search(r'[",\n]',x) else x
def row(d): return ','.join(cell(d.get(k,'')) for k in H)

out=[','.join(H)]
# rate card first
out.append(row({'row_type':'deco_method','method':'embroidery','setup_cost':'35.00','priced_by':'size',
  'band_small_max_mm':99,'band_medium_max_mm':150,'notes':'Setup per job. Confirm whether charged per position.'}))
out.append(row({'row_type':'deco_method','method':'screen','setup_cost':'40.00','priced_by':'quantity',
  'mult_2_colours':'1.200','mult_3_colours':'1.320','mult_4_colours':'1.386',
  'notes':'Multipliers absolute against 1 colour. Confirm whether setup is per screen.'}))
out.append(row({'row_type':'deco_method','method':'dtf','priced_by':'size','band_small_max_mm':99,
  'band_medium_max_mm':150,'notes':'No setup cost recorded.'}))
out.append(row({'row_type':'deco_method','method':'dtg','priced_by':'size','band_small_max_mm':99,
  'band_medium_max_mm':150,'notes':'No setup recorded. DTF + 50%, provisional.'}))
for b,c in [('small','0.60'),('medium','0.85'),('large','1.20')]:
    out.append(row({'row_type':'deco_rate','method':'embroidery','size_band':b,'unit_cost':c}))
for b,c in [('small','0.60'),('medium','0.90'),('large','1.20')]:
    out.append(row({'row_type':'deco_rate','method':'dtf','size_band':b,'unit_cost':c}))
for b,c in [('small','0.90'),('medium','1.35'),('large','1.80')]:
    out.append(row({'row_type':'deco_rate','method':'dtg','size_band':b,'unit_cost':c,'provisional':'yes','notes':'DTF + 50%'}))
for qm,c,n,prov in [(1,'4.50','1-9',''),(10,'4.30','10-24',''),(25,'4.10','25-49',''),(50,'3.70','50-99',''),
                    (100,'2.64','100-249, interpolated','yes'),(250,'1.68','250-499, interpolated','yes'),(500,'1.20','500+','')]:
    out.append(row({'row_type':'deco_rate','method':'screen','qty_min':qm,'unit_cost':c,
                    'notes':'1 colour. '+n+' pieces.','provisional':prov}))

seen_handles={}
stats={'priced':0,'quote':0,'at_market':0,'above_market':0,'no_bench':0}
audit=[]
for i,r in enumerate(P[1:],1):
    ref=r[hp['Product reference']]; name=r[hp['Product name']]; cat=r[hp['Product category']]
    mp='MP-%04d'%i
    base=re.sub(r'[^a-z0-9]+','-',name.lower().replace('&','and')).strip('-')
    handle=base
    if handle in seen_handles: handle=f"{base}-{ref.lower()}"
    seen_handles[handle]=ref
    cols=colour_of.get(ref,[]) or ['c001']
    sizes=size_of.get(ref,[]) or ['One size']
    methods,positions=DECO_BY_CAT.get(cat,(['embroidery'],['left_chest']))
    prices={}; note=''
    if ref in CHI:
        stats['priced']+=1
        marks=[]
        for q in QTY:
            floor=(CHI[ref]+deco(q))/(1-MARGIN)
            b=bench(ref,q)
            if b is None: marks.append('nb'); prices['price_%d'%q]='%.2f'%(math.ceil(floor*100)/100); continue
            bm=down05(b)
            # the floor must round UP: rounding to the nearest cent can shave
            # a fraction off and drop the margin a hair under 35%
            if bm>=floor: prices['price_%d'%q]='%.2f'%bm; marks.append('at')
            else: prices['price_%d'%q]='%.2f'%(math.ceil(floor*100)/100); marks.append('ab')
        if 'ab' in marks: stats['above_market']+=1
        elif 'at' in marks: stats['at_market']+=1
        else: stats['no_bench']+=1
        b100=bench(ref,100)
        note=(f"cost {CHI[ref]:.2f}; worst-case decoration {deco(100):.2f} at 100; "
              f"market blank {b100:.2f}; ours {float(prices['price_100'])/b100:.2f}x market" if b100
              else f"cost {CHI[ref]:.2f}; no competitor data")
        audit.append((mp,name,cat,CHI[ref],b100,float(prices['price_100'])))
    else:
        stats['quote']+=1
        note='No supplier cost on file — quote on inquiry.'
    d={'row_type':'product','ref':mp,'handle':handle,'name':name,'category':cat,'status':'published',
       'moq':25,'currency':'EUR','cost_price':('%.2f'%CHI[ref]) if ref in CHI else '',
       'lead_weeks_min':3,'lead_weeks_max':5,'colours':'|'.join(cols),'sizes':'|'.join(sizes),
       'personalisation_methods':'|'.join(methods),'personalisation_positions':'|'.join(positions),
       'artwork_required':'yes',
       'description':(r[hp['Composition']] or name)[:400],
       'materials':r[hp['Composition']] or '','weight_gsm':int(r[hp['Weight (GSM)']]) if r[hp['Weight (GSM)']] else '',
       'care':'','provenance':'Stanley/Stella certified supply chain','country_of_origin':'',
       'supplier':'Stanley/Stella','supplier_ref':ref,'notes':note}
    d.update(prices)
    out.append(row(d))
    for ci,ck in enumerate(cols):
        out.append(row({'row_type':'variant','ref':mp,'status':'published','colour':ck,
          'sku':f"{mp.replace('-','')}-{ck.upper()}",'price_adjustment':'0.00',
          'stock_on_hand':'','reorder_point':''}))
    pos=1
    for ck in cols:
        u=img_of.get(ref,{}).get(ck)
        if not u: continue
        out.append(row({'row_type':'image','ref':mp,'colour':ck if pos>1 else '','image_url':u,
          'image_alt':f"{name} in {CNAME.get(ck,ck)}",'image_position':pos}))
        pos+=1
    for m in methods:
        for po in positions:
            w,ht=(EMB_MAX if m=='embroidery' else MAXDIM).get(po,(100,100))
            out.append(row({'row_type':'decoration','ref':mp,'method':m,'position':po,
              'max_width_mm':w,'max_height_mm':ht,'max_colours':6 if m=='embroidery' else 4,
              'artwork_format':'Vector or DST' if m=='embroidery' else 'Vector',
              'notes':'Default maximum for the category — confirm per product.'}))

open(OUT,'w').write('\n'.join(out)+'\n')
print(f"scenario={SCENARIO}  rows={len(out)-1}  ->  {OUT}")
print(f"  priced {stats['priced']}   quote-only {stats['quote']}")
print(f"  at/below market {stats['at_market']}   above market {stats['above_market']}   no benchmark {stats['no_bench']}")
json.dump(audit,open('audit.json','w'))
