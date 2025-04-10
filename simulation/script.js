// ThingSpeak Configuration
const CHANNEL_INFO = [
    { id: '2914193', apiKey: 'MH9PG5BKVZIYGW18' }, // Channel 1
    { id: '2914195', apiKey: 'FXNT93E2CGJZOXYZ' }, // Channel 2
    { id: '2914196', apiKey: '241WNVOWZCVDUNL0' }, // Channel 3
    { id: '2914197', apiKey: 'B2NKKTZBEG91U9PX' }, // Channel 4
    { id: '2914203', apiKey: 'EMAQGRWKUB4SOUCN' }, // Channel 5
    { id: '2914204', apiKey: '8EAR1YJRSYWMGHBO' }  // Channel 6
];

// Simulation State
let simulationRunning = false;
let simulationSpeed = 5; // 1-10 scale, lower means slower
let targetOccupancy = 50; // percentage
let simulationInterval;
let parkingSpots = {};
let occupiedCount = 0;

// Elements
const startButton = document.getElementById('start-simulation');
const stopButton = document.getElementById('stop-simulation');
const speedSlider = document.getElementById('simulation-speed');
const speedValue = document.getElementById('speed-value');
const occupancySlider = document.getElementById('occupancy-rate');
const occupancyValue = document.getElementById('occupancy-value');
const occupiedCountElement = document.getElementById('occupied-count');
const lastUpdateElement = document.getElementById('last-update');
const apiStatusElement = document.getElementById('api-status');
const logContainer = document.getElementById('log-container');

// Initialize parking spots
function initializeParkingSpots() {
    for (let channel = 1; channel <= 6; channel++) {
        for (let field = 1; field <= 2; field++) {
            const spotId = `spot-${channel}-${field}`;
            const spotElement = document.getElementById(spotId);
            
            if (spotElement) {
                parkingSpots[spotId] = {
                    element: spotElement,
                    occupied: false,
                    channel: channel,
                    field: field
                };
                
                // Add click listener to manually toggle spots
                spotElement.addEventListener('click', () => {
                    if (simulationRunning) {
                        toggleSpotManually(spotId);
                    }
                });
            }
        }
    }
}

// Toggle a spot's status manually when clicked
function toggleSpotManually(spotId) {
    const spot = parkingSpots[spotId];
    const newStatus = !spot.occupied;
    
    updateSpotStatus(spotId, newStatus);
    sendToThingSpeak(spot.channel, spot.field, newStatus ? 1 : 0);
    
    addLogEntry(`Manual toggle: Spot ${spotId.split('-')[2] === '1' ? 'A' : 'B'}${spotId.split('-')[1]} is now ${newStatus ? 'occupied' : 'free'}`);
}

// Update a spot's visual status
function updateSpotStatus(spotId, isOccupied) {
    const spot = parkingSpots[spotId];
    const wasOccupied = spot.occupied;
    
    spot.occupied = isOccupied;
    
    // Add animation class based on state change
    if (wasOccupied !== isOccupied) {
        spot.element.classList.remove('car-entering', 'car-leaving');
        
        if (isOccupied) {
            spot.element.classList.add('car-entering');
        } else {
            spot.element.classList.add('car-leaving');
        }
    }
    
    // Update CSS class for occupied/available
    if (isOccupied) {
        spot.element.classList.add('occupied');
    } else {
        spot.element.classList.remove('occupied');
    }
    
    // Update occupied count
    updateOccupiedCount();
}

// Update total occupied count
function updateOccupiedCount() {
    occupiedCount = Object.values(parkingSpots).filter(spot => spot.occupied).length;
    occupiedCountElement.textContent = `${occupiedCount}/12`;
}

// Send data to ThingSpeak
function sendToThingSpeak(channelIndex, fieldIndex, value) {
    // ThingSpeak API only allows one update per channel every 15 seconds
    apiStatusElement.textContent = 'Sending...';
    
    const channel = CHANNEL_INFO[channelIndex - 1];
    
    // Construct ThingSpeak URL
    const url = `https://api.thingspeak.com/update?api_key=${channel.apiKey}&field${fieldIndex}=${value}`;
    
    // Make actual HTTP request to ThingSpeak
    fetch(url)
        .then(response => response.text())
        .then(data => {
            console.log(`ThingSpeak response: ${data}`);
            
            // Update last update time
            const now = new Date();
            const timeString = now.toLocaleTimeString();
            lastUpdateElement.textContent = timeString;
            
            // Update API status based on response
            if (data > 0) {
                apiStatusElement.textContent = 'Success';
            } else {
                apiStatusElement.textContent = 'Error: Rate limit';
            }
            
            setTimeout(() => {
                apiStatusElement.textContent = 'Ready';
            }, 2000);
        })
        .catch(error => {
            console.error('Error sending to ThingSpeak:', error);
            apiStatusElement.textContent = 'Error!';
            
            setTimeout(() => {
                apiStatusElement.textContent = 'Ready';
            }, 2000);
        });
}

// Add a log entry
function addLogEntry(message) {
    const now = new Date();
    const timeString = now.toLocaleTimeString();
    
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';
    logEntry.innerHTML = `
        <span class="log-time">${timeString}</span>
        <span class="log-message">${message}</span>
    `;
    
    logContainer.prepend(logEntry);
    
    // Limit log entries to prevent memory issues
    if (logContainer.children.length > 50) {
        logContainer.lastChild.remove();
    }
}

