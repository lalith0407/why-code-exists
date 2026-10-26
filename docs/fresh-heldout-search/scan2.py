import json,subprocess,re,sys
AG=re.compile(r'devin-ai-integration|copilot-swe-agent|^Copilot$|codex|claude|cursor',re.I)
gh=lambda *a: subprocess.run(['gh',*a],capture_output=True,text=True).stdout
for line in sys.stdin:
    url=line.strip(); m=re.match(r'https://github.com/([^/]+/[^/]+)/(?:issues|pull)/(\d+)',url); repo,n=m.groups()
    b=json.loads(gh('issue','view',n,'-R',repo,'--json','body') or '{}').get('body') or ''
    refs=re.findall(r'(?:introduced|caused|regress\w*|broke\w*|since)[^.\n]{0,40}?(?:#|/pull/)(\d+)',b,re.I)
    out=[]
    for r in list(dict.fromkeys(refs))[:3]:
        q=json.loads(gh('pr','view',r,'-R',repo,'--json','author,mergedAt') or '{}')
        a=(q.get('author') or {}).get('login','?'); out.append(f"#{r}:{a}:{'merged' if q.get('mergedAt') else 'nm'}:{'AGENT' if AG.search(a) else ''}")
    print(url,'| refs',out,flush=True)
