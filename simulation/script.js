// ThingSpeak Configuration - 6 channels (one for each IR sensor pair)
const THINGSPEAK_UPDATE_INTERVAL = 60000; // Update ThingSpeak once per minute

// Each IR sensor has its own ThingSpeak channel with 2 fields
// IMPORTANT: You need to use the WRITE API key for updating ThingSpeak
const CHANNEL_INFO = [
    { id: 'CHANNEL_1_ID', apiKey: 'WRITE_API_KEY_1' }, // Channel 1 - Sector A spots 1-2
    { id: 'CHANNEL_2_ID', apiKey: 'WRITE_API_KEY_2' }, // Channel 2 - Sector A spots 3-4
    { id: 'CHANNEL_3_ID', apiKey: 'WRITE_API_KEY_3' }, // Channel 3 - Sector B spots 1-2
    { id: 'CHANNEL_4_ID', apiKey: 'WRITE_API_KEY_4' }, // Channel 4 - Sector B spots 3-4
    { id: 'CHANNEL_5_ID', apiKey: 'WRITE_API_KEY_5' }, // Channel 5 - Sector C spots 1-2
    { id: 'CHANNEL_6_ID', apiKey: 'WRITE_API_KEY_6' }  // Channel 6 - Sector C spots 3-4
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

// Local parking state storage (3 rows x 4 columns)
// Row A: Sectors A (spots 1-4)
// Row B: Sectors B (spots 5-8)
// Row C: Sectors C (spots 9-12)
const parkingStateArray = [
    [false, false, false, false], // Sector A (spots 1-4)
    [false, false, false, false], // Sector B (spots 5-8)
    [false, false, false, false]  // Sector C (spots 9-12)
];

// Flag to track if ThingSpeak needs updating
let thingspeakNeedsUpdate = false;
let thingspeakUpdateTimer = null;

// Countdown timer for ThingSpeak updates
let countdownValue = Math.floor(THINGSPEAK_UPDATE_INTERVAL / 1000); // Convert ms to seconds
let countdownTimer = null;

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
    // Clear any existing parking spots
    parkingSpots = {};
    occupiedCount = 0;
    
    // Reset all state array entries to false (empty)
    for (let i = 0; i < parkingStateArray.length; i++) {
        for (let j = 0; j < parkingStateArray[i].length; j++) {
            parkingStateArray[i][j] = false;
        }
    }
    
    // Log to help debug
    console.log('Initializing parking spots...');
    
    // Now set up each spot
    for (let channel = 1; channel <= 6; channel++) {
        for (let field = 1; field <= 2; field++) {
            const spotId = `spot-${channel}-${field}`;
            const spotElement = document.getElementById(spotId);
            
            console.log(`Looking for spot element: ${spotId}`);
            
            if (spotElement) {
                console.log(`Found spot element: ${spotId}`);
                
                // Find the mapping for this channel and field
                const mappings = channelFieldToSectorSpotMap.filter(mapping => 
                    mapping.channel === channel - 1 && mapping.field === field
                );
                
                if (mappings.length > 0) {
                    const mapping = mappings[0];
                    const sectorIndex = mapping.sector;
                    const spotIndex = mapping.spot;
                    
                    console.log(`Mapping spot ${spotId} to sector ${sectorIndex}, spot ${spotIndex}`);
                    
                    parkingSpots[spotId] = {
                        element: spotElement,
                        occupied: false,
                        channel: channel,
                        field: field,
                        sectorIndex: sectorIndex,
                        spotIndex: spotIndex
                    };
                    
                    // Ensure spot shows as available in UI
                    spotElement.classList.remove('occupied');
                    spotElement.classList.add('available');
                    
                    // Add click listener to manually toggle spots
                    spotElement.addEventListener('click', () => {
                        toggleSpotManually(spotId);
                    });
                } else {
                    console.error(`Could not find mapping for channel ${channel}, field ${field}`);
                }
            } else {
                console.error(`Could not find element with ID: ${spotId}`);
            }
        }
    }
    
    // Initialize ThingSpeak update timer
    setupThingspeakTimer();
    
    // Force initial ThingSpeak update
    thingspeakNeedsUpdate = true;
    updateOccupiedCount();
    
    console.log('Parking spots initialized:', parkingSpots);
}

