// Contract tests: the same requests against both data backends must give the same answers.
// Run with both backends up:  node --test 'contract/*.test.mjs'
// DOTNET_API_URL and NODE_API_URL default to the ports from compose.yaml.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

const backends = {
  dotnet: process.env.DOTNET_API_URL ?? 'http://127.0.0.1:8081',
  node: process.env.NODE_API_URL ?? 'http://127.0.0.1:8082',
};

async function call(base, path, body) {
  const response = await fetch(base + path, body === undefined ? undefined : {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('json') ? await response.json() : Buffer.from(await response.arrayBuffer());
  return { status: response.status, backend: response.headers.get('x-data-backend'), payload };
}

/** Both backends answer the same request; returns the .NET answer after asserting equality. */
async function same(path, body) {
  const [a, b] = await Promise.all([call(backends.dotnet, path, body), call(backends.node, path, body)]);
  assert.equal(a.backend, 'dotnet');
  assert.equal(b.backend, 'node');
  assert.equal(a.status, b.status, `status for ${path}`);
  if (a.status >= 400) {
    // Problem details: same status, title and message; traceId and type URL may differ.
    assert.equal(a.payload.title, b.payload.title);
    assert.equal(a.payload.detail, b.payload.detail);
  } else {
    assert.deepEqual(b.payload, a.payload);
  }
  return a;
}

const aggregate = (body) => same('/api/sales/aggregate', body);

describe('semantic layer', () => {
  test('schema lists the same dimensions, values and limits', async () => {
    const { payload } = await same('/api/schema');
    assert.deepEqual(payload.dimensions.find((d) => d.name === 'channel').values, ['Online', 'Reseller']);
  });

  test('grand total', async () => {
    const { payload } = await aggregate({ measures: ['revenue', 'cost', 'margin', 'quantity', 'orders'] });
    assert.deepEqual(payload.rows, [{ revenue: 109809274.2, cost: 97257907.95, margin: 12551366.25, quantity: 274776, orders: 31455 }]);
  });

  test('every measure at once', async () => {
    const { payload } = await same('/api/schema');
    const { payload: total } = await aggregate({ measures: payload.measures.map((m) => m.name) });
    assert.equal(total.rows[0].discount, 527507.93);
    assert.equal(total.rows[0].freight, 2745235.52);
  });

  test('discount per promotion type: only promotions grant one', async () => {
    const { payload } = await aggregate({ measures: ['discount', 'revenue'], groupBy: ['promotionType'] });
    assert.equal(payload.rows.find((r) => r.promotionType === 'No Discount').discount, 0);
    assert.ok(payload.rows.find((r) => r.promotionType === 'Volume Discount').discount > 0);
  });

  test('a nullable numeric dimension groups and filters: average order value per reseller size', async () => {
    const { payload } = await aggregate({
      measures: ['averageOrderValue', 'orders'],
      groupBy: ['resellerAnnualRevenue'],
      filters: [{ dimension: 'resellerAnnualRevenue', operator: 'gte', values: [100000] }],
    });
    assert.deepEqual(payload.rows.map((r) => r.resellerAnnualRevenue).sort((a, b) => a - b), [100000, 150000, 300000]);
  });

  test('average order value is rounded alike for every product', () =>
    aggregate({ measures: ['averageOrderValue'], groupBy: ['product'], limit: 1000 }));

  test('colour and product line', () => aggregate({ measures: ['revenue', 'freight'], groupBy: ['productLine', 'color'] }));

  test('revenue per channel', async () => {
    const { payload } = await aggregate({ measures: ['revenue'], groupBy: ['channel'] });
    assert.deepEqual(payload.rows, [
      { channel: 'Reseller', revenue: 80450596.98 },
      { channel: 'Online', revenue: 29358677.22 },
    ]);
  });

  test('time series stays chronological', async () => {
    await aggregate({ measures: ['revenue', 'orders'], groupBy: ['year', 'quarter'] });
  });

  test('three dimensions with filters and explicit order', async () => {
    await aggregate({
      measures: ['margin', 'quantity'],
      groupBy: ['country', 'productCategory', 'year'],
      filters: [
        { dimension: 'territoryGroup', operator: 'eq', values: ['Europe'] },
        { dimension: 'year', operator: 'gte', values: [2012] },
        { dimension: 'year', operator: 'lte', values: [2013] },
      ],
      orderBy: { field: 'margin', direction: 'desc' },
    });
  });

  test('top resellers in Germany, online sales as the empty reseller', async () => {
    const { payload } = await aggregate({
      measures: ['revenue'],
      groupBy: ['reseller'],
      filters: [{ dimension: 'country', operator: 'in', values: ['Germany'] }],
      limit: 5,
    });
    assert.equal(payload.truncated, true);
    assert.equal(payload.rows[0].reseller, null);
  });

  test('ascending order by a nullable dimension puts the empty group first', async () => {
    await aggregate({ measures: ['orders'], groupBy: ['resellerBusinessType'], orderBy: { field: 'resellerBusinessType', direction: 'asc' } });
  });

  test('every product in one answer', async () => {
    const { payload } = await aggregate({ measures: ['revenue', 'quantity'], groupBy: ['product'], limit: 1000 });
    assert.equal(payload.truncated, false);
  });
});

describe('requests outside the semantic layer', () => {
  test('a person is not a dimension', async () => {
    const { status, payload } = await aggregate({ measures: ['revenue'], groupBy: ['salesRep'] });
    assert.equal(status, 400);
    assert.match(payload.detail, /Unknown dimension 'salesRep'/);
  });

  test('unknown measure', () => aggregate({ measures: ['salary'] }));
  test('too many dimensions', () => aggregate({ measures: ['revenue'], groupBy: ['year', 'quarter', 'month', 'country'] }));
  test('text value for a numeric dimension', () => aggregate({ measures: ['revenue'], filters: [{ dimension: 'year', operator: 'eq', values: ['2013'] }] }));
  test('range operator on a text dimension', () => aggregate({ measures: ['revenue'], filters: [{ dimension: 'country', operator: 'gte', values: ['G'] }] }));
  test('order by a column that is not requested', () => aggregate({ measures: ['revenue'], groupBy: ['year'], orderBy: { field: 'country' } }));
});

describe('catalogue', () => {
  test('product search treats % literally', async () => {
    const { payload } = await same('/api/products?search=%25&limit=5');
    assert.deepEqual(payload, []);
  });

  test('product search', () => same('/api/products?search=mountain-100&limit=50'));
  test('product details', () => same('/api/products/344'));
  test('unknown product', () => same('/api/products/999999'));
  test('product photo', () => same('/api/products/344/photo'));
  test('German resellers', () => same('/api/resellers?country=Germany&limit=200'));
});
