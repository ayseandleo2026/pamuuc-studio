"""Emit the PAMUUC merchandise catalogue CSV from the Stanley/Stella workbook,
priced by pricelist3 (floor basis x 1.55)."""
import re, csv, sys
from collections import defaultdict
exec(open('pricelist3.py').read())
from read import sheet
CL=sheet('xl/worksheets/sheet4.xml'); SZ=sheet('xl/worksheets/sheet5.xml')
hcl={x:i for i,x in enumerate(CL[0])}; hsz={x:i for i,x in enumerate(SZ[0])}

colour_of=defaultdict(list); img_of=defaultdict(dict); CNAME={}
for r in CL[1:]:
    ref=r[hcl['Product reference']]; k='c'+r[hcl['Colour code']][1:]
    CNAME[k]=r[hcl['Colour name']]
    if k not in colour_of[ref]: colour_of[ref].append(k)
    if r[hcl['Primary product image URL']]: img_of[ref][k]=r[hcl['Primary product image URL']]
size_of=defaultdict(list)
for r in SZ[1:]:
    s=r[hsz['Size']]; s='One size' if s=='OS' else s
    if s not in size_of[r[hsz['Product reference']]]: size_of[r[hsz['Product reference']]].append(s)

DECO_BY_CAT={
 'T-shirts':(['embroidery','screen','dtf','dtg'],['front','back','left_chest','sleeve']),
 'Sweatshirts':(['embroidery','screen','dtf','dtg'],['front','back','left_chest','sleeve']),
 'Polos':(['embroidery','screen'],['left_chest','back','sleeve']),
 'Shirts':(['embroidery','screen'],['left_chest','back']),
 'Outerwear':(['embroidery','screen'],['front','back','left_chest']),
 'Pants & shorts':(['embroidery'],['left_chest','pocket']),
 'Accessories':(['embroidery','screen'],['front'])}
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
out.append(row({'row_type':'deco_method','method':'embroidery','setup_cost':'35.00','priced_by':'size','band_small_max_mm':99,'band_medium_max_mm':150,'notes':'Setup per job.'}))
out.append(row({'row_type':'deco_method','method':'screen','setup_cost':'40.00','priced_by':'quantity','mult_2_colours':'1.200','mult_3_colours':'1.320','mult_4_colours':'1.386','notes':'Multipliers absolute against 1 colour.'}))
out.append(row({'row_type':'deco_method','method':'dtf','priced_by':'size','band_small_max_mm':99,'band_medium_max_mm':150,'notes':'No setup cost recorded.'}))
out.append(row({'row_type':'deco_method','method':'dtg','priced_by':'size','band_small_max_mm':99,'band_medium_max_mm':150,'notes':'DTF + 50%, provisional.'}))
for b,c in [('small','0.60'),('medium','0.85'),('large','1.20')]: out.append(row({'row_type':'deco_rate','method':'embroidery','size_band':b,'unit_cost':c}))
for b,c in [('small','0.60'),('medium','0.90'),('large','1.20')]: out.append(row({'row_type':'deco_rate','method':'dtf','size_band':b,'unit_cost':c}))
for b,c in [('small','0.90'),('medium','1.35'),('large','1.80')]: out.append(row({'row_type':'deco_rate','method':'dtg','size_band':b,'unit_cost':c,'provisional':'yes','notes':'DTF + 50%'}))
for qm,c,n,pr in [(1,'4.50','1-9',''),(10,'4.30','10-24',''),(25,'4.10','25-49',''),(50,'3.70','50-99',''),(100,'2.64','100-249 interpolated','yes'),(250,'1.68','250-499 interpolated','yes'),(500,'1.20','500+','')]:
    out.append(row({'row_type':'deco_rate','method':'screen','qty_min':qm,'unit_cost':c,'notes':'1 colour. '+n,'provisional':pr}))

built=build(False); seen={}
for o in built:
    ref=o['ss']; mp=o['mp']
    base=re.sub(r'[^a-z0-9]+','-',o['name'].lower().replace('&','and')).strip('-')
    handle=base if base not in seen else f"{base}-{ref.lower()}"
    seen[handle]=1
    cols=colour_of.get(ref,[]) or ['c001']
    sizes=[s for s in size_of.get(ref,[]) if s] or ['One size']
    methods,positions=DECO_BY_CAT.get(o['cat'],(['embroidery'],['left_chest']))
    prices={('price_%d'%q):('%.2f'%o['prices'][q]) for q in TIERS} if o['cost'] is not None else {}
    note=(f"floor basis {o['cost']:.2f} + {FIXED:.2f} fixed + cheapest decoration, x {MULTIPLIER}"
          if o['cost'] is not None else 'No supplier cost on file — quote on inquiry.')
    if o['cost'] is not None and o['bands'] and o['bands'][-1]['sur']>0:
        b=o['bands'][-1]; note+=f"; +{b['sur']:.2f} on {b['size']} {b['colour']}"
    d={'row_type':'product','ref':mp,'handle':handle,'name':o['name'],'category':o['cat'],
       'status':'published','moq':25,'currency':'EUR',
       'cost_price':('%.2f'%o['cost']) if o['cost'] is not None else '',
       'lead_weeks_min':3,'lead_weeks_max':5,'colours':'|'.join(cols),'sizes':'|'.join(sizes),
       'personalisation_methods':'|'.join(methods),'personalisation_positions':'|'.join(positions),
       'artwork_required':'yes','description':(o['gsm'] and f"{int(o['gsm'])} g/m². " or '')+o['name'],
       'materials':'','weight_gsm':int(o['gsm']) if o['gsm'] else '','care':'','provenance':'',
       'country_of_origin':'','supplier':'Stanley/Stella','supplier_ref':ref,'notes':note}
    d.update(prices); out.append(row(d))
    for ck in cols:
        out.append(row({'row_type':'variant','ref':mp,'status':'published','colour':ck,
                        'sku':f"{mp.replace('-','')}-{ck.upper()}",'price_adjustment':'0.00'}))
    pos=1
    for ck in cols:
        u=img_of.get(ref,{}).get(ck)
        if not u: continue
        out.append(row({'row_type':'image','ref':mp,'colour':'' if pos==1 else ck,'image_url':u,
                        'image_alt':f"{o['name']} in {CNAME.get(ck,ck)}",'image_position':pos})); pos+=1
    for m in methods:
        for po in positions:
            w,ht=(EMB_MAX if m=='embroidery' else MAXDIM).get(po,(100,100))
            out.append(row({'row_type':'decoration','ref':mp,'method':m,'position':po,'max_width_mm':w,
              'max_height_mm':ht,'max_colours':6 if m=='embroidery' else 4,
              'artwork_format':'Vector or DST' if m=='embroidery' else 'Vector',
              'notes':'Category default — confirm per product.'}))
open('merch-catalogue.csv','w').write('\n'.join(out)+'\n')
print(f"merch-catalogue.csv  {len(out)-1} rows  multiplier {MULTIPLIER}")
