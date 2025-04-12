// MQTT Configuration
const MQTT_CONFIG = {
    host: "ws://172.20.10.2:9001/mqtt", // CHANGE THIS to your MQTT broker IP or hostname
    port: 9001,               // WebSocket port (typically 9001, not the same as MQTT 1883)
    username: '',             // Leave empty if not using authentication
    password: '',             // Leave empty if not using authentication
    clientId: 'WebClient_' + Math.random().toString(16).substr(2, 8),
    topics: [
        'parking/sensor1',
        'parking/sensor2',
        'parking/sensor3',
        'parking/sensor4',
        'parking/sensor5',
        'parking/sensor6'
    ],
    path:'/mqtt',
    useSSL: false, // Set to true if using SSL
    reconnectTimeout: 5000
};

// Global variables to store parking data
let parkingData = {
    total: 12,  // Total number of parking spots (6 modules × 2 spots per module)
    sensors: [], // Will hold data for all sensors
    totalParkingsToday: 0,
    timelineEvents: [],
    lastUpdate: null,
};

// Initialize empty data structure for all sensors
for (let i = 0; i < 6; i++) {
    parkingData.sensors.push({
        id: i + 1,
        spot1: 0,
        spot2: 0,
        lastChanged1: null,
        lastChanged2: null
    });
}

// Keep track of historical data for charts
const historicalData = {
    timestamps: [],
    occupancy: []
};

// MQTT Client
let client = null;

// Initialize the dashboard
function initDashboard() {
    client = connectMQTT();
    updateParkingStats();
    updateTrafficChart();
    setInterval(updateParkingStats, 1000); // Update every second based on most recent MQTT data
    setInterval(updateTrafficChart, 15000); // Update charts less frequently
}

function connectMQTT() {
    try {
        console.log("Connecting to MQTT broker...");

        // Parse the host URL properly
        const hostUrl = new URL(MQTT_CONFIG.host);
        
        const client = new Paho.MQTT.Client(
            hostUrl.hostname,
            Number(MQTT_CONFIG.port),
            MQTT_CONFIG.path,
            MQTT_CONFIG.clientId
        );

        // Set up callbacks before connecting
        client.onConnectionLost = onConnectionLost;
        client.onMessageArrived = onMessageArrived;

        const options = {
            timeout: 30, // Increased timeout
            useSSL: MQTT_CONFIG.useSSL,
            keepAliveInterval: 60, // Increased keep alive
            cleanSession: true,
            onSuccess: () => {
                console.log("MQTT Connected!");
                updateConnectionStatus(true);
                // Subscribe to topics after successful connection
                MQTT_CONFIG.topics.forEach(topic => {
                    console.log("Subscribing to:", topic);
                    client.subscribe(topic);
                });
            },
            onFailure: (err) => {
                console.error("MQTT Connection failed:", err);
                updateConnectionStatus(false);
                // Try to reconnect after 5 seconds
                setTimeout(() => connectMQTT(), MQTT_CONFIG.reconnectTimeout);
            }
        };

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
                setTimeout(connect, MQTT_CONFIG.reconnectTimeout);
            }
        };

        connect();
        return client;

    } catch (error) {
        console.error("MQTT setup error:", error);
        updateConnectionStatus(false);
        // Try to reconnect after 5 seconds
        setTimeout(() => connectMQTT(), MQTT_CONFIG.reconnectTimeout);
        return null;
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
        setTimeout(connectMQTT, MQTT_CONFIG.reconnectTimeout);
    }
}

// Called when a message arrives
function onMessageArrived(message) {
    // Parse the message payload (JSON format from ESP32)
    try {
        const payload = JSON.parse(message.payloadString);
        const sensorId = payload.sensorId;
        const topic = message.destinationName;
        
        console.log(`Message received on ${topic}:`, payload);
        
        // Update sensor data
        if (sensorId >= 1 && sensorId <= 6) {
            const sensorIndex = sensorId - 1;
            const sensor = parkingData.sensors[sensorIndex];
            
            // Check if spot states have changed (for event tracking)
            const spot1Changed = sensor.spot1 !== payload.spot1;
            const spot2Changed = sensor.spot2 !== payload.spot2;
            
            // Update the data
            sensor.spot1 = payload.spot1;
            sensor.spot2 = payload.spot2;
            
            // Track state changes for timeline
            const currentTime = new Date();
            
            if (spot1Changed) {
                sensor.lastChanged1 = currentTime;
                
                // If spot became occupied (car parked)
                if (payload.spot1 === 1) {
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
            
            if (spot2Changed) {
                sensor.lastChanged2 = currentTime;
                
                // If spot became occupied (car parked)
                if (payload.spot2 === 1) {
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
            }
            
            // Store last update time
            parkingData.lastUpdate = currentTime;
            
            // Update the UI
            updateParkingStats();
        }
    } catch (error) {
        console.error("Error processing MQTT message:", error);
    }
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
    }
    
    // Update timeline with recent events
    updateTimeline();
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

// Initialize when document is ready
$(document).ready(function() {
    initDashboard();
    createParkingChart();
    
    // Set up refresh button
    $('.premium-btn').on('click', function() {
        console.log("Manual refresh requested");
        updateParkingStats();
        updateTrafficChart();
    });
});