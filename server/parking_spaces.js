// MQTT Cloud Configuration
const MQTT_CONFIG = {
    // ===== REPLACE THESE VALUES WITH YOUR HIVEMQ CLOUD CREDENTIALS =====
    host: "wss://f68a0a1321584a169cd42818b2fcad8a.s2.eu.hivemq.cloud:8884/mqtt", // Replace CLUSTER-ID with your HiveMQ cluster ID
    port: 8884,               // WebSocket secure port
    username: 'team35',// Replace with your HiveMQ username
    password: 'Team35_Admin',// Replace with your HiveMQ password
    // ================================================================
    
    clientId: 'ESP32_ParkingSystem',  // Using authorized ID from HiveMQ
    topics: {
        base: 'parking',
        sensor: (channel, spot) => `parking/sensor${channel}/spot${spot}`
    },
    useSSL: true // Required for HiveMQ Cloud
};

// Helper functions for localStorage storage/retrieval - only for page refresh persistence
// These functions won't share data between pages anymore
function saveParkingData(data) {
    localStorage.setItem('parkingSpacesData', JSON.stringify(data));
}

function saveLastChangeTimes(data) {
    localStorage.setItem('parkingSpacesChangeTimes', JSON.stringify(data));
}

function loadParkingData() {
    const stored = localStorage.getItem('parkingSpacesData');
    return stored ? JSON.parse(stored) : {};
}

function loadLastChangeTimes() {
    const stored = localStorage.getItem('parkingSpacesChangeTimes');
    return stored ? JSON.parse(stored) : {};
}

// Save last update timestamp
function saveLastUpdateTime() {
    localStorage.setItem('parkingSpacesUpdateTime', new Date().toISOString());
}

// Get last update timestamp
function getLastUpdateTime() {
    return localStorage.getItem('parkingSpacesUpdateTime');
}

