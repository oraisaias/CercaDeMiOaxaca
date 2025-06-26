let initLoad = true;
let allPoints = null; // Variable global para almacenar todos los puntos
let currentRadius = 1; // Radio actual en kilómetros
let isLongDistanceMode = false; // Modo de distancia larga
let showTop5Only = false; // Mostrar solo las 5 más cercanas

mapboxgl.accessToken = 'pk.eyJ1IjoiYWpyYWUiLCJhIjoiZjYyMDFjMTJhNjVhNjRmZGFmNjM1MjE1YTYxYjA3YmYifQ.FpDHggdIAaeBm7v0clXkrA';
const map = new mapboxgl.Map({
    container: 'map',
    style: 'https://api.maptiler.com/maps/basic/style.json?key=1HCKO0pQuPEfNXXzGgSM',
    center: [-96.7278992, 17.0608748],
    zoom: 10,
    projection: 'globe',
    maxZoom: 18,
    // Límites expandidos para Oaxaca con más libertad de movimiento
    maxBounds: [
        [-99.0, 15.0], // Suroeste (longitud, latitud) - más al sur y oeste
        [-92.5, 19.0]  // Noreste (longitud, latitud) - más al norte y este
    ]
});

map.on('load', () => {
    let airports;

    map.once('idle', () => {
        d3.json("./data/mis-ubicaciones-filtrado.geojson", function (d) {
            airports = d;
            allPoints = d; // Guardar todos los puntos
            getSpoke(airports);
            setupRadiusControl(); // Configurar el control de radio
            
            // Ocultar splash screen después de que todo esté cargado
            setTimeout(() => {
                const splashScreen = document.getElementById('splashScreen');
                splashScreen.classList.add('fade-out');
                setTimeout(() => {
                    splashScreen.style.display = 'none';
                }, 500);
            }, 1000); // Esperar 1 segundo adicional para asegurar que todo esté listo
        });

        map.on('move', () => {
            getSpoke(airports);
            // Actualizar la posición de la cruz central
            updateCenterCross();
        });
    });
});

// Función para configurar el control de radio
function setupRadiusControl() {
    const radiusSlider = document.getElementById('radiusSlider');
    const radiusValue = document.getElementById('radiusValue');
    const distanceModeToggle = document.getElementById('distanceModeToggle');
    const top5Toggle = document.getElementById('top5Toggle');

    // Función para actualizar el slider según el modo
    function updateSliderMode() {
        if (isLongDistanceMode) {
            // Modo largo: 5-200 km
            radiusSlider.min = 5;
            radiusSlider.max = 200;
            radiusSlider.step = 1;
            if (currentRadius < 5) currentRadius = 5;
            if (currentRadius > 200) currentRadius = 200;
        } else {
            // Modo corto: 0.1-5 km
            radiusSlider.min = 0.1;
            radiusSlider.max = 5;
            radiusSlider.step = 0.1;
            if (currentRadius > 5) currentRadius = 5;
            if (currentRadius < 0.1) currentRadius = 0.1;
        }
        
        radiusSlider.value = currentRadius;
        updateRadiusDisplay();
    }

    // Función para actualizar la visualización del radio
    function updateRadiusDisplay() {
        if (isLongDistanceMode) {
            radiusValue.textContent = `${currentRadius.toFixed(0)} km`;
        } else {
            if (currentRadius < 1) {
                radiusValue.textContent = `${(currentRadius * 1000).toFixed(0)} m`;
            } else {
                radiusValue.textContent = `${currentRadius.toFixed(1)} km`;
            }
        }
    }

    // Event listener para el slider
    radiusSlider.addEventListener('input', (e) => {
        currentRadius = parseFloat(e.target.value);
        updateRadiusDisplay();
        
        // Actualizar las líneas con el nuevo radio
        if (allPoints) {
            getSpoke(allPoints);
        }
    });

    // Event listener para el toggle de modo
    distanceModeToggle.addEventListener('change', (e) => {
        isLongDistanceMode = e.target.checked;
        updateSliderMode();
        
        // Actualizar las líneas con el nuevo radio
        if (allPoints) {
            getSpoke(allPoints);
        }
    });

    // Event listener para el toggle Top 5
    top5Toggle.addEventListener('change', (e) => {
        showTop5Only = e.target.checked;
        
        // Actualizar las líneas con la nueva configuración
        if (allPoints) {
            getSpoke(allPoints);
        }
    });

    // Inicializar el modo
    updateSliderMode();
}

