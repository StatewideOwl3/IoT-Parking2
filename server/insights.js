// ThingSpeak Configuration
const CHANNEL_ID = '2913587';
const API_KEY = '5ZM4WBVZVHIBWB6B';
const UPDATE_INTERVAL = 15000; // Update every 15 seconds

let occupancyChartInstance = null;
let selectedTimeRange = 'hour';

document.addEventListener('DOMContentLoaded', () => {
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

        $.getJSON(`https://api.thingspeak.com/channels/${CHANNEL_ID}/feeds.json?api_key=${API_KEY}&results=${results}`, function(data) {
            if (!data || !data.feeds || !data.feeds.length) return;

            const aggregatedData = {};
            let totalOccupancy = 0;
            let totalReadings = 0;
            let peakOccupancy = 0;
            let peakTime = '';
            let totalCars = 0;

            data.feeds.forEach(feed => {
                const time = moment(feed.created_at);
                const timeKey = time.format(dateFormat);
                const occupancy = ((parseInt(feed.field1) || 0) + (parseInt(feed.field2) || 0)) / 2 * 100;

                if (!aggregatedData[timeKey]) {
                    aggregatedData[timeKey] = { total: 0, count: 0, cars: 0 };
                }

                aggregatedData[timeKey].total += occupancy;
                aggregatedData[timeKey].count++;

                // Track car entries
                if (feed.field1 === '1' && feed.field2 === '1') {
                    aggregatedData[timeKey].cars++;
                    totalCars++;
                }

                // Track peak occupancy
                if (occupancy > peakOccupancy) {
                    peakOccupancy = occupancy;
                    peakTime = time.format('HH:mm');
                }

                totalOccupancy += occupancy;
                totalReadings++;
            });

            // Update statistics
            const avgOccupancy = totalReadings > 0 ? Math.round(totalOccupancy / totalReadings) : 0;
            document.getElementById('totalCarsParked').textContent = totalCars;
            document.getElementById('avgOccupancyRate').textContent = avgOccupancy + '%';
            document.getElementById('peakHours').textContent = `${peakTime} (${Math.round(peakOccupancy)}%)`;

            // Prepare chart data
            const labels = Object.keys(aggregatedData).sort();
            const values = labels.map(key => Math.round(aggregatedData[key].total / aggregatedData[key].count));

            // Destroy existing chart if it exists
            if (occupancyChartInstance) {
                occupancyChartInstance.destroy();
            }

            // Create new chart
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

            updateActivityTable(data.feeds);
        });
    }

    // Update recent activity table
    function updateActivityTable(feeds) {
        const recentActivity = [];
        let lastSpot1State = 0;
        let lastSpot2State = 0;
        let spot1StartTime = null;
        let spot2StartTime = null;

        // Process the feeds in reverse to get the most recent events first
        feeds.reverse().forEach(feed => {
            const spot1 = parseInt(feed.field1) || 0;
            const spot2 = parseInt(feed.field2) || 0;
            const time = moment(feed.created_at);

            // Check Spot 1
            if (spot1 === 1 && lastSpot1State === 0) {
                spot1StartTime = time;
                recentActivity.push({
                    time: time,
                    spot: 'Spot 1',
                    event: 'Entry',
                    duration: '-'
                });
            } else if (spot1 === 0 && lastSpot1State === 1 && spot1StartTime) {
                const duration = moment.duration(time.diff(spot1StartTime));
                recentActivity.push({
                    time: time,
                    spot: 'Spot 1',
                    event: 'Exit',
                    duration: `${Math.floor(duration.asHours())}h ${duration.minutes()}m`
                });
                spot1StartTime = null;
            }

            // Check Spot 2
            if (spot2 === 1 && lastSpot2State === 0) {
                spot2StartTime = time;
                recentActivity.push({
                    time: time,
                    spot: 'Spot 2',
                    event: 'Entry',
                    duration: '-'
                });
            } else if (spot2 === 0 && lastSpot2State === 1 && spot2StartTime) {
                const duration = moment.duration(time.diff(spot2StartTime));
                recentActivity.push({
                    time: time,
                    spot: 'Spot 2',
                    event: 'Exit',
                    duration: `${Math.floor(duration.asHours())}h ${duration.minutes()}m`
                });
                spot2StartTime = null;
            }

            lastSpot1State = spot1;
            lastSpot2State = spot2;
        });

        // Update the activity table with the most recent 20 events
        const tableBody = document.querySelector('#activityTable tbody');
        tableBody.innerHTML = recentActivity.slice(0, 20).map(activity => `
            <tr>
                <td>${activity.time.format('MMM D, HH:mm')}</td>
                <td>${activity.spot}</td>
                <td>${activity.event}</td>
                <td>${activity.duration}</td>
            </tr>
        `).join('');
    }

    // Handle time range selection
    document.querySelectorAll('.time-option').forEach(button => {
        button.addEventListener('click', () => {
            document.querySelectorAll('.time-option').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            selectedTimeRange = button.dataset.range;
            updateOccupancyChart();
        });
    });

    // Initial update
    updateOccupancyChart();

    // Refresh periodically
    setInterval(updateOccupancyChart, UPDATE_INTERVAL);

    // Handle refresh button click
    document.querySelector('.premium-btn').addEventListener('click', updateOccupancyChart);
});