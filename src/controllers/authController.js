const bcrypt = require('bcrypt');
const db = require('../models/database');

const authController = {
    login: async (req, res) => {
        const { username, password } = req.body;
        
        try {
            const user = await db.oneOrNone('SELECT * FROM users WHERE username = $1', [username]);
            
            if (!user) {
                return res.status(401).json({ error: 'Usuario no encontrado' });
            }

            const validPassword = await bcrypt.compare(password, user.password);
            if (!validPassword) {
                return res.status(401).json({ error: 'Contraseña incorrecta' });
            }

            // Registrar sesión
            const result = await db.one(
                'INSERT INTO sessions (user_id) VALUES ($1) RETURNING id',
                [user.id]
            );

            // Registrar métrica de login
            await db.none(
                'INSERT INTO metrics (user_id, action) VALUES ($1, $2)',
                [user.id, 'login']
            );

            req.session.user = {
                id: user.id,
                username: user.username,
                role: user.role,
                sessionId: result.id
            };

            res.json({ success: true, redirect: '/dashboard' });
        } catch (error) {
            console.error('Error en login:', error);
            res.status(500).json({ error: 'Error de servidor' });
        }
    },

    logout: async (req, res) => {
        if (req.session.user) {
            try {
                const endTime = new Date().toISOString();
                // Actualizar el registro de sesión
                await db.none(`
                    UPDATE sessions
                    SET end_time = $1,
                        duration = EXTRACT(EPOCH FROM ($1::timestamp - start_time))
                    WHERE id = $2`,
                    [endTime, req.session.user.sessionId]
                );

                // Registrar métrica de logout
                await db.none(
                    'INSERT INTO metrics (user_id, action) VALUES ($1, $2)',
                    [req.session.user.id, 'logout']
                );
            } catch (error) {
                console.error('Error en logout:', error);
            }
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
            
            const result = await db.one(
                'INSERT INTO users (username, password, role) VALUES ($1, $2, $3) RETURNING id',
                [username, hashedPassword, role]
            );

            // Registrar métrica de creación de usuario
            await db.none(
                'INSERT INTO metrics (user_id, action) VALUES ($1, $2)',
                [req.session.user.id, `created_user:${username}`]
            );

            res.json({
                success: true,
                message: 'Usuario creado exitosamente',
                userId: result.id
            });
        } catch (error) {
            if (error.constraint === 'users_username_key') {
                return res.status(400).json({ error: 'El usuario ya existe' });
            }
            res.status(500).json({ error: 'Error al crear usuario' });
        }
    },

    getUserSessions: async (req, res) => {
        if (req.session.user?.role !== 'admin') {
            return res.status(403).json({ error: 'Acceso denegado' });
        }

        try {
            const sessions = await db.any(`
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
            `);
            res.json(sessions);
        } catch (error) {
            res.status(500).json({ error: 'Error al obtener sesiones' });
        }
    },

    getMetrics: async (req, res) => {
        if (req.session.user?.role !== 'admin') {
            return res.status(403).json({ error: 'Acceso denegado' });
        }

        try {
            const metrics = await db.any(`
                SELECT 
                    m.action,
                    m.timestamp,
                    u.username,
                    COUNT(*) as count
                FROM metrics m
                JOIN users u ON m.user_id = u.id
                GROUP BY m.action, u.username, m.timestamp
                ORDER BY m.timestamp DESC
            `);
            res.json(metrics);
        } catch (error) {
            res.status(500).json({ error: 'Error al obtener métricas' });
        }
    },

    getUsers: async (req, res) => {
        if (req.session.user?.role !== 'admin') {
            return res.status(403).json({ error: 'Acceso denegado' });
        }

        try {
            const users = await db.any('SELECT id, username, role FROM users');
            res.json(users);
        } catch (error) {
            res.status(500).json({ error: 'Error al obtener usuarios' });
        }
    },

    updateUser: async (req, res) => {
        if (req.session.user?.role !== 'admin') {
            return res.status(403).json({ error: 'Acceso denegado' });
        }

        const { id, username, password, role } = req.body;

        try {
            let updateQuery = 'UPDATE users SET username = $1, role = $2';
            let params = [username, role];

            if (password) {
                const hashedPassword = await bcrypt.hash(password, 10);
                updateQuery += ', password = $3';
                params.push(hashedPassword);
            }

            updateQuery += ' WHERE id = $' + (params.length + 1);
            params.push(id);

            await db.none(updateQuery, params);

            // Registrar métrica de actualización
            await db.none(
                'INSERT INTO metrics (user_id, action) VALUES ($1, $2)',
                [req.session.user.id, `updated_user:${username}`]
            );

            res.json({
                success: true,
                message: 'Usuario actualizado exitosamente'
            });
        } catch (error) {
            if (error.constraint === 'users_username_key') {
                return res.status(400).json({ error: 'El nombre de usuario ya existe' });
            }
            res.status(500).json({ error: 'Error al actualizar usuario' });
        }
    },

    deleteUser: async (req, res) => {
        if (req.session.user?.role !== 'admin') {
            return res.status(403).json({ error: 'Acceso denegado' });
        }

        const { id } = req.params;

        if (parseInt(id) === req.session.user.id) {
            return res.status(400).json({ error: 'No puedes eliminar tu propio usuario' });
        }

        try {
            const user = await db.oneOrNone('SELECT username FROM users WHERE id = $1', [id]);

            if (!user) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }

            await db.none('DELETE FROM users WHERE id = $1', [id]);

            // Registrar métrica de eliminación
            await db.none(
                'INSERT INTO metrics (user_id, action) VALUES ($1, $2)',
                [req.session.user.id, `deleted_user:${user.username}`]
            );

            res.json({
                success: true,
                message: 'Usuario eliminado exitosamente'
            });
        } catch (error) {
            res.status(500).json({ error: 'Error al eliminar usuario' });
        }
    }
};

module.exports = authController;