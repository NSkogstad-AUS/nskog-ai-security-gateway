import test from 'node:test';
import assert from 'node:assert/strict';
import { validate, validateToolArgs } from './validate';

test('validateToolArgs accepts valid web_search args', () => {
  const result = validateToolArgs('web_search', {
    query: 'AI security gateway',
    max_results: 3,
  });

  assert.equal(result, null);
});

test('validateToolArgs rejects missing required fields', () => {
  const result = validateToolArgs('web_search', {});

  assert.ok(result);
  assert.match(result[0], /must have required property 'query'/);
});

test('validateToolArgs rejects unknown tools fail-closed', () => {
  const result = validateToolArgs('tool_that_does_not_exist', {});

  assert.deepEqual(result, ["/ unknown tool 'tool_that_does_not_exist'"]);
});

test('validate returns readable errors for additional properties', () => {
  const result = validate(
    {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      required: ['query'],
      properties: {
        query: { type: 'string', minLength: 1 },
      },
      additionalProperties: false,
    },
    {
      query: 'ok',
      extra: true,
    },
  );

  assert.ok(result);
  assert.match(result[0], /must NOT have additional properties/);
});
