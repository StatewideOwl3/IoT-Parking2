// ThingSpeak Configuration - 6 channels (one for each IR sensor pair)
const UPDATE_INTERVAL = 60000; // Update every 60 seconds

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
// Each row is a sector (A, B, C), each column is a spot (1-4)
// Initialize with null to indicate "loading" state
let parkingStateArray = [
    [null, null, null, null], // Sector A (spots 1-4)
    [null, null, null, null], // Sector B (spots 1-4)
    [null, null, null, null]  // Sector C (spots 1-4)
];

// Flag to track if initial data has been loaded
let initialDataLoaded = false;

// Store last update times for each spot
let lastChangeTimes = {};

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

// This maps between channel/field and HTML element IDs
const spotIdMap = {
    '0-0': { channelDisplay: 1, fieldDisplay: 1 }, // Sector A, Spot 1 -> spot-1-1
    '0-1': { channelDisplay: 1, fieldDisplay: 2 }, // Sector A, Spot 2 -> spot-1-2
    '0-2': { channelDisplay: 2, fieldDisplay: 1 }, // Sector A, Spot 3 -> spot-2-1
    '0-3': { channelDisplay: 2, fieldDisplay: 2 }, // Sector A, Spot 4 -> spot-2-2
    '1-0': { channelDisplay: 3, fieldDisplay: 1 }, // Sector B, Spot 1 -> spot-3-1
    '1-1': { channelDisplay: 3, fieldDisplay: 2 }, // Sector B, Spot 2 -> spot-3-2
    '1-2': { channelDisplay: 4, fieldDisplay: 1 }, // Sector B, Spot 3 -> spot-4-1
    '1-3': { channelDisplay: 4, fieldDisplay: 2 }, // Sector B, Spot 4 -> spot-4-2
    '2-0': { channelDisplay: 5, fieldDisplay: 1 }, // Sector C, Spot 1 -> spot-5-1
    '2-1': { channelDisplay: 5, fieldDisplay: 2 }, // Sector C, Spot 2 -> spot-5-2
    '2-2': { channelDisplay: 6, fieldDisplay: 1 }, // Sector C, Spot 3 -> spot-6-1
    '2-3': { channelDisplay: 6, fieldDisplay: 2 }  // Sector C, Spot 4 -> spot-6-2
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('Parking spaces page loaded!');
    
    // Show loading state in the UI
    function showLoadingState() {
        // Add a loading indicator to the page
        const loadingIndicator = document.createElement('div');
        loadingIndicator.id = 'loading-indicator';
        loadingIndicator.style.position = 'fixed';
        loadingIndicator.style.top = '50%';
        loadingIndicator.style.left = '50%';
        loadingIndicator.style.transform = 'translate(-50%, -50%)';
        loadingIndicator.style.background = 'rgba(66, 112, 244, 0.8)';
        loadingIndicator.style.color = 'white';
        loadingIndicator.style.padding = '15px 20px';
        loadingIndicator.style.borderRadius = '8px';
        loadingIndicator.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
        loadingIndicator.style.zIndex = '1000';
        loadingIndicator.style.textAlign = 'center';
        loadingIndicator.innerHTML = '<div>Loading latest parking data...</div><div style="margin-top:10px">Fetching from ThingSpeak</div>';
        document.body.appendChild(loadingIndicator);
        
        // Update all spot statuses to show loading
        for (let sector = 0; sector < 3; sector++) {
            for (let spot = 0; spot < 4; spot++) {
                const key = `${sector}-${spot}`;
                const mapping = spotIdMap[key];
                if (!mapping) continue;
                
                const spotId = `spot-${mapping.channelDisplay}-${mapping.fieldDisplay}`;
                const statusId = `${spotId}-status`;
                const lastChangeId = `${spotId}-last-change`;
                
                const statusElement = document.getElementById(statusId);
                const lastChangeElement = document.getElementById(lastChangeId);
                
                if (statusElement) {
                    statusElement.textContent = 'LOADING...';
                }
                
                if (lastChangeElement) {
                    lastChangeElement.textContent = 'Fetching...';
                }
            }
        }
    }
    
    // Remove loading indicator
    function hideLoadingIndicator() {
        const indicator = document.getElementById('loading-indicator');
        if (indicator) {
            indicator.remove();
        }
    }
    
    // Initialize page
    function initializePage() {
        console.log('Initializing parking spaces page...');
        
        // Show loading state
        showLoadingState();
        
        // Initialize last change times
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 4; j++) {
                lastChangeTimes[`${i}-${j}`] = null;
            }
        }
        
        console.log('Parking state array initialized:', parkingStateArray);
        console.log('Starting first data fetch from ThingSpeak...');
        fetchAllChannelsData();
    }
    
    // Function to update the UI based on the parkingStateArray
    function updateParkingSpotUI() {
        console.log('Updating UI from state array:', parkingStateArray);
        
        // Hide loading indicator if it was visible
        if (initialDataLoaded) {
            hideLoadingIndicator();
        }
        
        // For each sector (0,1,2 = A,B,C)
        for (let sectorIndex = 0; sectorIndex < 3; sectorIndex++) {
            // For each spot (0,1,2,3 = spots 1,2,3,4 in that sector)
            for (let spotIndex = 0; spotIndex < 4; spotIndex++) {
                const spotState = parkingStateArray[sectorIndex][spotIndex];
                const key = `${sectorIndex}-${spotIndex}`;
                
                // Get HTML IDs using the spotIdMap
                const mapping = spotIdMap[key];
                if (!mapping) continue;
                
                // Target element IDs based on the mapping
                const spotId = `spot-${mapping.channelDisplay}-${mapping.fieldDisplay}`;
                const statusId = `${spotId}-status`;
                const lastChangeId = `${spotId}-last-change`;
                
                // Get elements
                const spotElement = document.getElementById(spotId);
                const statusElement = document.getElementById(statusId);
                const lastChangeElement = document.getElementById(lastChangeId);
                
                // If data is still loading (null), show loading state
                if (spotState === null) {
                    if (spotElement) {
                        spotElement.className = 'parking-spot loading';
                    }
                    
                    if (statusElement) {
                        statusElement.textContent = 'LOADING...';
                    }
                } else {
                    // Data is loaded, show normal state
                    const isOccupied = !!spotState; // Convert to boolean
                    
                    if (spotElement) {
                        spotElement.className = `parking-spot ${isOccupied ? 'occupied' : 'available'}`;
                    }
                    
                    if (statusElement) {
                        statusElement.textContent = isOccupied ? 'OCCUPIED' : 'FREE';
                    }
                }
                
                // Always update timestamp display if we have data
                if (lastChangeElement) {
                    if (lastChangeTimes[key]) {
                        const formattedTime = moment(lastChangeTimes[key]).format('h:mm A D MMM YYYY');
                        lastChangeElement.textContent = formattedTime;
                    } else {
                        // Even if timestamp doesn't exist, show loading message instead of empty
                        lastChangeElement.textContent = 'Fetching...';
                    }
                }
            }
        }
        
        // Update refresh time
        document.getElementById('last-refresh-time').textContent = moment().format('h:mm:ss A');
    }
    
    // Function to fetch data from all ThingSpeak channels
    function fetchAllChannelsData() {
        console.log('Fetching all ThingSpeak channels data...');
        
        // Create an array to hold all the promises
        const channelPromises = [];
        
        // Fetch data from all 6 channels
        for (let i = 0; i < CHANNEL_INFO.length; i++) {
            const channelData = CHANNEL_INFO[i];
            console.log(`Fetching channel ${i+1} (ID: ${channelData.id})`);
            
            const promise = $.ajax({
                url: `https://api.thingspeak.com/channels/${channelData.id}/feeds/last.json`,
                data: { api_key: channelData.apiKey },
                dataType: 'json'
            });
            
            channelPromises.push(promise);
        }
        
        // Process all the responses when they complete
        $.when.apply($, channelPromises)
            .done(function() {
                console.log('All ThingSpeak requests completed successfully');
                
                // Convert arguments to an array if multiple promises
                const results = channelPromises.length === 1 ? 
                    [arguments] : 
                    Array.prototype.slice.call(arguments);
                
                // Process each response
                results.forEach((result, index) => {
                    const data = result[0]; // First argument is the data
                    if (!data) return;
                    
                    console.log(`Processing data from channel ${index+1}:`, data);
                    
                    // Get the field values (0 = free, 1 = occupied)
                    // CRITICAL FIX: data.field1 '0' evaluates as falsy in JavaScript!
                    // We must check if it's undefined, not if it's truthy
                    const field1 = data.field1 !== undefined ? parseInt(data.field1) === 1 : false;
                    const field2 = data.field2 !== undefined ? parseInt(data.field2) === 1 : false;
                    
                    console.log(`Channel ${index+1}: field1=${data.field1} (${field1 ? 'OCCUPIED' : 'FREE'}), field2=${data.field2} (${field2 ? 'OCCUPIED' : 'FREE'})`);
                    
                    // Find corresponding spots in our parking state array using the mapping
                    const mappings = channelFieldToSectorSpotMap.filter(m => m.channel === index);
                    
                    mappings.forEach(mapping => {
                        const fieldValue = mapping.field === 1 ? field1 : field2;
                        const sector = mapping.sector;
                        const spot = mapping.spot;
                        
                        // ALWAYS update the last change time with the latest data timestamp
                        // regardless of whether the state has changed
                        lastChangeTimes[`${sector}-${spot}`] = data.created_at;
                        
                        // Update the parking state array
                        parkingStateArray[sector][spot] = fieldValue;
                        
                        // Log the timestamp update
                        console.log(`Updated timestamp for ${String.fromCharCode(65 + sector)}${spot + 1} to ${moment(data.created_at).format('h:mm A D MMM YYYY')}`);

                    });
                    
                    // Update timestamp display
                    if (index === 0) { // Use first channel for main timestamp
                        $('#thingspeak-timestamp').text(moment(data.created_at).format('MMM D, YYYY h:mm:ss A'));
                    }
                });
                
                // Mark that we've loaded the initial data
                initialDataLoaded = true;
                
                // After all data is processed, update the UI
                updateParkingSpotUI();
                console.log('UI updated with latest ThingSpeak data');
            })
            .fail(function(error) {
                console.error('Error fetching ThingSpeak data:', error);
            });
    }
    
    // Setup refresh button and auto-refresh interval
    function setupEvents() {
        // Manual refresh button
        document.querySelector('.premium-btn').addEventListener('click', function() {
            console.log('Manual refresh requested');
            fetchAllChannelsData();
        });
        
        // Auto-refresh interval
        console.log(`Setting up auto-refresh every ${UPDATE_INTERVAL/1000} seconds`);
        setInterval(fetchAllChannelsData, UPDATE_INTERVAL);
    }
    
    // Initialize everything
    initializePage();
    setupEvents();
    
    console.log('Parking spaces page setup complete!');
});