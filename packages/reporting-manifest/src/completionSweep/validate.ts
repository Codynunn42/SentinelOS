type ErrorObject = any;

// NOTE: Ajv ESM typings break under Node >=21 during composite builds.
// Runtime behavior is validated under Node 20 (pinned).

import AjvImport from 'ajv';
import addFormatsImport from 'ajv-formats';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CompletionSweepReport } from './types.js';

const schemaPath = fileURLToPath(new URL('./schema.completion_sweep_report.json', import.meta.url));
const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));

const Ajv = AjvImport as unknown as new (opts?: any) => any;

const addFormats =
  typeof addFormatsImport === 'function'
    ? addFormatsImport
    : (addFormatsImport as any).default;

const ajv = new Ajv({ allErrors: true, strict: false });

if (typeof addFormats === 'function') {
  addFormats(ajv);
}
const validateFn = ajv.compile(schema as object);

export function validateCompletionSweepReport(obj: unknown): { valid: boolean; errors?: ErrorObject[] } {
  const valid = validateFn(obj);
  return { valid: Boolean(valid), errors: valid ? undefined : (validateFn.errors as ErrorObject[]) ?? [] };
}

export function assertValidCompletionSweepReport(obj: unknown): asserts obj is CompletionSweepReport {
  const { valid, errors } = validateCompletionSweepReport(obj);
  if (!valid) {
    const message = errors?.map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ') || 'validation failed';
    throw new Error(`CompletionSweepReport validation error: ${message}`);
  }
}
