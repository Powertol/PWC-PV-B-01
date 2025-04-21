const express = require('express');
const router = express.Router();
const omieController = require('../controllers/omieController');

// Middleware de autenticación
const authMiddleware = (req, res, next) => {
    if (req.session && req.session.user) {
        next();
    } else {
        res.status(401).json({ error: 'No autorizado' });
    }
};

// Rutas protegidas
router.get('/status', authMiddleware, omieController.getDownloadStatus);
router.post('/download', authMiddleware, omieController.startDownload);

module.exports = router;