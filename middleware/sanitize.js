/**
 * Recursively sanitize request payloads to neutralize Mongo-style operator injection.
 * - Removes leading `$` and `.` characters from keys to prevent operator and path injection.
 * - Trims string values to avoid accidental whitespace discrepancies.
 * Applied only on POST requests to keep the rest of the stack unchanged.
 */
const sanitizeValue = (value) => {
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }

  if (value && typeof value === 'object') {
    const sanitized = {};
    for (const [key, nested] of Object.entries(value)) {
      const safeKey = key.replace(/^\$+/g, '').replace(/\./g, '_');

      // Skip keys that would end up empty after stripping dangerous characters
      if (!safeKey) continue;

      sanitized[safeKey] = sanitizeValue(nested);
    }
    return sanitized;
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  return value;
};

const sanitizeMiddleware = (req, _res, next) => {
  const methodsToSanitize = new Set(['POST', 'PUT', 'PATCH']);

  if (!methodsToSanitize.has(req.method)) return next();

  req.body = sanitizeValue(req.body);
  req.query = sanitizeValue(req.query);
  req.params = sanitizeValue(req.params);

  next();
};

module.exports = sanitizeMiddleware;
