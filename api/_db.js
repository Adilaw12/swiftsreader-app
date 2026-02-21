// api/_db.js — shared Postgres pool (replaces @vercel/postgres)
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
});

/**
 * Tagged template literal query — same API as @vercel/postgres:
 *   const r = await sql`SELECT * FROM users WHERE email = ${email}`
 *   r.rows[0]
 */
export async function sql(strings, ...values) {
  let text = '';
  const params = [];
  strings.forEach((str, i) => {
    text += str;
    if (i < values.length) {
      params.push(values[i]);
      text += `$${params.length}`;
    }
  });
  return pool.query(text, params);
}
