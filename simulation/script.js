// MQTT Configuration
const MQTT_CONFIG = {
    host: "ws://172.20.10.2:9001/mqtt",
    username: '',
    password: '',
    clientId: 'parking_simulator_' + Math.random().toString(16).substr(2, 8),
    topics: {
        base: 'parking',
        sensor: (channel, spot) => `parking/sensor${channel}/spot${spot}`
    }
};

// Simulation State
let simulationRunning = false;
let simulationSpeed = 5; // 1-10 scale, lower means slower
let targetOccupancy = 50; // percentage
let simulationInterval;
let parkingSpots = {};
let occupiedCount = 0;
let mqttClient = null;
let isConnected = false;

// Elements
const startButton = document.getElementById('start-simulation');
const stopButton = document.getElementById('stop-simulation');
const speedSlider = document.getElementById('simulation-speed');
const speedValue = document.getElementById('speed-value');
const occupancySlider = document.getElementById('occupancy-rate');
const occupancyValue = document.getElementById('occupancy-value');
const occupiedCountElement = document.getElementById('occupied-count');
const lastUpdateElement = document.getElementById('last-update');
const connectionStatusElement = document.getElementById('connection-status');
const logContainer = document.getElementById('log-container');

// Initialize parking spots
function initializeParkingSpots() {
    const parkingArea = document.querySelector('.parking-area');
    for (let channel = 1; channel <= 6; channel++) {
        const sensorElement = document.createElement('div');
        sensorElement.classList.add('sensor', `sensor${channel}`);
        parkingArea.appendChild(sensorElement);

        for (let spot = 1; spot <= 2; spot++) {
            const spotElement = document.createElement('div');
            spotElement.classList.add('spot', `spot${spot}`);
            const spotId = `spot-${channel}-${spot}`;
            spotElement.dataset.spotId = spotId;
            
            // Add car icon and spot number
            spotElement.innerHTML = `
                <i class="fas fa-car"></i>
                <span class="spot-number">${(channel-1)*2 + spot}</span>
            `;
            
            sensorElement.appendChild(spotElement);
            
            // Initialize spot state
            parkingSpots[spotId] = false;
        }
    }
}

// Update a spot's visual status
function updateSpotStatus(spotId, isOccupied) {
    const spotElement = document.querySelector(`[data-spot-id="${spotId}"]`);

    if (spotElement) {
        spotElement.classList.toggle('occupied', isOccupied);
        parkingSpots[spotId] = isOccupied;
        
        // Add animation class
        spotElement.classList.add('status-change');
        setTimeout(() => spotElement.classList.remove('status-change'), 500);
    }

    // Update occupied count and last update time
    updateOccupiedCount();
    lastUpdateElement.textContent = new Date().toLocaleTimeString();
}

// Update total occupied count
function updateOccupiedCount() {
    const occupiedSpots = document.querySelectorAll('.spot.occupied');
    occupiedCount = occupiedSpots.length;
    occupiedCountElement.textContent = `${occupiedCount}/12`;
}

// Add a log entry
function addLogEntry(message) {
    const now = new Date();
    const timeString = now.toLocaleTimeString();

    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';
    logEntry.innerHTML = `
        <span class="log-time">${timeString}</span>
        <i class="fas fa-info-circle"></i>
        <span class="log-message">${message}</span>
    `;

    logContainer.prepend(logEntry);
    logEntry.style.opacity = '0';
    setTimeout(() => logEntry.style.opacity = '1', 10);

    // Limit log entries to prevent memory issues
    while (logContainer.children.length > 50) {
        const lastChild = logContainer.lastChild;
        lastChild.style.opacity = '0';
        setTimeout(() => lastChild.remove(), 300);
    }
}

