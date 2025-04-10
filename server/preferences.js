document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('preferences-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const preferences = {
            totalSpots: document.getElementById('total-spots').value,
            sections: document.getElementById('sections').value.split(',').map(s => s.trim())
        };
        fetch('/api/preferences', { method: 'POST', body: JSON.stringify(preferences), headers: { 'Content-Type': 'application/json' } })
            .then(() => alert('Preferences saved'))
            .catch(console.error);
    });
});