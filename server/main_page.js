// ThingSpeak Channel Configuration - 6 channels, each with 2 fields
const UPDATE_INTERVAL = 60000; // Update every 60 seconds
let countdownValue = Math.floor(UPDATE_INTERVAL / 1000);
let countdownTimer = null;
let parkingChartInstance = null;
let trafficChartInstance = null;

// All 6 ThingSpeak channels (one for each IR sensor pair)
const CHANNEL_INFO = [
    { id: '2914193', apiKey: 'EF6D0DPOLTWPMMUD' }, // Channel 1 - Sector A spots 1-2
    { id: '2914195', apiKey: '38S5DDJSWBATRB7O' }, // Channel 2 - Sector A spots 3-4
    { id: '2914196', apiKey: 'T5QY7KFJPIZV9JKU' }, // Channel 3 - Sector B spots 1-2
    { id: '2914197', apiKey: 'AYRC81YEPXIFJ4KN' }, // Channel 4 - Sector B spots 3-4
    { id: '2914203', apiKey: 'ZR0R7T5PN6QR1T4E' }, // Channel 5 - Sector C spots 1-2
    { id: '2914204', apiKey: '1GQOW8QBGG9Q3CYX' }  // Channel 6 - Sector C spots 3-4
];

// Parking state storage (3 rows x 4 columns)
let parkingStateArray = [
    [false, false, false, false], // Sector A (spots 1-4)
    [false, false, false, false], // Sector B (spots 1-4)
    [false, false, false, false]  // Sector C (spots 1-4)
];

// Channel/field to sector/spot mapping
const channelFieldToSectorSpotMap = [
    { channel: 0, field: 1, sector: 0, spot: 0 }, // Channel 1, Field 1 -> Sector A, Spot 1
    { channel: 0, field: 2, sector: 0, spot: 1 }, // Channel 1, Field 2 -> Sector A, Spot 2
    { channel: 1, field: 1, sector: 0, spot: 2 }, // Channel 2, Field 1 -> Sector A, Spot 3
    { channel: 1, field: 2, sector: 0, spot: 3 }, // Channel 2, Field 2 -> Sector A, Spot 4
    { channel: 2, field: 1, sector: 1, spot: 0 }, // Channel 3, Field 1 -> Sector B, Spot 1
    { channel: 2, field: 2, sector: 1, spot: 1 }, // Channel 3, Field 2 -> Sector B, Spot 2
    { channel: 3, field: 1, sector: 1, spot: 2 }, // Channel 4, Field 1 -> Sector B, Spot 3
    { channel: 3, field: 2, sector: 1, spot: 3 }, // Channel 4, Field 2 -> Sector B, Spot 4
    { channel: 4, field: 1, sector: 2, spot: 0 }, // Channel 5, Field 1 -> Sector C, Spot 1
    { channel: 4, field: 2, sector: 2, spot: 1 }, // Channel 5, Field 2 -> Sector C, Spot 2
    { channel: 5, field: 1, sector: 2, spot: 2 }, // Channel 6, Field 1 -> Sector C, Spot 3
    { channel: 5, field: 2, sector: 2, spot: 3 }  // Channel 6, Field 2 -> Sector C, Spot 4
];

// Update the countdown display
function updateCountdownDisplay() {
    $('#next-update-countdown').text(countdownValue);
}

