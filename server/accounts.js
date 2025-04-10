document.addEventListener('DOMContentLoaded', () => {
    // Fetch and display user name
    fetch('/api/user')
        .then(response => response.json())
        .then(data => document.getElementById('user-name').textContent = data.name || 'Admin')
        .catch(() => document.getElementById('user-name').textContent = 'Admin');

    // Handle new car entry/exit
    document.getElementById('car-entry-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const entry = {
            licensePlate: document.getElementById('license-plate').value,
            entryTime: document fisca.getElementById('entry-time').value || null,
            exitTime: document.getElementById('exit-time').value || null
        };
        fetch('/api/car-entry', { method: 'POST', body: JSON.stringify(entry), headers: { 'Content-Type': 'application/json' } })
            .then(() => loadCarData())
            .catch(console.error);
    });

    // Handle total cars entered
    document.getElementById('total-cars-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const total = {
            count: document.getElementById('total-cars').value,
            day: document.getElementById('day').value
        };
        fetch('/api/total-cars', { method: 'POST', body: JSON.stringify(total), headers: { 'Content-Type': 'application/json' } })
            .then(() => console.log('Total cars updated'))
            .catch(console.error);
    });

    // Load and display car data
    function loadCarData() {
        fetch('/api/car-entries')
            .then(response => response.json())
            .then(data => {
                const container = document.getElementById('car-data');
                container.innerHTML = '<h3 class="section-title">Car Entries</h3>';
                data.forEach(entry => {
                    const div = document.createElement('div');
                    div.className = 'transaction-item';
                    div.innerHTML = `
                        <div class="transaction-content">
                            <div class="transaction-title">${entry.licensePlate}</div>
                            <div class="transaction-time">${entry.entryTime || 'No entry'} - ${entry.exitTime || 'No exit'}</div>
                        </div>
                        <button onclick="deleteEntry('${entry.id}')">Delete</button>
                    `;
                    container.appendChild(div);
                });
            });
    }

    // Delete entry
    window.deleteEntry = (id) => {
        fetch(`/api/car-entry/${id}`, { method: 'DELETE' })
            .then(() => loadCarData())
            .catch(console.error);
    };

    loadCarData();
});