import json,subprocess,re,sys,time
AG=re.compile(r'^(copilot-swe-agent|Copilot|devin-ai-integration|openhands-agent|chatgpt-codex-connector|google-labs-jules|cursor|claude)(\[bot\])?$',re.I)
def gh(*a):
    r=subprocess.run(["gh",*a],capture_output=True,text=True)
    return r.stdout
queries=sys.argv[1:]
seen={}
out=open("candidates.jsonl","a")
for q in queries:
  for lang in ["typescript","python"]:
    s=gh("search","prs","--merged","--language",lang,"--limit","100","--json","repository,number,title,body,url,closedAt","--",q)
    try: d=json.loads(s)
    except: print("err",q,s[:200]); time.sleep(20); continue
    for x in d:
      repo=x['repository']['nameWithOwner']; body=(x['title']+"\n"+(x.get('body') or ""))
      for m in re.finditer(r'(?:revert|regress|introduc|caus|broke|break)[^\n]{0,80}?(?:#|/pull/)(\d+)|(?:#|/pull/)(\d+)[^\n]{0,60}?(?:introduc|caus|broke|regress)',body,re.I):
        n=m.group(1) or m.group(2); k=(repo,n)
        if k in seen: continue
        p=gh("api",f"repos/{repo}/pulls/{n}","--jq","[.user.login,.merged_at,.title]")
        try: login,merged,title=json.loads(p)
        except: seen[k]=0; continue
        seen[k]=1
        if AG.match(login or ""):
          rec=dict(repo=repo,agent_pr=int(n),agent=login,agent_merged=merged,agent_title=title,fix_pr=x['number'],fix_url=x['url'],fix_title=x['title'],ctx=m.group(0)[:160],q=q)
          print(json.dumps(rec)); out.write(json.dumps(rec)+"\n"); out.flush()
    time.sleep(3)
