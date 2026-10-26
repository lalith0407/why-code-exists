import asyncio, importlib, json, os, sys, types, traceback
_root = "/workspace/open-agent/why-code-exists/artifacts/m12-v18b/heldout4-stop-minhold/app-patched"
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
    p = app("src/ta/sim/portfolio.py")
    c = app("src/ta/config.py")

    RiskCaps = m.RiskCaps
    NameMeta = m.NameMeta
    OrderIntent = m.OrderIntent
    Portfolio = p.Portfolio
    Lot = p.Lot

    # Create a portfolio with a position for AAA with entry_session 10
    portfolio = Portfolio(cash=10000.0)
    portfolio.positions["AAA"] = Lot(qty=100, cost=100, entry_session=10)
    portfolio.peak_equity = 15000.0
    portfolio.swing_exits = []
    portfolio.exit_sessions = {}

    # Create RiskCaps with min_hold_sessions=5
    caps = RiskCaps(min_hold_sessions=5)

    # Create meta for AAA
    meta = {"AAA": NameMeta(ticker="AAA", sleeve="core", sector="Information Technology", price=100.0)}

    # Setup prices dict
    prices = {"AAA": 70.0}  # Price down 30% from cost 100

    # Setup fill_session and fill_date
    fill_session = 14  # Current session
    fill_date = date(2024, 3, 4)

    # Current equity is 70 * 100 + cash = 7000 + 10000 = 17000 (simulate)
    equity = 17000.0

    # Prepare orders list
    buy_order = OrderIntent(ticker="AAA", side="buy", notional=1000.0, reason="rebalance", sleeve="core")
    sell_order = OrderIntent(ticker="AAA", side="sell", notional=1000.0, reason="rebalance", sleeve="core")
    orders = [buy_order, sell_order]
    arranged()
    kept_orders, notes = m.guard_orders(
        orders,
        portfolio,
        meta,
        caps,
        fill_session=fill_session,
        fill_date=fill_date,
        prices=prices,
        equity=equity,
    )
    record("kept_orders", [(o.ticker, o.side, o.reason) for o in kept_orders])
    record("notes", notes)
    check(len(kept_orders) == 1 and kept_orders[0].side == "buy", "day trade sell blocked when buy exists")
_pass, _err, _stack = True, None, None
try:
    asyncio.run(_wce_main())
except BaseException as e:
    _stack = "".join(traceback.format_exception(e))
    _pass, _err = False, (type(e).__name__ + ": " + str(e))[:300] + " | " + "".join(traceback.format_tb(e.__traceback__)[-1:]).strip().replace(chr(10), " ")[:200]
sys.setprofile(None)
print("__WCE_RESULTS__" + json.dumps(dict(pass_=_pass, error=_err, stack=_stack, recorded=_rec, target_ran=(_wce_hits[0] > 0) if _wce_trace else None), default=repr))
