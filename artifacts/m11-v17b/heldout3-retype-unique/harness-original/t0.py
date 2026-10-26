import asyncio, importlib, json, os, sys, types, traceback
_root = "/workspace/open-agent/heldout3-src/blast-radius-hardened"
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
_wce_trace = ["world/db.py","_sqlite_script"]
_wce_hits = [0]
if _wce_trace:
    def _wce_prof(fr, ev, arg):
        if ev == "call" and fr.f_code.co_name == _wce_trace[1] and fr.f_code.co_filename.replace(os.sep, "/").endswith(_wce_trace[0]):
            _wce_hits[0] += 1
    sys.setprofile(_wce_prof)
    import threading; threading.setprofile(_wce_prof)
async def _wce_main():
    m = app("world/db.py")
    import sqlite3
    conn = sqlite3.connect(":memory:")
    conn.execute("CREATE TABLE customers (id INTEGER PRIMARY KEY, email TEXT UNIQUE, tier INTEGER)")
    conn.execute("INSERT INTO customers (email, tier) VALUES (?, ?)", ("ana@example.com", 1))
    conn.commit()
    arranged()
    m._sqlite_script(conn, 'ALTER TABLE customers ALTER COLUMN tier SET DATA TYPE BIGINT')
    conn.execute("INSERT INTO customers (email, tier) VALUES (?, ?)", ("ana@example.com", 2))
    cursor = conn.execute("SELECT email FROM customers WHERE email = ?", ("ana@example.com",))
    rows = cursor.fetchall()
    record("rows", rows)
    harm_observed(len(rows) == 2, "duplicate rows with same email allowed after ALTER COLUMN type")
_pass, _err, _stack = True, None, None
try:
    asyncio.run(_wce_main())
except BaseException as e:
    _stack = "".join(traceback.format_exception(e))
    _pass, _err = False, (type(e).__name__ + ": " + str(e))[:300] + " | " + "".join(traceback.format_tb(e.__traceback__)[-1:]).strip().replace(chr(10), " ")[:200]
sys.setprofile(None)
print("__WCE_RESULTS__" + json.dumps(dict(pass_=_pass, error=_err, stack=_stack, recorded=_rec, target_ran=(_wce_hits[0] > 0) if _wce_trace else None), default=repr))
