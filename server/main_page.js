// MQTT Cloud Configuration
const MQTT_CONFIG = {
    // ===== REPLACE THESE VALUES WITH YOUR HIVEMQ CLOUD CREDENTIALS =====
    host: "wss://f68a0a1321584a169cd42818b2fcad8a.s2.eu.hivemq.cloud:8884/mqtt", // HiveMQ Cloud WebSocket Secure URL
    port: 8884,               // WebSocket secure port
    username: 'team35',       // Replace with your HiveMQ username
    password: 'Team35_Admin', // Replace with your HiveMQ password
    // ================================================================
    
    // Generate a unique client ID for main dashboard
    clientId: 'dashboard_main_' + Math.random().toString(16).substring(2, 10),
    topics: [
        'parking/sensor1',
        'parking/sensor2',
        'parking/sensor3',
        'parking/sensor4',
        'parking/sensor5',
        'parking/sensor6',
        'parking/sensor1/spot1',
        'parking/sensor1/spot2',
        'parking/sensor2/spot1',
        'parking/sensor2/spot2',
        'parking/sensor3/spot1',
        'parking/sensor3/spot2',
        'parking/sensor4/spot1',
        'parking/sensor4/spot2',
        'parking/sensor5/spot1',
        'parking/sensor5/spot2',
        'parking/sensor6/spot1',
        'parking/sensor6/spot2'
    ],
    path: '/mqtt',
    useSSL: true, // Required for HiveMQ Cloud
    reconnectTimeout: 5000
};

// Helper functions for localStorage persistence (for this page only)
function saveParkingData(data) {
    localStorage.setItem('mainPageData', JSON.stringify(data));
}

function loadParkingData() {
    const stored = localStorage.getItem('mainPageData');
    if (stored) {
        try {
            return JSON.parse(stored);
        } catch (e) {
            console.error('Error parsing stored parking data:', e);
            return null;
        }
    }
    return null;
}

// Helper to save timeline events
function saveTimelineEvents(events) {
    localStorage.setItem('mainPageTimelineEvents', JSON.stringify(events));
}

function loadTimelineEvents() {
    const stored = localStorage.getItem('mainPageTimelineEvents');
    if (stored) {
        try {
            // Convert ISO date strings back to Date objects
            return JSON.parse(stored, (key, value) => {
                if (key === 'time' && typeof value === 'string') {
                    return new Date(value);
                }
                return value;
            });
        } catch (e) {
            console.error('Error parsing stored timeline events:', e);
            return [];
        }
    }
    return [];
}

// Save/load historical data
function saveHistoricalData(data) {
    localStorage.setItem('mainPageHistoricalData', JSON.stringify(data));
}

function loadHistoricalData() {
    const stored = localStorage.getItem('mainPageHistoricalData');
    return stored ? JSON.parse(stored) : { timestamps: [], occupancy: [] };
}

// Global variables to store parking data
let parkingData = loadParkingData() || {
    total: 12,  // Total number of parking spots (6 modules × 2 spots per module)
    sensors: [], // Will hold data for all sensors
    totalParkingsToday: 0,
    timelineEvents: [],
    lastUpdate: null,
};

// Initialize sensors if they're not in stored data
if (!parkingData.sensors || parkingData.sensors.length === 0) {
    parkingData.sensors = [];
    for (let i = 0; i < 6; i++) {
        parkingData.sensors.push({
            id: i + 1,
            spot1: 0,
            spot2: 0,
            lastChanged1: null,
            lastChanged2: null
        });
    }
}

// Load timeline events from localStorage
parkingData.timelineEvents = loadTimelineEvents() || [];

// Keep track of historical data for charts - load from localStorage if available
const historicalData = loadHistoricalData() || {
    timestamps: [],
    occupancy: []
};

// MQTT Client
let client = null;

// Initialize the dashboard
function initDashboard() {
    // Connect to MQTT
    client = connectMQTT();
    
    // Initial UI updates
    updateParkingStats();
    updateTrafficChart();
    
    // Set up regular update intervals
    setInterval(updateParkingStats, 1000); // Update every second based on most recent MQTT data
    setInterval(updateTrafficChart, 15000); // Update charts less frequently
    
    // Check MQTT connection status and attempt reconnection if needed
    setInterval(function() {
        if (!client || !client.isConnected()) {
            console.log("MQTT connection not active, attempting reconnection...");
            client = connectMQTT();
        } else {
            console.log("MQTT connection is active. Connection status:", client.isConnected());
        }
    }, 10000); // Check every 10 seconds
    
    // Periodically save data for page refresh persistence
    setInterval(function() {
        saveParkingData(parkingData);
        saveTimelineEvents(parkingData.timelineEvents);
        saveHistoricalData(historicalData);
    }, 10000); // Every 10 seconds
}