// Run one simulation cycle
function runSimulationCycle() {
    if (!isConnected) {
        addLogEntry('Cannot run simulation: Not connected to MQTT broker');
        stopSimulation();
        return;
    }

    // Calculate how many spots should be occupied based on target occupancy
    const targetOccupiedCount = Math.round((targetOccupancy / 100) * 12);
    const currentOccupiedSpots = Object.entries(parkingSpots).filter(([_, isOccupied]) => isOccupied).length;

    if (currentOccupiedSpots < targetOccupiedCount) {
        // Find available spots and randomly occupy one
        const availableSpots = Object.entries(parkingSpots)
            .filter(([_, isOccupied]) => !isOccupied)
            .map(([spotId]) => spotId);

        if (availableSpots.length > 0) {
            const randomSpotId = availableSpots[Math.floor(Math.random() * availableSpots.length)];
            updateSpotStatus(randomSpotId, true);
            publishParkingData(randomSpotId, true);
            addLogEntry(`Car arrived: Spot ${spotId.split('-')[2] === '1' ? 'A' : 'B'}${spotId.split('-')[1]} is now occupied`);
        }
    }
    else if (currentOccupiedSpots > targetOccupiedCount) {
        // Find occupied spots and randomly free one
        const occupiedSpots = Object.entries(parkingSpots)
            .filter(([_, isOccupied]) => isOccupied)
            .map(([spotId]) => spotId);

        if (occupiedSpots.length > 0) {
            const randomSpotId = occupiedSpots[Math.floor(Math.random() * occupiedSpots.length)];
            updateSpotStatus(randomSpotId, false);
            publishParkingData(randomSpotId, false);
            addLogEntry(`Car departed: Spot ${randomSpotId.split('-')[2] === '1' ? 'A' : 'B'}${randomSpotId.split('-')[1]} is now free`);
        }
    }
    else {
        // If we're at the target, still allow for random changes
        if (Math.random() < 0.3) { // 30% chance of a random change
            // Decide whether to add or remove a car (with equal probability)
            const addCar = Math.random() < 0.5;

            if (addCar && currentOccupiedSpots < 12) {
                // Find available spots and randomly occupy one
                const availableSpots = Object.entries(parkingSpots)
                    .filter(([_, isOccupied]) => !isOccupied)
                    .map(([spotId]) => spotId);

                if (availableSpots.length > 0) {
                    const randomSpotId = availableSpots[Math.floor(Math.random() * availableSpots.length)];
                    updateSpotStatus(randomSpotId, true);
                    publishParkingData(randomSpotId, true);
                    addLogEntry(`Random arrival: Spot ${randomSpotId.split('-')[2] === '1' ? 'A' : 'B'}${randomSpotId.split('-')[1]} is now occupied`);
                }
            }
            else if (!addCar && currentOccupiedSpots > 0) {
                // Find occupied spots and randomly free one
                const occupiedSpots = Object.entries(parkingSpots)
                    .filter(([_, isOccupied]) => isOccupied)
                    .map(([spotId]) => spotId);

                if (occupiedSpots.length > 0) {
                    const randomSpotId = occupiedSpots[Math.floor(Math.random() * occupiedSpots.length)];
                    updateSpotStatus(randomSpotId, false);
                    publishParkingData(randomSpotId, false);
                    addLogEntry(`Random departure: Spot ${randomSpotId.split('-')[2] === '1' ? 'A' : 'B'}${randomSpotId.split('-')[1]} is now free`);
                }
            }
        }
    }
}

// Publish parking data to MQTT
function publishParkingData(spotId, isOccupied) {
    if (!isConnected) {
        addLogEntry('Cannot publish: Not connected to MQTT broker');
        return;
    }

    const [_, channel, spot] = spotId.split('-');
    
    const message = new Paho.MQTT.Message(JSON.stringify({
        spot_id: spotId,
        status: isOccupied ? 1 : 0,
        timestamp: new Date().toISOString()
    }));
    
    message.destinationName = `parking/sensor${channel}/spot${spot}`;
    message.qos = 1;
    
    try {
        mqttClient.send(message);
        addLogEntry(`Data sent for ${spotId}: ${isOccupied ? 'Occupied' : 'Vacant'}`);
        connectionStatusElement.innerHTML = '<i class="fas fa-check-circle"></i> Connected';
        connectionStatusElement.className = 'success';
    } catch (error) {
        console.error('Error:', error);
        addLogEntry(`Failed to send data for ${spotId}: ${error.message}`);
        connectionStatusElement.innerHTML = '<i class="fas fa-exclamation-circle"></i> Error';
        connectionStatusElement.className = 'error';
    }
}

