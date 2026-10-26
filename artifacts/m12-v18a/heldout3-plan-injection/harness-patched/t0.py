import asyncio, importlib, json, os, sys, types, traceback
_root = "/workspace/open-agent/why-code-exists/artifacts/m12-v18a/heldout3-plan-injection/app-patched"
sys.path[:0] = [p for p in (os.path.join(_root, "src"), _root) if os.path.isdir(p)]
_rec = []
def _wce_stub(name, code):
    m = types.ModuleType(name); exec(compile(code, "<stub " + name + ">", "exec"), m.__dict__); sys.modules[name] = m

def harm_observed(cond, msg="harmful outcome not observed"):
    if not cond:
        raise AssertionError("harmful outcome not observed: " + msg)

def check(cond, msg="check failed"):
    if not cond: raise AssertionError(msg)
def record(name, value):
    _rec.append(dict(name=name, value=value))
def arranged():
    pass
def app(rel):
    rel = rel.lstrip("/")
    return importlib.import_module((rel[4:] if rel.startswith("src/") else rel).removesuffix(".py").removesuffix("/__init__").replace("/", "."))
_wce_trace = ["blast_radius/reasoner/base.py","_deprecation_step"]
_wce_hits = [0]
if _wce_trace:
    def _wce_prof(fr, ev, arg):
        if ev == "call" and fr.f_code.co_name == _wce_trace[1] and fr.f_code.co_filename.replace(os.sep, "/").endswith(_wce_trace[0]):
            _wce_hits[0] += 1
    sys.setprofile(_wce_prof)
    import threading; threading.setprofile(_wce_prof)
async def _wce_main():
    m = app("blast_radius/reasoner/base.py")
    from blast_radius.models import Action, Condition
    import time

    # Prepare a malicious action with SQL injection in target
    malicious_target = "tmp_import'; DROP TABLE customers; --"
    action = Action(
        sql="DROP TABLE customers;",
        kind="drop_table",
        table=malicious_target,
        column=None,
        raw_sql=None
    )
    conds = [Condition(id="c1", kind="dummy", description="dummy", target="dummy")]

    # Prepare a safe action for decoy tests
    safe_action = Action(
        sql="ALTER TABLE orders DROP COLUMN legacy_discount;",
        kind="drop_column",
        table="orders",
        column="legacy_discount",
        raw_sql=None
    )

    # Prepare conditions for safe action
    safe_conds = [Condition(id="c1", kind="dummy", description="dummy", target="dummy")]

    arranged()
    err = None
    sql_injection_detected = False
    try:
        plan_steps = m.safe_plan(action, conds)
        # The first step is the deprecation step with embedded SQL
        deprecate_step = plan_steps[0]
        sql = deprecate_step.sql
        record("deprecate_sql", sql)
        # Check if the malicious DROP TABLE is embedded verbatim
        if malicious_target in sql and "DROP TABLE customers" in sql:
            sql_injection_detected = True
    except Exception as e:
        err = e
        record("error", str(e))
    harm_observed(sql_injection_detected, "SQL injection vulnerability allows DROP TABLE execution")
_pass, _err, _stack = True, None, None
try:
    asyncio.run(_wce_main())
except BaseException as e:
    _stack = "".join(traceback.format_exception(e))
    _pass, _err = False, (type(e).__name__ + ": " + str(e))[:300] + " | " + "".join(traceback.format_tb(e.__traceback__)[-1:]).strip().replace(chr(10), " ")[:200]
sys.setprofile(None)
print("__WCE_RESULTS__" + json.dumps(dict(pass_=_pass, error=_err, stack=_stack, recorded=_rec, target_ran=(_wce_hits[0] > 0) if _wce_trace else None), default=repr))
