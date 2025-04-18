// ThingSpeak Channel Configuration - All 6 channels
const CHANNEL_INFO = [
    { id: '2914193', apiKey: 'EF6D0DPOLTWPMMUD' }, // Channel 1 - Sector A spots 1-2
    { id: '2914195', apiKey: '38S5DDJSWBATRB7O' }, // Channel 2 - Sector A spots 3-4
    { id: '2914196', apiKey: 'T5QY7KFJPIZV9JKU' }, // Channel 3 - Sector B spots 1-2
    { id: '2914197', apiKey: 'AYRC81YEPXIFJ4KN' }, // Channel 4 - Sector B spots 3-4
    { id: '2914203', apiKey: 'ZR0R7T5PN6QR1T4E' }, // Channel 5 - Sector C spots 1-2
    { id: '2914204', apiKey: '1GQOW8QBGG9Q3CYX' }  // Channel 6 - Sector C spots 3-4
];

const UPDATE_INTERVAL = 60000; // 60 seconds
let selectedTimeRange = 'hour';
let occupancyChartInstance = null;

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

$(document).ready(function() {
    // Initialize with default time range
    updateOccupancyChart();
    
    // Handle refresh button click
    $('.premium-btn').click(function() {
        updateOccupancyChart();
    });

    // Time range button click handlers
    $('.time-option').click(function() {
        $('.time-option').removeClass('active');
        $(this).addClass('active');
        selectedTimeRange = $(this).data('range');
        updateOccupancyChart();
    });

    // Update occupancy chart based on selected time range
    function updateOccupancyChart() {
        let results = 0;
        let groupBy = '';
        let dateFormat = '';

        switch(selectedTimeRange) {
            case 'hour':
                results = 60; // Last hour, minute by minute
                groupBy = 'minute';
                dateFormat = 'HH:mm';
                break;
            case 'day':
                results = 288; // Last 24 hours, 5-minute intervals
                groupBy = 'hour';
                dateFormat = 'HH:00';
                break;
            case 'week':
                results = 168; // Last 7 days, hourly
                groupBy = 'day';
                dateFormat = 'ddd';
                break;
            case 'month':
                results = 720; // Last 30 days, hourly
                groupBy = 'day';
                dateFormat = 'MMM D';
                break;
            case 'year':
                results = 8760; // Last 365 days, daily
                groupBy = 'month';
                dateFormat = 'MMM YYYY';
                break;
            case 'lifetime':
                results = 8760; // All time, monthly
                groupBy = 'month';
                dateFormat = 'MMM YYYY';
                break;
        }

        // Create promises for all channels
        const channelPromises = CHANNEL_INFO.map(channel => 
            $.getJSON(`https://api.thingspeak.com/channels/${channel.id}/feeds.json?api_key=${channel.apiKey}&results=${results}`)
        );

        // Wait for all channel data
        Promise.all(channelPromises).then(channelsData => {
            const aggregatedData = {};
            let totalCars = 0;
            let peakOccupancy = 0;
            let peakTime = '';

            // Process data from all channels
            channelsData.forEach((data, channelIndex) => {
                if (!data || !data.feeds || !data.feeds.length) return;

                data.feeds.forEach(feed => {
                    const time = moment(feed.created_at);
                    const timeKey = time.format(dateFormat);
                    
                    if (!aggregatedData[timeKey]) {
                        aggregatedData[timeKey] = { total: 0, count: 0, occupiedSpots: 0 };
                    }

                    // Get spots data using the mapping
                    const mappings = channelFieldToSectorSpotMap.filter(m => m.channel === channelIndex);
                    mappings.forEach(mapping => {
                        const fieldValue = parseInt(feed[`field${mapping.field}`]) === 1;
                        if (fieldValue) {
                            aggregatedData[timeKey].occupiedSpots++;
                            totalCars++;
                        }
                    });
                    
                    // Each channel has 2 spots
                    aggregatedData[timeKey].count += 2;
                });
            });

            // Calculate percentages and find peak
            Object.entries(aggregatedData).forEach(([timeKey, data]) => {
                const occupancyPercent = (data.occupiedSpots / data.count) * 100;
                data.occupancyRate = occupancyPercent;

                if (occupancyPercent > peakOccupancy) {
                    peakOccupancy = occupancyPercent;
                    peakTime = timeKey;
                }
            });

            // Update stats cards
            $('#totalCarsParked').text(totalCars);
            $('#avgOccupancyRate').text(Math.round(peakOccupancy) + '%');
            $('#peakHours').text(`${peakTime} (${Math.round(peakOccupancy)}%)`);

            // Prepare chart data
            const labels = Object.keys(aggregatedData).sort();
            const values = labels.map(key => Math.round(aggregatedData[key].occupancyRate));

            // Update or create chart
            if (occupancyChartInstance) {
                occupancyChartInstance.destroy();
            }

            const ctx = document.getElementById('occupancyChart').getContext('2d');
            occupancyChartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Occupancy Rate (%)',
                        data: values,
                        borderColor: '#4270F4',
                        backgroundColor: 'rgba(66, 112, 244, 0.1)',
                        tension: 0.4,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            max: 100,
                            ticks: {
                                callback: value => value + '%'
                            },
                            grid: {
                                color: 'rgba(0, 0, 0, 0.1)'
                            }
                        },
                        x: {
                            grid: {
                                display: false
                            },
                            ticks: {
                                maxRotation: 45,
                                minRotation: 45
                            }
                        }
                    }
                }
            });

            // Update activity table with merged data from all channels
            updateActivityTable(channelsData);
        });
    }

    function updateActivityTable(channelsData) {
        const tableBody = $('#activityTable tbody');
        tableBody.empty();

        // Process the most recent activity from all channels
        const recentActivity = [];

        channelsData.forEach((data, channelIndex) => {
            if (!data || !data.feeds || !data.feeds.length) return;

            let lastStatus = {};
            data.feeds.forEach(feed => {
                const time = moment(feed.created_at);
                const mappings = channelFieldToSectorSpotMap.filter(m => m.channel === channelIndex);
                
                mappings.forEach(mapping => {
                    const fieldValue = parseInt(feed[`field${mapping.field}`]) === 1;
                    const spotKey = `sector${mapping.sector}spot${mapping.spot}`;
                    const spotName = `${String.fromCharCode(65 + mapping.sector)}${mapping.spot + 1}`;
                    
                    if (lastStatus[spotKey] !== undefined && lastStatus[spotKey] !== fieldValue) {
                        recentActivity.push({
                            time: time,
                            spot: spotName,
                            event: fieldValue ? 'Occupied' : 'Vacated',
                            duration: ''
                        });
                    }
                    lastStatus[spotKey] = fieldValue;
                });
            });
        });

        // Sort by time and take the 10 most recent activities
        recentActivity
            .sort((a, b) => b.time - a.time)
            .slice(0, 10)
            .forEach(activity => {
                const row = `<tr>
                    <td>${activity.time.format('HH:mm:ss')}</td>
                    <td>${activity.spot}</td>
                    <td>${activity.event}</td>
                    <td>${activity.duration}</td>
                </tr>`;
                tableBody.append(row);
            });
    }

    // Set up auto-refresh
    setInterval(updateOccupancyChart, UPDATE_INTERVAL);
});