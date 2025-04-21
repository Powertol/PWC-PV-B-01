// Función para formatear la duración en formato legible
function formatDuration(seconds) {
    if (!seconds) return 'N/A';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    let duration = [];
    if (hours > 0) duration.push(`${hours}h`);
    if (minutes > 0) duration.push(`${minutes}m`);
    if (remainingSeconds > 0) duration.push(`${remainingSeconds}s`);

    return duration.join(' ') || '0s';
}

// Función para formatear la fecha
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('es-ES', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

// Función para cargar las sesiones de usuarios
async function loadSessions() {
    try {
        const response = await fetch('/auth/sessions');
        const sessions = await response.json();
        
        const tableBody = document.getElementById('sessionsTableBody');
        tableBody.innerHTML = '';
        
        sessions.forEach(session => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${session.username}</td>
                <td>${formatDate(session.start_time)}</td>
                <td>${formatDate(session.end_time)}</td>
                <td>${formatDuration(session.duration)}</td>
                <td class="${session.status === 'Activa' ? 'session-active' : 'session-ended'}">${session.status}</td>
            `;
            tableBody.appendChild(tr);
        });
    } catch (error) {
        console.error('Error al cargar sesiones:', error);
        alert('Error al cargar el historial de sesiones');
    }
}

// Función para cargar la lista de usuarios
async function loadUsers() {
    try {
        const response = await fetch('/auth/users');
        const users = await response.json();
        
        const tableBody = document.getElementById('usersTableBody');
        tableBody.innerHTML = '';
        
        users.forEach(user => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${user.username}</td>
                <td>${user.role === 'admin' ? 'Administrador' : 'Usuario'}</td>
                <td class="action-buttons">
                    <button onclick="editUser(${user.id}, '${user.username}', '${user.role}')" class="edit-btn">
                        <i class="material-icons">edit</i>
                        <span>Editar</span>
                    </button>
                    <button onclick="deleteUser(${user.id}, '${user.username}')" class="delete-btn">
                        <i class="material-icons">delete</i>
                        <span>Eliminar</span>
                    </button>
                </td>
            `;
            tableBody.appendChild(tr);
        });
    } catch (error) {
        console.error('Error al cargar usuarios:', error);
        alert('Error al cargar la lista de usuarios');
    }
}

// Manejadores de modales
function openCreateModal() {
    document.getElementById('createUserModal').style.display = 'block';
}

function closeCreateModal() {
    document.getElementById('createUserModal').style.display = 'none';
    document.getElementById('createUserForm').reset();
}

function openEditModal() {
    document.getElementById('editUserModal').style.display = 'block';
}

function closeEditModal() {
    document.getElementById('editUserModal').style.display = 'none';
    document.getElementById('editUserForm').reset();
}

// Función para editar usuario
function editUser(id, username, role) {
    document.getElementById('editUserId').value = id;
    document.getElementById('editUsername').value = username;
    document.getElementById('editRole').value = role;
    document.getElementById('editPassword').value = ''; // Limpiar contraseña
    openEditModal();
}

// Función para eliminar usuario
async function deleteUser(id, username) {
    if (!confirm(`¿Estás seguro de que deseas eliminar al usuario ${username}?`)) {
        return;
    }

    try {
        const response = await fetch(`/auth/users/${id}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Error al eliminar usuario');
        }

        alert('Usuario eliminado exitosamente');
        loadUsers(); // Recargar lista de usuarios
    } catch (error) {
        console.error('Error:', error);
        alert(error.message);
    }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Cargar usuarios al inicio
    loadUsers();

    // Manejador del botón crear usuario
    const createUserBtn = document.getElementById('createUserBtn');
    if (createUserBtn) {
        createUserBtn.addEventListener('click', openCreateModal);
    }

    // Manejador del formulario crear usuario
    const createUserForm = document.getElementById('createUserForm');
    if (createUserForm) {
        createUserForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const userData = {
                username: document.getElementById('newUsername').value,
                password: document.getElementById('newPassword').value,
                role: document.getElementById('newRole').value
            };

            try {
                const response = await fetch('/auth/users', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(userData)
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || 'Error al crear usuario');
                }

                alert('Usuario creado exitosamente');
                closeCreateModal();
                loadUsers(); // Recargar lista de usuarios
            } catch (error) {
                console.error('Error:', error);
                alert(error.message);
            }
        
            // Cargar sesiones al cargar usuarios
            loadSessions();
        });
        
        // Actualizar sesiones cada minuto
        setInterval(loadSessions, 60000);
    }

    // Manejador del formulario editar usuario
    const editUserForm = document.getElementById('editUserForm');
    if (editUserForm) {
        editUserForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const id = document.getElementById('editUserId').value;
            const userData = {
                id: id,
                username: document.getElementById('editUsername').value,
                password: document.getElementById('editPassword').value,
                role: document.getElementById('editRole').value
            };

            try {
                const response = await fetch(`/auth/users/${id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(userData)
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || 'Error al actualizar usuario');
                }

                alert('Usuario actualizado exitosamente');
                closeEditModal();
                loadUsers(); // Recargar lista de usuarios
            } catch (error) {
                console.error('Error:', error);
                alert(error.message);
            }
        });
    }
});