// utils/csv.js
// Convert arrays of plain objects to CSV. Flattens nested fields to dot.keys.
function isObjectId(v) {
  return v && typeof v === 'object' && v._bsontype === 'ObjectId';
}

function flattenDoc(obj, prefix = '', out = {}) {
  const key = prefix.replace(/\.$/, '');
  if (obj == null) {
    out[key] = obj;
    return out;
  }

  // Primitives
  if (typeof obj !== 'object') {
    out[key] = obj;
    return out;
  }

  // Dates, ObjectIds, Buffers, Arrays
  if (obj instanceof Date) {
    out[key] = obj.toISOString();
    return out;
  }
  if (isObjectId(obj)) {
    out[key] = String(obj);
    return out;
  }
  if (Buffer.isBuffer(obj)) {
    out[key] = obj.toString('base64');
    return out;
  }
  if (Array.isArray(obj)) {
    out[key] = JSON.stringify(obj);
    return out;
  }

  // Plain objects
  for (const [k, v] of Object.entries(obj)) {
    flattenDoc(v, prefix ? `${prefix}${k}.` : `${k}.`, out);
  }
  return out;
}

function collectHeaders(rows) {
  const set = new Set();
  for (const r of rows) {
    for (const k of Object.keys(r)) set.add(k);
  }
  return Array.from(set);
}

function csvEscape(val) {
  if (val == null) return '';
  let s = typeof val === 'string' ? val : String(val);
  s = s.replace(/\r\n/g, '\n');
  const mustQuote = /[",\n]/.test(s);
  if (!mustQuote) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

function toCSV(objects, fields) {
  const flat = objects.map((o) => flattenDoc(o));
  const headers = fields && fields.length ? fields : collectHeaders(flat);
  const lines = [];
  lines.push(headers.map(csvEscape).join(','));
  for (const row of flat) {
    const line = headers.map((h) => csvEscape(row[h]));
    lines.push(line.join(','));
  }
  return lines.join('\n');
}

module.exports = { toCSV, flattenDoc, collectHeaders, csvEscape };
