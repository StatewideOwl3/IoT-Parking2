// MQTT Cloud Configuration
const MQTT_CONFIG = {
    // ===== REPLACE THESE VALUES WITH YOUR HIVEMQ CLOUD CREDENTIALS =====
    host: "wss://f68a0a1321584a169cd42818b2fcad8a.s2.eu.hivemq.cloud:8884/mqtt", // HiveMQ Cloud WebSocket Secure URL
    port: 8884,               // WebSocket secure port
    username: 'team35',       // Replace with your HiveMQ username
    password: 'Team35_Admin', // Replace with your HiveMQ password
    // ================================================================
    
    // Generate a unique client ID to prevent conflicts
    clientId: 'web_simulation_' + Math.random().toString(16).substring(2, 10),
    topics: {
        base: 'parking',
        sensor: (channel, spot) => `parking/sensor${channel}/spot${spot}`
    },
    useSSL: true // Required for HiveMQ Cloud
};

// Helper functions for localStorage persistence
function saveParkingSpots(spots) {
    localStorage.setItem('simulationParkingSpots', JSON.stringify(spots));
}

function loadParkingSpots() {
    const stored = localStorage.getItem('simulationParkingSpots');
    return stored ? JSON.parse(stored) : {};
}

function saveSharedParkingData(spots) {
    // Convert to the format used by the server pages
    const sharedData = {};
    
    // Process each spot and organize by channel
    Object.entries(spots).forEach(([spotId, isOccupied]) => {
        const parts = spotId.split('-');
        const channel = parts[1];
        const spot = parts[2];
        
        if (!sharedData[channel]) {
            sharedData[channel] = {};
        }
        
        if (spot === '1') {
            sharedData[channel].spot1 = isOccupied;
        } else {
            sharedData[channel].spot2 = isOccupied;
        }
    });
    
    // Save to shared localStorage
    localStorage.setItem('parkingData', JSON.stringify(sharedData));
    localStorage.setItem('lastUpdateTime', new Date().toISOString());
}

// Load shared data from server pages
function syncWithSharedStorage() {
    try {
        const sharedData = localStorage.getItem('parkingData');
        if (sharedData) {
            const parsedData = JSON.parse(sharedData);
            let updated = false;
            
            // Update our spots from the shared data
            for (const channel in parsedData) {
                if (parsedData[channel].spot1 !== undefined) {
                    const spotId = `spot-${channel}-1`;
                    if (parkingSpots[spotId] !== parsedData[channel].spot1) {
                        parkingSpots[spotId] = parsedData[channel].spot1;
                        applySpotStatus(spotId, parsedData[channel].spot1);
                        updated = true;
                    }
                }
                if (parsedData[channel].spot2 !== undefined) {
                    const spotId = `spot-${channel}-2`;
                    if (parkingSpots[spotId] !== parsedData[channel].spot2) {
                        parkingSpots[spotId] = parsedData[channel].spot2;
                        applySpotStatus(spotId, parsedData[channel].spot2);
                        updated = true;
                    }
                }
            }
            
            if (updated) {
                console.log('Updated simulation from shared storage');
                updateOccupiedCount();
            }
        }
    } catch (error) {
        console.error('Error syncing with shared storage:', error);
    }
}

