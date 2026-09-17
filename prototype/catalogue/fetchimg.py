"""Download Stanley/Stella product photography as small thumbnails and store
them as data URIs, because the artifact CSP blocks external image hosts."""
import os, json, base64, re, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
from read import sheet
CL=sheet('xl/worksheets/sheet4.xml'); h={x:i for i,x in enumerate(CL[0])}
os.makedirs('img',exist_ok=True)

MAXC=int(sys.argv[1]) if len(sys.argv)>1 else 6      # colours per product
byprod={}
for r in CL[1:]:
    ref=r[h['Product reference']]; code=r[h['Colour code']]; u=r[h['Primary product image URL']]
    if not u: continue
    byprod.setdefault(ref,[]).append(('c'+code[1:], u))

jobs=[]
for ref,lst in byprod.items():
    for i,(ck,u) in enumerate(lst[:MAXC]):
        w = 400 if i==0 else 240
        t = f"c_lpad,w_{w},f_jpg,q_auto:low"
        url = re.sub(r'/upload/[^/]+/', f'/upload/{t}/', u)
        jobs.append((f"{ref}_{ck}", url))

def grab(j):
    key,url=j
    p=f"img/{key}.jpg"
    if os.path.exists(p) and os.path.getsize(p)>500: return True
    r=subprocess.run(["curl","-sS","--max-time","30","-o",p,url],capture_output=True)
    return os.path.exists(p) and os.path.getsize(p)>500

with ThreadPoolExecutor(max_workers=12) as ex:
    ok=list(ex.map(grab,jobs))
print(f"{sum(ok)}/{len(jobs)} downloaded", flush=True)

out={}
for key,_ in jobs:
    p=f"img/{key}.jpg"
    if os.path.exists(p) and os.path.getsize(p)>500:
        out[key]="data:image/jpeg;base64,"+base64.b64encode(open(p,'rb').read()).decode()
json.dump(out,open('images.json','w'),separators=(',',':'))
print(f"images.json {os.path.getsize('images.json')//1024} KB, {len(out)} images")
