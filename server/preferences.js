// Store parking lots data in localStorage
let parkingLots = JSON.parse(localStorage.getItem('parkingLots')) || [];

function saveParkingLots() {
    localStorage.setItem('parkingLots', JSON.stringify(parkingLots));
}

function updateParkingLotsList() {
    const listContainer = document.getElementById('parking-lots-list');
    const lotSelect = document.getElementById('lot-select');
    
    // Clear existing content
    listContainer.innerHTML = '';
    lotSelect.innerHTML = '<option value="">Select a parking lot</option>';
    
    parkingLots.forEach((lot, index) => {
        // Create lot display card
        const lotCard = document.createElement('div');
        lotCard.className = 'lot-card';
        lotCard.innerHTML = `
            <h3>${lot.name}</h3>
            <p>Total Spots: ${lot.totalSpots}</p>
            <div class="sections-list">
                <h4>Sections:</h4>
                ${lot.sections.map(section => `
                    <div class="section-item">
                        <span>${section.name} (${section.spots} spots)</span>
                        <button class="delete-btn" data-lot="${index}" data-section="${section.name}">Delete</button>
                    </div>
                `).join('')}
            </div>
            <button class="delete-btn" data-lot="${index}">Delete Lot</button>
        `;
        listContainer.appendChild(lotCard);
        
        // Add to select dropdown
        const option = document.createElement('option');
        option.value = index;
        option.textContent = lot.name;
        lotSelect.appendChild(option);
    });
    
    // Add event listeners for delete buttons
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const lotIndex = parseInt(e.target.dataset.lot);
            const sectionName = e.target.dataset.section;
            
            if (sectionName) {
                // Delete section
                parkingLots[lotIndex].sections = parkingLots[lotIndex].sections.filter(s => s.name !== sectionName);
            } else {
                // Delete entire lot
                parkingLots.splice(lotIndex, 1);
            }
            
            saveParkingLots();
            updateParkingLotsList();
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    // Initialize the display
    updateParkingLotsList();
    
    // Handle parking lot form submission
    document.getElementById('parking-lots-form').addEventListener('submit', (e) => {
        e.preventDefault();
        
        const name = document.getElementById('lot-name').value;
        const totalSpots = parseInt(document.getElementById('total-spots').value);
        
        parkingLots.push({
            name,
            totalSpots,
            sections: []
        });
        
        saveParkingLots();
        updateParkingLotsList();
        e.target.reset();
    });
    
    // Handle sections form submission
    document.getElementById('sections-form').addEventListener('submit', (e) => {
        e.preventDefault();
        
        const lotIndex = document.getElementById('lot-select').value;
        const sectionName = document.getElementById('section-name').value;
        const sectionSpots = parseInt(document.getElementById('section-spots').value);
        
        if (lotIndex === '') {
            alert('Please select a parking lot');
            return;
        }
        
        const lot = parkingLots[lotIndex];
        const totalSectionSpots = lot.sections.reduce((sum, section) => sum + section.spots, 0) + sectionSpots;
        
        if (totalSectionSpots > lot.totalSpots) {
            alert(`Cannot add section. Total section spots (${totalSectionSpots}) would exceed lot capacity (${lot.totalSpots}).`);
            return;
        }
        
        if (lot.sections.some(s => s.name === sectionName)) {
            alert('A section with this name already exists in the selected lot.');
            return;
        }
        
        lot.sections.push({
            name: sectionName,
            spots: sectionSpots
        });
        
        saveParkingLots();
        updateParkingLotsList();
        e.target.reset();
    });
});