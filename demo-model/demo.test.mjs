// Tests of the demo model's keyword matching against the real system prompt of the agents.
// The schema is a snapshot of GET /api/schema.  Run with:  node --test 'demo-model/*.test.mjs'
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createInstructions } from '../agent/src/instructions.ts';
import { demoAnswer, readSchema } from './demo.mjs';

const system = createInstructions(JSON.parse(readFileSync(new URL('./schema.test.json', import.meta.url), 'utf8')));
const tools = ['querySales', 'findProducts', 'findResellers', 'pinToDashboard'];
const ask = (text, messages = []) => demoAnswer({ system, tools, messages: [...messages, { role: 'user', text }] });

test('reads measures, dimensions and their values from the system prompt', () => {
  const schema = readSchema(system);
  assert.deepEqual(schema.measures, ['revenue', 'cost', 'margin', 'quantity', 'orders', 'averageOrderValue', 'discount', 'freight']);
  assert.deepEqual(schema.dimensions.find((d) => d.name === 'resellerAnnualRevenue')?.values, [30000, 80000, 100000, 150000, 300000]);
  assert.ok(schema.dimensions.find((d) => d.name === 'country')?.values.includes('Germany'));
  assert.deepEqual(schema.dimensions.find((d) => d.name === 'product')?.values, []);
});

test('every answer says that no real model is behind it', () => {
  for (const question of ['Revenue per year', 'Who is our key account manager?', 'Hello', 'Show me the Mountain-200 bikes.']) {
    assert.match(ask(question).text, /^Demo mode, no real LLM:/);
  }
});

test('the example questions of the app', () => {
  assert.deepEqual(ask('How did revenue develop per quarter, split by sales channel?').input.query, {
    measures: ['revenue'],
    groupBy: ['year', 'quarter', 'channel'],
  });
  assert.equal(ask('How did revenue develop per quarter, split by sales channel?').input.chart, 'line');

  assert.deepEqual(ask('Which 10 resellers in Germany bought the most? Show revenue and margin.').input.query, {
    measures: ['revenue', 'margin'],
    groupBy: ['reseller'],
    filters: [{ dimension: 'country', operator: 'eq', values: ['Germany'] }],
    orderBy: { field: 'revenue', direction: 'desc' },
    limit: 10,
  });

  assert.deepEqual(ask('Compare the gross margin of the product categories in Europe in 2013.').input.query, {
    measures: ['margin'],
    groupBy: ['productCategory'],
    filters: [
      { dimension: 'territoryGroup', operator: 'eq', values: ['Europe'] },
      { dimension: 'year', operator: 'eq', values: [2013] },
    ],
  });

  assert.deepEqual(ask('Show me the Mountain-200 bikes.'), {
    text: 'Demo mode, no real LLM: I search the catalogue for "Mountain-200".',
    tool: 'findProducts',
    input: { search: 'Mountain-200', limit: 8 },
  });

  assert.deepEqual(ask('How much discount did each promotion type grant, and how much revenue came with it?').input.query, {
    measures: ['discount', 'revenue'],
    groupBy: ['promotionType'],
  });

  assert.deepEqual(ask('Do larger resellers place bigger orders? Show the average order value per reseller annual revenue.').input.query, {
    measures: ['averageOrderValue'],
    groupBy: ['resellerAnnualRevenue'],
  });

  assert.deepEqual(ask('Who is Brakes and Gears, and where are they located?'), {
    text: 'Demo mode, no real LLM: I look up the reseller "Brakes and Gears".',
    tool: 'findResellers',
    input: { search: 'Brakes and Gears', limit: 6 },
  });

  const capabilities = ask('What can you do for me?');
  assert.equal(capabilities.tool, undefined);
  assert.match(capabilities.text, /average order value/);

  const people = ask('Who is the key account manager of our biggest reseller?');
  assert.equal(people.tool, undefined);
  assert.match(people.text, /deliberately not part of the data model/);
});

test('a total without grouping is a key figure, a German question works as well', () => {
  assert.deepEqual(ask('Total revenue online in 2012').input, {
    title: 'Revenue, Online, 2012',
    chart: 'kpi',
    query: {
      measures: ['revenue'],
      filters: [
        { dimension: 'channel', operator: 'eq', values: ['Online'] },
        { dimension: 'year', operator: 'eq', values: [2012] },
      ],
    },
  });
  assert.deepEqual(ask('Umsatz pro Jahr und Kanal').input.query, { measures: ['revenue'], groupBy: ['year', 'channel'] });
});

test('the longest matching value wins, and "sales channel" is not also the measure "sales"', () => {
  assert.deepEqual(ask('Orders per sales channel for Mountain Bikes').input.query, {
    measures: ['orders'],
    groupBy: ['channel'],
    filters: [{ dimension: 'productSubcategory', operator: 'eq', values: ['Mountain Bikes'] }],
  });
});

test('what it does not understand gets an honest answer and revenue per year', () => {
  const answer = ask('Hello, how are you?');
  assert.match(answer.text, /cannot answer that/);
  assert.deepEqual(answer.input, { title: 'Revenue per year', chart: 'line', query: { measures: ['revenue'], groupBy: ['year'] } });
});

test('"pin" pins the last chart of the conversation', () => {
  const view = ask('Revenue per country').input;
  const history = [
    { role: 'user', text: 'Revenue per country' },
    { role: 'assistant', text: '', toolCalls: [{ id: 'call_1', name: 'querySales', input: view }] },
    { role: 'tool', name: 'querySales', output: '{"rows":[]}' },
    { role: 'assistant', text: 'Done.', toolCalls: [] },
  ];
  assert.deepEqual(ask('Pin it to the dashboard', history), { text: 'Demo mode, no real LLM: I pin the last chart.', tool: 'pinToDashboard', input: view });
  assert.equal(ask('pin it').tool, undefined);
});

test('after a tool result it comments without numbers, and passes on errors', () => {
  const after = (name, output) => demoAnswer({ system, tools, messages: [{ role: 'tool', name, output }] }).text;
  assert.match(after('querySales', '{"rows":[]}'), /straight from the database/);
  assert.match(after('querySales', '{"error":"Unknown measure \'salary\'."}'), /rejected the request: Unknown measure 'salary'/);
  assert.match(after('findProducts', '{"products":[]}'), /no product/);
});
