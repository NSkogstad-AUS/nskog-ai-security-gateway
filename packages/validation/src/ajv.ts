/**
 * Single shared Ajv instance configured exclusively for JSON Schema draft 2020-12.
 *
 * IMPORTANT: Do NOT mix this instance with Ajv draft-07 validators. If you need
 * draft-07, create a separate `new Ajv()` instance elsewhere.
 *
 * @see https://ajv.js.org/json-schema.html#draft-2020-12
 */
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
});

// Adds support for format keywords: date-time, email, uri, uuid, etc.
addFormats(ajv);

export { ajv, Ajv2020 };
