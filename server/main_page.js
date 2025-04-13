// ThingSpeak Channel Configuration - 6 channels, each with 2 fields
// Primary channel data for reference
const PRIMARY_CHANNEL_ID = '2913587';
const PRIMARY_API_KEY = '5ZM4WBVZVHIBWB6B';
const UPDATE_INTERVAL = 60000; // Update every 60 seconds (reduced frequency)

// All 6 ThingSpeak channels (one for each IR sensor)
const CHANNEL_INFO = [
    { id: '2914193', apiKey: 'EF6D0DPOLTWPMMUD' }, // Channel 1 - Sector A spots 1-2
    { id: '2914195', apiKey: '38S5DDJSWBATRB7O' }, // Channel 2 - Sector A spots 3-4
    { id: '2914196', apiKey: 'T5QY7KFJPIZV9JKU' }, // Channel 3 - Sector B spots 1-2
    { id: '2914197', apiKey: 'AYRC81YEPXIFJ4KN' }, // Channel 4 - Sector B spots 3-4
    { id: '2914203', apiKey: 'ZR0R7T5PN6QR1T4E' }, // Channel 5 - Sector C spots 1-2
    { id: '2914204', apiKey: '1GQOW8QBGG9Q3CYX' }  // Channel 6 - Sector C spots 3-4
];

// Parking state storage (3 rows x 4 columns)
// Row A: Sectors A (spots 1-4) 
// Row B: Sectors B (spots 1-4)
// Row C: Sectors C (spots 1-4)
let parkingStateArray = [
    [false, false, false, false], // Sector A (spots 1-4)
    [false, false, false, false], // Sector B (spots 1-4)
    [false, false, false, false]  // Sector C (spots 1-4)
];

// Mapping from channel and field to sector and spot
// This maps each field of each channel to the right spot in our UI
const channelFieldToSectorSpotMap = [
    // Channel 1 (fields 1-2) -> Sector A (spots 1-2)
    { channel: 0, field: 1, sector: 0, spot: 0 }, // Channel 1, Field 1 -> Sector A, Spot 1
    { channel: 0, field: 2, sector: 0, spot: 1 }, // Channel 1, Field 2 -> Sector A, Spot 2
    
    // Channel 2 (fields 1-2) -> Sector A (spots 3-4)
    { channel: 1, field: 1, sector: 0, spot: 2 }, // Channel 2, Field 1 -> Sector A, Spot 3
    { channel: 1, field: 2, sector: 0, spot: 3 }, // Channel 2, Field 2 -> Sector A, Spot 4
    
    // Channel 3 (fields 1-2) -> Sector B (spots 1-2)
    { channel: 2, field: 1, sector: 1, spot: 0 }, // Channel 3, Field 1 -> Sector B, Spot 1
    { channel: 2, field: 2, sector: 1, spot: 1 }, // Channel 3, Field 2 -> Sector B, Spot 2
    
    // Channel 4 (fields 1-2) -> Sector B (spots 3-4)
    { channel: 3, field: 1, sector: 1, spot: 2 }, // Channel 4, Field 1 -> Sector B, Spot 3
    { channel: 3, field: 2, sector: 1, spot: 3 }, // Channel 4, Field 2 -> Sector B, Spot 4
    
    // Channel 5 (fields 1-2) -> Sector C (spots 1-2)
    { channel: 4, field: 1, sector: 2, spot: 0 }, // Channel 5, Field 1 -> Sector C, Spot 1
    { channel: 4, field: 2, sector: 2, spot: 1 }, // Channel 5, Field 2 -> Sector C, Spot 2
    
    // Channel 6 (fields 1-2) -> Sector C (spots 3-4)
    { channel: 5, field: 1, sector: 2, spot: 2 }, // Channel 6, Field 1 -> Sector C, Spot 3
    { channel: 5, field: 2, sector: 2, spot: 3 }  // Channel 6, Field 2 -> Sector C, Spot 4
];

// Track when each parking spot was last updated
let lastChangeTimes = {};

// Countdown timer for ThingSpeak updates
let countdownValue = Math.floor(UPDATE_INTERVAL / 1000); // Convert ms to seconds
let countdownTimer = null;

