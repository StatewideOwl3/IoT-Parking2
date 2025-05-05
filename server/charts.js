document.addEventListener('DOMContentLoaded', () => {
    // Select refresh buttons
    const refreshAllBtn = document.getElementById('refresh-all-charts');
    const refreshSidebarBtn = document.getElementById('refresh-charts');
    const autoRefreshBtn = document.getElementById('auto-refresh');
    const chartTypeSelect = document.getElementById('chart-type');
    const timeRangeSelect = document.getElementById('time-range');
    const resultsCountInput = document.getElementById('results-count');
    
    let autoRefreshInterval;
    let isAutoRefreshing = false;
    
    // Channel IDs and READ API keys for all 6 channels
    const channelInfo = [
        { id: 'CHANNEL_1_ID', readApiKey: 'READ_API_KEY_1' }, // Channel 1
        { id: 'CHANNEL_2_ID', readApiKey: 'READ_API_KEY_2' }, // Channel 2
        { id: 'CHANNEL_3_ID', readApiKey: 'READ_API_KEY_3' }, // Channel 3
        { id: 'CHANNEL_4_ID', readApiKey: 'READ_API_KEY_4' }, // Channel 4
        { id: 'CHANNEL_5_ID', readApiKey: 'READ_API_KEY_5' }, // Channel 5
        { id: 'CHANNEL_6_ID', readApiKey: 'READ_API_KEY_6' }  // Channel 6
    ];

    // Handle premium box refresh button click
    $('.premium-btn').click(function() {
        refreshAllCharts();
    });

    function refreshAllCharts() {
        const iframes = document.querySelectorAll('.chart-iframe');
        iframes.forEach(iframe => {
            iframe.src = iframe.src;
        });
        console.log('All charts refreshed at', new Date().toLocaleTimeString());
    }
    
    function updateAllCharts() {
        for (let channelIndex = 1; channelIndex <= 6; channelIndex++) {
            for (let fieldIndex = 1; fieldIndex <= 2; fieldIndex++) {
                const chartId = `chart-${channelIndex}-${fieldIndex}`;
                const chartIframe = document.getElementById(chartId);
                
                if (chartIframe) {
                    chartIframe.src = generateChartUrl(channelIndex, fieldIndex);
                }
            }
        }
        console.log('All charts updated at', new Date().toLocaleTimeString());
    }

    function generateChartUrl(channelIndex, fieldIndex) {
        const channel = channelInfo[channelIndex - 1];
        const channelId = channel.id;
        const readApiKey = channel.readApiKey;
        const chartType = chartTypeSelect.value;
        const resultsCount = resultsCountInput.value;
        
        // Calculate days to use in URL based on time range selected
        const hours = parseInt(timeRangeSelect.value);
        const days = Math.ceil(hours / 24);
        
        // Calculate actual spot number (1-12)
        const spotNumber = (channelIndex - 1) * 2 + fieldIndex;
        
        return `https://thingspeak.com/channels/${channelId}/charts/${fieldIndex}?api_key=${readApiKey}&bgcolor=%23ffffff&color=%23d62020&dynamic=true&results=${resultsCount}&title=Spot+${spotNumber}&type=${chartType}&days=${days}`;
    }
    
    // Event listeners for existing buttons
    refreshAllBtn.addEventListener('click', refreshAllCharts);
    refreshSidebarBtn.addEventListener('click', refreshAllCharts);
    
    // Update charts when options change
    chartTypeSelect.addEventListener('change', updateAllCharts);
    timeRangeSelect.addEventListener('change', updateAllCharts);
    resultsCountInput.addEventListener('change', updateAllCharts);
    
    // Toggle auto refresh
    autoRefreshBtn.addEventListener('click', () => {
        if (isAutoRefreshing) {
            clearInterval(autoRefreshInterval);
            autoRefreshBtn.textContent = 'Auto Refresh: OFF';
            isAutoRefreshing = false;
        } else {
            autoRefreshInterval = setInterval(refreshAllCharts, 30000);
            autoRefreshBtn.textContent = 'Auto Refresh: ON';
            isAutoRefreshing = true;
        }
    });
    
    // Initial chart update
    updateAllCharts();
});