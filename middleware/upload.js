import multer from 'multer';
import mime from 'mime-types';

const storage = multer.memoryStorage();

function fileFilter(req, file, cb) {
  // accept images + (optionally) videos/pdfs if you want later
  const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Only image files are allowed'), false);
}

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// utility to generate an object name with original ext
export function generateObjectName(originalName) {
  const base = String(originalName || 'file')
    .replace(/\s+/g, '-')
    .toLowerCase();
  const ext =
    mime.extension(mime.lookup(base) || '') || base.split('.').pop() || 'bin';
  const noExt = base.replace(/\.[^.]+$/, '');
  const ts = Date.now();
  return `${noExt}-${ts}.${ext}`;
}
