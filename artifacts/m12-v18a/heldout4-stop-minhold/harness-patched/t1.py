import asyncio, importlib, json, os, sys, types, traceback
_root = "/workspace/open-agent/why-code-exists/artifacts/m12-v18a/heldout4-stop-minhold/app-patched"
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
_wce_trace = ["src/ta/harness/caps.py","guard_orders"]
_wce_hits = [0]
if _wce_trace:
    def _wce_prof(fr, ev, arg):
        if ev == "call" and fr.f_code.co_name == _wce_trace[1] and fr.f_code.co_filename.replace(os.sep, "/").endswith(_wce_trace[0]):
            _wce_hits[0] += 1
    sys.setprofile(_wce_prof)
    import threading; threading.setprofile(_wce_prof)
async def _wce_main():
    from datetime import date

    m = app("src/ta/harness/caps.py")
    from ta.models import OrderIntent

    # Create a minimal Portfolio mock with required attributes for guard_orders
    class DummyLot:
        def __init__(self, qty, cost, entry_session):
            self.qty = qty
            self.cost = cost
            self.entry_session = entry_session

    class DummyPortfolio:
        def __init__(self):
            self.peak_equity = 1000.0
            self.swing_exits = []
            self.exit_sessions = {}
            self.positions = {}

    # Setup a portfolio with a position for AAA
    portfolio = DummyPortfolio()
    portfolio.positions["AAA"] = DummyLot(qty=10, cost=100, entry_session=10)
    portfolio.exit_sessions["AAA"] = 5

    # Setup meta for AAA
    meta = {"AAA": m.NameMeta(ticker="AAA", sleeve="core", sector="Information Technology", price=100)}

    # Setup caps with default values
    from src.ta.config import RiskCaps
    caps = RiskCaps()

    # Setup prices dict
    prices = {"AAA": 70}  # AAA down 30% from cost 100

    # Setup fill_session and fill_date
    fill_session = 15
    fill_date = date(2024, 3, 4)

    # Setup equity
    equity = 700  # 30% down from peak_equity 1000
    orders = [OrderIntent(ticker="AAA", side="sell", notional=300, reason="cap_reduction", sleeve="core")]
    arranged()
    kept, notes = m.guard_orders(
        orders,
        portfolio,
        meta,
        caps,
        fill_session=fill_session,
        fill_date=fill_date,
        prices=prices,
        equity=equity,
    )
    record("kept", kept)
    record("notes", notes)
    check(len(kept) == 1 and kept[0].reason == "cap_reduction", "cap_reduction sell order is allowed despite min_hold_sessions")
_pass, _err, _stack = True, None, None
try:
    asyncio.run(_wce_main())
except BaseException as e:
    _stack = "".join(traceback.format_exception(e))
    _pass, _err = False, (type(e).__name__ + ": " + str(e))[:300] + " | " + "".join(traceback.format_tb(e.__traceback__)[-1:]).strip().replace(chr(10), " ")[:200]
sys.setprofile(None)
print("__WCE_RESULTS__" + json.dumps(dict(pass_=_pass, error=_err, stack=_stack, recorded=_rec, target_ran=(_wce_hits[0] > 0) if _wce_trace else None), default=repr))
