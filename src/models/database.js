const pgp = require('pg-promise')();
const bcrypt = require('bcrypt');

const connectionString = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_hexzg0qALTv1@ep-sparkling-brook-a2kg7qoz-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require';
const db = pgp(connectionString);

// Función para inicializar las tablas
async function initializeTables() {
    try {
        // Tabla de usuarios
        await db.none(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE,
                password TEXT,
                role TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabla de métricas
        await db.none(`
            CREATE TABLE IF NOT EXISTS metrics (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                action TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabla de sesiones de usuario
        await db.none(`
            CREATE TABLE IF NOT EXISTS sessions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                end_time TIMESTAMP,
                duration INTEGER
            )
        `);

        // Tabla de archivos descargados
        await db.none(`
            CREATE TABLE IF NOT EXISTS downloaded_files (
                id SERIAL PRIMARY KEY,
                filename TEXT UNIQUE,
                download_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                file_date DATE,
                file_path TEXT
            )
        `);

        // Tabla de precios de energía
        await db.none(`
            CREATE TABLE IF NOT EXISTS energy_prices (
                id SERIAL PRIMARY KEY,
                year INTEGER,
                month INTEGER,
                day INTEGER,
                hour INTEGER,
                price_mwh DECIMAL(10, 2),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(year, month, day, hour)
            )
        `);

        // Tabla de producción solar
        await db.none(`
            CREATE TABLE IF NOT EXISTS solar_production (
                id SERIAL PRIMARY KEY,
                year INTEGER,
                month INTEGER,
                day INTEGER,
                hour INTEGER,
                production_mwh DECIMAL(10, 6),
                latitude DECIMAL(9, 6),
                longitude DECIMAL(9, 6),
                peak_power DECIMAL(10, 2),
                system_loss DECIMAL(5, 2),
                mounting_system TEXT,
                angle DECIMAL(5, 2),
                azimuth DECIMAL(5, 2),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(year, month, day, hour, latitude, longitude)
            )
        `);

        // Tabla de configuración de instalaciones
        await db.none(`
            CREATE TABLE IF NOT EXISTS installations (
                id SERIAL PRIMARY KEY,
                name TEXT,
                latitude DECIMAL(9, 6),
                longitude DECIMAL(9, 6),
                peak_power DECIMAL(10, 2),
                system_loss DECIMAL(5, 2),
                mounting_system TEXT,
                angle DECIMAL(5, 2),
                azimuth DECIMAL(5, 2),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                user_id INTEGER REFERENCES users(id)
            )
        `);

        // Crear superadmin si no existe
        const admin = await db.oneOrNone('SELECT id FROM users WHERE username = $1', ['admin']);
        if (!admin) {
            const hashedPassword = await bcrypt.hash('admin', 10);
            await db.none(
                'INSERT INTO users (username, password, role) VALUES ($1, $2, $3)',
                ['admin', hashedPassword, 'admin']
            );
            console.log('Admin user created successfully');
        }

    } catch (error) {
        console.error('Error initializing database:', error);
        throw error;
    }
}

// Inicializar tablas
initializeTables().catch(console.error);

module.exports = db;