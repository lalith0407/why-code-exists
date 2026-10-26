import asyncio, importlib, json, os, sys, types, traceback
_root = "/workspace/open-agent/why-code-exists/artifacts/m11-v17b/heldout4-stop-minhold/app-patched"
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

    caps = RiskCaps(min_hold_sessions=5, swing_hold_sessions=20, swing_trades_per_quarter=2, reentry_sessions=5, drawdown_halt_high_risk=-0.20)

    book = Portfolio(cash=1000.0, peak_equity=1000.0)
    book.positions["AAA"] = Lot(qty=10, cost=100, entry_session=10)
    book.swing_exits = [date(2024, 3, 1), date(2024, 3, 2)]
    book.exit_sessions = {"AAA": 5}

    meta = {"AAA": m.NameMeta(ticker="AAA", sleeve="core", sector="Information Technology", price=10)}

    fill_session = 12
    fill_date = date(2024, 3, 4)
    prices = {"AAA": 10}

    equity = 700

    # Orders for reproduction test include a stop-loss sell with reason 'stop' that should not be blocked by min_hold
    orders_repro = [
        OrderIntent(ticker="AAA", side="sell", notional=300, reason="stop"),  # stop-loss sell
        OrderIntent(ticker="AAA", side="buy", notional=300, reason="rebalance"),
    ]

    # Orders for decoy test 1: discretionary sell blocked by min_hold
    orders_decoy1 = [
        OrderIntent(ticker="AAA", side="sell", notional=300, reason="rebalance"),  # discretionary sell
    ]

    # Orders for decoy test 2: cap_reduction sell allowed despite min_hold
    orders_decoy2 = [
        OrderIntent(ticker="AAA", side="sell", notional=300, reason="cap_reduction"),  # forced sell allowed
    ]
    arranged()
    out, notes = m.guard_orders(
        orders_repro,
        book,
        meta,
        caps,
        fill_session=fill_session,
        fill_date=fill_date,
        prices=prices,
        equity=equity,
    )
    record("kept", [(o.ticker, o.side, o.notional, o.reason) for o in out])
    record("notes", notes)
    harm_observed(len(out) == 0 and any("min hold blocked sell" in note for note in notes), "stop-loss sell was blocked by min_hold and dropped")
_pass, _err, _stack = True, None, None
try:
    asyncio.run(_wce_main())
except BaseException as e:
    _stack = "".join(traceback.format_exception(e))
    _pass, _err = False, (type(e).__name__ + ": " + str(e))[:300] + " | " + "".join(traceback.format_tb(e.__traceback__)[-1:]).strip().replace(chr(10), " ")[:200]
sys.setprofile(None)
print("__WCE_RESULTS__" + json.dumps(dict(pass_=_pass, error=_err, stack=_stack, recorded=_rec, target_ran=(_wce_hits[0] > 0) if _wce_trace else None), default=repr))
