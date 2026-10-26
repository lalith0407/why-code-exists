import asyncio, importlib, json, os, sys, types, traceback
_root = "/workspace/open-agent/why-code-exists/artifacts/m11-v17a/heldout4-caps-unknown/app-patched"
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

    # Prepare meta with a known ticker and a ticker not in meta
    meta = {
        "AAPL": m_caps.NameMeta(ticker="AAPL", sleeve="core", sector="Technology", price=150.0),
        # No entry for ZZZZ to simulate missing ticker
    }

    # Prepare caps with default values
    caps = RiskCaps()

    # Prepare weights with a ticker not in meta (ZZZZ) with a large weight to trigger violation
    weights = {"ZZZZ": 0.95}
    arranged()
    weights2 = {"AAPL": 0.5}
    outcome = m_caps.enforce_caps(weights2, meta, caps)
    record("ok", outcome.ok)
    record("violations", outcome.violations)
    check(not outcome.ok and any(v["code"] == "single_name" for v in outcome.violations), "single-name cap violation detected")
_pass, _err, _stack = True, None, None
try:
    asyncio.run(_wce_main())
except BaseException as e:
    _stack = "".join(traceback.format_exception(e))
    _pass, _err = False, (type(e).__name__ + ": " + str(e))[:300] + " | " + "".join(traceback.format_tb(e.__traceback__)[-1:]).strip().replace(chr(10), " ")[:200]
sys.setprofile(None)
print("__WCE_RESULTS__" + json.dumps(dict(pass_=_pass, error=_err, stack=_stack, recorded=_rec, target_ran=(_wce_hits[0] > 0) if _wce_trace else None), default=repr))