function getSpoke(airports) {
    const center = map.getCenter();
    const newPoint = turf.point([center.lng, center.lat]);
    buildSpoke(airports, newPoint);
}

function buildSpoke(airports, point) {
    let nearestAirports = turf.featureCollection([]);
    let nearestAirportLines = turf.featureCollection([]);
    let shortestLine = null;
    let cleanedAirports = JSON.parse(JSON.stringify(airports));

    // Filtrar puntos dentro del radio especificado
    const pointsInRadius = cleanedAirports.features.filter(feature => {
        const distance = turf.distance(point, feature, {units: 'kilometers'});
        return distance <= currentRadius;
    });

    // Si no hay puntos en el radio, no mostrar líneas
    if (pointsInRadius.length === 0) {
        if (initLoad) {
            addLayers(airports, nearestAirports, nearestAirportLines, shortestLine);
        } else {
            map.getSource('newPoint').setData(nearestAirports);
            map.getSource('newLine').setData(nearestAirportLines);
            map.getSource('shortestLine').setData(shortestLine);
        }
        return;
    }

    // Crear una nueva colección con solo los puntos en el radio
    const filteredAirports = {
        type: 'FeatureCollection',
        features: pointsInRadius
    };

    // Encontrar los puntos más cercanos dentro del radio
    const maxPoints = showTop5Only ? 5 : 10;
    for (let i=1;i<=maxPoints && i<=pointsInRadius.length;i++) {
        const nearest = turf.nearestPoint(point, filteredAirports);
        const startLng = point.geometry.coordinates[0];
        const endLng = nearest.geometry.coordinates[0];
        
        if (startLng >= 90 && endLng <= -90) {
            nearest.geometry.coordinates[0] += 360;
        } else if (startLng <= -90 && endLng >= 90) {
            nearest.geometry.coordinates[0] -= 360;
        }

        const nearestLine = turf.lineString([point.geometry.coordinates, nearest.geometry.coordinates]);
        
        if (i === 1) {
            shortestLine = nearestLine;
        } else {
            nearestAirportLines.features.push(nearestLine);
        }
        
        nearestAirports.features.push(nearest);

        // Remover el punto usado para no repetirlo
        const index = filteredAirports.features.findIndex(n => n.properties.shopCode === nearest.properties.shopCode);
        if (index !== -1) {
            filteredAirports.features.splice(index, 1);
        }
    }

    if (initLoad) {
        addLayers(airports, nearestAirports, nearestAirportLines, shortestLine);
    } else {
        map.getSource('newPoint').setData(nearestAirports);
        map.getSource('newLine').setData(nearestAirportLines);
        map.getSource('shortestLine').setData(shortestLine);
        
        // Actualizar fuente para el punto más cercano si existe
        if (nearestAirports.features.length > 0 && map.getSource('closestPointSource')) {
            const closestPoint = turf.featureCollection([nearestAirports.features[0]]);
            map.getSource('closestPointSource').setData(closestPoint);
        }
    }
}