// Initialize the dashboard
function initDashboard() {
    // Initial data load
    updateParkingStats();
    updateTrafficChart();
    
    // Set up countdown timer (updates every second)
    countdownTimer = setInterval(() => {
        if (countdownValue > 0) {
            countdownValue--;
            updateCountdownDisplay();
        }
    }, 1000);
    
    // Initialize the countdown display
    updateCountdownDisplay();
    
    // Set interval for periodic updates
    setInterval(() => {
        // Reset the countdown when we do an update
        countdownValue = Math.floor(UPDATE_INTERVAL / 1000);
        updateParkingStats();
        updateTrafficChart();
    }, UPDATE_INTERVAL);
}

// Update parking statistics
function updateParkingStats() {
    console.log('Updating parking stats from ThingSpeak for all 6 channels...');
    
    // Create a promise for each of the 6 channels
    const channelPromises = [];
    
    // Loop through all 6 channels to fetch their data
    for (let channelIndex = 0; channelIndex < CHANNEL_INFO.length; channelIndex++) {
        const channelData = CHANNEL_INFO[channelIndex];
        console.log(`Fetching data from ThingSpeak channel ${channelIndex + 1}:`, channelData.id);
        
        // Create a promise for this channel
        const promise = $.ajax({
            url: `https://api.thingspeak.com/channels/${channelData.id}/feeds/last.json`,
            data: { api_key: channelData.apiKey },
            dataType: 'json',
            success: function(data) {
                if (!data) {
                    console.error(`No data received from ThingSpeak for channel ${channelIndex + 1}`);
                    return;
                }
                
                console.log(`Received ThingSpeak data for channel ${channelIndex + 1}:`, data);
                const timestamp = data.created_at;
                const lastUpdateTimestamp = moment(timestamp);
                
                // Update ThingSpeak timestamp display
                const formattedTime = lastUpdateTimestamp.format('MMM D, YYYY h:mm:ss A');
                
                // Each channel has 2 fields corresponding to 2 parking spots
                const field1 = data.field1 !== undefined ? parseInt(data.field1) === 1 : false;
                const field2 = data.field2 !== undefined ? parseInt(data.field2) === 1 : false;
                
                // Find the mapping for this channel's fields
                const mappings = channelFieldToSectorSpotMap.filter(m => m.channel === channelIndex);
                
                if (mappings.length >= 2) {
                    // Map field1 to the correct sector/spot
                    const field1Mapping = mappings.find(m => m.field === 1);
                    if (field1Mapping) {
                        // Always update the timestamp to show the latest data point time
                        // regardless of whether state changed
                        parkingStateArray[field1Mapping.sector][field1Mapping.spot] = field1;
                        lastChangeTimes[`${field1Mapping.sector}-${field1Mapping.spot}`] = timestamp;
                        
                        // Format and log for debugging
                        const sectorLetter = String.fromCharCode(65 + field1Mapping.sector);
                        const spotNumber = field1Mapping.spot + 1;
                        const formattedTime = moment(timestamp).format('MMM D, YYYY h:mm:ss A');
                        console.log(`Sector ${sectorLetter}${spotNumber}: ${field1 ? 'Occupied' : 'Free'} (Last data: ${formattedTime})`);
                    }
                    
                    // Map field2 to the correct sector/spot
                    const field2Mapping = mappings.find(m => m.field === 2);
                    if (field2Mapping) {
                        // Always update the timestamp to show the latest data point time
                        // regardless of whether state changed
                        parkingStateArray[field2Mapping.sector][field2Mapping.spot] = field2;
                        lastChangeTimes[`${field2Mapping.sector}-${field2Mapping.spot}`] = timestamp;
                        
                        // Format and log for debugging
                        const sectorLetter = String.fromCharCode(65 + field2Mapping.sector);
                        const spotNumber = field2Mapping.spot + 1;
                        const formattedTime = moment(timestamp).format('MMM D, YYYY h:mm:ss A');
                        console.log(`Sector ${sectorLetter}${spotNumber}: ${field2 ? 'Occupied' : 'Free'} (Last data: ${formattedTime})`);
                    }
                }
                
                // Display the ThingSpeak update timestamp for this channel
                $(`#channel-${channelIndex + 1}-timestamp`).text(formattedTime);
                
                // Update the latest timestamp for display
                $('#thingspeak-timestamp').text(formattedTime);
                $('#thingspeak-status').text('Connected').removeClass('status-inactive').addClass('status-active');
            },
            error: function(error) {
                console.error(`Error fetching data from ThingSpeak for channel ${channelIndex + 1}:`, error);
                $('#thingspeak-status').text('Error').removeClass('status-active').addClass('status-inactive');
            }
        });
        
        channelPromises.push(promise);
    }
    
    // After all channel data is fetched, update the UI
    $.when.apply($, channelPromises).always(function() {
        console.log('All channel requests completed');
        
        // Calculate total occupied spots
        let totalOccupied = 0;
        for (let i = 0; i < parkingStateArray.length; i++) {
            for (let j = 0; j < parkingStateArray[i].length; j++) {
                if (parkingStateArray[i][j]) totalOccupied++;
            }
        }
        
        // Calculate statistics
        const totalSpots = 12; // Total of 12 parking spots (3 sectors × 4 spots)
        const freeSpots = totalSpots - totalOccupied;
        const capacityPercentage = Math.round((totalOccupied / totalSpots) * 100);
        
        // Update dashboard elements
        $('#freeSpaces').text(freeSpots);
        $('#occupiedSpaces').text(totalOccupied);
        $('#capacityPercentage').text(`${capacityPercentage}%`);
        $('#capacityStatus').text(capacityPercentage > 80 ? 'High' : capacityPercentage > 50 ? 'Moderate' : 'Low');
        
        // Update client-side timestamp
        const clientTime = new Date();
        $('#last-update-time').text(clientTime.toLocaleTimeString());
        
        // Update the countdown display
        const countdownSeconds = 60; // Reset to 60 seconds
        updateCountdown(countdownSeconds);
        
        // Calculate total parkings from historical data (less frequently)
        // Only fetch this data once every 5 minutes to reduce API calls
        const now = new Date();
        const lastFetchTime = sessionStorage.getItem('lastHistoricalFetch');
        const shouldFetchHistorical = !lastFetchTime || (now - new Date(lastFetchTime)) > 5 * 60 * 1000; // 5 minutes
        
        if (shouldFetchHistorical) {
            // For historical data, we'll use the primary channel as the main reference
            $.getJSON(`https://api.thingspeak.com/channels/${PRIMARY_CHANNEL_ID}/feeds.json?api_key=${PRIMARY_API_KEY}&results=1000`, function(historicalData) {
                if (historicalData && historicalData.feeds) {
                    let totalParkings = 0;
                    let lastStates = Array(2).fill(0); // Only field1 and field2
                    
                    historicalData.feeds.forEach(feed => {
                        // Check field1 and field2 for transitions
                        for (let field = 1; field <= 2; field++) {
                            const fieldName = `field${field}`;
                            const currentState = parseInt(feed[fieldName]) || 0;
                            
                            // Count when a spot becomes occupied (0->1 transition)
                            if (currentState === 1 && lastStates[field-1] === 0) {
                                totalParkings++;
                            }
                            
                            lastStates[field-1] = currentState;
                        }
                    });
                    
                    $('#totalCarsParked').text(totalParkings);
                    $('#totalParkings').text(totalParkings);
                    
                    // Remember when we last fetched this data
                    sessionStorage.setItem('lastHistoricalFetch', now.toISOString());
                }
            });
        }
        
        // Update the last refresh time (client-side)
        const lastUpdateTime = moment().format('h:mm:ss A');
        $('#last-update-time').text(lastUpdateTime);
        
        // Update countdown
        updateCountdownDisplay();
    });
}

