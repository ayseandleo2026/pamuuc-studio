"""PAMUUC price list — built from cost upward. No competitor input.

  price(tier) = ceil05( (garment cost + decoration allowance) / (1 - margin) )

Garment cost is the WORST size/colour band for that product, so no size or
colour in the range can fall below the target margin.
Decoration allowance is the worst case for the chosen scenario at that tier,
with setup amortised over the tier quantity.
"""
import math, json
from collections import defaultdict
from read import sheet

P=sheet('xl/worksheets/sheet1.xml'); K=sheet('xl/worksheets/sheet3.xml')
h=lambda r:{x:i for i,x in enumerate(r[0])}
hp,hk=h(P),h(K)

TIERS=[25,50,100,250,500]; MARGIN=0.35
EMB={'small':0.60,'medium':0.85,'large':1.20}; EMB_SETUP=35.0
DTF_L=1.20; DTG_L=1.80
SCREEN={1:4.50,10:4.30,25:4.10,50:3.70,100:2.64,250:1.68,500:1.20}; SCR_SETUP=40.0
MULT={1:1.0,2:1.200,3:1.320,4:1.386}
def scr(q,c=4): return SCREEN[max(b for b in SCREEN if b<=q)]*MULT[c]

def placements(q):
    return {'Embroidery, large':EMB['large']+EMB_SETUP/q,
            'Screen print, 4 colour':scr(q,4)+SCR_SETUP/q,
            'DTF, large':DTF_L, 'DTG, large':DTG_L}

SCENARIOS={
 'two':        ('Two placements — front and back, worst pair',
                lambda q: sum(sorted(placements(q).values(),reverse=True)[:2])),
 'one':        ('One placement — worst single',
                lambda q: max(placements(q).values())),
 'one_modest': ('One placement — embroidery medium or 1-colour screen',
                lambda q: max(EMB['medium']+EMB_SETUP/q,
                              SCREEN[max(b for b in SCREEN if b<=q)]+SCR_SETUP/q)),
 'none':       ('Blank — decoration quoted separately', lambda q: 0.0),
}
def ceil05(x): return math.ceil(x*20)/20

cost=defaultdict(list)
for r in K[1:]: cost[r[hk['Product reference']]].append(r[hk['Unit cost (EUR)']])
CHI={k:max(v) for k,v in cost.items()}; CLO={k:min(v) for k,v in cost.items()}

rows=[]
for i,r in enumerate(P[1:],1):
    ref=r[hp['Product reference']]
    rows.append({
      'mp':'MP-%04d'%i,'ss':ref,'name':r[hp['Product name']],'cat':r[hp['Product category']],
      'type':r[hp['Product type']] or '','gsm':r[hp['Weight (GSM)']] or '',
      'colours':int(r[hp['Colour count']] or 0),'sizes':int(r[hp['Size count']] or 0),
      'cost':CHI.get(ref),'cost_lo':CLO.get(ref),
    })

def build(scen):
    _,fn=SCENARIOS[scen]
    deco={q:fn(q) for q in TIERS}
    out=[]
    for d in rows:
        e=dict(d); e['deco']=deco
        if d['cost'] is None:
            e['prices']={q:None for q in TIERS}; e['margins']={q:None for q in TIERS}
        else:
            e['prices']={q:ceil05((d['cost']+deco[q])/(1-MARGIN)) for q in TIERS}
            e['margins']={q:(e['prices'][q]-d['cost']-deco[q])/e['prices'][q] for q in TIERS}
        out.append(e)
    return deco,out
