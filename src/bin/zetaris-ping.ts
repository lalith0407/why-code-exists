#!/usr/bin/env node
/**
 * npm run zetaris:ping — prints ONLY success/fail + row count. Never password.
 */
import { ping, probeJdbcPort, loadConnection } from "../evidence/zetaris.js";

async function main() {
  let jdbcNote = "";
  try {
    const conn = loadConnection();
    const probe = await probeJdbcPort(conn);
    jdbcNote = probe.detail;
  } catch {
    /* ignore probe errors for ping summary */
  }

  const result = await ping();
  if (result.ok) {
    console.log(`PASS zetaris:ping rows=${result.rowCount} via=${result.via}`);
    if (jdbcNote) console.log(`note: ${jdbcNote}`);
    process.exit(0);
  }
  console.log(`FAIL zetaris:ping rows=${result.rowCount} via=${result.via}`);
  if (result.error) console.log(`error: ${result.error}`);
  if (jdbcNote) console.log(`note: ${jdbcNote}`);
  process.exit(1);
}

main().catch((e) => {
  console.log(`FAIL zetaris:ping`);
  console.log(`error: ${(e as Error).message}`);
  process.exit(1);
});