// Store chart instances
let trafficChartInstance = null;
let parkingChartInstance = null;

// Update the countdown display
function updateCountdownDisplay() {
    const countdownElement = document.getElementById('next-update-countdown');
    if (countdownElement) {
        countdownElement.textContent = countdownValue;
    }
}

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
    let results = 0;
    
    switch(selectedRange) {
        case '24h':
            results = 24;
            break;
        case '7d':
            results = 24 * 7;
            break;
        case '30d':
            results = 24 * 30;
            break;
        default:
            results = 24;
    }

    $.getJSON(`https://api.thingspeak.com/channels/${CHANNEL_ID}/feeds.json?api_key=${API_KEY}&results=${results}`, function(data) {
        if (data && data.feeds) {
            const ctx = document.getElementById('trafficChart').getContext('2d');
            let labels, values;

            // Process data based on time range
            if (selectedRange === '1h') {
                // For last hour, show data points every 5 minutes
                labels = data.feeds.map(feed => moment(feed.created_at).format('HH:mm'));
                values = data.feeds.map(feed => ((parseInt(feed.field1) || 0) + (parseInt(feed.field2) || 0)) / 2 * 100);
            } else if (selectedRange === '24h') {
                // For 24 hours, group by hour
                const hourlyData = {};
                data.feeds.forEach(feed => {
                    const hour = moment(feed.created_at).format('HH:00');
                    if (!hourlyData[hour]) {
                        hourlyData[hour] = { total: 0, count: 0 };
                    }
                    hourlyData[hour].total += (parseInt(feed.field1) || 0) + (parseInt(feed.field2) || 0);
                    hourlyData[hour].count += 2; // 2 spots
                });

                labels = Object.keys(hourlyData).sort();
                values = Object.values(hourlyData).map(data => (data.total / data.count) * 100);
            } else if (selectedRange === '7d') {
                // For week view, show day names
                const dailyData = {};
                data.feeds.forEach(feed => {
                    const day = moment(feed.created_at).format('ddd');
                    if (!dailyData[day]) {
                        dailyData[day] = { total: 0, count: 0 };
                    }
                    dailyData[day].total += (parseInt(feed.field1) || 0) + (parseInt(feed.field2) || 0);
                    dailyData[day].count += 2;
                });

                labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].filter(day => dailyData[day]);
                values = labels.map(day => (dailyData[day].total / dailyData[day].count) * 100);
            }

            // Destroy previous chart instance if it exists
            if (trafficChartInstance) {
                trafficChartInstance.destroy();
            }

            // Create new chart instance
            trafficChartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Occupancy Rate',
                        data: values,
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
        }
    });

    // Update recent traffic
    $.getJSON(`https://api.thingspeak.com/channels/${CHANNEL_ID}/feeds.json?api_key=${API_KEY}&results=10`, function(data) {
        if (data && data.feeds) {
            let lastSpot1 = null;
            let lastSpot2 = null;
            const changes = [];
            
            // Detect changes in spot status
            data.feeds.forEach(feed => {
                const spot1 = parseInt(feed.field1);
                const spot2 = parseInt(feed.field2);
                const time = feed.created_at;
                
                if (lastSpot1 !== null && spot1 !== lastSpot1) {
                    changes.push({
                        spot: 1,
                        status: spot1 === 1 ? 'IN' : 'OUT',
                        time: time
                    });
                }
                
                if (lastSpot2 !== null && spot2 !== lastSpot2) {
                    changes.push({
                        spot: 2,
                        status: spot2 === 1 ? 'IN' : 'OUT',
                        time: time
                    });
                }
                
                lastSpot1 = spot1;
                lastSpot2 = spot2;
            });
            
            // Sort changes by time (most recent first) and take top 5
            const recentChanges = changes.sort((a, b) => 
                new Date(b.time) - new Date(a.time)
            ).slice(0, 5);
            
            const recentTrafficHtml = recentChanges.map(change => `
                <div class="transaction-item">
                    <div class="transaction-icon"><i class="fas fa-car-alt"></i></div>
                    <div class="transaction-content">
                        <div class="transaction-title">Spot ${change.spot}</div>
                        <div class="transaction-time">
                            <i class="far fa-clock"></i> ${moment(change.time).fromNow()}
                        </div>
                    </div>
                    <div class="transaction-amount ${change.status === 'IN' ? 'positive' : 'negative'}">
                        ${change.status}
                    </div>
                </div>
            `).join('');
            
            $('#recentTraffic').html(recentTrafficHtml || '<div class="no-changes">No recent changes</div>');
        }
    });
}