// Run one simulation cycle
function runSimulationCycle() {
    // Calculate how many spots should be occupied based on target occupancy
    const targetOccupiedCount = Math.round((targetOccupancy / 100) * 12);
    
    // Determine if we need to add or remove cars
    if (occupiedCount < targetOccupiedCount) {
        // Find available spots and randomly occupy one
        const availableSpots = Object.entries(parkingSpots).filter(([id, spot]) => !spot.occupied);
        
        if (availableSpots.length > 0) {
            // Get a random available spot
            const randomIndex = Math.floor(Math.random() * availableSpots.length);
            const [spotId, spot] = availableSpots[randomIndex];
            
            // Occupy the spot
            updateSpotStatus(spotId, true);
            sendToThingSpeak(spot.channel, spot.field, 1);
            addLogEntry(`Car arrived: Spot ${spotId.split('-')[2] === '1' ? 'A' : 'B'}${spotId.split('-')[1]} is now occupied`);
        }
    } 
    else if (occupiedCount > targetOccupiedCount) {
        // Find occupied spots and randomly free one
        const occupiedSpots = Object.entries(parkingSpots).filter(([id, spot]) => spot.occupied);
        
        if (occupiedSpots.length > 0) {
            // Get a random occupied spot
            const randomIndex = Math.floor(Math.random() * occupiedSpots.length);
            const [spotId, spot] = occupiedSpots[randomIndex];
            
            // Free the spot
            updateSpotStatus(spotId, false);
            sendToThingSpeak(spot.channel, spot.field, 0);
            addLogEntry(`Car departed: Spot ${spotId.split('-')[2] === '1' ? 'A' : 'B'}${spotId.split('-')[1]} is now free`);
        }
    }
    else {
        // If we're at the target, still allow for random changes
        if (Math.random() < 0.3) { // 30% chance of a random change
            // Decide whether to add or remove a car (with equal probability)
            const addCar = Math.random() < 0.5;
            
            if (addCar && occupiedCount < 12) {
                // Find available spots and randomly occupy one
                const availableSpots = Object.entries(parkingSpots).filter(([id, spot]) => !spot.occupied);
                
                if (availableSpots.length > 0) {
                    const randomIndex = Math.floor(Math.random() * availableSpots.length);
                    const [spotId, spot] = availableSpots[randomIndex];
                    
                    updateSpotStatus(spotId, true);
                    sendToThingSpeak(spot.channel, spot.field, 1);
                    addLogEntry(`Random arrival: Spot ${spotId.split('-')[2] === '1' ? 'A' : 'B'}${spotId.split('-')[1]} is now occupied`);
                }
            } 
            else if (!addCar && occupiedCount > 0) {
                // Find occupied spots and randomly free one
                const occupiedSpots = Object.entries(parkingSpots).filter(([id, spot]) => spot.occupied);
                
                if (occupiedSpots.length > 0) {
                    const randomIndex = Math.floor(Math.random() * occupiedSpots.length);
                    const [spotId, spot] = occupiedSpots[randomIndex];
                    
                    updateSpotStatus(spotId, false);
                    sendToThingSpeak(spot.channel, spot.field, 0);
                    addLogEntry(`Random departure: Spot ${spotId.split('-')[2] === '1' ? 'A' : 'B'}${spotId.split('-')[1]} is now free`);
                }
            }
        }
    }
}

// Start simulation
function startSimulation() {
    if (simulationRunning) return;
    
    simulationRunning = true;
    startButton.disabled = true;
    stopButton.disabled = false;
    
    // Calculate interval time based on speed (in seconds)
    // Speed 1 = 30s, Speed 10 = 3s
    const intervalTime = (31 - (simulationSpeed * 3)) * 1000;
    
    addLogEntry(`Simulation started with speed ${simulationSpeed} (${intervalTime/1000}s interval) and target occupancy ${targetOccupancy}%`);
    
    // Run an initial cycle
    runSimulationCycle();
    
    // Set interval for ongoing simulation
    simulationInterval = setInterval(runSimulationCycle, intervalTime);
}

// Stop simulation
function stopSimulation() {
    if (!simulationRunning) return;
    
    simulationRunning = false;
    startButton.disabled = false;
    stopButton.disabled = true;
    
    clearInterval(simulationInterval);
    
    addLogEntry('Simulation stopped');
}

// Event listeners
startButton.addEventListener('click', startSimulation);
stopButton.addEventListener('click', stopSimulation);

speedSlider.addEventListener('input', () => {
    simulationSpeed = parseInt(speedSlider.value);
    speedValue.textContent = simulationSpeed;
    
    // If simulation is running, restart it with new speed
    if (simulationRunning) {
        stopSimulation();
        startSimulation();
    }
});

occupancySlider.addEventListener('input', () => {
    targetOccupancy = parseInt(occupancySlider.value);
    occupancyValue.textContent = `${targetOccupancy}%`;
});

// Initialize everything when the page loads
document.addEventListener('DOMContentLoaded', () => {
    initializeParkingSpots();
    addLogEntry('Simulation ready to start');
});
