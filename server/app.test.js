const assert = require('node:assert/strict');
const { once } = require('node:events');
const { afterEach, beforeEach, describe, it } = require('node:test');

const { createApp } = require('./app');

describe('logistics API', () => {
  let server;
  let baseUrl;
  let execute;
  let locationQuery;

  beforeEach(async () => {
    locationQuery = '';
    execute = async (sql) => {
      if (sql.startsWith('INSERT INTO delivery_records')) {
        return [{ insertId: 17, affectedRows: 1 }, []];
      }
      if (sql.includes('AS price')) {
        return [[{ price: 52000 }], []];
      }
      if (sql.startsWith('DELETE FROM delivery_records WHERE')) {
        return [{ affectedRows: 1 }, []];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    };

    const pool = {
      query: async (sql) => {
        if (sql.includes('FROM locations l')) {
          locationQuery = sql;
          const location = {
            id: 1,
            provinceName: 'Example Province',
            locationName: 'Example Town',
            fullLabel: 'Example Town, Example Province',
            rate40_45: 46000,
            rate50: 48000,
            rate55_60: 52000,
          };
          const duplicate = {
            ...location,
            id: 2,
            fullLabel: 'Example Town, Example Province — Route Two',
          };
          return [Array.from({ length: 40 }, (_, index) => (index === 1 ? duplicate : location)), []];
        }
        if (sql.includes('FROM delivery_records')) {
          return [[{ id: 17, drNumber: 'DR-001' }], []];
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      },
      execute: (...args) => execute(...args),
    };

    server = createApp(pool).listen(0, '127.0.0.1');
    await once(server, 'listening');
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterEach(async () => {
    server.close();
    await once(server, 'close');
  });

  it('returns destinations and database rates', async () => {
    const locations = await fetch(`${baseUrl}/api/locations`, {
      headers: { 'accept-encoding': 'gzip' },
    });
    const rates = await fetch(`${baseUrl}/api/rates?locationId=1&postLength=55`);

    assert.equal(locations.status, 200);
    assert.equal(locations.headers.get('content-encoding'), 'gzip');
    assert.equal(locations.headers.get('cache-control'), 'private, max-age=300');
    const destinations = await locations.json();
    assert.deepEqual(destinations[0], {
      id: 1,
      provinceName: 'Example Province',
      locationName: 'Example Town',
      fullLabel: 'Example Town, Example Province',
      rate40_45: 46000,
      rate50: 48000,
      rate55_60: 52000,
    });
    assert.equal(destinations[1].fullLabel, 'Example Town, Example Province — Route Two');
    assert.match(locationQuery, /COUNT\(\*\) OVER \(PARTITION BY l\.province_id, l\.location_name\)/);
    assert.equal(rates.status, 200);
    assert.deepEqual(await rates.json(), { price: 52000 });
  });

  it('persists validated deliveries with a single database insert-select', async () => {
    const calls = [];
    execute = async (sql, params) => {
      calls.push({ sql, params });
      if (sql.startsWith('INSERT INTO delivery_records')) {
        return [{ insertId: 17, affectedRows: 1 }, []];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    };

    const response = await fetch(`${baseUrl}/api/deliveries`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        date: '2026-11-09',
        drNumber: 'DR-001',
        truckPlate: 'ABC 1234',
        customerName: 'Example Customer',
        locationId: 1,
        postLength: 55,
      }),
    });

    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), {
      id: 17,
      date: '2026-11-09',
      drNumber: 'DR-001',
      truckPlate: 'ABC 1234',
      customerName: 'Example Customer',
      locationId: 1,
      postLength: 55,
    });
    assert.equal(calls.length, 1);
    assert.match(calls[0].sql, /CONCAT\(l\.location_name, ', ', l\.province_name/);
    assert.match(calls[0].sql, /duplicate_location/);
    assert.match(calls[0].sql, /rate_extendible_55_60ft/);
    assert.deepEqual(calls[0].params, ['2026-11-09', 'DR-001', 'ABC 1234', 'Example Customer', 55, 1]);
  });

  it('rejects invalid lengths without querying MySQL', async () => {
    const response = await fetch(`${baseUrl}/api/rates?locationId=1&postLength=41`);

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'A valid location and post length are required.' });
  });
});
