import asyncio, importlib, json, os, sys, types, traceback
_root = "/workspace/open-agent/why-code-exists/artifacts/m11-v17b/heldout2-drawdown-penny/app-patched"
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
    from ta.harness.caps import guard_orders, RiskCaps, NameMeta
    from ta.models import OrderIntent
    from ta.sim.portfolio import Portfolio, Lot

    # Create a portfolio with peak_equity > 0 and current equity to simulate drawdown
    portfolio = Portfolio(cash=1000.0, peak_equity=3000.0)

    # Add a position with entry_session to test min_hold_sessions and swing_hold_sessions
    portfolio.positions["FALN"] = Lot(qty=100, cost=210.0, entry_session=10)

    # Set exit_sessions to simulate reentry wait
    portfolio.exit_sessions["FALN"] = 5

    # Set swing_exits dates in the current quarter
    portfolio.swing_exits = [date(2024, 3, 1), date(2024, 3, 2)]

    # Define RiskCaps with drawdown_halt_high_risk = -0.20
    caps = RiskCaps(
        drawdown_halt_high_risk=-0.20,
        min_hold_sessions=5,
        swing_hold_sessions=20,
        swing_trades_per_quarter=2,
        reentry_sessions=5
    )

    # Define meta for FALN as a high-risk sleeve and price below penny threshold
    meta = {
        "FALN": NameMeta(ticker="FALN", sleeve="high_risk", sector="Energy", price=2.10)
    }

    # Create an order for FALN buy at $2.10
    orders = [OrderIntent(ticker="FALN", side="buy", notional=210.0, sleeve="high_risk")]

    # Set fill_session and fill_date
    fill_session = 15
    fill_date = date(2024, 3, 4)

    # Prices dict
    prices = {"FALN": 2.10}

    # Current equity is 2100 (drawdown = 2100/3000 - 1 = -0.3)
    equity = 2100.0
    orders_day_trade = [
        OrderIntent(ticker="FALN", side="buy", notional=210.0, sleeve="core"),
        OrderIntent(ticker="FALN", side="sell", notional=210.0, sleeve="core"),
    ]

    kept, notes = guard_orders(
        orders_day_trade,
        portfolio,
        meta,
        caps,
        fill_session=fill_session,
        fill_date=fill_date,
        prices=prices,
        equity=equity
    )

    record("kept_day_trade", [o.dict() for o in kept])
    record("notes_day_trade", notes)

    check(len(kept) == 1 and kept[0].side == "buy", "day trade sell should be blocked, buy allowed")
    check(any("day trade blocked" in note for note in notes), "day trade block note should be present")
_pass, _err, _stack = True, None, None
try:
    asyncio.run(_wce_main())
except BaseException as e:
    _stack = "".join(traceback.format_exception(e))
    _pass, _err = False, (type(e).__name__ + ": " + str(e))[:300] + " | " + "".join(traceback.format_tb(e.__traceback__)[-1:]).strip().replace(chr(10), " ")[:200]
sys.setprofile(None)
print("__WCE_RESULTS__" + json.dumps(dict(pass_=_pass, error=_err, stack=_stack, recorded=_rec, target_ran=(_wce_hits[0] > 0) if _wce_trace else None), default=repr))
