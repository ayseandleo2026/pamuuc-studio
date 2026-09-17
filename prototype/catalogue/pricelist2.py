"""PAMUUC price list v2 — cost-up, three-case decoration, fixed costs included.

  unit cost   = CHEAPEST-band garment + own label 0.60 + delabel 0.60 + packaging 0.20
                (the dearest band in the same range still sells at this price, so its
                 margin is lower — reported separately as the exposure)
  decoration  = one embroidery + one screen print, at three specs:
                  good    small embroidery  + 1-colour screen
                  medium  medium embroidery + 2-colour screen
                  bad     large embroidery  + 4-colour screen
                running cost only — setup is a one-off charge, not in the unit price
  price(tier) = ceil05( (unit cost + MEDIAN of the three) x 1.35 )

Markup on cost, not margin on price: we add 35% on top of what the job costs
us. On a price basis that is 25.9%, which is what the figures under each price
report, because margin on revenue is what actually lands in the account.

The median case sits at target margin, the good case above it and the bad case
below it, and every case stays profitable. Pricing on the median rather than the
worst case is what keeps the two lower tiers — 80% of orders — competitive.
"""
import math
from collections import defaultdict
from read import sheet

def band_key(size_band, colour_group):
    big = '4XL' in (size_band or '') or '5XL' in (size_band or '')
    special = (colour_group or '') not in ('Whites','Colors')
    return (big, special)

P=sheet('xl/worksheets/sheet1.xml'); K=sheet('xl/worksheets/sheet3.xml')
h=lambda r:{x:i for i,x in enumerate(r[0])}
hp,hk=h(P),h(K)

TIERS=[25,50,100,250,500]; MARKUP=0.35
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

def blend(q, setup_in_unit=False):
    return sorted(deco(q,setup_in_unit).values())[1]      # median of three

def ceil05(x): return math.ceil(x*20)/20

cost=defaultdict(list); bands=defaultdict(list)
for r in K[1:]:
    ref=r[hk['Product reference']]; c=r[hk['Unit cost (EUR)']]
    cost[ref].append(c)
    bands[ref].append((r[hk['Cost size band']], r[hk['Cost colour group']], c))
CHI={k:max(v) for k,v in cost.items()}; CLO={k:min(v) for k,v in cost.items()}

def build(setup_in_unit=False):
    out=[]
    for i,r in enumerate(P[1:],1):
        ref=r[hp['Product reference']]
        g=CLO.get(ref)
        e={'mp':'MP-%04d'%i,'ss':ref,'name':r[hp['Product name']],'cat':r[hp['Product category']],
           'gsm':r[hp['Weight (GSM)']] or '','colours':int(r[hp['Colour count']] or 0),
           'sizes':int(r[hp['Size count']] or 0),'cost':g,'cost_hi':CHI.get(ref),
           'fixed':FIXED,'prices':{},'margins':{},
           'bands':[{'size':a,'colour':b,'cost':c,
                     'sur':round((c-CLO[ref])*(1+MARKUP),2) if ref in CLO else 0}
                    for a,b,c in sorted(bands.get(ref,[]), key=lambda x:x[2])]}
        if g is not None:
            base=g+FIXED
            for q in TIERS:
                d=deco(q,setup_in_unit); p=ceil05((base+blend(q,setup_in_unit))*(1+MARKUP))
                e['prices'][q]=p
                e['margins'][q]={k:(p-base-d[k])/p for k in d}
                hi=CHI.get(ref)
                e.setdefault('margins_hi',{})[q]={k:(p-(hi+FIXED)-d[k])/p for k in d}
        out.append(e)
    return out
