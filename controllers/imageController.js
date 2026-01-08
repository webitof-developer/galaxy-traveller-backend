// backend/controllers/imageController.js
// Scalable Images-only controller for Google Cloud Storage
// - Folders + Images only (no generic files in listings)
// - Server-side pagination using pageToken/maxResults
// - Basename search via `q` (works with GET or POST)
// - Signed upload/read/download helpers

const { bucket, makeFilePublic } = require('../utils/gcs');

// ---------------- helpers ----------------
function normalizePrefix(input) {
  if (!input) return ''; // root
  let p = String(input).replace(/^\/+/, ''); // remove leading slashes
  if (p && !p.endsWith('/')) p += '/'; // ensure trailing slash
  return p;
}
function normalizeObjectPath(input) {
  let p = String(input || '').replace(/^\/+/, '');
  if (p.includes('..')) throw new Error('Invalid path'); // no traversal
  return p;
}
function safeFilename(name) {
  const n = (name || '').trim() || 'file';
  return n.replace(/[^\w.\-()+@ ]/g, '_');
}
function safeFolderName(name) {
  if (!name || typeof name !== 'string') {
    throw new Error('Folder name required');
  }

  let n = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_') // spaces → _
    .replace(/[^\w.\-()+@]/g, '_'); // remove unsafe chars

  if (!n) throw new Error('Invalid folder name');
  if (n.includes('..')) throw new Error('Invalid folder name');

  return n;
}

// read param from GET ?query or POST body
function param(req, key, fallback) {
  const qv = req.query?.[key];
  const bv = req.body?.[key];
  return qv ?? bv ?? fallback;
}

exports.listFiles = async (req, res) => {
  try {
    const rawPrefix = param(req, 'prefix', ''); // empty = root
    const prefix = normalizePrefix(rawPrefix);

    const q = String(param(req, 'q', '') || '')
      .toLowerCase()
      .trim();
    const imagesOnly = String(param(req, 'imagesOnly', '1')) === '1';
    const maxResults = 25;
    const pageToken = param(req, 'pageToken', undefined) || undefined;

    let folderItems = [];
    let imageItems = [];
    let nextPageToken = null;

    // ------------------------------------------------------
    // CASE 1️⃣ — ROOT LEVEL: show uploads/* folders + all images
    // ------------------------------------------------------
    if (!prefix || prefix === '') {
      // ✅ only fetch folders if this is the first page
      if (!pageToken) {
        const [uploadFolders, , uploadResp] = await bucket.getFiles({
          prefix: 'uploads/',
          delimiter: '/',
          autoPaginate: false,
          maxResults,
        });

        const uploadPrefixes = uploadResp?.prefixes || [];
        folderItems = uploadPrefixes.map((p) => {
          const trimmed = p.endsWith('/') ? p.slice(0, -1) : p;
          return {
            name: p,
            displayName: trimmed.split('/').pop(),
            type: 'folder',
          };
        });
      }

      // 1B. Load top-level images (paginated)
      const [rootFiles, , rootResp] = await bucket.getFiles({
        prefix: '',
        delimiter: undefined,
        autoPaginate: false,
        maxResults,
        pageToken,
      });
      console.log('rootFiles', rootFiles.length, rootFiles, rootResp);

      const rootImages = rootFiles.filter((file) => {
        const name = file.name || '';

        // ignore folders / sentinels
        if (name.endsWith('/') || name.endsWith('/.keep')) return false;

        // only images
        const ct = file.metadata?.contentType || '';
        if (!ct.startsWith('image/')) return false;

        // optional search
        const base = name.split('/').pop().toLowerCase();
        if (q && !base.includes(q)) return false;

        return true;
      });

      imageItems = rootImages.map((file) => ({
        name: file.name,
        publicUrl: `https://storage.googleapis.com/${bucket.name}/${file.name}`,
        contentType: file.metadata?.contentType,
        size: file.metadata?.size,
        updated: file.metadata?.updated,
        type: 'image',
      }));

      nextPageToken = rootResp?.nextPageToken || null;
    }

    // ------------------------------------------------------
    // CASE 2️⃣ — Inside uploads/folder/ : show only its content
    // ------------------------------------------------------
    else if (prefix.startsWith('uploads/')) {
      // ✅ only fetch subfolders once (first page)
      if (!pageToken) {
        const [folderFiles, , folderResp] = await bucket.getFiles({
          prefix,
          delimiter: '/',
          autoPaginate: false,
          maxResults,
        });

        const subPrefixes = folderResp?.prefixes || [];
        folderItems = subPrefixes.map((p) => {
          const trimmed = p.endsWith('/') ? p.slice(0, -1) : p;
          return {
            name: p,
            displayName: trimmed.split('/').pop(),
            type: 'folder',
          };
        });
      }

      const [fileObjs, , fileResp] = await bucket.getFiles({
        prefix,
        delimiter: '/',
        autoPaginate: false,
        maxResults,
        pageToken,
      });

      const imageFiles = fileObjs.filter((file) => {
        const name = file.name || '';
        if (name.endsWith('/') || name.endsWith('/.keep')) return false;

        const ct = file.metadata?.contentType || '';
        const isImage = ct.startsWith('image/');
        if (imagesOnly && !isImage) return false;

        const base = name.split('/').pop().toLowerCase();
        if (q && !base.includes(q)) return false;

        return true;
      });

      imageItems = imageFiles.map((file) => ({
        name: file.name,
        publicUrl: `https://storage.googleapis.com/${bucket.name}/${file.name}`,
        contentType: file.metadata?.contentType,
        size: file.metadata?.size,
        updated: file.metadata?.updated,
        type: 'image',
      }));

      nextPageToken = fileResp?.nextPageToken || null;
    }

    // ------------------------------------------------------
    // Merge and respond
    // ------------------------------------------------------
    const combined = [...folderItems, ...imageItems];

    return res.status(200).json({
      success: true,
      prefix,
      total: combined.length,
      items: combined,
      nextPageToken,
    });
  } catch (err) {
    console.error('[listFiles:smartRootVsFolder] Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

// Create folder by writing a sentinel object `<prefix>/<name>/.keep`
exports.createFolder = async (req, res) => {
  try {
    const { parent = 'uploads/', name } = req.body || {};
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'name is required' });
    }

    // Always ensure folders go under "uploads/"
    const cleanParent = normalizePrefix(
      parent.startsWith('uploads/') ? parent : `uploads/${parent}`,
    );
    const cleanName = safeFolderName(name);

    const targetPrefix = `${cleanParent}${cleanName}`; // e.g. uploads/MyFolder
    const sentinelPath = `${targetPrefix}/.keep`;

    // Check if folder already exists
    const [existing] = await bucket.getFiles({
      prefix: `${targetPrefix}/`,
      maxResults: 1,
    });
    if (existing && existing.length > 0) {
      return res.status(409).json({
        error: 'Folder already exists',
        prefix: `${targetPrefix}/`,
      });
    }

    // Create empty .keep file to simulate folder
    await bucket.file(sentinelPath).save('', {
      resumable: false,
      contentType: 'application/x-empty',
      metadata: { cacheControl: 'no-store' },
    });

    return res.status(201).json({
      success: true,
      prefix: `${targetPrefix}/`,
      message: 'Folder created successfully',
    });
  } catch (err) {
    console.error('[createFolder] Error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to create folder',
    });
  }
};

