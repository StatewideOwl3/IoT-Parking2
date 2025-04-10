// ThingSpeak Configuration
const CHANNEL_INFO = [
    { id: '2914193', apiKey: 'MH9PG5BKVZIYGW18' }, // Channel 1
    { id: '2914195', apiKey: 'FXNT93E2CGJZOXYZ' }, // Channel 2
    { id: '2914196', apiKey: '241WNVOWZCVDUNL0' }, // Channel 3
    { id: '2914197', apiKey: 'B2NKKTZBEG91U9PX' }, // Channel 4
    { id: '2914203', apiKey: 'EMAQGRWKUB4SOUCN' }, // Channel 5
    { id: '2914204', apiKey: '8EAR1YJRSYWMGHBO' }  // Channel 6
];
const UPDATE_INTERVAL = 5000; // Update every 5 seconds

document.addEventListener('DOMContentLoaded', () => {
    let allParkingData = {};
    let lastChangeTimes = {};

    function updateParkingSpots() {
        // Create an array of promises for fetching the current data
        const currentDataPromises = CHANNEL_INFO.map((channel, index) => {
            return $.getJSON(
                `https://api.thingspeak.com/channels/${channel.id}/feeds/last.json?api_key=${channel.apiKey}`
            ).then(data => {
                // Store the data for this channel
                if (data) {
                    const channelNum = index + 1;
                    
                    // Update Spot 1 for this channel
                    const spot1Id = `spot-${channelNum}-1`;
                    const spot1Occupied = parseInt(data.field1) === 1;
                    
                    const spot1Element = document.getElementById(spot1Id);
                    const spot1Status = document.getElementById(`${spot1Id}-status`);
                    
                    spot1Element.className = 'parking-spot ' + (spot1Occupied ? 'occupied' : 'available');
                    spot1Status.textContent = spot1Occupied ? 'OCCUPIED' : 'FREE';
                    
                    // Update Spot 2 for this channel
                    const spot2Id = `spot-${channelNum}-2`;
                    const spot2Occupied = parseInt(data.field2) === 1;
                    
                    const spot2Element = document.getElementById(spot2Id);
                    const spot2Status = document.getElementById(`${spot2Id}-status`);
                    
                    spot2Element.className = 'parking-spot ' + (spot2Occupied ? 'occupied' : 'available');
                    spot2Status.textContent = spot2Occupied ? 'OCCUPIED' : 'FREE';
                    
                    // Store the current state
                    allParkingData[channelNum] = {
                        spot1: spot1Occupied,
                        spot2: spot2Occupied,
                        timestamp: data.created_at
                    };
                }
                return data;
            }).catch(error => {
                console.error(`Error fetching current data for channel ${index + 1}:`, error);
                return null;
            });
        });

        // Create an array of promises for fetching the historical data
        const historicalDataPromises = CHANNEL_INFO.map((channel, index) => {
            return $.getJSON(
                `https://api.thingspeak.com/channels/${channel.id}/feeds.json?api_key=${channel.apiKey}&results=100`
            ).then(historicalData => {
                if (historicalData && historicalData.feeds && historicalData.feeds.length > 0) {
                    const channelNum = index + 1;
                    const feeds = historicalData.feeds.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                    
                    let lastSpot1Change = null;
                    let lastSpot2Change = null;
                    let prevSpot1State = parseInt(feeds[0].field1);
                    let prevSpot2State = parseInt(feeds[0].field2);
                    
                    // Find last state changes
                    for (let i = 1; i < feeds.length; i++) {
                        const feed = feeds[i];
                        const spot1State = parseInt(feed.field1);
                        const spot2State = parseInt(feed.field2);
                        
                        if (spot1State !== prevSpot1State && !lastSpot1Change) {
                            lastSpot1Change = feed.created_at;
                        }
                        if (spot2State !== prevSpot2State && !lastSpot2Change) {
                            lastSpot2Change = feed.created_at;
                        }
                        
                        // If we found both changes, we can stop
                        if (lastSpot1Change && lastSpot2Change) break;
                        
                        prevSpot1State = spot1State;
                        prevSpot2State = spot2State;
                    }
                    
                    // Store the change times
                    lastChangeTimes[`${channelNum}-1`] = lastSpot1Change;
                    lastChangeTimes[`${channelNum}-2`] = lastSpot2Change;
                    
                    // Update last change times with IST time
                    updateTimeDisplay(`spot-${channelNum}-1-last-change`, lastSpot1Change);
                    updateTimeDisplay(`spot-${channelNum}-2-last-change`, lastSpot2Change);
                }
                return historicalData;
            }).catch(error => {
                console.error(`Error fetching historical data for channel ${index + 1}:`, error);
                return null;
            });
        });

        // Execute all promises in parallel
        Promise.all([...currentDataPromises, ...historicalDataPromises])
            .then(() => {
                // All data has been fetched and processed
                console.log("All parking data updated successfully");
            })
            .catch(error => {
                console.error("Error updating parking data:", error);
            });
    }

    // Helper function to update time display
    function updateTimeDisplay(elementId, timestamp) {
        if (timestamp) {
            const time = moment(timestamp).utcOffset('+05:30'); // Set to IST
            const timeStr = time.format('h:mm A');
            const dateStr = time.format('D MMM YYYY');
            document.getElementById(elementId).textContent = `${timeStr} ${dateStr}`;
        } else {
            document.getElementById(elementId).textContent = 'No changes yet';
        }
    }

    // Update spots initially and set interval
    updateParkingSpots();
    setInterval(updateParkingSpots, UPDATE_INTERVAL);

    // Handle refresh button click
    document.querySelector('.premium-btn').addEventListener('click', () => {
        updateParkingSpots();
    });
});