const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.POSTGRES_HOST || 'postgres',
  port:     parseInt(process.env.POSTGRES_PORT || '5432', 10),
  database: process.env.POSTGRES_DB,
  user:     process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  max: 20,
  idleTimeoutMillis:       30000,
  connectionTimeoutMillis: 2000,
  // Hard ceiling per query. Anything above this gets aborted by postgres
  // with `canceling statement due to statement timeout`. Protects against
  // runaway analytics queries holding a backend handler indefinitely.
  // The nginx proxy_read_timeout is 120s — this stays well below that.
  statement_timeout: 15000,
});

pool.on('error', (err) => {
  console.error('Unexpected DB client error', err);
});

module.exports = {
  query:   (text, params) => pool.query(text, params),
  connect: ()             => pool.connect(),
  pool,
};
