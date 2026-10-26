#!/usr/bin/env python3
"""Grade LOCATE runs per docs/locate-eval-rule.md (mechanical parts only)."""
import json, os, subprocess, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
X=Path('/workspace/open-agent/cursor-infer/v4/x')
EF=ROOT/'artifacts/cursor-infer/v4-blind-sonnet5/eval-frozen'
FIX=json.load(open(EF/'fix-lines-v4.json'))
def norm(case,f):
    if not f: return f
    src=X/case/'src'
    for c in (f, f[4:] if f.startswith('src/') else None, 'src/'+f):
        if c and (src/c).is_file(): return c
    return f
def reanchor(case,f,line,text):
    p=X/case/'src'/f
    if not p.is_file() or not text or not text.strip(): return line
    ls=p.read_text(errors='replace').splitlines()
    occ=[i+1 for i,l in enumerate(ls) if text.strip() in l]
    return min(occ,key=lambda o:abs(o-line)) if occ else line
def hit(case,c):
    fx=FIX[case]; f=norm(case,c.get('file',''))
    if not (f.endswith(fx['file']) or fx['file'].endswith(f)): return False
    ln=reanchor(case,f,c.get('line',0),c.get('text',''))
    return any(abs(ln-a)<=10 for a in fx['lines'])
cfg=sys.argv[1]; base=ROOT/'artifacts/locate'/cfg
ans=base/'graded-answers'; pre=base/'graded-answers-pre'
for d in (ans,pre): d.mkdir(exist_ok=True)
rows={}
for i in range(1,16):
    case='case%02d'%i; r=json.load(open(base/case/'report.json'))
    L=r.get('locate'); row={'stage':r.get('stage')}
    if L and L.get('picked'):
        l2=(L.get('layer2') or {}).get('candidate')
        top3=([l2] if l2 else [])+L['layer1']['candidates']
        seen=[];
        for c in top3:
            k=(c['file'],c['line'])
            if k not in [(s['file'],s['line']) for s in seen]: seen.append(c)
        row['method']=L.get('method'); row['pick']='%s:%s'%(L['picked']['file'],L['picked']['line'])
        row['top1']=hit(case,L['picked']); row['top3']=any(hit(case,c) for c in seen[:3])
    else: row['method']='n/a(frames)' if not L else 'none'; row['top1']=row['top3']=None
    tp=r.get('three_piece') or {}
    row['linker_edit']=r.get('stage') not in ('no_frame','no_edit') and bool(tp)
    for key,d in (('answer',ans),('pre_repair_answer',pre)):
        a=r.get(key) or (r.get('answer') if key=='pre_repair_answer' else None)
        if a:
            a=json.loads(json.dumps(a))
            for e in a.get('evidence',[]):
                if e.get('kind')=='code': e['file']=norm(case,e.get('file',''))
            json.dump(a,open(d/(case+'.json'),'w'),indent=1)
    a=r.get('answer') or {}
    ev=a.get('evidence',[])
    row['verified']=bool(ev) and all(e.get('verified') for e in ev)
    p=r.get('pre_repair_answer') or {}; pev=p.get('evidence',[])
    row['verified_pre']=bool(pev) and all(e.get('verified') for e in pev) if p else row['verified']
    row['repair']=(r.get('repair') or {}).get('outcome','none')
    rows[case]=row
for d,name in ((ans,'grade.txt'),(pre,'grade-pre.txt')):
    out=subprocess.run(['python3',str(EF/'grade.py'),'--answers',str(d),'--bundle',str(X),'--fix-lines',str(EF/'fix-lines-v4.json')],capture_output=True,text=True).stdout
    (base/name).write_text(out)
    for line in out.splitlines():
        s=line.split()
        if s and s[0] in rows: rows[s[0]]['grounded' if name=='grade.txt' else 'grounded_pre']=s[1]=='True'
json.dump(rows,open(base/'locate-grade.json','w'),indent=1)
for c,r in rows.items(): print(c,r)