// Toggle a spot's status manually when clicked
function toggleSpotManually(spotId) {
    const spot = parkingSpots[spotId];
    const newStatus = !spot.occupied;
    
    // Update local state array
    parkingStateArray[spot.sectorIndex][spot.spotIndex] = newStatus;
    
    // Update UI
    updateSpotStatus(spotId, newStatus);
    
    // Mark for ThingSpeak update, but don't send immediately
    // Data will be sent on the next 60-second timer cycle
    thingspeakNeedsUpdate = true;
    
    // Log the change
    const sectorLetter = ['A', 'B', 'C'][spot.sectorIndex];
    const spotNumber = spot.spotIndex + 1;
    addLogEntry(`Manual toggle: ${sectorLetter}${spotNumber} is now ${newStatus ? 'occupied' : 'free'}`);
}

// Update a spot's visual status
function updateSpotStatus(spotId, isOccupied) {
    const spot = parkingSpots[spotId];
    if (!spot) {
        console.error(`Spot ${spotId} not found in parkingSpots`);
        return;
    }
    
    const wasOccupied = spot.occupied;
    console.log(`Updating spot ${spotId} from ${wasOccupied} to ${isOccupied}`);
    
    // Update the spot data
    spot.occupied = isOccupied;
    
    // Update local state array
    parkingStateArray[spot.sectorIndex][spot.spotIndex] = isOccupied;
    
    // Add animation class based on state change
    if (wasOccupied !== isOccupied) {
        spot.element.classList.remove('car-entering', 'car-leaving');
        
        if (isOccupied) {
            spot.element.classList.add('car-entering');
            spot.element.classList.add('occupied');
            spot.element.classList.remove('available');
        } else {
            spot.element.classList.add('car-leaving');
            spot.element.classList.remove('occupied');
            spot.element.classList.add('available');
        }
    }
    
    // Update occupied count
    updateOccupiedCount();
    
    // Mark for ThingSpeak update
    thingspeakNeedsUpdate = true;
    
    // Log state array for debugging
    logParkingState();
}

// Update total occupied count
function updateOccupiedCount() {
    occupiedCount = Object.values(parkingSpots).filter(spot => spot.occupied).length;
    occupiedCountElement.textContent = `${occupiedCount}/12`;
}

