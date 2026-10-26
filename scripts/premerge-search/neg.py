import json,subprocess,datetime as dt,re
def gh(*a): return subprocess.run(["gh",*a],capture_output=True,text=True).stdout
POS=[("Vexorterminal0111/vexor-terminal",32,33),("jotamano/fluxocaixa",19,20),("hoathienmenh-01/xuantoi",127,129),("arborstarjax-bot/soberliving",13,14),("COG-GTM/otterworks",137,142),("prathamesh-ops-sudo/securenexus",416,417)]
CODE=re.compile(r'\.(ts|tsx|js|jsx|mjs|py)$'); TEST=re.compile(r'(test|spec|__tests__|\.md$|\.json$|\.ya?ml$|\.lock$)',re.I)
def stats(repo,n):
    fs=json.loads(gh("api","--paginate","--slurp",f"repos/{repo}/pulls/{n}/files?per_page=100")); fs=[f for p in fs for f in p]
    code=sum(f['changes'] for f in fs if CODE.search(f['filename']) and not TEST.search(f['filename']))
    other=sum(f['changes'] for f in fs if not CODE.search(f['filename']) and not TEST.search(f['filename']))
    return code,other,sum(f['changes'] for f in fs)
res={"positives":[],"negatives":[]}
AG="devin-ai-integration[bot]"
for repo,a,fix in POS:
    p=json.loads(gh("api",f"repos/{repo}/pulls/{a}")); c=stats(repo,a)
    res["positives"].append(dict(repo=repo,pr=a,fix=fix,author=p['user']['login'],merged=p['merged_at'],code_lines=c[0],other_lines=c[1],total=c[2],merge_sha=p['merge_commit_sha'],base=p['base']['sha'],head=p['head']['sha']))
    m=dt.datetime.fromisoformat(p['merged_at'][:-1])
    prs=json.loads(gh("api","--paginate","--slurp",f"repos/{repo}/pulls?state=closed&per_page=100")); prs=[x for pg in prs for x in pg]
    cands=[]
    for x in prs:
        if not x.get('merged_at') or x['number'] in (a,fix) or x['user']['login']!=p['user']['login']: continue
        t=dt.datetime.fromisoformat(x['merged_at'][:-1])
        if abs((t-m).days)>60 or t>dt.datetime(2026,9,25): continue
        cands.append((abs((t-m).total_seconds()),x))
    cands.sort(key=lambda z:z[0]); got=0
    for _,x in cands:
        if got>=2: break
        c=stats(repo,x['number'])
        if c[0]==0 or c[2]>1500: continue
        # referenced later as cause/revert?
        q=gh("search","prs","--repo",repo,"--json","number,title,body","--",f"#{x['number']}")
        refs=[y for y in json.loads(q or "[]") if y['number']!=x['number'] and re.search(rf"#{x['number']}\b",(y['title']+(y['body'] or ""))) and re.search(r'revert|regress|fix|bug|broke',(y['title']+(y['body'] or "")),re.I)]
        if refs: print("skip ref",repo,x['number'],[y['number'] for y in refs]); continue
        res["negatives"].append(dict(repo=repo,pr=x['number'],author=x['user']['login'],merged=x['merged_at'],title=x['title'],code_lines=c[0],total=c[2],merge_sha=x['merge_commit_sha'],base=x['base']['sha'],head=x['head']['sha'])); got+=1
json.dump(res,open("eval-draft.json","w"),indent=1)
for k in res:
    for r in res[k]: print(k,r['repo'],r['pr'],r['author'],r['merged'][:10],r['code_lines'],r['total'])
