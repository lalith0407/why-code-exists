import asyncio, importlib, json, os, sys, types, traceback
_root = "/workspace/trading-agent-system"
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
_wce_trace = ["src/ta/harness/caps.py","enforce_caps"]
_wce_hits = [0]
if _wce_trace:
    def _wce_prof(fr, ev, arg):
        if ev == "call" and fr.f_code.co_name == _wce_trace[1] and fr.f_code.co_filename.replace(os.sep, "/").endswith(_wce_trace[0]):
            _wce_hits[0] += 1
    sys.setprofile(_wce_prof)
    import threading; threading.setprofile(_wce_prof)
async def _wce_main():
    m_caps = app("src/ta/harness/caps.py")
    from ta.config import RiskCaps

    # Prepare meta with no entry for 'ZZZZ' to simulate missing security
    meta = {
        "AAPL": m_caps.NameMeta(ticker="AAPL", sleeve="core", sector="Technology", price=150.0),
        "MSFT": m_caps.NameMeta(ticker="MSFT", sleeve="core", sector="Technology", price=250.0),
    }

    # Caps with single_core_pct = 0.15 as per default
    caps = RiskCaps()

    # Weights with 95% on 'ZZZZ' which is missing from meta
    weights = {"ZZZZ": 0.95}

    # Import helper functions for decoy tests
    m_models = app("src/ta/models.py")
    arranged()
    weights3 = {"AAPL": 0.2, "MSFT": 0.2}
    outcome = m_caps.enforce_caps(weights3, meta, caps)
    record("violations", outcome.violations)
    check(any(v["code"] == "sector" for v in outcome.violations), "sector cap violation detected")
_pass, _err, _stack = True, None, None
try:
    asyncio.run(_wce_main())
except BaseException as e:
    _stack = "".join(traceback.format_exception(e))
    _pass, _err = False, (type(e).__name__ + ": " + str(e))[:300] + " | " + "".join(traceback.format_tb(e.__traceback__)[-1:]).strip().replace(chr(10), " ")[:200]
sys.setprofile(None)
print("__WCE_RESULTS__" + json.dumps(dict(pass_=_pass, error=_err, stack=_stack, recorded=_rec, target_ran=(_wce_hits[0] > 0) if _wce_trace else None), default=repr))