// Generate signed READ URL for viewing files
exports.signRead = async (req, res) => {
  try {
    const objPath = req.query.path;
    if (!objPath) return res.status(400).json({ error: 'Missing ?path=' });

    const clean = normalizeObjectPath(objPath);
    const [url] = await bucket.file(clean).getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 15 * 60 * 1000,
    });

    res.json({
      url,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    });
  } catch (err) {
    console.error('[signRead] Error:', err);
    res.status(500).json({ error: err.message });
  }
};

// Generate signed UPLOAD URL that stores inside the folder path if provided
exports.signUploadForPath = async (req, res) => {
  try {
    const { folder = 'uploads/', filename, contentType } = req.body || {};
    if (!filename || typeof filename !== 'string') {
      return res.status(400).json({ error: 'filename is required' });
    }

    const cleanFile = safeFilename(filename);
    // Ensure folder starts with "uploads/"
    const cleanFolder = folder
      ? normalizeObjectPath(
          folder.startsWith('uploads/') ? folder : `uploads/${folder}`,
        ).replace(/\/+$/, '')
      : 'uploads';

    // Final path: uploads/folder/filename.jpg
    const objectPath = cleanFolder
      ? `${cleanFolder}/${cleanFile}`
      : `uploads/${cleanFile}`;
    const ct = (contentType || 'application/octet-stream').toLowerCase();

    const [uploadUrl] = await bucket.file(objectPath).getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 15 * 60 * 1000,
      contentType: ct,
      extensionHeaders: { 'x-goog-acl': 'public-read' },
    });

    return res.status(200).json({
      success: true,
      path: objectPath,
      uploadUrl,
      publicUrl: `https://storage.googleapis.com/${bucket.name}/${objectPath}`,
      message: `Ready to upload into ${cleanFolder}`,
    });
  } catch (err) {
    console.error('[signUploadForPath] Error:', err);
    return res.status(500).json({
      error: 'Failed to sign upload',
      details: err.message,
    });
  }
};

