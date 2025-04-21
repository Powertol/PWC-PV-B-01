const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Rutas
const authRoutes = require('./routes/authRoutes');
const omieRoutes = require('./routes/omieRoutes');
const conversorRoutes = require('./routes/conversorRoutes');
const pvgisRoutes = require('./routes/pvgisRoutes');
const batteryRoutes = require('./routes/batteryRoutes');

const app = express();
const port = process.env.PORT || 3000;

// Configuración de middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));
app.use('/downloads', express.static(path.join(__dirname, '../downloads')));
app.use(session({
    secret: 'powerchoice_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 horas
}));

// Base de datos
require('./models/database');

// Configuración de vistas
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware de autenticación
const authMiddleware = (req, res, next) => {
    if (req.session && req.session.user) {
        next();
    } else {
        // Si es una petición a la API, devolver error JSON
        if (req.originalUrl.startsWith('/api/')) {
            res.status(401).json({
                success: false,
                error: 'No autorizado. Por favor, inicie sesión.'
            });
        } else {
            // Si es una petición web normal, redirigir a login
            res.redirect('/login');
        }
    }
};

// Rutas de autenticación
app.use('/auth', authRoutes);

// Rutas de OMIE
app.use('/omie', authMiddleware, omieRoutes);

// Rutas del conversor
app.use('/conversor', authMiddleware, conversorRoutes);

// Rutas de PVGIS
console.log('Registrando rutas de PVGIS...');
app.use('/pvgis', authMiddleware, pvgisRoutes);

// Rutas de batería
console.log('Registrando rutas de batería...');
app.use('/api/battery', authMiddleware, batteryRoutes);

// Ruta temporal para pruebas sin autenticación
app.post('/optimize-test', express.json(), async (req, res) => {
    const BatteryController = require('./controllers/batteryController');
    await BatteryController.optimize(req, res);
});

// Ruta temporal para pruebas
app.post('/api/analyze-battery', express.json(), async (req, res) => {
    const BatteryController = require('./controllers/batteryController');
    await BatteryController.runAnalysis(req, res);
});

// Ruta temporal para pruebas de lectura de Excel
app.get('/read-excel', express.json(), async (req, res) => {
    const { readExcelFile } = require('./utils/excelReader');
    const { filename } = req.query;
    if (!filename) {
        return res.status(400).json({
            success: false,
            error: 'Nombre de archivo requerido'
        });
    }

    const filePath = path.join(__dirname, '..', filename);
    const result = readExcelFile(filePath);
    res.json(result);
});

// Rutas de vistas
app.get('/', (req, res) => {
    res.redirect('/login');
});

app.get('/login', (req, res) => {
    if (req.session.user) {
        res.redirect('/dashboard');
    } else {
        res.render('login');
    }
});

app.get('/dashboard', authMiddleware, (req, res) => {
    res.render('dashboard', { user: req.session.user });
});

// Manejo de errores
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('¡Algo salió mal!');
});

// Iniciar servidor
app.listen(port, () => {
    console.log(`Servidor ejecutándose en http://localhost:${port}`);
});

module.exports = app;