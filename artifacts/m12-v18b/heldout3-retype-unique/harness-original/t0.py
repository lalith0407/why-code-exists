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

    # Helper to count rows with a given email
    def count_email_rows(email: str) -> int:
        cur = conn.execute("SELECT COUNT(*) FROM customers WHERE email = ?", (email,))
        return cur.fetchone()[0]

    # Helper to get index names on a table
    def get_indexes(table: str) -> list[str]:
        cur = conn.execute(f"PRAGMA index_list({table})")
        return [row[1] for row in cur.fetchall()]

    # Setup initial customers table with unique index on email
    conn.execute("CREATE TABLE customers (id INTEGER PRIMARY KEY, email TEXT NOT NULL, tier TEXT NOT NULL)")
    conn.execute("CREATE UNIQUE INDEX unique_email ON customers(email)")
    conn.execute("INSERT INTO customers (email, tier) VALUES ('ana@example.com', 'silver')")
    conn.commit()
    arranged()
    # Run the ALTER TABLE ALTER COLUMN TYPE command that triggers _retype_column_sqlite
    sql = 'ALTER TABLE customers ALTER COLUMN tier SET DATA TYPE BIGINT'
    m._sqlite_script(conn, sql)

    # Check indexes on customers table after retype
    indexes = await get_indexes('customers')
    record("indexes", indexes)

    # Insert a duplicate email row, which should fail if unique index is preserved
    err = None
    try:
        conn.execute("INSERT INTO customers (email, tier) VALUES ('ana@example.com', 2)")
        conn.commit()
    except Exception as e:
        err = e
    record("insert_error", str(err) if err else None)

    # Count rows with that email
    duplicate_rows = await count_email_rows('ana@example.com')
    record("duplicate_rows", duplicate_rows)

    # Harm observed if unique index lost and duplicate rows allowed
    harm_observed(len(indexes) == 0, "unique index on email lost after ALTER COLUMN TYPE")
    harm_observed(duplicate_rows == 2, "duplicate rows with same email accepted")
_pass, _err, _stack = True, None, None
try:
    asyncio.run(_wce_main())
except BaseException as e:
    _stack = "".join(traceback.format_exception(e))
    _pass, _err = False, (type(e).__name__ + ": " + str(e))[:300] + " | " + "".join(traceback.format_tb(e.__traceback__)[-1:]).strip().replace(chr(10), " ")[:200]
sys.setprofile(None)
print("__WCE_RESULTS__" + json.dumps(dict(pass_=_pass, error=_err, stack=_stack, recorded=_rec, target_ran=(_wce_hits[0] > 0) if _wce_trace else None), default=repr))
