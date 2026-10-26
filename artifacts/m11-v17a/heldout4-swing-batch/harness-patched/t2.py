import asyncio, importlib, json, os, sys, types, traceback
_root = "/workspace/open-agent/why-code-exists/artifacts/m11-v17a/heldout4-swing-batch/app-patched"
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
    from ta.sim.portfolio import Portfolio

    # Create a portfolio with some swing exits and positions
    portfolio = Portfolio(cash=10000.0)

    # Add swing exits to simulate previous swing trades in the quarter
    # We'll add 1 swing exit already used in the quarter
    quarter_start = date(2024, 4, 1)  # Q2 2024
    portfolio.swing_exits.append(quarter_start)

    # Add a position with entry_session to test min_hold and swing_hold
    portfolio.positions["AAA"] = type("Lot", (), {"qty": 10, "cost": 100, "entry_session": 10})()

    # Add exit_sessions to simulate previous exits
    portfolio.exit_sessions["AAA"] = 12

    # Setup meta for the ticker
    meta = {
        "AAA": m.NameMeta(ticker="AAA", sleeve="core", sector="Technology", price=100.0)
    }

    # Setup caps with swing_trades_per_quarter=2 (the cap)
    caps = m.RiskCaps(swing_trades_per_quarter=2, min_hold_sessions=5, swing_hold_sessions=20, reentry_sessions=5, drawdown_halt_high_risk=-0.2)

    # Setup orders: one sell order that would be blocked by swing-trade cap
    orders = [
        OrderIntent(ticker="AAA", side="sell", notional=1000.0, reason="rebalance", sleeve="core")
    ]

    # Setup prices
    prices = {"AAA": 100.0}

    # Setup fill_session and fill_date within the swing_hold_sessions and quarter
    fill_session = 15
    fill_date = date(2024, 4, 15)  # Q2 2024

    # Setup equity and peak_equity
    portfolio.peak_equity = 12000.0
    equity = 10000.0
    # Test that a buy order is blocked if reentry_sessions cap is active
    buy_order = OrderIntent(ticker="AAA", side="buy", notional=1000.0, reason="rebalance", sleeve="core")

    # Set exit_sessions so that reentry_sessions cap blocks the buy
    portfolio.exit_sessions["AAA"] = fill_session - (caps.reentry_sessions - 1)

    kept, notes = m.guard_orders(
        [buy_order],
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
    check(len(kept) == 0 and any("reentry wait blocked buy" in note for note in notes), "buy blocked by reentry_sessions cap")
_pass, _err, _stack = True, None, None
try:
    asyncio.run(_wce_main())
except BaseException as e:
    _stack = "".join(traceback.format_exception(e))
    _pass, _err = False, (type(e).__name__ + ": " + str(e))[:300] + " | " + "".join(traceback.format_tb(e.__traceback__)[-1:]).strip().replace(chr(10), " ")[:200]
sys.setprofile(None)
print("__WCE_RESULTS__" + json.dumps(dict(pass_=_pass, error=_err, stack=_stack, recorded=_rec, target_ran=(_wce_hits[0] > 0) if _wce_trace else None), default=repr))
