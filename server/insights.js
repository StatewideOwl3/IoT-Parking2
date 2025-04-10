document.addEventListener('DOMContentLoaded', () => {
    const BASE_URL = 'http://localhost:3000';

    // Monthly Gain in Traffic
    function updateMonthlyGainChart() {
        fetch(`${BASE_URL}/api/monthly-gain`)
            .then(response => response.json())
            .then(data => {
                new Chart(document.getElementById('monthly-gain-chart').getContext('2d'), {
                    type: 'line',
                    data: {
                        labels: data.labels,
                        datasets: [{
                            label: 'Monthly Gain',
                            data: data.values,
                            borderColor: '#4270F4',
                            fill: false
                        }]
                    },
                    options: { scales: { y: { beginAtZero: true } } }
                });
            })
            .catch(err => console.error('Monthly Gain Error:', err));
    }

    // Traffic Occupancy Based on Time
    function updateOccupancyTimeChart() {
        fetch(`${BASE_URL}/api/occupancy-time`)
            .then(response => response.json())
            .then(data => {
                new Chart(document.getElementById('occupancy-time-chart').getContext('2d'), {
                    type: 'bar',
                    data: {
                        labels: data.labels,
                        datasets: [{
                            label: 'Occupancy',
                            data: data.values,
                            backgroundColor: '#4270F4'
                        }]
                    },
                    options: { scales: { y: { beginAtZero: true } } }
                });
            })
            .catch(err => console.error('Occupancy Time Error:', err));
    }

    // Traffic Flow Based on Day of the Week
    function updateTrafficDayChart() {
        fetch(`${BASE_URL}/api/traffic-day`)
            .then(response => response.json())
            .then(data => {
                new Chart(document.getElementById('traffic-day-chart').getContext('2d'), {
                    type: 'bar',
                    data: {
                        labels: data.labels,
                        datasets: [{
                            label: 'Traffic Flow',
                            data: data.values,
                            backgroundColor: '#4270F4'
                        }]
                    },
                    options: { scales: { y: { beginAtZero: true } } }
                });
            })
            .catch(err => console.error('Traffic Day Error:', err));
    }

    // Initial updates
    updateMonthlyGainChart();
    updateOccupancyTimeChart();
    updateTrafficDayChart();

    // Refresh every 15 seconds
    setInterval(() => {
        updateMonthlyGainChart();
        updateOccupancyTimeChart();
        updateTrafficDayChart();
    }, 15000);
});