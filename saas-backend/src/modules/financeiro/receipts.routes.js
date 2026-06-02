'use strict';
const { Router } = require('express');
const multer = require('multer');
const { authenticate } = require('../../middleware/auth.middleware');
const ctrl = require('./receipts.controller');

const router = Router();

// Multer em memoria
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /^image\/(jpeg|jpg|png|webp)$/.test(file.mimetype);
    cb(ok ? null : new Error(`Tipo de arquivo nao suportado: ${file.mimetype}`), ok);
  },
});

router.use(authenticate);

router.get('/pending',                     ctrl.listPending);
router.get('/revisar',                     ctrl.listForRevisar);
router.get('/revisar/count',               ctrl.countPending);
router.get('/:id',                         ctrl.getOne);
router.get('/:id/image',                   ctrl.getImage);
router.post('/upload',                     upload.single('image'), ctrl.upload);
router.post('/:id/confirm',                ctrl.confirm);
router.post('/:id/items/:idx/resolve',     ctrl.resolveItem);
router.put('/:id',                         ctrl.edit);
router.delete('/:id',                      ctrl.reject);

module.exports = router;
