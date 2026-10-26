import asyncio, importlib, json, os, sys, types, traceback
_root = "/workspace/open-agent/why-code-exists/artifacts/m12-v18b/heldout2-drawdown-penny/app-patched"
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
    from ta.sim.portfolio import Portfolio, Lot
    from ta.config import RiskCaps

    caps = RiskCaps()

    # Create a portfolio with peak_equity and positions
    portfolio = Portfolio(cash=1000.0, peak_equity=1000.0)

    # Add a position with entry_session far enough in the past to not block sells
    portfolio.positions["FALN"] = Lot(qty=100, cost=210.0, entry_session=0)

    # Setup meta for FALN as a high-risk sleeve and price below 5 (penny)
    meta = {
        "FALN": m.NameMeta(ticker="FALN", sleeve="high_risk", sector="Financials", price=2.10)
    }

    # Setup orders including a buy order for FALN
    orders = [
        OrderIntent(ticker="FALN", side="buy", notional=210.0, sleeve="high_risk", reason="rebalance")
    ]

    # Prices dict for FALN
    prices = {"FALN": 2.10}

    # fill_session and fill_date
    fill_session = 10
    fill_date = date(2024, 6, 1)

    # equity is 700 (30% drawdown from peak 1000)
    equity = 700.0
    sell_order = OrderIntent(ticker="FALN", side="sell", notional=210.0, sleeve="high_risk", reason="rebalance")
    arranged()
    out, notes = m.guard_orders(
        [sell_order],
        portfolio,
        meta,
        caps,
        fill_session=10,
        fill_date=fill_date,
        prices=prices,
        equity=equity,
    )
    record("kept_orders", [(o.ticker, o.side, o.notional) for o in out])
    record("notes", notes)
    check(len(out) == 1 and out[0].side == "sell", "sell order allowed after min_hold_sessions")
_pass, _err, _stack = True, None, None
try:
    asyncio.run(_wce_main())
except BaseException as e:
    _stack = "".join(traceback.format_exception(e))
    _pass, _err = False, (type(e).__name__ + ": " + str(e))[:300] + " | " + "".join(traceback.format_tb(e.__traceback__)[-1:]).strip().replace(chr(10), " ")[:200]
sys.setprofile(None)
print("__WCE_RESULTS__" + json.dumps(dict(pass_=_pass, error=_err, stack=_stack, recorded=_rec, target_ran=(_wce_hits[0] > 0) if _wce_trace else None), default=repr))
