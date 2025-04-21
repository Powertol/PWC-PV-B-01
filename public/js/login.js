document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const errorMessage = document.getElementById('errorMessage');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        try {
            const response = await fetch('/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (data.success) {
                window.location.href = data.redirect;
            } else {
                errorMessage.textContent = data.error || 'Error al iniciar sesión';
            }
        } catch (error) {
            errorMessage.textContent = 'Error de conexión';
            console.error('Error:', error);
        }
    });
});