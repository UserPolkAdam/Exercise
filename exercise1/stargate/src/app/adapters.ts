/**
 * Response adapters. The OpenAPI spec declares no response schemas, so every
 * payload enters as `unknown` and is only interpreted when it matches a
 * recognizable shape. Anything else is preserved as raw JSON.
 */

export interface Field { key: string; label: string; value: string; }
export interface PersonRow { name: string; fields: Field[]; }
export interface RecordTable { columns: string[]; rows: Record<string, string>[]; }
export interface PeoplePage {
  rows: PersonRow[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  serverPaged: boolean;
}

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => !!v && typeof v === 'object' && !Array.isArray(v);

const NAME_KEYS = ['name', 'Name', 'fullName', 'personName'];

export function humanize(key: string): string {
  return key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

export function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) {
      const d = new Date(v);
      if (!isNaN(d.getTime())) return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
    }
    return v;
  }
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
}

function nameOf(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (isRec(v)) for (const k of NAME_KEYS) if (typeof v[k] === 'string') return v[k] as string;
  return null;
}

function fieldsOf(r: Rec, skip: string[] = NAME_KEYS): Field[] {
  return Object.entries(r)
    .filter(([k, v]) => !skip.includes(k) && (v === null || typeof v !== 'object'))
    .map(([k, v]) => ({ key: k, label: humanize(k), value: formatValue(v) }));
}

/** Common envelope pattern: { success, message, people: [...] } etc. Returns the first array found. */
function firstArray(v: unknown, prefer: string[]): unknown[] | null {
  if (Array.isArray(v)) return v;
  if (!isRec(v)) return null;
  for (const k of prefer) if (Array.isArray(v[k])) return v[k] as unknown[];
  for (const val of Object.values(v)) if (Array.isArray(val)) return val;
  return null;
}

/** Person list: array of strings, array of objects with name, or envelope containing such an array. */
export function adaptPeople(raw: unknown): PersonRow[] | null {
  const arr = firstArray(raw, ['people', 'persons', 'items', 'data', 'result']);
  if (!arr) return null;
  const rows: PersonRow[] = [];
  for (const item of arr) {
    const name = nameOf(item);
    if (name === null) return null;
    rows.push({ name, fields: isRec(item) ? fieldsOf(item) : [] });
  }
  return rows;
}

/**
 * Reads the paginated roster envelope. Bare arrays and unpaged list envelopes
 * remain supported for compatibility with the current local API.
 */
export function adaptPeoplePage(raw: unknown, requestedPage: number, requestedPageSize: number): PeoplePage | null {
  const arr = firstArray(raw, ['items', 'people', 'persons', 'data', 'result']);
  const rows = adaptPeople(raw);
  if (!arr || !rows) return null;

  const root = isRec(raw) ? raw : null;
  const totalCount = numberFrom(root, ['totalCount']);
  if (totalCount === null) {
    return {
      rows,
      page: 1,
      pageSize: Math.max(rows.length, 1),
      totalCount: rows.length,
      totalPages: 1,
      serverPaged: false,
    };
  }

  const page = positiveNumberFrom(root, ['page', 'currentPage']) ?? requestedPage;
  const pageSize = positiveNumberFrom(root, ['pageSize']) ?? requestedPageSize;
  const explicitTotalPages = numberFrom(root, ['totalPages']);
  const calculatedTotalPages = Math.ceil(totalCount / pageSize);
  return {
    rows,
    page,
    pageSize,
    totalCount,
    totalPages: explicitTotalPages !== null && (totalCount === 0 ? explicitTotalPages === 0 : explicitTotalPages > 0)
      ? explicitTotalPages
      : calculatedTotalPages,
    serverPaged: true,
  };
}

function numberFrom(record: Rec | null, keys: string[]): number | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  }
  return null;
}

function positiveNumberFrom(record: Rec | null, keys: string[]): number | null {
  const value = numberFrom(record, keys);
  return value !== null && value > 0 ? value : null;
}

/** Single person: object with name, or envelope { person: {...} }. */
export function adaptPerson(raw: unknown): PersonRow | null {
  if (typeof raw === 'string') return { name: raw, fields: [] };
  if (!isRec(raw)) return null;
  const inner = isRec(raw['person']) ? raw['person'] : isRec(raw['data']) ? raw['data'] : raw;
  const name = nameOf(inner);
  return name === null ? null : { name, fields: fieldsOf(inner) };
}

/** Duty history may contain only a person when no assignments were returned. */
export function adaptDuties(raw: unknown): { person: PersonRow | null; table: RecordTable } | null {
  if (isRec(raw) && raw['success'] === false) return null;
  const personRecord = isRec(raw) && isRec(raw['person']) ? raw['person'] : null;
  const person = personRecord ? adaptPerson(personRecord) : null;
  const dutyKeys = ['astronautDuties', 'duties', 'items', 'data'];
  // A person-only success is valid, but a malformed duty collection must
  // remain visible as an unrecognized response rather than look empty.
  for (const record of [isRec(raw) ? raw : null, personRecord]) {
    if (record && dutyKeys.some((key) => key in record && record[key] != null && !Array.isArray(record[key]))) return null;
  }
  const arr = firstArray(raw, dutyKeys) ?? firstArray(personRecord, dutyKeys)
    ?? (person ? [] : null);
  if (!arr || !arr.every(isRec)) return null;
  const columns: string[] = [];
  for (const r of arr as Rec[]) for (const [k, v] of Object.entries(r)) if ((v === null || typeof v !== 'object') && !columns.includes(k)) columns.push(k);
  const rows = (arr as Rec[]).map((r) => Object.fromEntries(columns.map((c) => [c, formatValue(r[c])])));
  return { person, table: { columns, rows } };
}

/** Person lookup: distinguish an omitted collection from empty or malformed duties. */
export function adaptPersonDuties(raw: unknown): RecordTable | null | undefined {
  if (!isRec(raw) || !('astronautDuties' in raw)) return undefined;
  if (!Array.isArray(raw['astronautDuties'])) return null;
  return adaptDuties(raw)?.table ?? null;
}

export function pretty(raw: unknown): string {
  if (raw === null || raw === undefined || raw === '') return '(empty response body)';
  if (typeof raw === 'string') {
    try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw; }
  }
  return JSON.stringify(raw, null, 2);
}

/** Convert a datetime-local value (local time) to ISO, or undefined when blank/invalid. */
export function localToIso(v: string): string | undefined {
  if (!v.trim()) return undefined;
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}

export function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}