function connectMQTT() {
    try {
        console.log("Connecting to MQTT cloud broker...");

        // Create a client instance
        const url = new URL(MQTT_CONFIG.host);
        const client = new Paho.MQTT.Client(
            url.hostname,
            Number(MQTT_CONFIG.port),
            url.pathname,
            MQTT_CONFIG.clientId
        );

        // Set up callbacks before connecting
        client.onConnectionLost = onConnectionLost;
        client.onMessageArrived = onMessageArrived;

        const options = {
            timeout: 30, // Increased timeout
            useSSL: MQTT_CONFIG.useSSL, // Must be true for HiveMQ Cloud
            keepAliveInterval: 60, // Increased keep alive
            cleanSession: true,
            onSuccess: () => {
                console.log("MQTT Cloud Connected!");
                updateConnectionStatus(true);
                // Subscribe to topics after successful connection
                MQTT_CONFIG.topics.forEach(topic => {
                    console.log("Subscribing to:", topic);
                    client.subscribe(topic);
                });
                displayConnectionInfo('Connected to MQTT Cloud');
            },
            onFailure: (err) => {
                console.error("MQTT Connection failed:", err);
                updateConnectionStatus(false);
                displayConnectionInfo('Failed to connect: ' + err.errorMessage);
                // Try to reconnect after 5 seconds
                setTimeout(() => connectMQTT(), MQTT_CONFIG.reconnectTimeout);
            }
        };

        // Required for HiveMQ Cloud authentication
        if (MQTT_CONFIG.username) {
            options.userName = MQTT_CONFIG.username;
            options.password = MQTT_CONFIG.password;
        }

        // Connect with retry mechanism
        const connect = () => {
            try {
                client.connect(options);
            } catch (err) {
                console.error("Connection attempt failed:", err);
                displayConnectionInfo('Connection attempt failed');
                setTimeout(connect, MQTT_CONFIG.reconnectTimeout);
            }
        };

        connect();
        return client;

    } catch (error) {
        console.error("MQTT setup error:", error);
        updateConnectionStatus(false);
        displayConnectionInfo('MQTT setup error: ' + error.message);
        // Try to reconnect after 5 seconds
        setTimeout(() => connectMQTT(), MQTT_CONFIG.reconnectTimeout);
        return null;
    }
}

// Display connection information on the dashboard
function displayConnectionInfo(message) {
    const infoElement = document.getElementById('connection-info');
    if (infoElement) {
        infoElement.textContent = message;
    } else {
        // Create an info element if it doesn't exist
        const infoDiv = document.createElement('div');
        infoDiv.id = 'connection-info';
        infoDiv.className = 'connection-info';
        infoDiv.textContent = message;
        document.querySelector('.welcome-section').appendChild(infoDiv);
    }
}

// Called when the client connects
function onConnect() {
    console.log("MQTT Connected!");
    
    // Subscribe to all sensor topics
    MQTT_CONFIG.topics.forEach(topic => {
        console.log("Subscribing to:", topic);
        client.subscribe(topic);
    });
    
    // Update status in UI
    updateConnectionStatus(true);
}

// Called when connection fails
function onConnectFailure(error) {
    console.error("MQTT Connection failed:", error);
    updateConnectionStatus(false);
    
    // Try to reconnect after 5 seconds
    setTimeout(connectMQTT, MQTT_CONFIG.reconnectTimeout);
}

// Called when connection is lost
function onConnectionLost(responseObject) {
    if (responseObject.errorCode !== 0) {
        console.error("MQTT Connection lost:", responseObject.errorMessage);
        updateConnectionStatus(false);
        
        // Try to reconnect after 5 seconds
        setTimeout(function() {
            console.log("Attempting to reconnect to MQTT...");
            client = connectMQTT();
        }, MQTT_CONFIG.reconnectTimeout);
        
        // Immediately fall back to ThingSpeak
        fetchThingSpeakData();
    }
}