document.addEventListener('DOMContentLoaded', () => {
    // Initialize with data from localStorage if available
    let allParkingData = loadParkingData();
    let lastChangeTimes = loadLastChangeTimes();
    let mqttClient = null;
    let isConnected = false;
    let totalSpots = 12;
    let occupiedSpots = 0;
    
    // Apply stored data to UI on page load
    applyStoredParkingData();

    // Connect to MQTT broker
    function connectMQTT() {
        mqttClient = new Paho.MQTT.Client(
            new URL(MQTT_CONFIG.host).hostname,
            MQTT_CONFIG.port,
            '/mqtt', // Path is required for WebSocket connections
            MQTT_CONFIG.clientId
        );

        mqttClient.onConnectionLost = onConnectionLost;
        mqttClient.onMessageArrived = onMessageArrived;

        const connectOptions = {
            onSuccess: onConnect,
            onFailure: onConnectFailure,
            useSSL: MQTT_CONFIG.useSSL, // Must be true for HiveMQ Cloud
            timeout: 10, // Increased timeout for cloud connections
            keepAliveInterval: 60
        };

        // Required for HiveMQ Cloud authentication
        if (MQTT_CONFIG.username) {
            connectOptions.userName = MQTT_CONFIG.username;
            connectOptions.password = MQTT_CONFIG.password;
        }
        
        try {
            console.log('Connecting to MQTT cloud broker...');
            mqttClient.connect(connectOptions);
            displayConnectionStatus('Connecting to MQTT cloud...', 'connecting');
        } catch (error) {
            console.error('MQTT connection error:', error);
            displayConnectionStatus('Connection error: ' + error.message, 'error');
            onConnectFailure(error);
        }
    }
    
    // Display connection status in the UI
    function displayConnectionStatus(message, status) {
        const statusElement = document.getElementById('mqtt-status');
        if (statusElement) {
            statusElement.textContent = message;
            statusElement.className = status || '';
        } else {
            // Create status element if it doesn't exist
            const statusDiv = document.createElement('div');
            statusDiv.id = 'mqtt-status';
            statusDiv.className = status || '';
            statusDiv.textContent = message;
            document.querySelector('.welcome-section').appendChild(statusDiv);
        }
    }

    function onConnect() {
        isConnected = true;
        console.log("Connected to MQTT cloud broker");
        displayConnectionStatus('Connected to MQTT cloud', 'success');
        
        // Subscribe to all parking spot topics
        for (let channel = 1; channel <= 6; channel++) {
            for (let spot = 1; spot <= 2; spot++) {
                const topic = MQTT_CONFIG.topics.sensor(channel, spot);
                mqttClient.subscribe(topic, { qos: 1 });
                console.log("Subscribed to topic:", topic);
            }
        }
        
        // Also subscribe to sensor-level topics
        for (let channel = 1; channel <= 6; channel++) {
            const sensorTopic = `parking/sensor${channel}`;
            mqttClient.subscribe(sensorTopic, { qos: 1 });
            console.log("Subscribed to sensor topic:", sensorTopic);
        }
    }

    function onConnectFailure(response) {
        isConnected = false;
        console.error("Failed to connect to MQTT cloud broker:", response);
        displayConnectionStatus('Failed to connect to MQTT cloud', 'error');
        
        // Try to reconnect after a delay
        setTimeout(function() {
            console.log("Attempting to reconnect to MQTT cloud broker...");
            connectMQTT();
        }, 5000); // Retry after 5 seconds
    }

    function onConnectionLost(responseObject) {
        isConnected = false;
        if (responseObject.errorCode !== 0) {
            console.error("MQTT Cloud Connection Lost:", responseObject.errorMessage);
            displayConnectionStatus('Connection lost: ' + responseObject.errorMessage, 'error');
        }
        
        // Update UI to show disconnected state
        updateSpotsToDisconnectedState();
        
        // Try to reconnect after a delay
        setTimeout(function() {
            console.log("Attempting to reconnect to MQTT cloud broker after connection loss...");
            connectMQTT();
        }, 5000); // Retry after 5 seconds
    }
    
    // Show disconnected state in the UI
    function updateSpotsToDisconnectedState() {
        // Update status indicators
        const statusElements = document.querySelectorAll('.spot-status');
        statusElements.forEach(elem => {
            elem.textContent = 'DISCONNECTED';
            elem.classList.add('warning');
        });
        
        // Update counters
        const occupiedCountElement = document.getElementById('occupied-count');
        const availableCountElement = document.getElementById('available-count');
        
        if (occupiedCountElement) occupiedCountElement.textContent = '--';
        if (availableCountElement) availableCountElement.textContent = '--';
    }

    // Apply stored parking data to UI on page load
    function applyStoredParkingData() {
        console.log('Applying stored parking data');
        // Apply stored status to all parking spots
        for (const channelNum in allParkingData) {
            const channel = allParkingData[channelNum];
            if (channel.spot1 !== undefined) {
                applySpotStatus(channelNum, '1', channel.spot1);
            }
            if (channel.spot2 !== undefined) {
                applySpotStatus(channelNum, '2', channel.spot2);
            }
        }
        
        // Update statistics after applying all stored data
        updateStatistics();
        
        // Display last update time if available
        const lastUpdateTime = getLastUpdateTime();
        if (lastUpdateTime) {
            const lastUpdatedElement = document.getElementById('last-updated');
            if (lastUpdatedElement) {
                lastUpdatedElement.textContent = new Date(lastUpdateTime).toLocaleTimeString();
            }
        }
    }
    
    function onMessageArrived(message) {
        try {
            console.log("MQTT Message Arrived:", message.payloadString);
            const topic = message.destinationName;
            const payload = JSON.parse(message.payloadString);

            // Log detailed message info for debugging
            console.log('Message topic:', topic);
            console.log('Message payload:', payload);

            // Two possible message formats:
            // 1. From simulation: {spot_id: "spot-1-1", status: 1/0, timestamp: "..."}
            // 2. From ESP32: Contains sensorId, spot1, spot2 values

            // Handle simulation messages with spot_id format
            if (payload.spot_id) {
                const spotIdParts = payload.spot_id.split('-');
                if (spotIdParts.length === 3) {
                    const sensorNumber = spotIdParts[1];
                    const spotNumber = spotIdParts[2];
                    updateSpotStatus(sensorNumber, spotNumber, payload.status === 1);
                }
            }
            // Handle direct topic format: parking/sensor1/spot2
            else if (topic.includes('/')) {
                const topicParts = topic.split('/');
                if (topicParts.length === 3) {
                    const sensorPart = topicParts[1]; // "sensor1"
                    const spotPart = topicParts[2]; // "spot2"
                    
                    const sensorNumber = sensorPart.replace('sensor', '');
                    const spotNumber = spotPart.replace('spot', '');
                    
                    // Use the status field if available, otherwise assume 1 (occupied)
                    const status = payload.status !== undefined ? payload.status === 1 : true;
                    updateSpotStatus(sensorNumber, spotNumber, status);
                }
            }
            // Handle ESP32 sensor data format with sensorId, spot1, spot2
            else if (payload.sensorId && (payload.spot1 !== undefined || payload.spot2 !== undefined)) {
                const sensorId = payload.sensorId;
                
                if (payload.spot1 !== undefined) {
                    updateSpotStatus(sensorId, '1', payload.spot1 === 1);
                }
                
                if (payload.spot2 !== undefined) {
                    updateSpotStatus(sensorId, '2', payload.spot2 === 1);
                }
            }
            
            // Save the latest update time
            saveLastUpdateTime();
            
        } catch (error) {
            console.error('Error processing MQTT message:', error);
        }
    }

    // Apply spot status without checking for changes (used when loading from storage)
    function applySpotStatus(channelNum, spotNum, isOccupied) {
        const spotId = `spot-${channelNum}-${spotNum}`;
        const spotElement = document.getElementById(spotId);
        const spotStatus = document.getElementById(`${spotId}-status`);
        const lastChangeElement = document.getElementById(`${spotId}-last-change`);
        
        if (spotElement && spotStatus) {
            // Update class for styling (no animation)
            spotElement.classList.remove('available', 'occupied');
            spotElement.classList.add(isOccupied ? 'occupied' : 'available');
            
            // Update status text
            spotStatus.textContent = isOccupied ? 'OCCUPIED' : 'FREE';
            
            // If we have a last change time, display it
            if (lastChangeTimes[spotId] && lastChangeElement) {
                lastChangeElement.textContent = new Date(lastChangeTimes[spotId]).toLocaleTimeString();
            }
        }
    }
    
    // Update a specific parking spot's status
    function updateSpotStatus(channelNum, spotNum, isOccupied) {
        const spotId = `spot-${channelNum}-${spotNum}`;
        const spotElement = document.getElementById(spotId);
        const spotStatus = document.getElementById(`${spotId}-status`);
        const lastChangeElement = document.getElementById(`${spotId}-last-change`);
        
        // Always update the data model regardless of UI state
        if (!allParkingData[channelNum]) {
            allParkingData[channelNum] = {};
        }
        
        if (spotNum === '1') {
            allParkingData[channelNum].spot1 = isOccupied;
        } else {
            allParkingData[channelNum].spot2 = isOccupied;
        }
        
        // Save to localStorage immediately after any update
        saveParkingData(allParkingData);
        
        // Update UI if elements exist
        if (spotElement && spotStatus) {
            // Save previous state to check for visual changes only
            const previousState = spotElement.classList.contains('occupied');
            
            // Update class for styling
            spotElement.classList.remove('available', 'occupied');
            spotElement.classList.add(isOccupied ? 'occupied' : 'available');
            
            // Add animation for status change if there was a real change
            if (previousState !== isOccupied) {
                spotElement.classList.add('status-change');
                setTimeout(() => spotElement.classList.remove('status-change'), 500);
            }
            
            // Update status text
            spotStatus.textContent = isOccupied ? 'OCCUPIED' : 'FREE';
            
            // Update last change time
            const now = new Date();
            if (lastChangeElement) {
                lastChangeElement.textContent = now.toLocaleTimeString();
            }
            
            // Store timestamp of change
            lastChangeTimes[spotId] = now;
            saveLastChangeTimes(lastChangeTimes);
        }
        
        // Always update statistics
        updateStatistics();
    }

    // Function to initialize parking spots to a default state
    function initializeParkingSpots() {
        console.log('Initializing parking spots to default state');
        
        // Set all spots to 'unknown' state until we get real data
        for (let channel = 1; channel <= 6; channel++) {
            for (let spot = 1; spot <= 2; spot++) {
                const spotId = `spot-${channel}-${spot}`;
                const spotElement = document.getElementById(spotId);
                const statusElement = document.getElementById(`${spotId}-status`);
                
                if (spotElement) {
                    // Add a special 'unknown' class
                    spotElement.classList.remove('available', 'occupied');
                    spotElement.classList.add('unknown');
                }
                
                if (statusElement) {
                    statusElement.textContent = 'WAITING FOR DATA';
                }
                
                // Initialize data structure
                if (!allParkingData[channel]) {
                    allParkingData[channel] = {};
                }
            }
        }
        
        // Initialize counters
        updateStatistics();
        
        // Update display
        const lastUpdatedElement = document.getElementById('last-updated');
        if (lastUpdatedElement) {
            lastUpdatedElement.textContent = 'Awaiting connection...';
        }
    }

    // Helper function to update time display
    function updateTimeDisplay(elementId, timestamp) {
        if (timestamp) {
            const time = moment(timestamp).utcOffset('+05:30'); // Set to IST
            const timeStr = time.format('h:mm A');
            const dateStr = time.format('D MMM YYYY');
            document.getElementById(elementId).textContent = `${timeStr} ${dateStr}`;
        } else {
            document.getElementById(elementId).textContent = 'No changes yet';
        }
    }

    // Update statistics for the simple display
    function updateStatistics() {
        // Count occupied spots
        occupiedSpots = 0;
        for (let channel = 1; channel <= 6; channel++) {
            if (allParkingData[channel]) {
                if (allParkingData[channel].spot1) occupiedSpots++;
                if (allParkingData[channel].spot2) occupiedSpots++;
            }
        }
        
        const availableSpots = totalSpots - occupiedSpots;
        
        // Update counters
        const occupiedCountElement = document.getElementById('occupied-count');
        const availableCountElement = document.getElementById('available-count');
        
        if (occupiedCountElement) {
            occupiedCountElement.textContent = occupiedSpots;
        }
        
        if (availableCountElement) {
            availableCountElement.textContent = availableSpots;
        }
    }
    
    // Helper function to add status change animation
    function addStatusChangeAnimation(element) {
        if (!element) return;
        element.classList.add('status-change');
        setTimeout(() => element.classList.remove('status-change'), 500);
    }

    // The parking spots are not interactive in the main website
    // They only display status received from MQTT or ThingSpeak

    // Initialize by connecting to MQTT Cloud
    if (typeof Paho !== 'undefined') {
        console.log('Using MQTT Cloud for real-time updates');
        
        // Initialize parking spots while waiting for connection
        initializeParkingSpots();
        
        // Connect to MQTT cloud
        connectMQTT();
        
        // Setup periodic connection check
        setInterval(function() {
            if (!isConnected) {
                console.log("MQTT connection check failed, attempting to reconnect...");
                connectMQTT();
            } else {
                console.log("MQTT connection check: Connected");
            }
        }, 10000); // Check every 10 seconds
    } else {
        console.log('MQTT client not available - page will not function properly');
        displayConnectionStatus('MQTT client not available - please enable JavaScript', 'error');
    }
    
    // Periodically save data to localStorage (just for page refresh persistence)
    setInterval(function() {
        saveParkingData(allParkingData);
        saveLastChangeTimes(lastChangeTimes);
        saveLastUpdateTime();
    }, 10000); // Save every 10 seconds

    // Add refresh button functionality with enhanced error handling
    document.querySelector('.premium-btn').addEventListener('click', function() {
        console.log('Manual refresh requested');
        if (isConnected) {
            // For MQTT, we can't force an update, but we can check the connection
            console.log('MQTT connection is active, waiting for messages');
            
            // Visually indicate refresh action with animation
            this.classList.add('refreshing');
            setTimeout(() => this.classList.remove('refreshing'), 500);
        } else {
            console.log('MQTT not connected, falling back to ThingSpeak');
            // Try to reconnect MQTT first
            connectMQTT();
            // And immediately fetch ThingSpeak data
            updateParkingSpots();
        }
        
        // Force UI statistics update
        updateStatistics();
        
        // Add visual feedback
        const button = this;
        button.textContent = 'Refreshing...';
        setTimeout(() => button.textContent = 'Refresh', 1000);
    });
    
    // Initialize statistics
    updateStatistics();
});