// Simulation State
let simulationRunning = false;
let simulationSpeed = 5; // 1-10 scale, lower means slower
let targetOccupancy = 50; // percentage
let simulationInterval;
let parkingSpots = loadParkingSpots() || {};
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
    // Check if we already have saved spots, otherwise initialize defaults
    const needsInitialization = Object.keys(parkingSpots).length === 0;
    
    // Initialize spot states if needed
    if (needsInitialization) {
        for (let channel = 1; channel <= 6; channel++) {
            for (let spot = 1; spot <= 2; spot++) {
                const spotId = `spot-${channel}-${spot}`;
                parkingSpots[spotId] = false;
            }
        }
    }
    
    // Apply stored status to UI
    for (let channel = 1; channel <= 6; channel++) {
        for (let spot = 1; spot <= 2; spot++) {
            const spotId = `spot-${channel}-${spot}`;
            if (parkingSpots[spotId] !== undefined) {
                applySpotStatus(spotId, parkingSpots[spotId]);
            }
        }
    }
    
    // Set up click handlers for manual toggling during testing
    for (let channel = 1; channel <= 6; channel++) {
        for (let spot = 1; spot <= 2; spot++) {
            const spotId = `spot-${channel}-${spot}`;
            const spotElement = document.getElementById(spotId);
            if (spotElement) {
                spotElement.addEventListener('click', () => {
                    const newStatus = !parkingSpots[spotId];
                    updateSpotStatus(spotId, newStatus);
                    publishParkingData(spotId, newStatus);
                });
            }
        }
    }
    
    // This is no longer needed as we're using direct MQTT communication
    // syncWithSharedStorage();
    
    // Initialize slider progress indicators
    updateSliderProgress();
}

// Apply spot status without animation (used when loading from storage)
function applySpotStatus(spotId, isOccupied) {
    const spotElement = document.getElementById(spotId);

    if (spotElement) {
        // Update class for styling (no animation)
        spotElement.classList.toggle('available', !isOccupied);
        spotElement.classList.toggle('occupied', isOccupied);
        
        // Update status text only
        const statusElement = document.getElementById(`${spotId}-status`);
        if (statusElement) {
            statusElement.textContent = isOccupied ? 'OCCUPIED' : 'FREE';
        }
    }
}