// Called when a message arrives
// Enhanced logging for debugging the connection
function logConnectionStatus() {
    if (client) {
        console.log(`MQTT Client Status: ${client.isConnected() ? 'Connected' : 'Disconnected'}`);
    } else {
        console.log('MQTT Client not initialized');
    }
}

function onMessageArrived(message) {
    // Parse the message payload
    try {
        const topic = message.destinationName;
        console.log(`Message received on ${topic}:`, message.payloadString);
        
        const payload = JSON.parse(message.payloadString);
        
        // Enhanced logging for debugging
        console.log('Message topic:', topic);
        console.log('Message payload:', payload);
        
        // Handle different message formats
        
        // 1. Handle direct payload from ESP32 with sensorId, spot1, spot2
        if (payload.sensorId && payload.sensorId >= 1 && payload.sensorId <= 6) {
            const sensorId = payload.sensorId;
            const sensorIndex = sensorId - 1;
            const sensor = parkingData.sensors[sensorIndex];
            
            // Check if spot states have changed (for event tracking)
            const spot1Changed = sensor.spot1 !== payload.spot1;
            const spot2Changed = sensor.spot2 !== payload.spot2;
            
            // Update the data
            if (payload.spot1 !== undefined) sensor.spot1 = payload.spot1;
            if (payload.spot2 !== undefined) sensor.spot2 = payload.spot2;
            
            processSpotChanges(sensorId, spot1Changed, spot2Changed, sensor.spot1, sensor.spot2);
        }
        // 2. Handle simulation format with spot_id
        else if (payload.spot_id) {
            const spotIdParts = payload.spot_id.split('-');
            if (spotIdParts.length === 3) {
                const sensorNumber = parseInt(spotIdParts[1]);
                const spotNumber = parseInt(spotIdParts[2]);
                
                if (sensorNumber >= 1 && sensorNumber <= 6 && (spotNumber === 1 || spotNumber === 2)) {
                    const sensorIndex = sensorNumber - 1;
                    const sensor = parkingData.sensors[sensorIndex];
                    
                    // Update specific spot
                    const newStatus = payload.status === 1 ? 1 : 0;
                    
                    // Track if this is a change
                    let spot1Changed = false;
                    let spot2Changed = false;
                    
                    if (spotNumber === 1) {
                        spot1Changed = sensor.spot1 !== newStatus;
                        sensor.spot1 = newStatus;
                    } else {
                        spot2Changed = sensor.spot2 !== newStatus;
                        sensor.spot2 = newStatus;
                    }
                    
                    processSpotChanges(sensorNumber, spot1Changed, spot2Changed, sensor.spot1, sensor.spot2);
                }
            }
        }
        // 3. Handle topic-based messages: parking/sensor1/spot2
        else if (topic.includes('/')) {
            const topicParts = topic.split('/');
            if (topicParts.length === 3 && topicParts[0] === 'parking') {
                const sensorPart = topicParts[1];
                const spotPart = topicParts[2];
                
                const sensorNumber = parseInt(sensorPart.replace('sensor', ''));
                const spotNumber = parseInt(spotPart.replace('spot', ''));
                
                if (sensorNumber >= 1 && sensorNumber <= 6 && (spotNumber === 1 || spotNumber === 2)) {
                    const sensorIndex = sensorNumber - 1;
                    const sensor = parkingData.sensors[sensorIndex];
                    
                    // Determine new status
                    const newStatus = payload.status !== undefined ? (payload.status === 1 ? 1 : 0) : 1;
                    
                    // Track if this is a change
                    let spot1Changed = false;
                    let spot2Changed = false;
                    
                    if (spotNumber === 1) {
                        spot1Changed = sensor.spot1 !== newStatus;
                        sensor.spot1 = newStatus;
                    } else {
                        spot2Changed = sensor.spot2 !== newStatus;
                        sensor.spot2 = newStatus;
                    }
                    
                    processSpotChanges(sensorNumber, spot1Changed, spot2Changed, sensor.spot1, sensor.spot2);
                }
            }
        }
    } catch (error) {
        console.error("Error processing MQTT message:", error);
    }
}

