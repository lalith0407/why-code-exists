import json,subprocess,re,sys
AG=re.compile(r'devin-ai-integration|copilot-swe-agent|^Copilot$|codex|claude|cursor',re.I)
def gh(*a):
    r=subprocess.run(['gh',*a],capture_output=True,text=True); return r.stdout
for line in sys.stdin:
    url=line.split()[0]; m=re.match(r'https://github.com/([^/]+/[^/]+)/pull/(\d+)',url); repo,n=m.groups()
    p=json.loads(gh('pr','view',n,'-R',repo,'--json','body,createdAt,files') or '{}'); b=p.get('body') or ''
    refs=re.findall(r'(?:introduced|caused|regress\w*|broke\w*)[^.\n]{0,40}?(?:#|/pull/)(\d+)',b,re.I)
    err=bool(re.search(r'Traceback|Error:|Exception|error TS\d|at \S+ \(|panic:',b))
    out=[]
    for r in dict.fromkeys(refs):
        q=json.loads(gh('pr','view',r,'-R',repo,'--json','author,mergedAt,number') or '{}')
        a=(q.get('author') or {}).get('login','?'); out.append(f"#{r}:{a}:{'merged' if q.get('mergedAt') else 'notmerged'}:{'AGENT' if AG.search(a) else ''}")
    print(url,'| refs',out,'| errtext',err, flush=True)
