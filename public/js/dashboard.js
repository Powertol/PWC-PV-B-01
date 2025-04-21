document.addEventListener('DOMContentLoaded', () => {
    // Elementos del DOM
    const startDownloadBtn = document.getElementById('startDownload');
    const downloadProgress = document.getElementById('downloadProgress');
    const availableFilesEl = document.getElementById('availableFiles');
    const downloadedFilesEl = document.getElementById('downloadedFiles');
    const pendingFilesEl = document.getElementById('pendingFiles');
    const createUserBtn = document.getElementById('createUserBtn');
    const userModal = document.getElementById('userModal');
    const metricsData = document.getElementById('metricsData');
    const navBar = document.querySelector('.app-nav');

    // Manejar la barra de navegación pegajosa
    function handleNavbarScroll() {
        if (window.scrollY > 0) {
            navBar.classList.add('scrolled');
        } else {
            navBar.classList.remove('scrolled');
        }
    }

    window.addEventListener('scroll', handleNavbarScroll);

    // Animación para los números en las tarjetas de estadísticas
    function animateValue(element, start, end, duration) {
        const range = end - start;
        const increment = range / (duration / 16);
        let current = start;
        
        const timer = setInterval(() => {
            current += increment;
            if ((increment > 0 && current >= end) || (increment < 0 && current <= end)) {
                clearInterval(timer);
                element.textContent = end;
            } else {
                element.textContent = Math.round(current);
            }
        }, 16);
    }

    // Función para actualizar el estado de las descargas
    async function updateDownloadStatus() {
        try {
            const response = await fetch('/omie/status');
            const data = await response.json();

            // Animar los valores con transición suave
            animateValue(availableFilesEl, parseInt(availableFilesEl.textContent) || 0, data.available, 500);
            animateValue(downloadedFilesEl, parseInt(downloadedFilesEl.textContent) || 0, data.downloaded, 500);
            animateValue(pendingFilesEl, parseInt(pendingFilesEl.textContent) || 0, data.pending, 500);

            // Animar la barra de progreso
            const progress = ((data.downloaded / data.available) * 100) || 0;
            downloadProgress.style.width = `${progress}%`;
            downloadProgress.style.backgroundColor = progress === 100 ? 'var(--success-color)' : 'var(--primary-color)';

            return data;
        } catch (error) {
            console.error('Error al obtener estado:', error);
        }
    }

    // Iniciar descarga de archivos
    if (startDownloadBtn) {
        startDownloadBtn.addEventListener('click', async () => {
            try {
                startDownloadBtn.disabled = true;
                startDownloadBtn.innerHTML = '<span class="spinner"></span> Descargando...';
                startDownloadBtn.classList.add('downloading');

                const response = await fetch('/omie/download', {
                    method: 'POST'
                });
                const data = await response.json();

                if (data.success) {
                    await updateDownloadStatus();
                    alert('Descarga completada exitosamente');
                } else {
                    throw new Error(data.error);
                }
            } catch (error) {
                alert('Error en la descarga: ' + error.message);
            } finally {
                startDownloadBtn.disabled = false;
                startDownloadBtn.textContent = 'Iniciar Descarga';
            }
        });
    }

    // Funcionalidad para crear usuarios (solo admin)
    if (createUserBtn) {
        createUserBtn.addEventListener('click', () => {
            userModal.style.display = 'block';
        });

        const createUserForm = document.getElementById('createUserForm');
        createUserForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const formData = {
                username: document.getElementById('newUsername').value,
                password: document.getElementById('newPassword').value,
                role: document.getElementById('role').value
            };

            try {
                const response = await fetch('/auth/users', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(formData)
                });

                const data = await response.json();

                if (data.success) {
                    alert('Usuario creado exitosamente');
                    userModal.style.display = 'none';
                    createUserForm.reset();
                } else {
                    throw new Error(data.error);
                }
            } catch (error) {
                alert('Error al crear usuario: ' + error.message);
            }
        });
    }

    // Función para cerrar el modal
    window.closeModal = function() {
        userModal.style.display = 'none';
    }

    // Cargar métricas para administradores
    async function loadMetrics() {
        if (!metricsData) return;

        try {
            const response = await fetch('/auth/metrics');
            const metrics = await response.json();

            const metricsHTML = metrics.map(metric => `
                <div class="metric-item" style="
                    background: white;
                    padding: 1rem;
                    border-radius: var(--border-radius);
                    margin-bottom: 1rem;
                    box-shadow: var(--card-shadow);
                    transition: transform 0.3s ease;
                    cursor: pointer;
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 1rem;
                    align-items: center;">
                    <div style="font-weight: bold; color: var(--primary-color);">
                        ${metric.action.replace(/_/g, ' ').toUpperCase()}
                    </div>
                    <div>Usuario: ${metric.username}</div>
                    <div>Cantidad: <span style="color: var(--secondary-color); font-weight: bold;">${metric.count}</span></div>
                    <div>Última vez: ${new Date(metric.timestamp).toLocaleString()}</div>
                </div>
            `).join('');

            metricsData.innerHTML = metricsHTML;
        } catch (error) {
            console.error('Error al cargar métricas:', error);
        }
    }

    // Actualizar estado inicial y configurar actualizaciones periódicas
    updateDownloadStatus();
    loadMetrics();
    
    // Actualizar estado cada 30 segundos
    setInterval(updateDownloadStatus, 30000);
    // Actualizar métricas cada 2 minutos
    setInterval(loadMetrics, 120000);
});