// Create parking chart
function createParkingChart() {
    const ctx = document.getElementById('parking-chart').getContext('2d');
    
    // Destroy previous chart instance if it exists
    if (parkingChartInstance) {
        parkingChartInstance.destroy();
    }

    // Get selected time range from buttons
    const activeButton = document.querySelector('.time-option.active');
    let selectedRange = 'hour';
    if (activeButton) {
        const buttonText = activeButton.textContent.trim().toLowerCase();
        if (buttonText.includes('week')) {
            selectedRange = 'week';
        } else if (buttonText.includes('today')) {
            selectedRange = 'day';
        }
    }

    // Determine number of results to fetch based on range
    let results = 0;
    switch(selectedRange) {
        case 'hour':
            results = 60; // Last hour, data every minute
            break;
        case 'day':
            results = 288; // Last 24 hours, data every 5 minutes
            break;
        case 'week':
            results = 168; // Last 7 days, hourly data
            break;
    }

    // Fetch data from ThingSpeak
    $.getJSON(`https://api.thingspeak.com/channels/${CHANNEL_ID}/feeds.json?api_key=${API_KEY}&results=${results}`, function(response) {
        if (!response || !response.feeds || !response.feeds.length) return;

        const feeds = response.feeds;
        const now = moment();
        const labels = [];
        const data = [];
        const timelineHtml = [];
        const aggregatedData = {};

        if (selectedRange === 'hour') {
            // Group by 5-minute intervals for the last hour
            feeds.forEach(feed => {
                const time = moment(feed.created_at);
                const interval = time.format('HH:mm');
                if (!aggregatedData[interval]) {
                    aggregatedData[interval] = { total: 0, count: 0 };
                }
                aggregatedData[interval].total += ((parseInt(feed.field1) || 0) + (parseInt(feed.field2) || 0)) / 2 * 100;
                aggregatedData[interval].count++;
            });

            // Get last 12 5-minute intervals
            for (let i = 11; i >= 0; i--) {
                const time = now.clone().subtract(i * 5, 'minutes');
                const interval = time.format('HH:mm');
                labels.push(interval);
                const avg = aggregatedData[interval] ? 
                    aggregatedData[interval].total / aggregatedData[interval].count : 0;
                data.push(Math.round(avg));

                if (i % 2 === 0) {
                    timelineHtml.push(`<div class="month">${interval}</div>`);
                }
            }
        } else if (selectedRange === 'day') {
            // Group by hour for the last 24 hours
            feeds.forEach(feed => {
                const time = moment(feed.created_at);
                const hour = time.format('HH:00');
                if (!aggregatedData[hour]) {
                    aggregatedData[hour] = { total: 0, count: 0 };
                }
                aggregatedData[hour].total += ((parseInt(feed.field1) || 0) + (parseInt(feed.field2) || 0)) / 2 * 100;
                aggregatedData[hour].count++;
            });

            // Get last 12 2-hour intervals
            for (let i = 11; i >= 0; i--) {
                const time = now.clone().subtract(i * 2, 'hours');
                const hour = time.format('HH:00');
                labels.push(hour);
                const avg = aggregatedData[hour] ? 
                    aggregatedData[hour].total / aggregatedData[hour].count : 0;
                data.push(Math.round(avg));

                if (i % 2 === 0) {
                    timelineHtml.push(`<div class="month">${hour}</div>`);
                }
            }
        } else { // week
            // Group by day
            const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            feeds.forEach(feed => {
                const time = moment(feed.created_at);
                const day = days[time.day()];
                if (!aggregatedData[day]) {
                    aggregatedData[day] = { total: 0, count: 0 };
                }
                aggregatedData[day].total += ((parseInt(feed.field1) || 0) + (parseInt(feed.field2) || 0)) / 2 * 100;
                aggregatedData[day].count++;
            });

            // Get data for last 7 days
            const today = now.day();
            for (let i = 6; i >= 0; i--) {
                const dayIndex = (today - i + 7) % 7;
                const day = days[dayIndex];
                labels.push(day);
                const avg = aggregatedData[day] ? 
                    aggregatedData[day].total / aggregatedData[day].count : 0;
                data.push(Math.round(avg));
                timelineHtml.push(`<div class="month">${day}</div>`);
            }
        }

            // Update timeline in HTML
        document.getElementById('timeline').innerHTML = timelineHtml.join('');

        // Create new chart instance
        parkingChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Parking Occupancy',
                data: data,
                borderColor: '#4270F4',
                backgroundColor: 'rgba(66, 112, 244, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
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
                        minRotation: 45,
                        autoSkip: false,
                        maxTicksLimit: 12,
                        font: {
                            size: 10
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
    });
}

// Initialize when document is ready
$(document).ready(function() {
    initDashboard();
    createParkingChart();
    
    // Handle refresh button click
    $('.premium-btn').click(function() {
        updateParkingStats();
        updateTrafficChart();
        createParkingChart(); // Also update parking chart on refresh
    });

    // Handle time range button clicks
    $('.time-option').click(function() {
        $('.time-option').removeClass('active');
        $(this).addClass('active');
        updateTrafficChart();
        createParkingChart(); // Update parking chart when time range changes
    });
});
