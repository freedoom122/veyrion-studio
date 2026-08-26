const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function createStorage(subfolder) {
  const dest = path.join(uploadDir, subfolder);
  ensureDir(dest);

  return multer.diskStorage({
    destination: (req, file, cb) => cb(null, dest),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${uuidv4()}${ext}`);
    },
  });
}

const ALLOWED_PRODUCT_TYPES = [
  'application/zip', 'application/x-tar', 'application/gzip',
  'application/octet-stream', 'application/pdf',
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
];

const ALLOWED_THUMBNAIL_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const uploadProductFile = multer({
  storage: createStorage('products'),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (req, file, cb) => {
    if (ALLOWED_PRODUCT_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed'), false);
    }
  },
});

const uploadThumbnail = multer({
  storage: createStorage('thumbnails'),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (ALLOWED_THUMBNAIL_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Image type not allowed'), false);
    }
  },
});

module.exports = { uploadProductFile, uploadThumbnail };
