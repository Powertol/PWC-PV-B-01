// Inicializar el mapa
let map;
let marker;

function initMap() {
    map = L.map('map').setView([40.416775, -3.703790], 6); // Centro en España

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Agregar control de búsqueda
    const searchControl = L.Control.geocoder({
        defaultMarkGeocode: false
    }).addTo(map);

    searchControl.on('markgeocode', function(e) {
        const latLng = e.geocode.center;
        setMarker(latLng);
        map.setView(latLng, 13);
    });

    // Evento de clic en el mapa
    map.on('click', function(e) {
        setMarker(e.latlng);
    });

    // Manejar cambios en el tipo de montaje
    document.getElementById('mountingSystem').addEventListener('change', function(e) {
        const angleGroup = document.querySelector('.form-group[data-field="angle"]');
        const aspectGroup = document.querySelector('.form-group[data-field="aspect"]');
        
        switch(e.target.value) {
            case 'fixed':
                angleGroup.style.display = 'block';
                aspectGroup.style.display = 'block';
                break;
            case 'vertical_axis':
                angleGroup.style.display = 'block';
                aspectGroup.style.display = 'none';
                break;
            case 'inclined_axis':
                angleGroup.style.display = 'block';
                aspectGroup.style.display = 'none';
                break;
            case 'two_axis':
                angleGroup.style.display = 'none';
                aspectGroup.style.display = 'none';
                break;
        }
    });
}

function setMarker(latlng) {
    if (marker) {
        map.removeLayer(marker);
    }
    marker = L.marker(latlng).addTo(map);
    document.getElementById('latitude').value = latlng.lat.toFixed(6);
    document.getElementById('longitude').value = latlng.lng.toFixed(6);
}

// Manejar el envío del formulario
document.getElementById('pvgisForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const mountingSystem = document.getElementById('mountingSystem').value;
    const formData = {
        lat: document.getElementById('latitude').value,
        lon: document.getElementById('longitude').value,
        peakpower: document.getElementById('peakPower').value,
        loss: document.getElementById('systemLoss').value,
        mounting_system: mountingSystem,
        angle: mountingSystem !== 'two_axis' ? document.getElementById('angle').value : '0',
        aspect: mountingSystem === 'fixed' ? document.getElementById('aspect').value : '0'
    };

    try {
        const loadingMsg = document.getElementById('loadingMessage');
        const errorMsg = document.getElementById('errorMessage');
        
        loadingMsg.style.display = 'block';
        errorMsg.style.display = 'none';
        loadingMsg.textContent = 'Calculando producción solar...';

        const response = await fetch('/pvgis/calculate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        const result = await response.json();

        if (result.success) {
            loadingMsg.textContent = 'Cálculo completado. Descargando Excel...';
            window.location.href = '/downloads/' + result.file;
        } else {
            throw new Error(result.message || 'Error al procesar la solicitud');
        }

    } catch (error) {
        document.getElementById('errorMessage').textContent = 
            'Error: ' + (error.message || 'Error al procesar la solicitud');
        document.getElementById('errorMessage').style.display = 'block';
    } finally {
        document.getElementById('loadingMessage').style.display = 'none';
    }
});

// Inicializar mapa cuando se carga la página
document.addEventListener('DOMContentLoaded', initMap);