// Update a spot's visual status with animation
function updateSpotStatus(spotId, isOccupied) {
    const spotElement = document.getElementById(spotId);

    if (spotElement) {
        // Save previous state to check for visual changes
        const previousState = spotElement.classList.contains('occupied');
        
        // Update class for styling
        spotElement.classList.toggle('available', !isOccupied);
        spotElement.classList.toggle('occupied', isOccupied);
        
        // Update state tracking
        parkingSpots[spotId] = isOccupied;
        
        // Save to localStorage
        saveParkingSpots(parkingSpots);
        
        // Save to shared storage for server pages
        saveSharedParkingData(parkingSpots);
        
        // Add animation class if state actually changed
        if (previousState !== isOccupied) {
            spotElement.classList.add('status-change');
            setTimeout(() => spotElement.classList.remove('status-change'), 500);
        }
        
        // Update status text and last change time
        const statusElement = document.getElementById(`${spotId}-status`);
        const lastChangeElement = document.getElementById(`${spotId}-last-change`);
        
        if (statusElement) {
            statusElement.textContent = isOccupied ? 'OCCUPIED' : 'FREE';
        }
        
        if (lastChangeElement) {
            const now = new Date();
            lastChangeElement.textContent = now.toLocaleTimeString();
        }
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

// Memory-efficient log entry addition with DOM reuse
const LOG_LIMIT = 20; // Reduced from 50 to save memory
let logPool = [];

// Add a log entry
function addLogEntry(message) {
    // Skip empty messages
    if (!message || !logContainer) {
        return;
    }

    try {
        const now = new Date();
        const timeString = now.toLocaleTimeString();
        
        // Create or reuse a log entry element
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry';
        // Use textContent instead of innerHTML for better performance
        
        const timeSpan = document.createElement('span');
        timeSpan.className = 'log-time';
        timeSpan.textContent = timeString;
        
        const icon = document.createElement('i');
        icon.className = 'fas fa-info-circle';
        
        const messageSpan = document.createElement('span');
        messageSpan.className = 'log-message';
        messageSpan.textContent = message;
        
        logEntry.appendChild(timeSpan);
        logEntry.appendChild(icon);
        logEntry.appendChild(messageSpan);
        
        // Add to the top of the log
        logContainer.prepend(logEntry);
        
        // Simple fade in without setTimeout to reduce callbacks
        logEntry.style.opacity = '0';
        // Use requestAnimationFrame instead of setTimeout
        requestAnimationFrame(() => {
            logEntry.style.opacity = '1';
        });
        
        // Limit entries - remove extras without animations
        if (logContainer.children.length > LOG_LIMIT) {
            // Batch removals to avoid layout thrashing
            const toRemove = [];
            while (logContainer.children.length > LOG_LIMIT) {
                toRemove.push(logContainer.lastChild);
                logContainer.removeChild(logContainer.lastChild);
            }
        }
    } catch (error) {
        // If anything goes wrong with logging, don't crash the application
        console.error('Error in log system:', error);
    }
}

// Memory and CPU-efficient simulation cycle
let lastMqttPublishTime = 0;
let pendingPublishQueue = [];
const MQTT_THROTTLE_MS = 1500; // Throttle MQTT publishes to max once per 1.5 seconds

// Helper function to get sector and spot info - extracted to avoid repetition
function getSpotDescription(spotId) {
    const parts = spotId.split('-');
    const channelNum = parseInt(parts[1]);
    const spotNum = parts[2];
    
    // Determine sector (A, B, C)
    let sector;
    if (channelNum <= 2) sector = 'A';
    else if (channelNum <= 4) sector = 'B';
    else sector = 'C';
    
    // Calculate spot number within sector
    let spotInSector;
    if (channelNum % 2 === 1) { // odd channel
        spotInSector = spotNum === '1' ? 1 : 2;
    } else { // even channel
        spotInSector = spotNum === '1' ? 3 : 4;
    }
    
    return { sector, spotInSector };
}

// Process the MQTT publish queue efficiently
function processMqttQueue() {
    const now = Date.now();
    if (pendingPublishQueue.length === 0 || now - lastMqttPublishTime < MQTT_THROTTLE_MS) {
        return false;
    }
    
    // For efficiency, only publish the latest status for each spot
    const latestSpotStatus = {};
    
    // Build map of latest status for each spot
    pendingPublishQueue.forEach(item => {
        latestSpotStatus[item.spotId] = item.isOccupied;
    });
    
    // Publish the latest status for each spot
    for (const [spotId, isOccupied] of Object.entries(latestSpotStatus)) {
        publishParkingData(spotId, isOccupied);
    }
    
    // Clear queue and update timestamp
    pendingPublishQueue = [];
    lastMqttPublishTime = now;
    return true;
}

// Run one simulation cycle
function runSimulationCycle() {
    if (!isConnected) {
        addLogEntry('Cannot run simulation: Not connected to MQTT broker');
        stopSimulation();
        return;
    }

    const now = new Date();
    const currentTime = now.getTime();
    
    // First process any pending MQTT publishes
    processMqttQueue();
    
    // Calculate how many spots should be occupied based on target occupancy
    const targetOccupiedCount = Math.round((targetOccupancy / 100) * 12);
    const currentOccupiedSpots = Object.entries(parkingSpots).filter(([_, isOccupied]) => isOccupied).length;
    
    // Queue an update based on current state
    let updatePerformed = false;
    let action = null;
    let spotId = null;
    
    if (currentOccupiedSpots < targetOccupiedCount) {
        // Need to fill spots - find empty ones
        const availableSpots = Object.entries(parkingSpots)
            .filter(([_, isOccupied]) => !isOccupied)
            .map(([id]) => id);

        if (availableSpots.length > 0) {
            // Choose random spot efficiently
            spotId = availableSpots[Math.floor(Math.random() * availableSpots.length)];
            updateSpotStatus(spotId, true);
            action = 'arrived';
            updatePerformed = true;
            
            // Queue for MQTT publish instead of immediate publish
            pendingPublishQueue.push({ spotId, isOccupied: true });
        }
    }
    else if (currentOccupiedSpots > targetOccupiedCount) {
        // Need to vacate spots - find occupied ones
        const occupiedSpots = Object.entries(parkingSpots)
            .filter(([_, isOccupied]) => isOccupied)
            .map(([id]) => id);

        if (occupiedSpots.length > 0) {
            spotId = occupiedSpots[Math.floor(Math.random() * occupiedSpots.length)];
            updateSpotStatus(spotId, false);
            action = 'departed';
            updatePerformed = true;
            
            // Queue for MQTT publish
            pendingPublishQueue.push({ spotId, isOccupied: false });
        }
    }
    else {
        // At target occupancy - occasional random changes (reduced probability)
        if (Math.random() < 0.2) { // Reduced from 0.3 to save resources
            const addCar = Math.random() < 0.5 && currentOccupiedSpots < 12;
            
            if (addCar) {
                const availableSpots = Object.entries(parkingSpots)
                    .filter(([_, isOccupied]) => !isOccupied)
                    .map(([id]) => id);

                if (availableSpots.length > 0) {
                    spotId = availableSpots[Math.floor(Math.random() * availableSpots.length)];
                    updateSpotStatus(spotId, true);
                    action = 'random-arrived';
                    updatePerformed = true;
                    
                    pendingPublishQueue.push({ spotId, isOccupied: true });
                }
            } else if (currentOccupiedSpots > 0) {
                const occupiedSpots = Object.entries(parkingSpots)
                    .filter(([_, isOccupied]) => isOccupied)
                    .map(([id]) => id);

                if (occupiedSpots.length > 0) {
                    spotId = occupiedSpots[Math.floor(Math.random() * occupiedSpots.length)];
                    updateSpotStatus(spotId, false);
                    action = 'random-departed';
                    updatePerformed = true;
                    
                    pendingPublishQueue.push({ spotId, isOccupied: false });
                }
            }
        }
    }
    
    // Add a log entry if we updated something
    if (updatePerformed && spotId) {
        const { sector, spotInSector } = getSpotDescription(spotId);
        const isArrival = action.includes('arrived');
        const isRandom = action.includes('random');
        
        const prefix = isRandom ? 'Random ' : '';
        const message = isArrival ? 
            `${prefix}Car arrived: Spot ${sector}${spotInSector} is now occupied` : 
            `${prefix}Car departed: Spot ${sector}${spotInSector} is now free`;
            
        addLogEntry(message);
    }
}

// Publish parking data to MQTT
function publishParkingData(spotId, isOccupied) {
    if (!isConnected) {
        addLogEntry('Cannot publish: Not connected to MQTT cloud broker');
        return;
    }

    const [_, channel, spot] = spotId.split('-');
    const sensorId = parseInt(channel);
    const spotNum = parseInt(spot);
    const status = isOccupied ? 1 : 0;
    const timestamp = new Date().toISOString();
    
    // Send message in both formats to ensure compatibility with all pages
    
    // Format 1: Direct spot message with spot_id for parking_spaces.js
    const spotMessage = new Paho.MQTT.Message(JSON.stringify({
        spot_id: spotId,
        status: status,
        timestamp: timestamp
    }));
    
    spotMessage.destinationName = `parking/sensor${channel}/spot${spot}`;
    spotMessage.qos = 1;
    
    // Format 2: ESP32-like format for main_page.js
    // Create a message object with sensorId, spot1, and spot2 fields
    const sensorData = {};
    sensorData.sensorId = sensorId;
    
    // Set only the changed spot, leaving the other undefined
    if (spotNum === 1) {
        sensorData.spot1 = status;
    } else {
        sensorData.spot2 = status;
    }
    
    sensorData.timestamp = timestamp;
    
    const sensorMessage = new Paho.MQTT.Message(JSON.stringify(sensorData));
    sensorMessage.destinationName = `parking/sensor${sensorId}`;
    sensorMessage.qos = 1;
    
    try {
        // Send both message types
        mqttClient.send(spotMessage);
        mqttClient.send(sensorMessage);
        
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

// Connect to MQTT cloud broker
// MQTT Connection with memory optimization
let reconnectAttempts = 0;
let reconnectTimer = null;

function connectMQTT() {
    try {
        // Clear any existing reconnect timer
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
        
        // Extract hostname and path from the full URL
        const url = new URL(MQTT_CONFIG.host);
        const hostname = url.hostname;
        const path = url.pathname;
        
        // Create MQTT client only if it doesn't exist
        if (!mqttClient) {
            mqttClient = new Paho.MQTT.Client(
                hostname,
                MQTT_CONFIG.port,
                path, // Path from the MQTT URL
                MQTT_CONFIG.clientId
            );
            
            // Set callbacks
            mqttClient.onConnectionLost = onConnectionLost;
            mqttClient.onMessageArrived = onMessageArrived;
        }
        
        // Connect options
        const connectOptions = {
            onSuccess: onConnect,
            onFailure: onConnectFailure,
            useSSL: MQTT_CONFIG.useSSL, // Must be true for HiveMQ Cloud
            timeout: 30, // Increased timeout for cloud connections
            keepAliveInterval: 60,
            mqttVersion: 4, // Use MQTT v3.1.1
            cleanSession: true
        }; // We'll handle reconnection ourselves manually
        
        // HiveMQ Cloud requires authentication
        if (MQTT_CONFIG.username) {
            connectOptions.userName = MQTT_CONFIG.username;
            connectOptions.password = MQTT_CONFIG.password;
        }
        
        connectionStatusElement.innerHTML = '<i class="fas fa-sync fa-spin"></i> Connecting to HiveMQ Cloud...';
        connectionStatusElement.className = 'warning';
        addLogEntry('Connecting to MQTT cloud broker...');
        
        mqttClient.connect(connectOptions);
    } catch (error) {
        console.error('Connection error:', error);
        connectionStatusElement.innerHTML = '<i class="fas fa-exclamation-circle"></i> Error: ' + error.message;
        connectionStatusElement.className = 'error';
        addLogEntry(`Connection error: ${error.message}`);
        
        // Exponential backoff for reconnection
        const delay = Math.min(30000, Math.pow(2, reconnectAttempts) * 1000);
        reconnectAttempts++;
        console.log(`Will attempt to reconnect in ${delay/1000} seconds`);
        
        // Try to reconnect with exponential backoff
        reconnectTimer = setTimeout(connectMQTT, delay);
    }
}

function onConnect() {
    isConnected = true;
    console.log("Connected to MQTT cloud broker");
    connectionStatusElement.innerHTML = '<i class="fas fa-check-circle"></i> Connected to HiveMQ Cloud';
    connectionStatusElement.className = 'success';
    addLogEntry('Connected to MQTT cloud broker');
    
    // Subscribe to all parking spot topics
    for (let channel = 1; channel <= 6; channel++) {
        for (let spot = 1; spot <= 2; spot++) {
            const topic = MQTT_CONFIG.topics.sensor(channel, spot);
            mqttClient.subscribe(topic, { qos: 1 });
            console.log("Subscribed to topic:", topic);
        }
    }
    
    // Also subscribe to sensor-level topics for compatibility with other components
    for (let channel = 1; channel <= 6; channel++) {
        const sensorTopic = `parking/sensor${channel}`;
        mqttClient.subscribe(sensorTopic, { qos: 1 });
        console.log("Subscribed to sensor topic:", sensorTopic);
    }
    
    // Test the connection by publishing a system status message
    try {
        const statusMessage = new Paho.MQTT.Message(JSON.stringify({
            system: 'simulator',
            status: 'connected',
            timestamp: new Date().toISOString()
        }));
        statusMessage.destinationName = 'parking/system/status';
        statusMessage.qos = 1;
        mqttClient.send(statusMessage);
        addLogEntry('Connection test message sent successfully');
    } catch (error) {
        console.error('Error sending test message:', error);
        addLogEntry('Warning: Connection established but test message failed');
    }
}

function onConnectFailure(response) {
    isConnected = false;
    console.error("Failed to connect to MQTT cloud broker:", response);
    connectionStatusElement.innerHTML = '<i class="fas fa-exclamation-circle"></i> Connection Failed: ' + response.errorMessage;
    connectionStatusElement.className = 'error';
    addLogEntry(`Connection failed: ${response.errorMessage || 'Unknown error'}`);
    
    // Disable simulation buttons
    startButton.disabled = true;
    stopButton.disabled = true;
    
    // Try to reconnect automatically after a delay
    setTimeout(() => {
        addLogEntry('Attempting to reconnect to MQTT cloud...');
        connectMQTT();
    }, 5000);
}

function onConnectionLost(responseObject) {
    isConnected = false;
    connectionStatusElement.innerHTML = '<i class="fas fa-times-circle"></i> Disconnected';
    connectionStatusElement.className = 'error';
    if (responseObject.errorCode !== 0) {
        console.error("MQTT Cloud Connection Lost:", responseObject.errorMessage);
        addLogEntry(`Connection lost: ${responseObject.errorMessage}`);
    } else {
        addLogEntry('Disconnected from MQTT cloud broker');
    }
    
    // If simulation is running, stop it
    if (simulationRunning) {
        stopSimulation();
    }
    
    // Try to reconnect automatically after a delay
    setTimeout(() => {
        addLogEntry('Attempting to reconnect to MQTT cloud...');
        connectMQTT();
    }, 5000);
}

function onMessageArrived(message) {
    try {
        console.log("Message Arrived: " + message.payloadString);
        const topic = message.destinationName;
        const payload = JSON.parse(message.payloadString);

        // Extract sensor and spot numbers from topic (e.g., "parking/sensor1/spot2")
        const topicParts = topic.split('/');
        if (topicParts.length === 3) {
            const sensorPart = topicParts[1]; // "sensor1"
            const spotPart = topicParts[2]; // "spot2"
            
            const sensorNumber = sensorPart.replace('sensor', '');
            const spotNumber = spotPart.replace('spot', '');
            
            // Our format now has the spot_id directly in the payload
            if (payload.spot_id) {
                // Use the spot_id from the payload
                updateSpotStatus(payload.spot_id, payload.status === 1);
                addLogEntry(`Received update for ${payload.spot_id}: ${payload.status === 1 ? 'Occupied' : 'Vacant'}`);
            } else {
                // Fallback to using the topic information
                const spotId = `spot-${sensorNumber}-${spotNumber}`;
                updateSpotStatus(spotId, payload.status === 1);
                addLogEntry(`Received update for ${spotId}: ${payload.status === 1 ? 'Occupied' : 'Vacant'}`);
            }
        } else {
            console.warn("Unexpected topic format:", topic);
        }
    } catch (error) {
        console.error('Error processing message:', error);
        addLogEntry(`Error processing message: ${error.message}`);
    }
}

// Update slider progress indicators
function updateSliderProgress() {
    // Update speed slider progress
    const speedSliderProgress = document.getElementById('speed-progress');
    const speedPercent = ((simulationSpeed - 1) / 9) * 100;
    speedSliderProgress.style.width = `${speedPercent}%`;
    
    // Update occupancy slider progress
    const occupancySliderProgress = document.getElementById('occupancy-progress');
    occupancySliderProgress.style.width = `${targetOccupancy}%`;
}

// Initialize everything when the page loads
document.addEventListener('DOMContentLoaded', () => {
    initializeParkingSpots();
    updateOccupiedCount();
    
    // We're now using direct MQTT communication instead of localStorage
    // setInterval(syncWithSharedStorage, 3000);
    
    // Periodic saving of state
    setInterval(() => {
        saveParkingSpots(parkingSpots);
        saveSharedParkingData(parkingSpots);
    }, 5000);
    connectMQTT();
    
    // Add event listeners for sliders with progress updates
    speedSlider.addEventListener('input', (e) => {
        simulationSpeed = parseInt(e.target.value);
        speedValue.textContent = simulationSpeed;
        updateSliderProgress();
        
        // Update simulation interval if running
        if (simulationRunning) {
            clearInterval(simulationInterval);
            simulationInterval = setInterval(runSimulationCycle, Math.max(1000 / simulationSpeed, 100));
        }
    });

    occupancySlider.addEventListener('input', (e) => {
        targetOccupancy = parseInt(e.target.value);
        occupancyValue.textContent = `${targetOccupancy}%`;
        updateSliderProgress();
    });
    
    // Initialize slider progress
    updateSliderProgress();
    
    addLogEntry('Simulation ready to start');
});
