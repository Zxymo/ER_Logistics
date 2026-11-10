const express = require('express');
const compression = require('compression');

const RATE_COLUMNS = new Map([
  [40, 'rate_regular_40_45ft'],
  [45, 'rate_regular_40_45ft'],
  [50, 'rate_extendible_50ft'],
  [55, 'rate_extendible_55_60ft'],
  [60, 'rate_extendible_55_60ft'],
]);

function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function trimmedString(value, maxLength) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength ? value.trim() : null;
}

function createApp(pool) {
  const app = express();
  app.use(compression());
  app.use(express.json({ limit: '16kb' }));

  app.get('/api/health', async (_request, response) => {
    await pool.query('SELECT 1');
    response.json({ status: 'ok' });
  });

  app.get('/api/locations', async (_request, response) => {
    response.set('Cache-Control', 'private, max-age=300');
    const [locations] = await pool.query(
      `SELECT l.id, l.province_name AS provinceName,
              l.location_name AS locationName,
              CONCAT(l.location_name, ', ', l.province_name,
                     CASE WHEN COUNT(*) OVER (PARTITION BY l.province_id, l.location_name) > 1
                          THEN CONCAT(' — ', r.route_name) ELSE '' END) AS fullLabel,
              r.rate_regular_40_45ft AS rate40_45,
              r.rate_extendible_50ft AS rate50,
              r.rate_extendible_55_60ft AS rate55_60
       FROM locations l
       JOIN hauling_routes r ON r.id = l.route_id
       ORDER BY l.province_name, l.location_name, l.id`,
    );
    response.json(locations);
  });

  app.get('/api/rates', async (request, response) => {
    const locationId = Number(request.query.locationId);
    const postLength = Number(request.query.postLength);
    const rateColumn = RATE_COLUMNS.get(postLength);

    if (!Number.isSafeInteger(locationId) || locationId <= 0 || !rateColumn) {
      response.status(400).json({ error: 'A valid location and post length are required.' });
      return;
    }

    const [rows] = await pool.execute(
      `SELECT r.${rateColumn} AS price
       FROM locations l
       JOIN hauling_routes r ON r.id = l.route_id
       WHERE l.id = ?`,
      [locationId],
    );
    response.json({ price: rows[0]?.price ?? null });
  });

  app.get('/api/deliveries', async (_request, response) => {
    const [deliveries] = await pool.query(
      `SELECT d.id, DATE_FORMAT(d.delivery_date, '%Y-%m-%d') AS date,
              d.dr_number AS drNumber, d.truck_plate AS truckPlate,
              d.customer_name AS customerName, d.location_id AS locationId,
              CASE WHEN l.id IS NULL THEN d.destination
                   ELSE CONCAT(l.location_name, ', ', l.province_name,
                     CASE WHEN (SELECT COUNT(*)
                                FROM locations duplicate_location
                                WHERE duplicate_location.province_id = l.province_id
                                  AND duplicate_location.location_name = l.location_name) > 1
                          THEN CONCAT(' — ', r.route_name) ELSE '' END)
              END AS destination,
              d.post_length AS postLength, d.price_php AS price
       FROM delivery_records d
       LEFT JOIN locations l ON l.id = d.location_id
       LEFT JOIN hauling_routes r ON r.id = l.route_id
       ORDER BY d.created_at DESC, d.id DESC`,
    );
    response.json(deliveries);
  });

  app.post('/api/deliveries', async (request, response) => {
    const body = request.body;
    const drNumber = trimmedString(body?.drNumber, 50);
    const truckPlate = trimmedString(body?.truckPlate, 20);
    const customerName = trimmedString(body?.customerName, 191);
    const locationId = Number(body?.locationId);
    const postLength = Number(body?.postLength);
    const rateColumn = RATE_COLUMNS.get(postLength);

    if (
      !isValidDate(body?.date) ||
      !drNumber ||
      !truckPlate ||
      !customerName ||
      !Number.isSafeInteger(locationId) ||
      locationId <= 0 ||
      !rateColumn
    ) {
      response.status(400).json({ error: 'Valid delivery details are required.' });
      return;
    }

    const [result] = await pool.execute(
      `INSERT INTO delivery_records
         (delivery_date, dr_number, truck_plate, customer_name, location_id, destination, post_length, price_php)
       SELECT ?, ?, ?, ?, l.id,
              CONCAT(l.location_name, ', ', l.province_name,
                     CASE WHEN (SELECT COUNT(*)
                                FROM locations duplicate_location
                                WHERE duplicate_location.province_id = l.province_id
                                  AND duplicate_location.location_name = l.location_name) > 1
                          THEN CONCAT(' — ', r.route_name) ELSE '' END),
              ?, r.${rateColumn}
       FROM locations l
       JOIN hauling_routes r ON r.id = l.route_id
       WHERE l.id = ?`,
      [body.date, drNumber, truckPlate, customerName, postLength, locationId],
    );

    if (result.affectedRows === 0) {
      response.status(404).json({ error: 'The selected destination was not found.' });
      return;
    }

    response.status(201).json({
      id: result.insertId,
      date: body.date,
      drNumber,
      truckPlate,
      customerName,
      locationId,
      postLength,
    });
  });

  app.delete('/api/deliveries/:id', async (request, response) => {
    const id = Number(request.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      response.status(400).json({ error: 'A valid delivery id is required.' });
      return;
    }

    const [result] = await pool.execute('DELETE FROM delivery_records WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      response.status(404).json({ error: 'Delivery record not found.' });
      return;
    }

    response.status(204).end();
  });

  app.delete('/api/deliveries', async (_request, response) => {
    await pool.query('DELETE FROM delivery_records');
    response.status(204).end();
  });

  app.use((error, _request, response, _next) => {
    if (error.type === 'entity.parse.failed') {
      response.status(400).json({ error: 'The request body must be valid JSON.' });
      return;
    }

    console.error('API request failed:', error);
    response.status(500).json({ error: 'The database request failed.' });
  });

  return app;
}

module.exports = { createApp };
