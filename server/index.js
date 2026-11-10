require('dotenv').config();

const { createPool } = require('mysql2/promise');
const { createApp } = require('./app');

const port = Number(process.env.API_PORT || 3000);
const host = process.env.API_HOST || '127.0.0.1';

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('API_PORT must be a valid TCP port.');
}

const pool = createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.DB_NAME || 'tsp_hauling',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,
});

async function start() {
  await pool.query('SELECT 1');
  const server = createApp(pool).listen(port, host, () => {
    console.info(`ER Logistics API listening on http://${host}:${port}`);
  });

  const shutdown = () => {
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

start().catch(async (error) => {
  console.error('Could not connect to MySQL. Check the database service and .env settings.', error);
  await pool.end();
  process.exitCode = 1;
});
