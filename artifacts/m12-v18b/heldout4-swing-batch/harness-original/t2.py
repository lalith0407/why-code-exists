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
    from src.ta.harness.caps import guard_orders
    from src.ta.models import OrderIntent
    from src.ta.sim.portfolio import Portfolio, Lot
    from src.ta.harness.caps import RiskCaps, NameMeta

    caps = RiskCaps(swing_trades_per_quarter=2, swing_hold_sessions=20, min_hold_sessions=5, reentry_sessions=5)

    # Setup a portfolio with multiple swing exits on the same session date
    portfolio = Portfolio(cash=10000.0)
    portfolio.peak_equity = 10000.0

    # We simulate 3 swing exits in the same quarter, two of which are on the same session date
    # Dates in Q1 2024
    portfolio.swing_exits = [date(2024, 1, 15), date(2024, 1, 15), date(2024, 2, 10)]

    # Positions with entry sessions to test swing hold and min hold
    portfolio.positions["AAA"] = Lot(qty=10, cost=100, entry_session=10)
    portfolio.positions["BBB"] = Lot(qty=10, cost=100, entry_session=10)

    # Exit sessions for reentry test
    portfolio.exit_sessions["CCC"] = 5

    # Prices for tickers
    prices = {"AAA": 100.0, "BBB": 100.0, "CCC": 100.0}

    # Orders to test swing trade cap enforcement
    orders = [
        OrderIntent(ticker="AAA", side="sell", notional=1000, reason="rebalance"),  # Should be blocked by swing trade cap
        OrderIntent(ticker="BBB", side="sell", notional=1000, reason="rebalance"),  # Should be blocked by swing trade cap
        OrderIntent(ticker="CCC", side="buy", notional=1000, reason="rebalance"),   # Should be allowed
    ]

    fill_session = 15
    fill_date = date(2024, 2, 15)
    equity = 10000.0

    meta = {
        "AAA": NameMeta(ticker="AAA", sleeve="core", sector="Tech", price=100),
        "BBB": NameMeta(ticker="BBB", sleeve="core", sector="Tech", price=100),
        "CCC": NameMeta(ticker="CCC", sleeve="core", sector="Tech", price=100),
    }

    # Decoy orders for other tests
    orders_decoy = [
        OrderIntent(ticker="DDD", side="buy", notional=1000, reason="rebalance"),
        OrderIntent(ticker="EEE", side="sell", notional=1000, reason="cap_reduction"),
    ]

    portfolio.positions["EEE"] = Lot(qty=10, cost=100, entry_session=10)
    arranged()
    buy_sell_orders = [
        OrderIntent(ticker='FFF', side='buy', notional=1000, reason='rebalance'),
        OrderIntent(ticker='FFF', side='sell', notional=1000, reason='rebalance'),
    ]
    meta['FFF'] = NameMeta(ticker='FFF', sleeve='core', sector='Tech', price=100)
    kept, notes = guard_orders(
        buy_sell_orders, portfolio, meta, caps,
        fill_session=fill_session, fill_date=fill_date, prices={'FFF': 100.0}, equity=equity
    )
    record('kept_orders', [(o.ticker, o.side) for o in kept])
    record('notes_day_trade', notes)
    check(len(kept) == 1 and kept[0].side == 'buy', 'day trade sell blocked, buy allowed')
_pass, _err, _stack = True, None, None
try:
    asyncio.run(_wce_main())
except BaseException as e:
    _stack = "".join(traceback.format_exception(e))
    _pass, _err = False, (type(e).__name__ + ": " + str(e))[:300] + " | " + "".join(traceback.format_tb(e.__traceback__)[-1:]).strip().replace(chr(10), " ")[:200]
sys.setprofile(None)
print("__WCE_RESULTS__" + json.dumps(dict(pass_=_pass, error=_err, stack=_stack, recorded=_rec, target_ran=(_wce_hits[0] > 0) if _wce_trace else None), default=repr))