// Process spot changes (extracted common functionality)
function processSpotChanges(sensorId, spot1Changed, spot2Changed, spot1Status, spot2Status) {
    const currentTime = new Date();
    
    // Handle spot 1 changes
    if (spot1Changed) {
        parkingData.sensors[sensorId-1].lastChanged1 = currentTime;
        
        // If spot became occupied (car parked)
        if (spot1Status === 1) {
            parkingData.totalParkingsToday++;
            // Add to timeline
            parkingData.timelineEvents.push({
                time: currentTime,
                type: 'parked',
                spot: `Sensor ${sensorId}, Spot 1`
            });
        } else {
            // Add car leaving to timeline
            parkingData.timelineEvents.push({
                time: currentTime,
                type: 'left',
                spot: `Sensor ${sensorId}, Spot 1`
            });
        }
    }
    
    // Handle spot 2 changes
    if (spot2Changed) {
        parkingData.sensors[sensorId-1].lastChanged2 = currentTime;
        
        // If spot became occupied (car parked)
        if (spot2Status === 1) {
            parkingData.totalParkingsToday++;
            // Add to timeline
            parkingData.timelineEvents.push({
                time: currentTime,
                type: 'parked',
                spot: `Sensor ${sensorId}, Spot 2`
            });
        } else {
            // Add car leaving to timeline
            parkingData.timelineEvents.push({
                time: currentTime,
                type: 'left',
                spot: `Sensor ${sensorId}, Spot 2`
            });
        }
    }
    
    // Record timestamp for chart data (once per minute)
    const minuteTimestamp = new Date(currentTime);
    minuteTimestamp.setSeconds(0, 0); // Round to the minute
    const timestampString = minuteTimestamp.toISOString();
    
    // Only add new data point if it's a new minute or we have no data
    if (historicalData.timestamps.length === 0 || 
        historicalData.timestamps[historicalData.timestamps.length - 1] !== timestampString) {
        
        // Calculate current occupancy
        const occupiedSpots = calculateOccupiedSpots();
        const occupancyRate = (occupiedSpots / parkingData.total) * 100;
        
        // Add to historical data (limit to last 24 hours / 1440 minutes)
        historicalData.timestamps.push(timestampString);
        historicalData.occupancy.push(occupancyRate);
        
        // Keep only the last 1440 data points (24 hours)
        if (historicalData.timestamps.length > 1440) {
            historicalData.timestamps.shift();
            historicalData.occupancy.shift();
        }
        
        // Save historical data
        saveHistoricalData(historicalData);
    }
    
    // Store last update time
    parkingData.lastUpdate = currentTime;
    
    // Save the parking data to localStorage for persistence
    saveParkingData(parkingData);
    
    // Update the UI
    updateParkingStats();
}

// Update connection status in UI
function updateConnectionStatus(connected) {
    // Update UI to show connection status
    // This could update a status indicator or notification
    console.log("MQTT connection status:", connected ? "Connected" : "Disconnected");
}

// Calculate number of occupied spots
function calculateOccupiedSpots() {
    return parkingData.sensors.reduce((total, sensor) => {
        return total + sensor.spot1 + sensor.spot2;
    }, 0);
}

// Update parking statistics based on current data
function updateParkingStats() {
    // Calculate statistics
    const occupiedSpots = calculateOccupiedSpots();
    const freeSpots = parkingData.total - occupiedSpots;
    const capacityPercentage = Math.round((occupiedSpots / parkingData.total) * 100);
    
    // Update dashboard elements
    $('#freeSpaces').text(freeSpots);
    $('#occupiedSpaces').text(occupiedSpots);
    $('#totalCarsParked').text(parkingData.totalParkingsToday);
    $('#totalParkings').text(parkingData.totalParkingsToday);
    $('#capacityPercentage').text(`${capacityPercentage}%`);
    $('#capacityStatus').text(capacityPercentage > 80 ? 'High' : capacityPercentage > 50 ? 'Moderate' : 'Low');
    
    // Update last updated time if data has been received
    if (parkingData.lastUpdate) {
        $('#last-updated').text(parkingData.lastUpdate.toLocaleString());
    } else {
        parkingData.lastUpdate = new Date(); // Set initial timestamp
        $('#last-updated').text(parkingData.lastUpdate.toLocaleString());
    }
    
    // Update timeline with recent events
    updateTimeline();
    
    // Check if data is stale (no updates in the last 30 seconds)
    const now = new Date();
    if (parkingData.lastUpdate && (now - parkingData.lastUpdate) > 30000) {
        console.log("Data appears stale, attempting to refresh...");
        if (!client || !client.isConnected()) {
            fetchThingSpeakData();
        }
    }
}

