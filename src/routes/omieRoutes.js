const express = require('express');
const router = express.Router();
const omieController = require('../controllers/omieController');

// Rutas protegidas
router.get('/status', omieController.getDownloadStatus);
router.post('/download', omieController.startDownload);

module.exports = router;