// ThingSpeak Channel configuration
const channelID = 2913587;
const readAPIKey = '5ZM4WBVZVHIBWB6B'; // Using the same API key as in the sensor code
const dataFields = { spot1: 1, spot2: 2 }; // field1 = spot1, field2 = spot2
const refreshInterval = 1; // Check every second
let parkingHistoryChart = null;
let lastEntryId = 0; // Track the last entry ID to detect new data
let lastUpdateTime = 0; // Track the last update time

// Initialize the dashboard
function initDashboard() {
    updateParkingData(); // Initial update
    createChart();
    
    // Set up regular updates using two different methods for redundancy
    
    // Method 1: Regular polling (more reliable but might be delayed due to caching)
    setInterval(checkForNewData, refreshInterval * 1000);
    
    // Method 2: Direct fetch with cache-busting (bypasses ThingSpeak caching)
    setInterval(forceDataRefresh, 5000); // Force refresh every 5 seconds
}

// Force a data refresh with cache-busting
async function forceDataRefresh() {
    try {
        // Add a timestamp to prevent caching
        const timestamp = new Date().getTime();
        const url = `https://api.thingspeak.com/channels/${channelID}/feeds/last.json?api_key=${readAPIKey}&_=${timestamp}`;
        
        const response = await fetch(url, {
            cache: 'no-store', // Tell browser not to cache
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const data = await response.json();
        processNewData(data);
    } catch (error) {
        console.error("Error in force refresh:", error);
    }
}

// Check if new data is available
async function checkForNewData() {
    const data = await fetchLatestData();
    if (data) {
        processNewData(data);
    }
}

// Process new data from any source
function processNewData(data) {
    // Only update if this is truly new data
    if (data && data.entry_id && data.entry_id > lastEntryId) {
        console.log("New data detected, updating dashboard...");
        lastEntryId = data.entry_id;
        lastUpdateTime = Date.now();
        
        // Update the UI
        updateUIWithData(data);
        updateChart();
    } else {
        // Check if we've gone too long without updates
        const currentTime = Date.now();
        if (currentTime - lastUpdateTime > 10000) { // 10 seconds
            console.log("No new data for 10 seconds, doing a refresh anyway");
            updateUIWithData(data);
            lastUpdateTime = currentTime;
        }
    }
}

// Fetch the latest data from ThingSpeak
async function fetchLatestData() {
    try {
        // Add a timestamp to prevent caching
        const timestamp = new Date().getTime();
        const url = `https://api.thingspeak.com/channels/${channelID}/feeds/last.json?api_key=${readAPIKey}&_=${timestamp}`;
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error("Error fetching data:", error);
        return null;
    }
}

// Update parking status indicators with provided data
function updateUIWithData(data) {
    if (!data) return;
    
    // Update spot 1 status
    const spot1Element = document.getElementById('spot1-status');
    const spot1Occupied = parseInt(data[`field${dataFields.spot1}`]) === 1;
    spot1Element.textContent = spot1Occupied ? 'Occupied' : 'Available';
    spot1Element.className = spot1Occupied ? 'status-indicator occupied' : 'status-indicator available';
    
    // Update spot 2 status
    const spot2Element = document.getElementById('spot2-status');
    const spot2Occupied = parseInt(data[`field${dataFields.spot2}`]) === 1;
    spot2Element.textContent = spot2Occupied ? 'Occupied' : 'Available';
    spot2Element.className = spot2Occupied ? 'status-indicator occupied' : 'status-indicator available';
    
    // Update last updated timestamp
    const lastUpdated = new Date(data.created_at).toLocaleString();
    document.getElementById('last-updated').textContent = lastUpdated;
}

// Update parking status indicators
async function updateParkingData() {
    const data = await fetchLatestData();
    if (data) {
        updateUIWithData(data);
    }
}

// Fetch historical data from ThingSpeak
async function fetchHistoricalData(days = 1) {
    try {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        
        const startStr = startDate.toISOString();
        const endStr = endDate.toISOString();
        
        const url = `https://api.thingspeak.com/channels/${channelID}/feeds.json?api_key=${readAPIKey}&start=${startStr}&end=${endStr}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error("Error fetching historical data:", error);
        return null;
    }
}

// Create the parking history chart
async function createChart() {
    const data = await fetchHistoricalData();
    if (!data || !data.feeds || data.feeds.length === 0) {
        console.error("No historical data available");
        return;
    }
    
    const ctx = document.getElementById('parkingHistoryChart').getContext('2d');
    
    // Process the data for the chart
    const feeds = data.feeds;
    const labels = feeds.map(feed => new Date(feed.created_at).toLocaleTimeString());
    const spot1Data = feeds.map(feed => feed[`field${dataFields.spot1}`] === '1' ? 1 : 0);
    const spot2Data = feeds.map(feed => feed[`field${dataFields.spot2}`] === '1' ? 1 : 0);
    
    // Create the chart with step line
    parkingHistoryChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Spot 1',
                    data: spot1Data,
                    backgroundColor: 'rgba(220, 53, 69, 0.2)',
                    borderColor: 'rgba(220, 53, 69, 1)',
                    borderWidth: 2,
                    pointRadius: 3,
                    stepped: 'before',
                    yAxisID: 'y'
                },
                {
                    label: 'Spot 2',
                    data: spot2Data,
                    backgroundColor: 'rgba(40, 167, 69, 0.2)',
                    borderColor: 'rgba(40, 167, 69, 1)',
                    borderWidth: 2,
                    pointRadius: 3,
                    stepped: 'before',
                    yAxisID: 'y'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Time'
                    }
                },
                y: {
                    min: 0,
                    max: 1,
                    ticks: {
                        stepSize: 1,
                        callback: function(value) {
                            return value === 0 ? 'Available' : 'Occupied';
                        }
                    },
                    title: {
                        display: true,
                        text: 'Status'
                    }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const value = context.parsed.y;
                            const status = value === 0 ? 'Available' : 'Occupied';
                            return `${context.dataset.label}: ${status}`;
                        }
                    }
                }
            }
        }
    });
}

// Update the chart with new data
async function updateChart() {
    if (!parkingHistoryChart) {
        createChart();
        return;
    }
    
    const data = await fetchHistoricalData();
    if (!data || !data.feeds || data.feeds.length === 0) {
        console.error("No historical data available for chart update");
        return;
    }
    
    const feeds = data.feeds;
    const labels = feeds.map(feed => new Date(feed.created_at).toLocaleTimeString());
    const spot1Data = feeds.map(feed => feed[`field${dataFields.spot1}`] === '1' ? 1 : 0);
    const spot2Data = feeds.map(feed => feed[`field${dataFields.spot2}`] === '1' ? 1 : 0);
    
    parkingHistoryChart.data.labels = labels;
    parkingHistoryChart.data.datasets[0].data = spot1Data;
    parkingHistoryChart.data.datasets[1].data = spot2Data;
    parkingHistoryChart.update();
}

// Initialize the dashboard when the page loads
document.addEventListener('DOMContentLoaded', initDashboard);
