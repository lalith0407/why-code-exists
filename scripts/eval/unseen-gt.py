import re,glob,json,sys
out={}
for d in sorted(glob.glob('*.diff')):
    files={};cur=None
    for l in open(d,errors='replace'):
        m=re.match(r'diff --git a/(\S+)',l)
        if m: cur=m.group(1); files[cur]=[]; continue
        m=re.match(r'@@ -(\d+)',l)
        if m: o=int(m.group(1)); prev_add=False; continue
        if cur is None or l.startswith(('---','+++','index')): continue
        if l.startswith('-'): files[cur].append(o); o+=1
        elif l.startswith('+'): files[cur].append(o)  # insertion point (old side)
        elif l.startswith(' '): o+=1
    prod={f:sorted(set(v)) for f,v in files.items() if not re.search(r'(^|/)(tests?|__tests__)/|[Tt]est|\.md$|docs?/',f)}
    prim=max(prod,key=lambda f:len(prod[f])) if prod else None
    out[d[:-5]]={"file":prim,"lines":prod.get(prim,[]),"other_prod_files":{k:v for k,v in prod.items() if k!=prim}}
json.dump(out,sys.stdout,indent=1)