exports.signDownload = async (req, res) => {
  try {
    const rawPath = req.query.path;
    if (!rawPath) return res.status(400).json({ error: 'Missing ?path=' });

    const objPath = normalizeObjectPath(rawPath);
    const filename = safeFilename(
      req.query.filename || objPath.split('/').pop() || 'download',
    );

    const [url] = await bucket.file(objPath).getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 15 * 60 * 1000,
      responseDisposition: `attachment; filename="${filename}"`,
    });

    res.status(200).json({ url, filename });
  } catch (err) {
    console.error('[signDownload] Error:', err);
    res
      .status(500)
      .json({ error: 'Failed to sign download', details: err.message });
  }
};

// Delete an object by full path
// DELETE /api/images  { path }
exports.deleteImage = async (req, res) => {
  try {
    const { path: p } = req.body || {};
    if (!p || typeof p !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid "path"' });
    }

    const clean = normalizeObjectPath(p);
    await bucket.file(clean).delete();
    return res.status(200).json({ message: `Deleted ${clean}.` });
  } catch (err) {
    console.error('[deleteImage] Error:', err);
    const code = err?.code || 500;
    return res.status(code === 404 ? 404 : 500).json({
      error: code === 404 ? 'File not found' : 'Failed to delete image',
      details: err.message,
    });
  }
};

// (Optional) Legacy: getSignedUrl builder
exports.getSignedUrl = async (req, res) => {
  const { modelKey, userId, otherId } = req.body || {};
  if (!userId || !modelKey)
    return res.status(400).json({ error: 'modelKey and userId are required' });

  const fileName = otherId
    ? `${modelKey}/${userId}/${otherId}/image-${Date.now()}.jpg`
    : `${modelKey}/${userId}/image-${Date.now()}.jpg`;

  const options = {
    version: 'v4',
    action: 'write',
    expires: Date.now() + 60 * 60 * 1000, // 1h
    contentType: 'image/jpeg',
  };

  try {
    const [url] = await bucket.file(fileName).getSignedUrl(options);
    res.status(200).json({ signedUrl: url, fileName });
  } catch (error) {
    console.error('[getSignedUrl] Error:', error);
    res.status(500).send({ error: error.message });
  }
};

exports.searchImages = async (req, res) => {
  try {
    // 🧩 Normalize and sanitize search input
    let rawQuery = param(req, 'q', '');
    if (!rawQuery) {
      return res
        .status(400)
        .json({ success: false, error: 'Missing search query (q)' });
    }

    // Replace "-" and spaces with "_"
    const normalizedQuery = rawQuery
      .replace(/[-\s]+/g, '_')
      .toLowerCase()
      .trim();

    const prefix = normalizePrefix(param(req, 'prefix', '')); // optional prefix search
    const imagesOnly = String(param(req, 'imagesOnly', '1')) === '1';

    const maxResults = 25; // pagination size
    const pageToken = param(req, 'pageToken', undefined) || undefined;

    // ---------------------------------------------------
    // 🔍 Recursive search — get all files under prefix (or all if prefix="")
    // ---------------------------------------------------
    const [files, , response] = await bucket.getFiles({
      prefix, // empty = search entire bucket
      delimiter: undefined, // recursive search
      autoPaginate: false,
      maxResults,
      pageToken,
    });

    const nextPageToken = response?.nextPageToken || null;

    // ---------------------------------------------------
    // 🧠 Filter results: only images, match normalized name
    // ---------------------------------------------------
    const matched = files.filter((file) => {
      const name = file.name || '';
      if (name.endsWith('/') || name.endsWith('/.keep')) return false;

      const ct = file.metadata?.contentType || '';
      const isImage = ct.startsWith('image/');
      if (imagesOnly && !isImage) return false;

      const base = name.split('/').pop().toLowerCase();
      // Match if filename contains query (underscores already replaced)
      return base.includes(normalizedQuery);
    });

    const items = matched.map((file) => ({
      name: file.name,
      publicUrl: `https://storage.googleapis.com/${bucket.name}/${file.name}`,
      contentType: file.metadata?.contentType,
      size: file.metadata?.size,
      updated: file.metadata?.updated,
      type: 'image',
    }));

    return res.status(200).json({
      success: true,
      prefix,
      query: normalizedQuery,
      total: items.length,
      items,
      nextPageToken,
    });
  } catch (err) {
    console.error('[searchImages] Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};
