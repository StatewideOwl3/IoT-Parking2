// ThingSpeak Channel Configuration
const CHANNEL_ID = '2913587';
const API_KEY = '5ZM4WBVZVHIBWB6B';
const UPDATE_INTERVAL = 15000; // Update every 15 seconds

// Initialize the dashboard
function initDashboard() {
    updateParkingStats();
    updateTrafficChart();
    setInterval(() => {
        updateParkingStats();
        updateTrafficChart();
    }, UPDATE_INTERVAL);
}

// Update parking statistics
function updateParkingStats() {
    $.getJSON(`https://api.thingspeak.com/channels/${CHANNEL_ID}/feeds/last.json?api_key=${API_KEY}`, function(data) {
        if (data) {
            // IR sensors: 1 = occupied, 0 = free
            const spot1Occupied = parseInt(data.field1) === 1;
            const spot2Occupied = parseInt(data.field2) === 1;
            
            // Calculate statistics
            const totalSpots = 2; // We have 2 parking spots
            const occupiedSpots = (spot1Occupied ? 1 : 0) + (spot2Occupied ? 1 : 0);
            const freeSpots = totalSpots - occupiedSpots;
            const capacityPercentage = Math.round((occupiedSpots / totalSpots) * 100);

            // Update dashboard elements
            $('#freeSpaces').text(freeSpots);
            $('#occupiedSpaces').text(occupiedSpots);
            $('#capacityPercentage').text(`${capacityPercentage}%`);
            $('#capacityStatus').text(capacityPercentage > 80 ? 'High' : capacityPercentage > 50 ? 'Moderate' : 'Low');
            
            // Calculate total parkings from historical data
            $.getJSON(`https://api.thingspeak.com/channels/${CHANNEL_ID}/feeds.json?api_key=${API_KEY}&results=8000`, function(historicalData) {
                if (historicalData && historicalData.feeds) {
                    let totalParkings = 0;
                    let lastSpot1State = 0;
                    let lastSpot2State = 0;
                    
                    historicalData.feeds.forEach(feed => {
                        const spot1 = parseInt(feed.field1) || 0;
                        const spot2 = parseInt(feed.field2) || 0;
                        
                        // Count when a spot becomes occupied (0->1 transition)
                        if (spot1 === 1 && lastSpot1State === 0) totalParkings++;
                        if (spot2 === 1 && lastSpot2State === 0) totalParkings++;
                        
                        lastSpot1State = spot1;
                        lastSpot2State = spot2;
                    });
                    
                    $('#totalCarsParked').text(totalParkings);
                    $('#totalParkings').text(totalParkings);
                }
            });
        }
    });
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
