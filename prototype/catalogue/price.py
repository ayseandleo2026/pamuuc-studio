from read import sheet
from collections import defaultdict
import statistics, itertools

P=sheet('xl/worksheets/sheet1.xml'); C=sheet('xl/worksheets/sheet2.xml')
K=sheet('xl/worksheets/sheet3.xml'); CL=sheet('xl/worksheets/sheet4.xml'); SZ=sheet('xl/worksheets/sheet5.xml')
h=lambda r:{x:i for i,x in enumerate(r[0])}
hp,hc,hk,hcl,hsz=h(P),h(C),h(K),h(CL),h(SZ)

QTY=[25,50,100,250,500]
MARGIN=0.35
EMB={'small':0.60,'medium':0.85,'large':1.20}; EMB_SETUP=35.0
DTF={'small':0.60,'medium':0.90,'large':1.20}; DTF_SETUP=0.0
DTG={'small':0.90,'medium':1.35,'large':1.80}; DTG_SETUP=0.0
SCREEN={1:4.50,10:4.30,25:4.10,50:3.70,100:2.64,250:1.68,500:1.20}; SCR_SETUP=40.0
MULT={1:1.0,2:1.200,3:1.320,4:1.386}

def screen_unit(q,cols=4):
    return SCREEN[max(b for b in SCREEN if b<=q)]*MULT[cols]

def placements(q, per_screen_setup=False):
    scr_setup = SCR_SETUP*4 if per_screen_setup else SCR_SETUP
    return {
      'embroidery (large)': EMB['large'] + EMB_SETUP/q,
      'screen print (4 col)': screen_unit(q,4) + scr_setup/q,
      'DTF (large)': DTF['large'] + DTF_SETUP/q,
      'DTG (large)': DTG['large'] + DTG_SETUP/q,
    }

def worst_two(q, per_screen_setup=False):
    """Worst any-two-placement combination — front and back."""
    p=placements(q,per_screen_setup)
    best=max(itertools.combinations(p.items(),2), key=lambda pair: pair[0][1]+pair[1][1])
    return best[0][1]+best[1][1], f"{best[0][0]} + {best[1][0]}"

# ---- costs -----------------------------------------------------------------
cost=defaultdict(list)
for r in K[1:]: cost[r[hk['Product reference']]].append(r[hk['Unit cost (EUR)']])
CLO={k:min(v) for k,v in cost.items()}; CHI={k:max(v) for k,v in cost.items()}

# ---- competitors -----------------------------------------------------------
comp=defaultdict(lambda: defaultdict(dict))
for r in C[1:]:
    ref,q,p,who=r[hc['Product reference']],r[hc['Quantity']],r[hc['Unit price (EUR ex VAT)']],r[hc['Competitor']]
    if p is not None: comp[ref][int(q)][who]=p
def bench(ref,q):
    d=comp.get(ref,{}).get(q)
    return statistics.median(d.values()) if d else None

NAMES={r[hp['Product reference']]:r[hp['Product name']] for r in P[1:]}
CATS={r[hp['Product reference']]:r[hp['Product category']] for r in P[1:]}
GSM={r[hp['Product reference']]:r[hp['Weight (GSM)']] for r in P[1:]}
COMPOS={r[hp['Product reference']]:r[hp['Composition']] for r in P[1:]}
REFS=[r[hp['Product reference']] for r in P[1:]]

def floor_price(ref,q,per_screen=False):
    if ref not in CHI: return None
    deco,_=worst_two(q,per_screen)
    return (CHI[ref]+deco)/(1-MARGIN)

def down05(x): 
    import math
    return math.floor(x*20)/20