// Send data to ThingSpeak (simulating 6 IR sensors, each with its own channel)
function sendToThingSpeak() {
    // ThingSpeak API only allows one update per channel every 15 seconds
    apiStatusElement.textContent = 'Sending...';
    addLogEntry('Sending data to ThingSpeak to ALL 6 CHANNELS...');
    
    // Create an array to store all promises
    const updatePromises = [];
    
    // For EACH channel, send the corresponding spot data
    CHANNEL_INFO.forEach((channelInfo, channelIndex) => {
        // Build query parameters for this channel
        let queryParams = `api_key=${channelInfo.apiKey}`;
        
        // Map the sector and spots based on the channel
        // Channel 1 (index 0) controls Sector A spots 1-2
        // Channel 2 (index 1) controls Sector A spots 3-4
        // Channel 3 (index 2) controls Sector B spots 1-2
        // And so on...
        let sectorIndex, spotIndex1, spotIndex2;
        
        if (channelIndex === 0) { // Channel 1 -> Sector A, Spots 1-2
            sectorIndex = 0;
            spotIndex1 = 0;
            spotIndex2 = 1;
        } else if (channelIndex === 1) { // Channel 2 -> Sector A, Spots 3-4
            sectorIndex = 0;
            spotIndex1 = 2;
            spotIndex2 = 3;
        } else if (channelIndex === 2) { // Channel 3 -> Sector B, Spots 1-2
            sectorIndex = 1;
            spotIndex1 = 0;
            spotIndex2 = 1;
        } else if (channelIndex === 3) { // Channel 4 -> Sector B, Spots 3-4
            sectorIndex = 1;
            spotIndex1 = 2;
            spotIndex2 = 3;
        } else if (channelIndex === 4) { // Channel 5 -> Sector C, Spots 1-2
            sectorIndex = 2;
            spotIndex1 = 0;
            spotIndex2 = 1;
        } else if (channelIndex === 5) { // Channel 6 -> Sector C, Spots 3-4
            sectorIndex = 2;
            spotIndex1 = 2;
            spotIndex2 = 3;
        }
        
        // Get the field values
        const field1Value = parkingStateArray[sectorIndex][spotIndex1] ? 1 : 0;
        const field2Value = parkingStateArray[sectorIndex][spotIndex2] ? 1 : 0;
        
        // Add field values to query parameters
        queryParams += `&field1=${field1Value}&field2=${field2Value}`;
        
        // Get sector letter and spot numbers for logging
        const sectorLetter = ['A', 'B', 'C'][sectorIndex];
        const spot1 = spotIndex1 + 1;
        const spot2 = spotIndex2 + 1;
        
        // Log what we're sending
        addLogEntry(`Sending to ThingSpeak Channel ${channelIndex+1} - ${sectorLetter}${spot1}: ${field1Value ? 'OCCUPIED' : 'FREE'}, ${sectorLetter}${spot2}: ${field2Value ? 'OCCUPIED' : 'FREE'}`);
        
        // Create the URL for the channel
        const url = `https://api.thingspeak.com/update?${queryParams}`;
        console.log(`ThingSpeak URL for channel ${channelIndex+1}:`, url);
        
        // Make the HTTP request and store the promise
        const promise = fetch(url)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
                return response.text();
            })
            .then(data => {
                // Add success log entry
                addLogEntry(`ThingSpeak update successful for Channel ${channelIndex+1} - Entry ID: ${data}`);
                console.log(`ThingSpeak update successful for Channel ${channelIndex+1}: ${data}`);
                return data;
            })
            .catch(error => {
                // Log error
                addLogEntry(`Error sending to ThingSpeak Channel ${channelIndex+1}: ${error.message}`);
                console.error(`Error sending data to ThingSpeak Channel ${channelIndex+1}:`, error);
                return null;
            });
        
        updatePromises.push(promise);
    });
    
    // Wait for all updates to complete
    Promise.all(updatePromises)
        .then(results => {
            // All updates completed (success or failure)
            const successCount = results.filter(result => result !== null).length;
            
            // Update status elements
            apiStatusElement.textContent = successCount === CHANNEL_INFO.length ? 'Success' : 'Partial Success';
            const now = new Date();
            const formattedTime = now.toLocaleString();
            
            // Update all timestamp displays
            lastUpdateElement.textContent = now.toLocaleTimeString();
            
            // Try to update timestamp displays, but handle gracefully if they don't exist
            try {
                if (document.getElementById('thingspeak-update-time')) {
                    document.getElementById('thingspeak-update-time').textContent = formattedTime;
                }
                if (document.getElementById('thingspeak-update-display')) {
                    document.getElementById('thingspeak-update-display').textContent = formattedTime;
                }
            } catch (e) {
                console.error('Error updating timestamp displays:', e);
            }
            
            // Reset the update flag and countdown
            thingspeakNeedsUpdate = false;
            countdownValue = Math.floor(THINGSPEAK_UPDATE_INTERVAL / 1000);
            updateCountdownDisplay();
            
            // Add final summary log entry
            addLogEntry(`ThingSpeak update completed: ${successCount}/${CHANNEL_INFO.length} channels updated successfully`);
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

// Determine sector and spot name from spot ID
function getSpotLabel(spotId) {
    const parts = spotId.split('-');
    const channel = parseInt(parts[1]);
    const field = parseInt(parts[2]);
    
    // Calculate global spot index (0-11)
    const globalIndex = (channel - 1) * 2 + (field - 1);
    
    // Determine sector (A, B, C)
    const sector = String.fromCharCode(65 + Math.floor(globalIndex / 4)); // A=65, B=66, C=67
    
    // Determine spot number (1-4) within sector
    const spotNumber = (globalIndex % 4) + 1;
    
    return `${sector}${spotNumber}`;
}

// Run one simulation cycle - simulating ESP32 behavior
function runSimulationCycle() {
    const currentOccupancyRate = (occupiedCount / 12) * 100;
    const targetRate = targetOccupancy;

    // Log the current state
    addLogEntry(`Current occupancy: ${occupiedCount}/12 (${Math.round(currentOccupancyRate)}%), Target: ${targetRate}%`);

    // Determine if we need to add or remove cars
    if (currentOccupancyRate < targetRate) {
        // Need to add cars
        const availableSpots = Object.entries(parkingSpots).filter(([id, spot]) => !spot.occupied);
        
        if (availableSpots.length > 0) {
            // Randomly select a spot to fill
            const randomIndex = Math.floor(Math.random() * availableSpots.length);
            const [spotId, spot] = availableSpots[randomIndex];
            
            // Occupy the spot - simulating IR sensor detecting a car
            updateSpotStatus(spotId, true);
            const spotLabel = getSpotLabel(spotId);
            addLogEntry(`IR sensor detected car: Spot ${spotLabel} is now occupied`);
        }
    } 
    else if (currentOccupancyRate > targetRate) {
        // Need to remove cars
        const occupiedSpots = Object.entries(parkingSpots).filter(([id, spot]) => spot.occupied);
        
        if (occupiedSpots.length > 0) {
            // Get a random occupied spot
            const randomIndex = Math.floor(Math.random() * occupiedSpots.length);
            const [spotId, spot] = occupiedSpots[randomIndex];
            
            // Free the spot - simulating IR sensor detecting spot is free
            updateSpotStatus(spotId, false);
            const spotLabel = getSpotLabel(spotId);
            addLogEntry(`IR sensor: Spot ${spotLabel} is now free`);
        }
    }
    else {
        // If we're at the target, still allow for random changes (simulating real-world activity)
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
                    const spotLabel = getSpotLabel(spotId);
                    addLogEntry(`IR sensor detected car: Spot ${spotLabel} is now occupied`);
                }
            } 
            else if (!addCar && occupiedCount > 0) {
                // Find occupied spots and randomly free one
                const occupiedSpots = Object.entries(parkingSpots).filter(([id, spot]) => spot.occupied);
                
                if (occupiedSpots.length > 0) {
                    const randomIndex = Math.floor(Math.random() * occupiedSpots.length);
                    const [spotId, spot] = occupiedSpots[randomIndex];
                    
                    updateSpotStatus(spotId, false);
                    const spotLabel = getSpotLabel(spotId);
                    addLogEntry(`IR sensor: Spot ${spotLabel} is now free`);
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
    
    // Send an immediate ThingSpeak update to initialize
    thingspeakNeedsUpdate = true;
    sendToThingSpeak();
    
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
    
    // Don't stop the countdown timer - ThingSpeak updates can still happen
    // even when simulation is stopped if there have been changes
}

// Set up timer for ThingSpeak updates
function setupThingspeakTimer() {
    // Clear any existing timers to prevent duplicates
    if (thingspeakUpdateTimer) clearInterval(thingspeakUpdateTimer);
    if (countdownTimer) clearInterval(countdownTimer);
    
    // Set up update timer for ThingSpeak - ONLY EVERY 60 SECONDS
    thingspeakUpdateTimer = setInterval(() => {
        console.log('60-second ThingSpeak update timer triggered, needs update:', thingspeakNeedsUpdate);
        if (thingspeakNeedsUpdate) {
            console.log('Sending update to ThingSpeak');
            // Only send if there have been changes
            sendToThingSpeak();
            // Reset the update flag after sending
            thingspeakNeedsUpdate = false;
            addLogEntry('ThingSpeak update sent on 60s timer cycle');
        } else {
            console.log('No changes to send to ThingSpeak');
            addLogEntry('No changes to send on this 60s cycle');
        }
        // Reset countdown regardless of whether we sent an update
        countdownValue = Math.floor(THINGSPEAK_UPDATE_INTERVAL / 1000);
        updateCountdownDisplay();
    }, 60000); // Changed to 60000 for 60 seconds
    
    // Set up countdown timer (updates every second)
    countdownTimer = setInterval(() => {
        if (countdownValue > 0) {
            countdownValue--;
            updateCountdownDisplay();
        }
    }, 1000);
    
    // Initialize countdown display
    updateCountdownDisplay();
    console.log('ThingSpeak timers set up, countdown value:', countdownValue);
}

// Update the countdown display
function updateCountdownDisplay() {
    const countdownElement = document.getElementById('next-update-countdown');
    if (countdownElement) {
        countdownElement.textContent = countdownValue;
    }
}

// Helper function to print the current state of the parking array for debugging
function logParkingState() {
    console.log('Current Parking State:');
    console.log('  Sector A:', parkingStateArray[0]);
    console.log('  Sector B:', parkingStateArray[1]);
    console.log('  Sector C:', parkingStateArray[2]);
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
