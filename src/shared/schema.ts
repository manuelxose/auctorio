/**
 * Minimal typed runtime-schema system (Zod-equivalent subset) used for
 * validating AI structured outputs. Zero dependencies, deterministic.
 */

export type SchemaDef<T = unknown> = {
  readonly kind: string;
  readonly isOptional: boolean;
  validate(value: unknown, path: string, errors: string[]): T | undefined;
  jsonSchema(): Record<string, unknown>;
};

export type Infer<S> = S extends SchemaDef<infer T> ? T : never;

export type SchemaValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

function fail(path: string, message: string, errors: string[]): undefined {
  errors.push(`${path}: ${message}`);
  return undefined;
}

// ────────────────────────────────────────────────────────────── primitives

export function str(options: { minLength?: number; maxLength?: number } = {}): SchemaDef<string> {
  return {
    kind: "string",
    isOptional: false,
    validate(value, path, errors) {
      if (typeof value !== "string") {
        return fail(path, "expected string", errors);
      }
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        return fail(path, "string must not be empty", errors);
      }
      if (options.minLength !== undefined && trimmed.length < options.minLength) {
        return fail(path, `string shorter than ${options.minLength}`, errors);
      }
      if (options.maxLength !== undefined && trimmed.length > options.maxLength) {
        return fail(path, `string longer than ${options.maxLength}`, errors);
      }
      return trimmed;
    },
    jsonSchema() {
      return { type: "string", ...(options.minLength !== undefined ? { minLength: options.minLength } : {}), ...(options.maxLength !== undefined ? { maxLength: options.maxLength } : {}) };
    },
  };
}

export function optionalString(options: { minLength?: number; maxLength?: number } = {}): SchemaDef<string | undefined> {
  return {
    kind: "string",
    isOptional: true,
    validate(value, path, errors) {
      if (value === undefined || value === null) {
        return undefined;
      }
      return str(options).validate(value, path, errors);
    },
    jsonSchema() {
      return { ...str(options).jsonSchema() };
    },
  };
}

export function num(options: { min?: number; max?: number; integer?: boolean } = {}): SchemaDef<number> {
  return {
    kind: "number",
    isOptional: false,
    validate(value, path, errors) {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return fail(path, "expected finite number", errors);
      }
      if (options.integer && !Number.isInteger(value)) {
        return fail(path, "expected integer", errors);
      }
      if (options.min !== undefined && value < options.min) {
        return fail(path, `number below ${options.min}`, errors);
      }
      if (options.max !== undefined && value > options.max) {
        return fail(path, `number above ${options.max}`, errors);
      }
      return value;
    },
    jsonSchema() {
      return { type: options.integer ? "integer" : "number", ...(options.min !== undefined ? { minimum: options.min } : {}), ...(options.max !== undefined ? { maximum: options.max } : {}) };
    },
  };
}

export function bool(): SchemaDef<boolean> {
  return {
    kind: "boolean",
    isOptional: false,
    validate(value, path, errors) {
      if (typeof value !== "boolean") {
        return fail(path, "expected boolean", errors);
      }
      return value;
    },
    jsonSchema() {
      return { type: "boolean" };
    },
  };
}

export function enums<T extends readonly string[]>(values: T): SchemaDef<T[number]> {
  const allowed = new Set<string>(values);
  return {
    kind: "enum",
    isOptional: false,
    validate(value, path, errors) {
      if (typeof value !== "string" || !allowed.has(value)) {
        return fail(path, `expected one of ${values.join(" | ")}`, errors);
      }
      return value as T[number];
    },
    jsonSchema() {
      return { type: "string", enum: [...values] };
    },
  };
}

export function arr<T>(item: SchemaDef<T>, options: { minItems?: number; maxItems?: number } = {}): SchemaDef<T[]> {
  return {
    kind: "array",
    isOptional: false,
    validate(value, path, errors) {
      if (!Array.isArray(value)) {
        return fail(path, "expected array", errors);
      }
      if (options.minItems !== undefined && value.length < options.minItems) {
        return fail(path, `array shorter than ${options.minItems}`, errors);
      }
      if (options.maxItems !== undefined && value.length > options.maxItems) {
        return fail(path, `array longer than ${options.maxItems}`, errors);
      }
      const result: T[] = [];
      let valid = true;
      value.forEach((entry, index) => {
        const errorsBefore = errors.length;
        const parsed = item.validate(entry, `${path}[${index}]`, errors);
        if (errors.length > errorsBefore) {
          valid = false;
          return;
        }
        result.push(parsed as T);
      });
      return valid ? result : undefined;
    },
    jsonSchema() {
      return { type: "array", items: item.jsonSchema(), ...(options.minItems !== undefined ? { minItems: options.minItems } : {}), ...(options.maxItems !== undefined ? { maxItems: options.maxItems } : {}) };
    },
  };
}

export function nullable<T>(inner: SchemaDef<T>): SchemaDef<T | null> {
  return {
    kind: inner.kind,
    isOptional: false,
    validate(value, path, errors) {
      if (value === null || value === undefined) {
        return null;
      }
      return inner.validate(value, path, errors);
    },
    jsonSchema() {
      return { anyOf: [{ type: "null" }, inner.jsonSchema()] };
    },
  };
}

export function optNul<T>(inner: SchemaDef<T>): SchemaDef<T | null | undefined> {
  return {
    kind: inner.kind,
    isOptional: true,
    validate(value, path, errors) {
      if (value === undefined) {
        return undefined;
      }
      if (value === null) {
        return null;
      }
      return inner.validate(value, path, errors);
    },
    jsonSchema() {
      return { anyOf: [{ type: "null" }, inner.jsonSchema()] };
    },
  };
}

export function obj<T extends Record<string, SchemaDef<unknown>>>(shape: T): SchemaDef<{ [K in keyof T]: Infer<T[K]> }> {
  return {
    kind: "object",
    isOptional: false,
    validate(value, path, errors) {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return fail(path, "expected object", errors);
      }
      const record = value as Record<string, unknown>;
      const result: Record<string, unknown> = {};
      let valid = true;
      for (const [key, schema] of Object.entries(shape)) {
        const errorsBefore = errors.length;
        const parsed = schema.validate(record[key], path ? `${path}.${key}` : key, errors);
        if (errors.length > errorsBefore) {
          valid = false;
          continue;
        }
        result[key] = parsed;
      }
      return valid ? (result as { [K in keyof T]: Infer<T[K]> }) : undefined;
    },
    jsonSchema() {
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [key, schema] of Object.entries(shape)) {
        properties[key] = schema.jsonSchema();
        if (!schema.isOptional) {
          required.push(key);
        }
      }
      return { type: "object", properties, required };
    },
  };
}

/** Validate a value against a schema and return a typed result. */
export function validateValue<T>(schema: SchemaDef<T>, value: unknown): SchemaValidationResult<T> {
  const errors: string[] = [];
  const errorsBefore = errors.length;
  const parsed = schema.validate(value, "", errors);
  if (errors.length > errorsBefore || parsed === undefined) {
    return { ok: false, errors };
  }
  return { ok: true, value: parsed };
}
