'use strict';
const { Router } = require('express');
const multer = require('multer');
const { authenticate } = require('../../middleware/auth.middleware');
const ctrl = require('./receipts.controller');

const router = Router();

// Multer em memória — Buffer direto pra processar (sem escrever em disco)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },   // 10MB
  fileFilter: (req, file, cb) => {
    const ok = /^image\/(jpeg|jpg|png|webp)$/.test(file.mimetype);
    cb(ok ? null : new Error(`Tipo de arquivo não suportado: ${file.mimetype}`), ok);
  },
});

router.use(authenticate);

router.get('/pending',           ctrl.listPending);
router.get('/:id',               ctrl.getOne);
router.get('/:id/image',         ctrl.getImage);
router.post('/upload',           upload.single('image'), ctrl.upload);
router.post('/:id/confirm',      ctrl.confirm);
router.put('/:id',               ctrl.edit);
router.delete('/:id',            ctrl.reject);

module.exports = router;