// Update the timeline display
function updateTimeline() {
    const timeline = $('#timeline');
    timeline.empty();
    
    // Sort events by time (newest first)
    const sortedEvents = [...parkingData.timelineEvents].sort((a, b) => b.time - a.time);
    
    // Show only the 5 most recent events
    const recentEvents = sortedEvents.slice(0, 5);
    
    recentEvents.forEach(event => {
        const timeStr = event.time.toLocaleTimeString();
        const isParkEvent = event.type === 'parked';
        
        const eventHtml = `
            <div class="timeline-item">
                <div class="timeline-dot ${isParkEvent ? 'parked' : 'left'}"></div>
                <div class="timeline-content">
                    <div class="timeline-event">
                        <span class="event-icon">
                            <i class="fas ${isParkEvent ? 'fa-parking' : 'fa-sign-out-alt'}"></i>
                        </span>
                        <span class="event-text">
                            Car ${isParkEvent ? 'parked in' : 'left'} ${event.spot}
                        </span>
                    </div>
                    <div class="timeline-time">${timeStr}</div>
                </div>
            </div>
        `;
        
        timeline.append(eventHtml);
    });
    
    // If no events
    if (recentEvents.length === 0) {
        timeline.append('<div class="no-data">No recent activity</div>');
    }
}

// Store chart instances
let trafficChartInstance = null;
let parkingChartInstance = null;

// Update traffic chart
function updateTrafficChart() {
    // Get selected time range from buttons
    const activeButton = document.querySelector('.time-option.active');
    let selectedRange = '24h';

    if (activeButton) {
        const buttonText = activeButton.textContent.trim().toLowerCase();
        if (buttonText.includes('week')) {
            selectedRange = '7d';
        } else if (buttonText === 'today') {
            selectedRange = '24h';
        } else if (buttonText.includes('hour')) {
            selectedRange = '1h';
        }
    }
    
    // Filter historical data based on time range
    let filteredData = {
        labels: [],
        values: []
    };
    
    if (historicalData.timestamps.length > 0) {
        const now = new Date();
        const cutoffTime = new Date(now);
        
        switch(selectedRange) {
            case '1h':
                cutoffTime.setHours(now.getHours() - 1);
                break;
            case '24h':
                cutoffTime.setDate(now.getDate() - 1);
                break;
            case '7d':
                cutoffTime.setDate(now.getDate() - 7);
                break;
        }
        
        // Filter data points
        historicalData.timestamps.forEach((timestamp, index) => {
            const dataTime = new Date(timestamp);
            if (dataTime >= cutoffTime) {
                // Format the label based on the time range
                let label;
                if (selectedRange === '1h') {
                    label = dataTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                } else if (selectedRange === '24h') {
                    label = dataTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                } else { // 7d
                    label = dataTime.toLocaleDateString([], {weekday: 'short', month: 'short', day: 'numeric'});
                }
                
                filteredData.labels.push(label);
                filteredData.values.push(historicalData.occupancy[index]);
            }
        });
    }
    
    // If no data available, use sample data for display
    if (filteredData.labels.length === 0) {
        // Generate sample data based on selected range
        const sampleCount = selectedRange === '1h' ? 12 : selectedRange === '24h' ? 24 : 7;
        for (let i = 0; i < sampleCount; i++) {
            filteredData.labels.push(i.toString());
            filteredData.values.push(Math.floor(Math.random() * 50) + 25); // Random values between 25-75%
        }
    }
    
    // Create or update traffic chart
    const ctx = document.getElementById('trafficChart').getContext('2d');
    
    // Destroy previous chart instance if it exists
    if (trafficChartInstance) {
        trafficChartInstance.destroy();
    }
    
    // Create new chart instance
    trafficChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: filteredData.labels,
            datasets: [{
                label: 'Occupancy Rate',
                data: filteredData.values,
                borderColor: '#4270F4',
                tension: 0.4,
                fill: false
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        callback: value => value + '%',
                        stepSize: 20
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.1)',
                        drawBorder: false
                    },
                    title: {
                        display: true,
                        text: 'Occupancy Rate'
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    title: {
                        display: true,
                        text: 'Time'
                    },
                    ticks: {
                        maxRotation: 45,
                        minRotation: 45
                    }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                }
            }
        }
    });
    
    // Update recent traffic view
    updateRecentTraffic();
}