// Start simulation
function startSimulation() {
    if (simulationRunning) return;

    simulationRunning = true;
    startButton.disabled = true;
    stopButton.disabled = false;

    // Calculate interval time based on speed (in seconds)
    // Speed 1 = 30s, Speed 10 = 3s
    const intervalTime = (31 - (simulationSpeed * 3)) * 1000;

    addLogEntry(`Simulation started with speed ${simulationSpeed} (${intervalTime / 1000}s interval) and target occupancy ${targetOccupancy}%`);

    // Run an initial cycle
    runSimulationCycle();

    // Set interval for ongoing simulation
    simulationInterval = setInterval(runSimulationCycle, intervalTime);
}

// Stop simulation
function stopSimulation() {
    if (!simulationRunning) return;

    simulationRunning = false;
    startButton.disabled = false;
    stopButton.disabled = true;

    clearInterval(simulationInterval);

    addLogEntry('Simulation stopped');
}

// Event listeners
startButton.addEventListener('click', startSimulation);
stopButton.addEventListener('click', stopSimulation);

speedSlider.addEventListener('input', () => {
    simulationSpeed = parseInt(speedSlider.value);
    speedValue.textContent = simulationSpeed;

    // If simulation is running, restart it with new speed
    if (simulationRunning) {
        stopSimulation();
        startSimulation();
    }
});

occupancySlider.addEventListener('input', () => {
    targetOccupancy = parseInt(occupancySlider.value);
    occupancyValue.textContent = `${targetOccupancy}%`;
});

// Connect to MQTT broker
function connectMQTT() {
    mqttClient = new Paho.MQTT.Client(
        MQTT_CONFIG.host,
        MQTT_CONFIG.clientId
    );

    mqttClient.onConnectionLost = onConnectionLost;
    mqttClient.onMessageArrived = onMessageArrived;

    const connectOptions = {
        onSuccess: onConnect,
        onFailure: onConnectFailure,
        useSSL: false,
        timeout: 3,
        keepAliveInterval: 60
    };

    if (MQTT_CONFIG.username) {
        connectOptions.userName = MQTT_CONFIG.username;
        connectOptions.password = MQTT_CONFIG.password;
    }

    connectionStatusElement.innerHTML = '<i class="fas fa-sync fa-spin"></i> Connecting...';
    connectionStatusElement.className = 'warning';
    
    try {
        mqttClient.connect(connectOptions);
    } catch (error) {
        console.error('Connection error:', error);
        onConnectFailure(error);
    }
}

function onConnect() {
    console.log("Connected to MQTT broker");
    MQTT_CONFIG.topics.forEach(topic => {
        client.subscribe(topic);
        console.log("Subscribed to topic:", topic);
    });
}

function onConnectFailure(response) {
    console.log("Failed to connect to MQTT broker: " + response.errorMessage);
}

function onConnectionLost(responseObject) {
    if (responseObject.errorCode !== 0) {
        console.log("Connection Lost: " + responseObject.errorMessage);
    }
}

function onMessageArrived(message) {
    console.log("Message Arrived: " + message.payloadString);
    const topic = message.destinationName;
    const payload = JSON.parse(message.payloadString);

    // Extract sensor number from topic (e.g., "parkingsystem/sensor1" -> 1)
    const sensorNumber = topic.split('sensor')[1];

    // Update spot status based on MQTT message
    const spot1Status = payload.spot1;
    const spot2Status = payload.spot2;

    updateSpotStatus(`spot-${sensorNumber}-1`, spot1Status === 1);
    updateSpotStatus(`spot-${sensorNumber}-2`, spot2Status === 1);
}

// Initialize everything when the page loads
document.addEventListener('DOMContentLoaded', () => {
    initializeParkingSpots();
    updateOccupiedCount();
    connectMQTT();
    addLogEntry('Simulation ready to start');
});
