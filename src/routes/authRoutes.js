const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Middleware de autenticación para rutas protegidas
const authMiddleware = (req, res, next) => {
    if (req.session && req.session.user) {
        next();
    } else {
        res.status(401).json({ error: 'No autorizado' });
    }
};

// Middleware para rutas de admin
const adminMiddleware = (req, res, next) => {
    if (req.session?.user?.role === 'admin') {
        next();
    } else {
        res.status(403).json({ error: 'Acceso denegado' });
    }
};

// Rutas públicas
router.post('/login', authController.login);
router.get('/logout', authController.logout);

// Rutas protegidas de admin
router.post('/users', authMiddleware, adminMiddleware, authController.createUser);
router.get('/users', authMiddleware, adminMiddleware, authController.getUsers);
router.put('/users/:id', authMiddleware, adminMiddleware, authController.updateUser);
router.delete('/users/:id', authMiddleware, adminMiddleware, authController.deleteUser);
router.get('/sessions', authMiddleware, adminMiddleware, authController.getUserSessions);
router.get('/metrics', authMiddleware, adminMiddleware, authController.getMetrics);

module.exports = router;