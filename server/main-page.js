document.addEventListener('DOMContentLoaded', () => {
    const BASE_URL = 'http://localhost:3000';
    let parkingChart;

    // Function to update dashboard data
    function updateDashboard() {
        fetch(`${BASE_URL}/api/parking-spots`)
            .then(response => response.json())
            .then(spots => {
                const totalSpots = spots.length;
                const occupied = spots.filter(s => s === '1').length;
                const free = totalSpots - occupied;

                document.querySelector('.transfer-card:nth-child(2) .card-amount').textContent = occupied; // Currently Parked
                document.querySelector('.transfer-card:nth-child(3) .card-amount').textContent = free; // Free Spots
                document.querySelector('.plan-percentage').textContent = `${Math.round((occupied / totalSpots) * 100)}%`;
            })
            .catch(err => console.error('Parking Spots Error:', err));

        fetch(`${BASE_URL}/api/total-cars-parked?timeframe=daily`)
            .then(response => response.json())
            .then(data => {
                const latest = data[data.length - 1];
                document.querySelector('.transfer-card:nth-child(1) .card-amount').textContent = latest ? latest.count : 0;
            })
            .catch(err => console.error('Total Cars Error:', err));
    }

    // Function to update the parking chart
    function updateParkingChart(timeframe = 'daily') {
        fetch(`${BASE_URL}/api/total-cars-parked?timeframe=${timeframe}`)
            .then(response => response.json())
            .then(data => {
                const labels = data.map(d => timeframe === 'daily' ? new Date(d.time).toLocaleDateString() : d.time);
                const values = data.map(d => d.count);
                if (parkingChart) parkingChart.destroy();
                parkingChart = new Chart(document.getElementById('parking-chart').getContext('2d'), {
                    type: timeframe === 'daily' ? 'line' : 'bar',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'Total Cars Parked',
                            data: values,
                            borderColor: '#4270F4',
                            backgroundColor: timeframe === 'daily' ? 'rgba(66, 112, 244, 0.2)' : '#4270F4',
                            fill: timeframe === 'daily'
                        }]
                    },
                    options: {
                        scales: {
                            y: { beginAtZero: true }
                        }
                    }
                });
            })
            .catch(err => console.error('Parking Chart Error:', err));
    }

    // Time Frame Buttons
    const timeOptions = document.querySelectorAll('.time-option');
    timeOptions.forEach(option => {
        option.addEventListener('click', () => {
            timeOptions.forEach(opt => opt.classList.remove('active'));
            option.classList.add('active');
            const timeframe = option.textContent.toLowerCase();
            updateParkingChart(timeframe);
        });
    });

    // Day/Month Buttons (assuming these are under a .month-container or similar)
    const dayButtons = document.querySelectorAll('.month');
    dayButtons.forEach(button => {
        button.addEventListener('click', () => {
            dayButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            // For simplicity, we'll switch to weekly view when a day is clicked
            updateParkingChart('weekly');
        });
    });

    // Initial updates
    updateDashboard();
    updateParkingChart('daily');

    // Refresh every 15 seconds
    setInterval(() => {
        updateDashboard();
        updateParkingChart(document.querySelector('.time-option.active')?.textContent.toLowerCase() || 'daily');
    }, 15000);
});