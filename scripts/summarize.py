import json,sys,os,glob
for d in sorted(glob.glob(sys.argv[1]+'/*/report.json')):
    r=json.load(open(d)); c=os.path.basename(os.path.dirname(d))
    t=r.get('tests') or {}; p=r.get('patch') or {}
    runs=r.get('runs') or {}
    res=lambda k:[(x['role'][0],x['pass'],x.get('target_ran')) for x in runs.get(k,{}).get('results',[])]
    print(f"{c:26} {r['verdict']:20} probe={[x.get('ok') for x in t.get('setup_probe',[])]} decoyRedraft={[x['replaced'] for x in t.get('decoy_redrafts_on_original',[])]} patch={p.get('file')}:{p.get('changed_lines')} {[a.get('changed_lines',a.get('problem','')[:20]) for a in p.get('attempts',[])]}")
    print("   orig",res('original'),"patched",res('patched'), "mech",(r.get('mechanism') or {}).get('verdict'))
    print("   claim:",(r.get('claim') or {}).get('claim','')[:220])
