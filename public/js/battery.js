document.addEventListener('DOMContentLoaded', function() {
    const batteryForm = document.getElementById('batteryForm');
    const downloadButton = document.getElementById('downloadAnalysis');
    const loadingMessage = document.getElementById('batteryLoadingMessage');
    const errorMessage = document.getElementById('batteryErrorMessage');

    // Configurar fecha máxima (hoy)
    const today = new Date();
    const maxDate = today.toISOString().split('T')[0];

    document.getElementById('startDate').setAttribute('max', maxDate);
    document.getElementById('endDate').setAttribute('max', maxDate);

    batteryForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        downloadButton.disabled = true;
        
        try {
            showLoading('Procesando datos y generando análisis...');
            hideError();
            hideResults();

            // Recopilar datos del formulario
            const formData = {
                startDate: document.getElementById('startDate').value,
                endDate: document.getElementById('endDate').value,
                capacity: parseFloat(document.getElementById('capacity').value),
                efficiency: parseFloat(document.getElementById('efficiency').value) / 100,
                dod: parseFloat(document.getElementById('dod').value) / 100,
                cRate: parseFloat(document.getElementById('cRate').value),
                manufacturer: document.getElementById('manufacturer').value
            };

            // Validar fechas
            if (new Date(formData.startDate) > new Date(formData.endDate)) {
                throw new Error('La fecha de inicio debe ser anterior a la fecha de fin');
            }

            // Realizar petición al servidor para procesar los datos
            const response = await fetch('/api/battery/optimize', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Error al procesar los datos');
            }

            // Mostrar los resultados
            const data = await response.json();
            
            // Formatear los valores monetarios
            const formatCurrency = (value) => {
                return new Intl.NumberFormat('es-ES', {
                    style: 'currency',
                    currency: 'EUR',
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                }).format(value);
            };

            // Formatear los porcentajes
            const formatPercentage = (value) => {
                return new Intl.NumberFormat('es-ES', {
                    style: 'percent',
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1
                }).format(value / 100);
            };

            // Actualizar los elementos de la interfaz - Ingresos
            document.getElementById('solarOnlyRevenue').textContent = formatCurrency(data.revenues.solarOnly);
            document.getElementById('withBatteryRevenue').textContent = formatCurrency(data.revenues.withBattery);
            document.getElementById('revenueImprovement').textContent = formatCurrency(data.revenues.improvement);

            // Actualizar los elementos de la interfaz - Degradación
            document.getElementById('totalDegradation').textContent = formatPercentage(data.degradation.totalDegradation);
            document.getElementById('cyclesDegradation').textContent = formatPercentage(data.degradation.bySource.cycles);
            document.getElementById('naturalDegradation').textContent = formatPercentage(data.degradation.bySource.natural);
            document.getElementById('remainingCapacity').textContent = formatPercentage(data.degradation.remainingCapacity * 100);

            // Mostrar la sección de resultados y habilitar el botón de descarga
            document.getElementById('batteryResults').style.display = 'block';
            downloadButton.disabled = false;

        } catch (error) {
            showError(error.message || 'Error al procesar la solicitud');
        } finally {
            hideLoading();
        }
    });

    // Manejador para el botón de descarga
    downloadButton.addEventListener('click', function() {
        window.location.href = '/api/battery/download-report';
    });

    function showLoading(message) {
        loadingMessage.textContent = message;
        loadingMessage.style.display = 'block';
    }

    function hideLoading() {
        loadingMessage.style.display = 'none';
    }

    function hideResults() {
        document.getElementById('batteryResults').style.display = 'none';
    }

    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
    }

    function hideError() {
        errorMessage.style.display = 'none';
    }
});

// Añadir estilos para los botones
const style = document.createElement('style');
style.textContent = `
    .form-actions {
        display: flex;
        gap: 1rem;
        justify-content: center;
        margin-top: 2rem;
    }

    .btn-secondary {
        background-color: var(--secondary-color);
    }

    .btn-secondary:disabled {
        background-color: #ccc;
        cursor: not-allowed;
    }
`;
document.head.appendChild(style);