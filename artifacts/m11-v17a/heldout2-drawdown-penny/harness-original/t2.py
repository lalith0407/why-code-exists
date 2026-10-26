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

    m_caps = app("src/ta/harness/caps.py")
    m_models = app("src/ta/models.py")
    m_portfolio = app("src/ta/sim/portfolio.py")
    m_config = app("src/ta/config.py")

    # Create a portfolio with peak_equity > 0 and current equity to simulate drawdown
    portfolio = m_portfolio.Portfolio(cash=10000.0)
    portfolio.peak_equity = 10000.0

    # Add a position in a high-risk sleeve stock (penny stock) with entry_session far enough in the past
    portfolio.positions["FALN"] = m_portfolio.Lot(qty=1000, cost=3000, entry_session=10)

    # No swing exits for simplicity
    portfolio.swing_exits = []

    # No exit sessions for the ticker
    portfolio.exit_sessions = {}

    # Setup RiskCaps with drawdown_halt_high_risk at -0.20 (20%)
    caps = m_config.RiskCaps()

    # Create an OrderIntent for a buy of FALN at $2.10 (penny stock, high-risk sleeve)
    order = m_models.OrderIntent(ticker="FALN", side="buy", notional=2100.0, sleeve="high_risk", reason="rebalance")

    # Prices dictionary with price for FALN
    prices = {"FALN": 2.10}

    # fill_session and fill_date
    fill_session = 20
    fill_date = date(2024, 3, 4)

    # Current equity is 7000, which is a 30% drawdown from peak 10000
    equity = 7000.0

    # Prepare orders list
    orders = [order]

    # Setup meta dictionary with NameMeta for FALN
    meta = {"FALN": m_caps.NameMeta(ticker="FALN", sleeve="high_risk", sector="Technology", price=2.10)}
    arranged()
    # Create a buy order with sleeve not high-risk
    non_high_risk_order = m_models.OrderIntent(ticker="FALN", side="buy", notional=2100.0, sleeve="core", reason="rebalance")
    orders_non_high_risk = [non_high_risk_order]
    out, notes = m_caps.guard_orders(
        orders_non_high_risk,
        portfolio,
        meta,
        caps,
        fill_session=fill_session,
        fill_date=fill_date,
        prices=prices,
        equity=equity,
    )
    record("kept_orders", [o.dict() for o in out])
    record("notes", notes)
    check(len(out) == 1 and not any("high-risk buy halted" in note for note in notes), "non high-risk buy allowed despite drawdown")
_pass, _err, _stack = True, None, None
try:
    asyncio.run(_wce_main())
except BaseException as e:
    _stack = "".join(traceback.format_exception(e))
    _pass, _err = False, (type(e).__name__ + ": " + str(e))[:300] + " | " + "".join(traceback.format_tb(e.__traceback__)[-1:]).strip().replace(chr(10), " ")[:200]
sys.setprofile(None)
print("__WCE_RESULTS__" + json.dumps(dict(pass_=_pass, error=_err, stack=_stack, recorded=_rec, target_ran=(_wce_hits[0] > 0) if _wce_trace else None), default=repr))
