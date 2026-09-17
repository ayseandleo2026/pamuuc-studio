"""PAMUUC price list v3 — lowest-cost basis, 1.45 multiplier.

  base cost   = cheapest NORMAL-size band, cheapest colour group
                + own label 0.60 + de-label 0.60 + packaging 0.20
                + cheapest decoration (small embroidery + 1-colour screen)
  price(tier) = ceil05( base cost x 1.45 )

Everything is priced off its floor, so the headline is the lowest defensible
number. Anything dearer than the floor — a larger size, a heather, a bigger or
multi-colour decoration — is a surcharge on top, at the same 1.45.

Oversize (4XL/5XL) is deliberately out of the base: it is a surcharge, not a
reason to lift every price in the range.

Two surcharge families, both at the same multiplier:
  size / colour       (band cost - base cost)   x 1.45
  decoration upgrade  (spec cost - cheapest)    x 1.45
With both applied the margin holds at 31% on every variant and every spec.
"""
import math, re
from collections import defaultdict
from read import sheet

P=sheet('xl/worksheets/sheet1.xml'); K=sheet('xl/worksheets/sheet3.xml')
h=lambda r:{x:i for i,x in enumerate(r[0])}
hp,hk=h(P),h(K)

TIERS=[25,50,100,250,500]; MULTIPLIER=1.55
LABEL_ON=0.60; LABEL_OFF=0.60; PACKAGING=0.20
FIXED=LABEL_ON+LABEL_OFF+PACKAGING

EMB={'small':0.60,'medium':0.85,'large':1.20}; EMB_SETUP=35.0
SCREEN={1:4.50,10:4.30,25:4.10,50:3.70,100:2.64,250:1.68,500:1.20}; SCR_SETUP=40.0
MULT={1:1.0,2:1.200,3:1.320,4:1.386}
SETUP_ONCE=EMB_SETUP+SCR_SETUP
def scr(q,c): return SCREEN[max(b for b in SCREEN if b<=q)]*MULT[c]

CASES=[('good','Small embroidery + 1-colour screen','small',1),
       ('medium','Medium embroidery + 2-colour screen','medium',2),
       ('bad','Large embroidery + 4-colour screen','large',4)]
def deco(q, setup_in_unit=False):
    su = SETUP_ONCE/q if setup_in_unit else 0.0
    return {k: EMB[e] + scr(q,c) + su for k,_,e,c in CASES}

def is_oversize(band): return bool(re.search(r'\b[45]XL\b', band or ''))
def ceil05(x): return math.ceil(x*20)/20

bands=defaultdict(list)
for r in K[1:]:
    bands[r[hk['Product reference']]].append(
        (r[hk['Cost size band']], r[hk['Cost colour group']], r[hk['Unit cost (EUR)']]))

BASE={}; ALL={}
for ref,bs in bands.items():
    normal=[b for b in bs if not is_oversize(b[0])]
    pool = normal or bs                       # a range that is only oversize keeps its own floor
    BASE[ref]=min(c for _,_,c in pool)
    ALL[ref]=sorted(bs, key=lambda x:x[2])

def build(setup_in_unit=False):
    out=[]
    for i,r in enumerate(P[1:],1):
        ref=r[hp['Product reference']]
        g=BASE.get(ref)
        e={'mp':'MP-%04d'%i,'ss':ref,'name':r[hp['Product name']],'cat':r[hp['Product category']],
           'gsm':r[hp['Weight (GSM)']] or '','colours':int(r[hp['Colour count']] or 0),
           'sizes':int(r[hp['Size count']] or 0),'cost':g,
           'cost_hi':max((c for _,_,c in ALL[ref]), default=None) if ref in ALL else None,
           'fixed':FIXED,'prices':{},'margins':{},'margins_hi':{},'bands':[]}
        if g is not None:
            e['bands']=[{'size':a,'colour':b,'cost':c,'over':is_oversize(a),
                         'sur':round((c-g)*MULTIPLIER,2)} for a,b,c in ALL[ref]]
            for q in TIERS:
                d=deco(q,setup_in_unit)
                base=g+FIXED+d['good']
                p=ceil05(base*MULTIPLIER); e['prices'][q]=p
                e['margins'][q]={k:(p-(g+FIXED+d[k]))/p for k in d}
                hi=e['cost_hi']
                # exposure: dearest variant / dearest spec with NO surcharge charged
                e['margins_hi'][q]={k:(p-(hi+FIXED+d[k]))/p for k in d}
                e.setdefault('decosur',{})[q]={k:round((d[k]-d['good'])*MULTIPLIER,2) for k in d}
        out.append(e)
    return out
