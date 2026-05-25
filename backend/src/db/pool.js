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
});

pool.on('error', (err) => {
  console.error('Unexpected DB client error', err);
});

module.exports = {
  query:   (text, params) => pool.query(text, params),
  connect: ()             => pool.connect(),
  pool,
};
