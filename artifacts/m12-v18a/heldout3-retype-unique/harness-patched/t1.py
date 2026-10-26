import asyncio, importlib, json, os, sys, types, traceback
_root = "/workspace/open-agent/why-code-exists/artifacts/m12-v18a/heldout3-retype-unique/app-patched"
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

    # Helper to create a table with a unique index on email
    def create_customers_with_unique_email(conn):
        conn.execute("CREATE TABLE customers (id INTEGER PRIMARY KEY, email TEXT NOT NULL, tier TEXT);")
        conn.execute("CREATE UNIQUE INDEX unique_email ON customers(email);")
        conn.execute("INSERT INTO customers (email, tier) VALUES ('ana@example.com', 'silver');")
        conn.commit()

    # Helper to count rows with a given email
    def count_email(conn, email):
        cur = conn.execute("SELECT COUNT(*) FROM customers WHERE email = ?", (email,))
        return cur.fetchone()[0]

    # Helper to check if unique index exists
    def unique_index_exists(conn, index_name):
        cur = conn.execute("SELECT name FROM sqlite_master WHERE type='index' AND name=?", (index_name,))
        return cur.fetchone() is not None

    create_customers_with_unique_email(conn)
    arranged()
    # Insert some rows
    conn.execute("INSERT INTO customers (email, tier) VALUES ('bob@example.com', 'gold');")
    conn.commit()

    # Run TRUNCATE TABLE command
    m._sqlite_script(conn, 'TRUNCATE TABLE customers;')

    # Check that table is empty
    count = conn.execute('SELECT COUNT(*) FROM customers').fetchone()[0]
    record('count', count)
    check(count == 0, 'table is empty after TRUNCATE TABLE')
_pass, _err, _stack = True, None, None
try:
    asyncio.run(_wce_main())
except BaseException as e:
    _stack = "".join(traceback.format_exception(e))
    _pass, _err = False, (type(e).__name__ + ": " + str(e))[:300] + " | " + "".join(traceback.format_tb(e.__traceback__)[-1:]).strip().replace(chr(10), " ")[:200]
sys.setprofile(None)
print("__WCE_RESULTS__" + json.dumps(dict(pass_=_pass, error=_err, stack=_stack, recorded=_rec, target_ran=(_wce_hits[0] > 0) if _wce_trace else None), default=repr))
