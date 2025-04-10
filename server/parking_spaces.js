// ThingSpeak Configuration
const CHANNEL_ID = '2913587';
const API_KEY = '5ZM4WBVZVHIBWB6B';
const UPDATE_INTERVAL = 2000; // Update every 2 seconds

document.addEventListener('DOMContentLoaded', () => {
    function updateParkingSpots() {
        $.getJSON(`https://api.thingspeak.com/channels/${CHANNEL_ID}/feeds/last.json?api_key=${API_KEY}`, function(data) {
            if (data) {
                // Update Spot 1
                const spot1Occupied = parseInt(data.field1) === 1;
                const spot1 = document.getElementById('spot-1');
                const spot1Status = document.getElementById('spot-1-status');
                spot1.className = 'parking-spot ' + (spot1Occupied ? 'occupied' : 'available');
                spot1Status.textContent = spot1Occupied ? 'OCCUPIED' : 'FREE';

                // Update Spot 2
                const spot2Occupied = parseInt(data.field2) === 1;
                const spot2 = document.getElementById('spot-2');
                const spot2Status = document.getElementById('spot-2-status');
                spot2.className = 'parking-spot ' + (spot2Occupied ? 'occupied' : 'available');
                spot2Status.textContent = spot2Occupied ? 'OCCUPIED' : 'FREE';

                // Get last state change times
                $.getJSON(`https://api.thingspeak.com/channels/${CHANNEL_ID}/feeds.json?api_key=${API_KEY}&results=100`, function(historicalData) {
                    if (historicalData && historicalData.feeds && historicalData.feeds.length > 0) {
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

                        // Update last change times with IST time
                        const updateTime = (elementId, timestamp) => {
                            if (timestamp) {
                                const time = moment(timestamp).utcOffset('+05:30'); // Set to IST
                                const timeStr = time.format('h:mm A');
                                const dateStr = time.format('D MMM YYYY');
                                document.getElementById(elementId).textContent = `${timeStr} ${dateStr}`;
                            } else {
                                document.getElementById(elementId).textContent = 'No changes yet';
                            }
                        };

                        updateTime('spot-1-last-change', lastSpot1Change);
                        updateTime('spot-2-last-change', lastSpot2Change);
                    }
                });
            }
        });
    }

    // Update spots initially and set interval
    updateParkingSpots();
    setInterval(updateParkingSpots, UPDATE_INTERVAL);

    // Handle refresh button click
    document.querySelector('.premium-btn').addEventListener('click', updateParkingSpots);
});