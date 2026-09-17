import xml.etree.ElementTree as ET, re, json, sys
NS={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
def strings():
    try: root=ET.parse('xl/sharedStrings.xml').getroot()
    except: return []
    out=[]
    for si in root.findall('m:si',NS):
        out.append(''.join(t.text or '' for t in si.iter('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t')))
    return out
SS=strings()
def colnum(ref):
    c=re.match(r'([A-Z]+)',ref).group(1); n=0
    for ch in c: n=n*26+ord(ch)-64
    return n-1
def sheet(path):
    root=ET.parse(path).getroot(); rows=[]
    for r in root.findall('.//m:sheetData/m:row',NS):
        cells={}
        for c in r.findall('m:c',NS):
            ref=c.get('r'); t=c.get('t'); v=c.find('m:v',NS)
            isv=c.find('m:is',NS)
            if isv is not None:
                val=''.join(x.text or '' for x in isv.iter('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t'))
            elif v is None: val=None
            elif t=='s': val=SS[int(v.text)]
            elif t=='b': val=(v.text=='1')
            else:
                try: val=float(v.text)
                except: val=v.text
            if val is not None and val!='': cells[colnum(ref)]=val
        if cells:
            w=max(cells)+1
            rows.append([cells.get(i) for i in range(w)])
    return rows
if __name__=='__main__':
    import os
    names={'sheet1.xml':'Products','sheet2.xml':'Competitor pricing','sheet3.xml':'Costs',
           'sheet4.xml':'Colours','sheet5.xml':'Sizes','sheet6.xml':'Coverage'}
    for f,n in names.items():
        rows=sheet('xl/worksheets/'+f)
        print('='*70); print(n, '—', len(rows), 'rows')
        for r in rows[:6]:
            print('  ', [str(x)[:28] if x is not None else '' for x in r][:14])
