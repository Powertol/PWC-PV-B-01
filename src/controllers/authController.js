const bcrypt = require('bcrypt');
const db = require('../models/database');

const authController = {
    login: async (req, res) => {
        const { username, password } = req.body;
        
        db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
            if (err) {
                return res.status(500).json({ error: 'Error de servidor' });
            }
            
            if (!user) {
                return res.status(401).json({ error: 'Usuario no encontrado' });
            }

            const validPassword = await bcrypt.compare(password, user.password);
            if (!validPassword) {
                return res.status(401).json({ error: 'Contraseña incorrecta' });
            }

            // Registrar sesión
            db.run('INSERT INTO sessions (user_id) VALUES (?)', [user.id], function(err) {
                if (err) {
                    console.error('Error al registrar sesión:', err);
                } else {
                    // Guardar el ID de la sesión en la sesión del usuario
                    const sessionId = this.lastID;
                    
                    // Registrar métrica de login
                    db.run('INSERT INTO metrics (user_id, action) VALUES (?, ?)',
                        [user.id, 'login']);

                    req.session.user = {
                        id: user.id,
                        username: user.username,
                        role: user.role,
                        sessionId: sessionId
                    };

                    res.json({ success: true, redirect: '/dashboard' });
                }
            });
        });
    },

    logout: (req, res) => {
        if (req.session.user) {
            // Actualizar el registro de sesión
            const endTime = new Date().toISOString();
            db.run(`
                UPDATE sessions
                SET end_time = ?,
                    duration = ROUND((JULIANDAY(?) - JULIANDAY(start_time)) * 86400)
                WHERE id = ?`,
                [endTime, endTime, req.session.user.sessionId],
                (err) => {
                    if (err) {
                        console.error('Error al actualizar sesión:', err);
                    }
                }
            );

            // Registrar métrica de logout
            db.run('INSERT INTO metrics (user_id, action) VALUES (?, ?)',
                [req.session.user.id, 'logout']);
        }
        
        req.session.destroy();
        res.redirect('/login');
    },

    createUser: async (req, res) => {
        if (req.session.user?.role !== 'admin') {
            return res.status(403).json({ error: 'Acceso denegado' });
        }

        const { username, password, role } = req.body;

        try {
            const hashedPassword = await bcrypt.hash(password, 10);
            
            db.run('INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
                [username, hashedPassword, role],
                function(err) {
                    if (err) {
                        if (err.message.includes('UNIQUE constraint failed')) {
                            return res.status(400).json({ error: 'El usuario ya existe' });
                        }
                        return res.status(500).json({ error: 'Error al crear usuario' });
                    }

                    // Registrar métrica de creación de usuario
                    db.run('INSERT INTO metrics (user_id, action) VALUES (?, ?)', 
                        [req.session.user.id, `created_user:${username}`]);

                    res.json({ 
                        success: true, 
                        message: 'Usuario creado exitosamente',
                        userId: this.lastID 
                    });
                }
            );
        } catch (error) {
            res.status(500).json({ error: 'Error al crear usuario' });
        }
    },

    getUserSessions: (req, res) => {
        if (req.session.user?.role !== 'admin') {
            return res.status(403).json({ error: 'Acceso denegado' });
        }

        db.all(`
            SELECT
                s.id,
                u.username,
                s.start_time,
                s.end_time,
                s.duration,
                CASE
                    WHEN s.end_time IS NULL THEN 'Activa'
                    ELSE 'Finalizada'
                END as status
            FROM sessions s
            JOIN users u ON s.user_id = u.id
            ORDER BY s.start_time DESC
        `, (err, sessions) => {
            if (err) {
                return res.status(500).json({ error: 'Error al obtener sesiones' });
            }
            res.json(sessions);
        });
    },

    getMetrics: (req, res) => {
        if (req.session.user?.role !== 'admin') {
            return res.status(403).json({ error: 'Acceso denegado' });
        }

        db.all(`
            SELECT 
                m.action,
                m.timestamp,
                u.username,
                COUNT(*) as count
            FROM metrics m
            JOIN users u ON m.user_id = u.id
            GROUP BY m.action, u.username
            ORDER BY m.timestamp DESC
        `, (err, metrics) => {
            if (err) {
                return res.status(500).json({ error: 'Error al obtener métricas' });
            }
            res.json(metrics);
        });
    },

    getUsers: (req, res) => {
        if (req.session.user?.role !== 'admin') {
            return res.status(403).json({ error: 'Acceso denegado' });
        }

        db.all('SELECT id, username, role FROM users', (err, users) => {
            if (err) {
                return res.status(500).json({ error: 'Error al obtener usuarios' });
            }
            res.json(users);
        });
    },

    updateUser: async (req, res) => {
        if (req.session.user?.role !== 'admin') {
            return res.status(403).json({ error: 'Acceso denegado' });
        }

        const { id, username, password, role } = req.body;

        try {
            // Si se proporciona una nueva contraseña, hashearla
            let updateQuery = 'UPDATE users SET username = ?, role = ?';
            let params = [username, role];

            if (password) {
                const hashedPassword = await bcrypt.hash(password, 10);
                updateQuery += ', password = ?';
                params.push(hashedPassword);
            }

            updateQuery += ' WHERE id = ?';
            params.push(id);

            db.run(updateQuery, params, function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint failed')) {
                        return res.status(400).json({ error: 'El nombre de usuario ya existe' });
                    }
                    return res.status(500).json({ error: 'Error al actualizar usuario' });
                }

                // Registrar métrica de actualización
                db.run('INSERT INTO metrics (user_id, action) VALUES (?, ?)',
                    [req.session.user.id, `updated_user:${username}`]);

                res.json({
                    success: true,
                    message: 'Usuario actualizado exitosamente'
                });
            });
        } catch (error) {
            res.status(500).json({ error: 'Error al actualizar usuario' });
        }
    },

    deleteUser: (req, res) => {
        if (req.session.user?.role !== 'admin') {
            return res.status(403).json({ error: 'Acceso denegado' });
        }

        const { id } = req.params;

        // No permitir eliminar al propio usuario administrador
        if (parseInt(id) === req.session.user.id) {
            return res.status(400).json({ error: 'No puedes eliminar tu propio usuario' });
        }

        db.get('SELECT username FROM users WHERE id = ?', [id], (err, user) => {
            if (err) {
                return res.status(500).json({ error: 'Error al buscar usuario' });
            }

            if (!user) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }

            db.run('DELETE FROM users WHERE id = ?', [id], function(err) {
                if (err) {
                    return res.status(500).json({ error: 'Error al eliminar usuario' });
                }

                // Registrar métrica de eliminación
                db.run('INSERT INTO metrics (user_id, action) VALUES (?, ?)',
                    [req.session.user.id, `deleted_user:${user.username}`]);

                res.json({
                    success: true,
                    message: 'Usuario eliminado exitosamente'
                });
            });
        });
    }
};

module.exports = authController;