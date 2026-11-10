# MySQL setup

1. Start MySQL or MariaDB and create/select the `tsp_hauling` database.
2. Import the supplied `tsp_hauling_rates_mysql.sql` file into that database.
   The file's `CREATE DATABASE` and `USE` statements are commented out, so a
   database must already be selected before importing it.
3. Run [`delivery_records.sql`](./delivery_records.sql) in the same database.
   This adds the table used to persist dispatch records.
4. Copy the project-root `.env.example` to `.env` and set the MySQL host, port,
   database, username, and password. Keep `.env` private.
5. In separate terminals, run `npm run api` and `npm start`.

The Angular dev-server proxies `/api` requests to the local API. Verify the
connection at `http://127.0.0.1:3000/api/health`. Keep the API on a trusted
network; it is intended for local development and does not provide user
authentication.
