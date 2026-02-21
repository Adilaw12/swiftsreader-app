// api/healthcheck.js — diagnostic endpoint
import { sql } from './_db.js';

export default async function handler(req, res) {
  const checks = {};

  checks.hasPostgresUrl = !!process.env.DATABASE_URL;
  checks.hasJwtSecret = !!process.env.JWT_SECRET;
  checks.nodeVersion = process.version;

  try {
    const r = await sql`SELECT 1 as ok`;
    checks.dbConnected = r.rows[0]?.ok === 1;
    const tables = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public'`;
    checks.tables = tables.rows.map(r => r.table_name);
  } catch (e) {
    checks.dbError = e.message;
  }

  return res.json(checks);
}
