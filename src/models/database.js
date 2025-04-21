const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

// En Render, usamos /var/data para almacenamiento persistente
const dbPath = process.env.NODE_ENV === 'production'
    ? path.join('/var/data', 'database.sqlite')
    : path.resolve(__dirname, '../../database.sqlite');

// Asegurarse de que el directorio existe en producción
if (process.env.NODE_ENV === 'production') {
    const fs = require('fs');
    const dir = '/var/data';
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

const db = new sqlite3.Database(dbPath);

// Crear tablas
db.serialize(() => {
    // Tabla de usuarios
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        role TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Tabla de métricas
    db.run(`CREATE TABLE IF NOT EXISTS metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        action TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    // Tabla de sesiones de usuario
    db.run(`CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        end_time DATETIME,
        duration INTEGER, /* duración en segundos */
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    // Tabla de archivos descargados
    // Primero eliminamos la tabla existente si existe
    db.run(`DROP TABLE IF EXISTS downloaded_files`);
    
    // Creamos la tabla con la nueva estructura
    db.run(`CREATE TABLE IF NOT EXISTS downloaded_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT UNIQUE,
        download_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        file_date DATE,
        file_path TEXT
    )`);

    // Crear superadmin si no existe
    const createAdmin = async () => {
        const hashedPassword = await bcrypt.hash('admin', 10);
        db.get("SELECT id FROM users WHERE username = 'admin'", (err, row) => {
            if (!row) {
                db.run("INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
                    ['admin', hashedPassword, 'admin']);
            }
        });
    };
    createAdmin();
});

module.exports = db;