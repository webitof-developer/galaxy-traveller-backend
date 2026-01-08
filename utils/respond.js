// utils/respond.js
exports.ok = (res, data, status = 200) =>
  res.status(status).json({ success: true, data });

exports.created = (res, data) => exports.ok(res, data, 200);

exports.notFound = (res, message = 'Not found') =>
  res.status(404).json({ success: false, message });

exports.fail = (res, error, status = 500) => {
  const message =
    (error && error.message) ||
    (typeof error === 'string' ? error : 'Server error');
  return res.status(status).json({ success: false, message });
};

// optional: async wrapper
exports.asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