function addLayers(airports, nearest, route, shortestLine) {
    initLoad = false;

    map.addSource('points', { 'type': 'geojson', 'data': airports });
    map.addSource('newPoint', { 'type': 'geojson', 'data': nearest });
    map.addSource('newLine', { 'type': 'geojson', 'data': route });
    map.addSource('shortestLine', { 'type': 'geojson', 'data': shortestLine });

    // Agregar fuente para el punto central (cruz)
    const centerPoint = turf.point([map.getCenter().lng, map.getCenter().lat]);
    map.addSource('centerPoint', {
        'type': 'geojson',
        'data': centerPoint
    });

    // Capa para la cruz central
    map.addLayer({
        'id': 'centerCross',
        'type': 'symbol',
        'source': 'centerPoint',
        'layout': {
            'text-field': '✚',
            'text-size': 24,
            'text-allow-overlap': true,
            'text-ignore-placement': true
        },
        'paint': {
            'text-color': '#ff0000',
            'text-halo-color': '#ffffff',
            'text-halo-width': 2
        }
    });

    map.addLayer({
        'id': 'globe-points',
        'type': 'circle',
        'source': 'points',
        'paint': {
            'circle-radius': [ 'interpolate', ['linear'], ['zoom'], 0, 0.1, 3, 3 ],
            'circle-opacity': 1,
            'circle-blur': 0,
            'circle-color': '#a7a79b'
        }
    });

    map.on('mouseenter', 'globe-points', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'globe-points', () => { map.getCanvas().style.cursor = ''; });

    map.addLayer({
        'id': 'point-labels',
        'type': 'symbol',
        'source': 'points',
        'layout': {
            'text-field': ['get', 'shopName'],
            'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
            'text-size': 12,
            'text-offset': [0, 1.2],
            'text-anchor': 'top'
        },
        'paint': {
            'text-color': '#222',
            'text-halo-color': '#fff',
            'text-halo-width': 1
        }
    });

    map.addLayer({
        'id': 'globe-newPoint',
        'type': 'circle',
        'source': 'newPoint',
        'paint': {
            'circle-radius': [ 'interpolate', ['linear'], ['zoom'], 0, 0.25, 3, 4 ],
            'circle-opacity': 1,
            'circle-blur': 0,
            'circle-color': '#035690'
        }
    });

    map.on('mouseenter', 'globe-newPoint', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'globe-newPoint', () => { map.getCanvas().style.cursor = ''; });

    // Capa adicional para pequeños círculos al final de las líneas
    map.addLayer({
        'id': 'line-end-points',
        'type': 'circle',
        'source': 'newPoint',
        'paint': {
            'circle-radius': [ 'interpolate', ['linear'], ['zoom'], 0, 2, 3, 6 ],
            'circle-opacity': 0.8,
            'circle-blur': 0,
            'circle-color': '#035690',
            'circle-stroke-width': 1,
            'circle-stroke-color': '#ffffff'
        }
    });

    map.on('mouseenter', 'line-end-points', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'line-end-points', () => { map.getCanvas().style.cursor = ''; });

    map.addLayer({
        'id': 'routeLayer',
        'type': 'line',
        'source': 'newLine',
        'layout': { 'line-join': 'round', 'line-cap': 'round' },
        'paint': {
            'line-color': '#FAB622',
            'line-width': [ 'interpolate', ['linear'], ['zoom'], 0, 0.5, 3, 4 ]
        }
    });

    map.on('mouseenter', 'routeLayer', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'routeLayer', () => { map.getCanvas().style.cursor = ''; });

    map.addLayer({
        'id': 'shortestLine',
        'type': 'line',
        'source': 'shortestLine',
        'layout': { 'line-join': 'round', 'line-cap': 'round' },
        'paint': {
            'line-color': '#4CAF50',
            'line-width': [ 'interpolate', ['linear'], ['zoom'], 0, 1, 3, 6 ]
        }
    });

    map.on('mouseenter', 'shortestLine', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'shortestLine', () => { map.getCanvas().style.cursor = ''; });

    // Capa para el punto más cercano (línea verde) - más grande y destacado
    if (nearest.features.length > 0) {
        const closestPoint = turf.featureCollection([nearest.features[0]]);
        map.addSource('closestPointSource', {
            'type': 'geojson',
            'data': closestPoint
        });
        
        map.addLayer({
            'id': 'closest-point',
            'type': 'circle',
            'source': 'closestPointSource',
            'paint': {
                'circle-radius': [ 'interpolate', ['linear'], ['zoom'], 0, 3, 3, 8 ],
                'circle-opacity': 0.9,
                'circle-blur': 0,
                'circle-color': '#4CAF50',
                'circle-stroke-width': 2,
                'circle-stroke-color': '#ffffff'
            }
        });

        map.on('mouseenter', 'closest-point', () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'closest-point', () => { map.getCanvas().style.cursor = ''; });
    }
}

