document.addEventListener('DOMContentLoaded', () => {
    const BASE_URL = 'http://localhost:3000';

    function updateParkingSpots() {
        fetch(`${BASE_URL}/api/parking-spots`)
            .then(response => response.json())
            .then(spots => {
                spots.forEach((status, index) => {
                    const spot = document.getElementById(`spot-${index + 1}`);
                    if (spot) {
                        spot.className = 'parking-spot ' + (status === '0' ? 'available' : 'occupied');
                    }
                });
            })
            .catch(err => console.error('Parking Spots Error:', err));
    }

    updateParkingSpots();
    setInterval(updateParkingSpots, 15000); // Refresh every 15 seconds
});