import asyncio, importlib, json, os, sys, types, traceback
_root = "/workspace/open-agent/why-code-exists/artifacts/m11-v17b/heldout3-plan-injection/app-patched"
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
    arranged()
    conds = [m.Condition("c1", "dummy", "orders.legacy_discount", {})]
    out = m.safe_plan(
        m.Action(
            sql="ALTER TABLE orders RENAME COLUMN legacy_discount TO discount_cents;",
            kind="rename_column",
            table="orders",
            column="legacy_discount",
            new_name="discount_cents",
            raw_sql=None
        ),
        conds
    )
    record("plan", [str(step) for step in out])
    check(len(out) == 2, "2 steps for rename_column")
    check(out[0].n == 1 and out[1].n == 2, "steps numbered 1 and 2")
    check(out[1].title.startswith("Rename"), "second step title mentions Rename")
    check(out[1].conditions == [c.id for c in conds], "second step gated by all conditions")
_pass, _err, _stack = True, None, None
try:
    asyncio.run(_wce_main())
except BaseException as e:
    _stack = "".join(traceback.format_exception(e))
    _pass, _err = False, (type(e).__name__ + ": " + str(e))[:300] + " | " + "".join(traceback.format_tb(e.__traceback__)[-1:]).strip().replace(chr(10), " ")[:200]
sys.setprofile(None)
print("__WCE_RESULTS__" + json.dumps(dict(pass_=_pass, error=_err, stack=_stack, recorded=_rec, target_ran=(_wce_hits[0] > 0) if _wce_trace else None), default=repr))