// Update recent traffic view
function updateRecentTraffic() {
    const recentTrafficDiv = $('#recentTraffic');
    recentTrafficDiv.empty();
    
    // Sort events by time (newest first)
    const sortedEvents = [...parkingData.timelineEvents].sort((a, b) => b.time - a.time);
    
    // Show only the 5 most recent events
    const recentEvents = sortedEvents.slice(0, 5);
    
    recentEvents.forEach(event => {
        const timeStr = event.time.toLocaleTimeString();
        const dateStr = event.time.toLocaleDateString();
        const isParkEvent = event.type === 'parked';
        
        const eventHtml = `
            <div class="transaction-item">
                <div class="transaction-icon ${isParkEvent ? 'deposit' : 'withdrawal'}">
                    <i class="fas ${isParkEvent ? 'fa-parking' : 'fa-sign-out-alt'}"></i>
                </div>
                <div class="transaction-details">
                    <div class="transaction-name">Car ${isParkEvent ? 'Parked' : 'Left'}</div>
                    <div class="transaction-date">${dateStr} ${timeStr}</div>
                </div>
                <div class="transaction-amount ${isParkEvent ? 'deposit' : 'withdrawal'}">
                    ${event.spot}
                </div>
            </div>
        `;
        
        recentTrafficDiv.append(eventHtml);
    });
    
    // If no events, show a message
    if (recentEvents.length === 0) {
        recentTrafficDiv.append('<div class="no-transaction">No recent activity</div>');
    }
}

// Create parking chart
function createParkingChart() {
    const ctx = document.getElementById('parking-chart').getContext('2d');
    
    // Initial data
    const chartData = {
        labels: [],
        datasets: [{
            label: 'Occupancy Rate',
            data: [],
            backgroundColor: 'rgba(66, 112, 244, 0.2)',
            borderColor: 'rgba(66, 112, 244, 1)',
            borderWidth: 2,
            tension: 0.4,
            fill: true
        }]
    };
    
    // Create chart
    parkingChartInstance = new Chart(ctx, {
        type: 'line',
        data: chartData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        callback: function(value) {
                            return value + '%';
                        }
                    },
                    grid: {
                        display: false
                    }
                },
                x: {
                    display: false
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            },
            elements: {
                point: {
                    radius: 0
                }
            }
        }
    });
    
    // Update chart data
    setInterval(() => {
        // Use the last 10 data points for the mini chart
        const dataLength = historicalData.timestamps.length;
        if (dataLength > 0) {
            const labels = historicalData.timestamps.slice(-10).map(ts => {
                const date = new Date(ts);
                return date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            });
            
            const data = historicalData.occupancy.slice(-10);
            
            parkingChartInstance.data.labels = labels;
            parkingChartInstance.data.datasets[0].data = data;
            parkingChartInstance.update();
        }
    }, 10000);
    
    // Initial button event handlers
    $('.time-option').on('click', function() {
        $('.time-option').removeClass('active');
        $(this).addClass('active');
        updateTrafficChart();
    });
    
    // Refresh button
    $('.premium-btn').on('click', function() {
        updateParkingStats();
        updateTrafficChart();
    });
}

// Report connection issues to the user interface
function reportConnectionIssue() {
    console.log("MQTT connection unavailable");
    updateConnectionStatus(false);
    displayConnectionInfo('MQTT connection unavailable - attempting to reconnect');
    
    // Update UI to show we're waiting for a connection
    $('#freeSpaces').text('--');
    $('#occupiedSpaces').text('--');
    $('#capacityStatus').text('Waiting for data...');
    
    // Try to reconnect to MQTT
    setTimeout(() => {
        if (!client || !client.isConnected()) {
            client = connectMQTT();
        }
    }, 3000);
}

// Add refresh functionality to the button
function setupRefreshButton() {
    $('.premium-btn').on('click', function() {
        console.log("Manual refresh requested");
        
        // First try MQTT if available
        if (client && client.isConnected()) {
            console.log("MQTT connected, waiting for updates");
            // MQTT is push-based, so we just need to make sure we're connected
        } else {
            // Fall back to ThingSpeak
            console.log("MQTT not connected, fetching from ThingSpeak");
            fetchThingSpeakData();
        }
        
        // Force UI updates
        updateParkingStats();
        updateTrafficChart();
    });
}

// Initialize when document is ready
$(document).ready(function() {
    initDashboard();
    createParkingChart();
    setupRefreshButton();
    
    // Set up refresh button
    $('.premium-btn').on('click', function() {
        console.log("Manual refresh requested");
        updateParkingStats();
        updateTrafficChart();
    });
});