// Update parking statistics
function updateParkingStats() {
    console.log('Updating parking stats from ThingSpeak...');
    
    const channelPromises = [];
    
    // Fetch data from all 6 channels
    for (let channelIndex = 0; channelIndex < CHANNEL_INFO.length; channelIndex++) {
        const channelData = CHANNEL_INFO[channelIndex];
        console.log(`Fetching data from channel ${channelIndex + 1}:`, channelData.id);
        
        const promise = $.ajax({
            url: `https://api.thingspeak.com/channels/${channelData.id}/feeds/last.json`,
            data: { api_key: channelData.apiKey },
            dataType: 'json',
            success: function(data) {
                if (!data) {
                    console.error(`No data received from channel ${channelIndex + 1}`);
                    return;
                }
                
                const field1 = parseInt(data.field1) === 1;
                const field2 = parseInt(data.field2) === 1;
                
                const mappings = channelFieldToSectorSpotMap.filter(m => m.channel === channelIndex);
                mappings.forEach(mapping => {
                    const value = mapping.field === 1 ? field1 : field2;
                    parkingStateArray[mapping.sector][mapping.spot] = value;
                });
                
                $('#thingspeak-status').text('Connected').removeClass('status-inactive').addClass('status-active');
            },
            error: function(error) {
                console.error(`Error fetching from channel ${channelIndex + 1}:`, error);
                $('#thingspeak-status').text('Error').removeClass('status-active').addClass('status-inactive');
            }
        });
        
        channelPromises.push(promise);
    }
    
    // After all channel data is fetched, update the UI
    return $.when.apply($, channelPromises).then(function() {
        let totalOccupied = 0;
        let totalSpots = 0;
        
        parkingStateArray.forEach(row => {
            row.forEach(spot => {
                if (spot) totalOccupied++;
                totalSpots++;
            });
        });
        
        const totalFree = totalSpots - totalOccupied;
        const occupancyRate = (totalOccupied / totalSpots) * 100;
        
        // Update UI elements if they exist
        if ($('#totalCarsParked').length) {
            $('#totalCarsParked').text(totalOccupied);
            $('#freeSpaces').text(totalFree);
            $('#occupiedSpaces').text(totalOccupied);
            $('#capacityStatus').text(`${totalOccupied}/${totalSpots}`);
            $('#capacityPercentage').text(`${Math.round(occupancyRate)}%`);
        }
        
        // Store data in localStorage
        localStorage.setItem('parkingState', JSON.stringify({
            parkingStateArray,
            lastUpdate: new Date().toISOString(),
            stats: {
                totalOccupied,
                totalFree,
                occupancyRate
            }
        }));
        
        // Update last refresh time
        const lastUpdateTime = moment().format('h:mm:ss A');
        $('#last-update-time').text(lastUpdateTime);
        
        updateCountdownDisplay();
        return { totalOccupied, totalFree, occupancyRate };
    });
}

// Update traffic chart
function updateTrafficChart() {
    // Get selected time range from buttons
    const activeButton = document.querySelector('.time-range-filter .time-option.active');
    let selectedRange = '24h';
    if (activeButton) {
        const buttonText = activeButton.textContent.trim().toLowerCase();
        if (buttonText.includes('week')) {
            selectedRange = '7d';
        } else if (buttonText.includes('hour')) {
            selectedRange = '1h';
        }
    }

    let results = 0;
    switch(selectedRange) {
        case '1h':
            results = 60; // Last hour, minute by minute
            break;
        case '24h':
            results = 288; // Last 24 hours, 5-minute intervals
            break;
        case '7d':
            results = 168; // Last 7 days, hourly data
            break;
    }

    // Fetch data from all channels and process changes
    const changes = [];
    const promises = CHANNEL_INFO.map((channel, channelIndex) => {
        return $.getJSON(`https://api.thingspeak.com/channels/${channel.id}/feeds.json?api_key=${channel.apiKey}&results=${results}`);
    });

    Promise.all(promises).then(channelsData => {
        // Process each channel's data for changes
        channelsData.forEach((data, channelIndex) => {
            if (!data || !data.feeds || !data.feeds.length) return;

            const feeds = data.feeds;
            let lastSpot1 = null;
            let lastSpot2 = null;

            // Get sector and spots for this channel from mapping
            const channelMappings = channelFieldToSectorSpotMap.filter(m => m.channel === channelIndex);

            feeds.slice(-10).forEach(feed => {
                const spot1 = parseInt(feed.field1);
                const spot2 = parseInt(feed.field2);
                const time = feed.created_at;

                // Process spot 1
                const spot1Mapping = channelMappings.find(m => m.field === 1);
                if (spot1Mapping && lastSpot1 !== null && spot1 !== lastSpot1) {
                    changes.push({
                        spot: `${String.fromCharCode(65 + spot1Mapping.sector)}${spot1Mapping.spot + 1}`,
                        status: spot1 === 1 ? 'IN' : 'OUT',
                        time: time
                    });
                }

                // Process spot 2
                const spot2Mapping = channelMappings.find(m => m.field === 2);
                if (spot2Mapping && lastSpot2 !== null && spot2 !== lastSpot2) {
                    changes.push({
                        spot: `${String.fromCharCode(65 + spot2Mapping.sector)}${spot2Mapping.spot + 1}`,
                        status: spot2 === 1 ? 'IN' : 'OUT',
                        time: time
                    });
                }

                lastSpot1 = spot1;
                lastSpot2 = spot2;
            });
        });

        // Sort changes by time (most recent first) and take top 5
        const recentChanges = changes
            .sort((a, b) => new Date(b.time) - new Date(a.time))
            .slice(0, 5);

        // Update recent traffic HTML
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

        // Prepare data for the traffic chart based on time range
        const timeLabels = [];
        const trafficData = [];
        
        // Group data by time intervals
        const trafficByInterval = new Map();
        const oneHourAgo = moment().subtract(1, 'hour');
        
        channelsData.forEach(data => {
            if (!data || !data.feeds || !data.feeds.length) return;
            
            data.feeds.forEach(feed => {
                const timestamp = moment(feed.created_at);
                // For 1h view, skip data points older than 1 hour
                if (selectedRange === '1h' && timestamp.isBefore(oneHourAgo)) {
                    return;
                }
                
                let timeKey;
                switch(selectedRange) {
                    case '1h':
                        timeKey = timestamp.format('HH:mm');
                        break;
                    case '24h':
                        timeKey = timestamp.format('HH:00');
                        break;
                    case '7d':
                        timeKey = timestamp.format('ddd');
                        break;
                }
                
                if (!trafficByInterval.has(timeKey)) {
                    trafficByInterval.set(timeKey, { total: 0, count: 0 });
                }
                
                const interval = trafficByInterval.get(timeKey);
                interval.total += (parseInt(feed.field1) || 0) + (parseInt(feed.field2) || 0);
                interval.count += 2; // 2 spots per channel
            });
        });
        
        // Convert map to sorted arrays
        const sortedIntervals = Array.from(trafficByInterval.entries())
            .sort((a, b) => {
                if (selectedRange === '7d') {
                    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                    return days.indexOf(a[0]) - days.indexOf(b[0]);
                }
                return a[0].localeCompare(b[0]);
            });
        
        sortedIntervals.forEach(([timeKey, data]) => {
            timeLabels.push(timeKey);
            trafficData.push((data.total / data.count) * 100); // Convert to percentage
        });

        const ctx = document.getElementById('trafficChart').getContext('2d');
        
        // If there's an existing chart, destroy it
        if (trafficChartInstance) {
            trafficChartInstance.destroy();
        }

        // Create new chart
        trafficChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: timeLabels,
                datasets: [{
                    label: 'Occupancy Rate',
                    data: trafficData,
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
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            maxRotation: 45,
                            minRotation: 45,
                            autoSkip: true,
                            maxTicksLimit: 12
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                },
                layout: {
                    padding: {
                        left: 10,
                        right: 10,
                        top: 10,
                        bottom: 10
                    }
                }
            }
        });
    }).catch(error => {
        console.error('Error fetching traffic data:', error);
        $('#recentTraffic').html('<div class="error-message">Error loading recent traffic data</div>');
    });
}