// Event listeners
document.getElementById('locationButton').addEventListener('click', () => {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((position) => {
            map.jumpTo({
                center: [position.coords.longitude, position.coords.latitude],
                zoom: 15
            });
        });
    }
});

document.getElementById('centerOaxacaButton').addEventListener('click', () => {
    // Coordenadas del centro de la ciudad de Oaxaca
    map.jumpTo({
        center: [-96.7236, 17.0732],
        zoom: 12
    });
});

document.getElementById('closeButton').addEventListener('click', () => {
    document.getElementById('infoPanel').classList.remove('open');
});

function searchOnGoogle() {
    const pointName = document.getElementById('pointName').textContent;
    if (pointName && pointName !== 'Loading...') {
        const searchQuery = encodeURIComponent(pointName);
        window.open(`https://www.google.com/search?q=${searchQuery}`, '_blank');
    }
}

map.on('click', (e) => {
    const features = map.queryRenderedFeatures(e.point, { layers: ['globe-points', 'routeLayer', 'shortestLine'] });
    if (features.length > 0) {
        const feature = features[0];
        let pointName, pointCity, pointStreet;
        
        if (feature.layer.id === 'globe-points') {
            pointName = feature.properties.shopName;
            pointCity = feature.properties['address.city'] || feature.properties.city || feature.properties.town || feature.properties.locality || 'No disponible';
            pointStreet = feature.properties['address.streetName'] || feature.properties.street || feature.properties.address || feature.properties.road || 'No disponible';
        } else if (feature.layer.id === 'routeLayer' || feature.layer.id === 'shortestLine') {
            const lineCoordinates = feature.geometry.coordinates;
            const endPoint = lineCoordinates[lineCoordinates.length - 1];
            
            const allFeatures = map.querySourceFeatures('points');
            const targetPoint = allFeatures.find(point => {
                const pointCoords = point.geometry.coordinates;
                return Math.abs(pointCoords[0] - endPoint[0]) < 0.001 && 
                       Math.abs(pointCoords[1] - endPoint[1]) < 0.001;
            });
            
            if (targetPoint) {
                pointName = targetPoint.properties.shopName;
                pointCity = targetPoint.properties['address.city'] || targetPoint.properties.city || targetPoint.properties.town || targetPoint.properties.locality || 'No disponible';
                pointStreet = targetPoint.properties['address.streetName'] || targetPoint.properties.street || targetPoint.properties.address || targetPoint.properties.road || 'No disponible';
            } else {
                pointName = "Punto conectado";
                pointCity = "No disponible";
                pointStreet = "No disponible";
            }
        }

        if (pointName) {
            document.getElementById('pointName').textContent = pointName;
            document.getElementById('pointCity').textContent = pointCity;
            document.getElementById('pointStreet').textContent = pointStreet;
            document.getElementById('infoPanel').classList.add('open');
        }
    }
});

// Función para actualizar la cruz central
function updateCenterCross() {
    const center = map.getCenter();
    const centerPoint = turf.point([center.lng, center.lat]);
    
    if (map.getSource('centerPoint')) {
        map.getSource('centerPoint').setData(centerPoint);
    }
} 