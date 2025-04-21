const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
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

// Configuración de sesión con PostgreSQL
const sessionConfig = {
    store: new pgSession({
        conString: process.env.DATABASE_URL,
        createTableIfMissing: true,
        pruneSessionInterval: 60
    }),
    secret: process.env.SESSION_SECRET || 'bees_session_secret_2025',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 horas
    }
};

if (app.get('env') === 'production') {
    app.set('trust proxy', 1); // Confiar en el proxy de Render
}

app.use(session(sessionConfig));

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
app.use('/pvgis', authMiddleware, pvgisRoutes);

// Rutas de batería
app.use('/api/battery', authMiddleware, batteryRoutes);

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
    if (process.env.NODE_ENV === 'production') {
        res.status(500).json({
            error: 'Error interno del servidor'
        });
    } else {
        res.status(500).json({
            error: err.message,
            stack: err.stack
        });
    }
});

// Iniciar servidor
app.listen(port, () => {
    console.log(`Servidor ejecutándose en puerto ${port}`);
});

module.exports = app;