// Initialize the dashboard
function initDashboard() {
    const restoredStats = restoreParkingState();
    if (restoredStats) {
        console.log('Restored parking state:', restoredStats);
    }
    
    updateParkingStats();
    updateTrafficChart();
    
    countdownTimer = setInterval(() => {
        if (countdownValue > 0) {
            countdownValue--;
            updateCountdownDisplay();
        }
    }, 1000);
    
    updateCountdownDisplay();
    
    setInterval(() => {
        countdownValue = Math.floor(UPDATE_INTERVAL / 1000);
        updateParkingStats();
        updateTrafficChart();
    }, UPDATE_INTERVAL);
}

// Event handlers when document is ready
$(document).ready(function() {
    initDashboard();
    
    // Handle refresh button click with immediate update
    $('.premium-btn').click(function() {
        countdownValue = Math.floor(UPDATE_INTERVAL / 1000);
        updateCountdownDisplay();
        updateParkingStats().then(() => {
            updateTrafficChart();
        });
    });
    
    // Handle time range button clicks
    $('.time-option').click(function() {
        $('.time-option').removeClass('active');
        $(this).addClass('active');
        
        // Force immediate data refresh when time range changes
        countdownValue = Math.floor(UPDATE_INTERVAL / 1000);
        updateCountdownDisplay();
        updateParkingStats().then(() => {
            updateTrafficChart();
        });
    });

    // Handle explore more button click
    document.querySelector('.promo-btn').addEventListener('click', () => {
        window.location.href = 'explore.html';
    });
});

// Restore parking state from localStorage if needed
function restoreParkingState() {
    const savedState = localStorage.getItem('parkingState');
    if (savedState) {
        const state = JSON.parse(savedState);
        parkingStateArray = state.parkingStateArray;
        return state.stats;
    }
    return null;
}
