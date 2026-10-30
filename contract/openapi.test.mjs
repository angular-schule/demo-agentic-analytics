// Both data backends publish their OpenAPI document, generated from their own code: ASP.NET Core
// from the endpoints and records, NestJS from the controllers and DTO classes. This test checks that
// the two documents describe the same contract: paths, parameters, request and response bodies,
// schemas with their types, formats, required and nullable properties, enums and tags.
// Wording (titles, descriptions, examples) and notation that means the same thing are left out.
// Run with both backends up:  node --test 'contract/*.test.mjs'
import assert from 'node:assert/strict';
import { test } from 'node:test';

const backends = {
  dotnet: process.env.DOTNET_API_URL ?? 'http://127.0.0.1:8081',
  node: process.env.NODE_API_URL ?? 'http://127.0.0.1:8082',
};

const WORDING = new Set(['description', 'summary', 'title', 'example', 'examples', 'default', 'minimum', 'maximum', 'operationId']);

/**
 * Reduces a JSON schema to what it means:
 * - a nullable type is a sorted type list (["integer", "null"]), however it is written,
 * - a nullable reference is {anyOf: [ref, null]}, whether the generator writes oneOf or anyOf,
 * - the enum of a nullable property lists its words; null is already part of the type.
 */
function schema(node) {
  if (Array.isArray(node)) return node.map(schema);
  if (node === null || typeof node !== 'object') return node;
  const result = {};
  for (const [key, value] of Object.entries(node)) {
    if (WORDING.has(key)) continue;
    result[key] = key === 'properties' ? Object.fromEntries(Object.entries(value).map(([name, s]) => [name, schema(s)])) : schema(value);
  }
  if (Array.isArray(result.type)) result.type = [...result.type].sort();
  if (Array.isArray(result.enum)) result.enum = result.enum.filter((value) => value !== null);
  if (Array.isArray(result.required)) result.required = [...result.required].sort();
  for (const combinator of ['oneOf', 'anyOf']) {
    const options = result[combinator];
    if (Array.isArray(options) && options.some((o) => o.type === 'null') && options.length === 2) {
      delete result[combinator];
      result.anyOf = [options.find((o) => o.type !== 'null'), { type: 'null' }];
    }
  }
  return result;
}

function operation(op) {
  return {
    tags: op.tags,
    parameters: (op.parameters ?? [])
      .map((p) => ({ name: p.name, in: p.in, required: p.required ?? false, schema: schema(p.schema) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    requestBody: op.requestBody && { required: op.requestBody.required ?? false, content: schema(op.requestBody.content) },
    responses: Object.fromEntries(Object.entries(op.responses).map(([status, r]) => [status, schema(r.content ?? {})])),
  };
}

function contract(document) {
  return {
    openapi: document.openapi,
    paths: Object.fromEntries(
      Object.entries(document.paths).map(([path, methods]) => [
        path,
        Object.fromEntries(Object.entries(methods).map(([method, op]) => [method, operation(op)])),
      ]),
    ),
    schemas: schema(document.components?.schemas ?? {}),
  };
}

test('both backends publish the same OpenAPI contract', async () => {
  const [dotnet, node] = await Promise.all(
    Object.values(backends).map(async (base) => contract(await (await fetch(`${base}/openapi/v1.json`)).json())),
  );
  assert.deepEqual(node, dotnet);
});

test('both backends open Swagger UI at their root', async () => {
  for (const base of Object.values(backends)) {
    const response = await fetch(base, { redirect: 'manual' });
    assert.equal(response.status, 302, base);
    assert.equal(new URL(response.headers.get('location') ?? '', base).pathname, '/swagger', base);
  }
});
