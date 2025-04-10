// Add search highlight styles
const style = document.createElement('style');
style.textContent = `
    .search-highlight {
        animation: highlight 2s;
    }
    @keyframes highlight {
        0% { background-color: rgba(66, 112, 244, 0.2); }
        70% { background-color: rgba(66, 112, 244, 0.2); }
        100% { background-color: transparent; }
    }
    .search-match {
        background-color: rgba(66, 112, 244, 0.1);
        border-radius: 2px;
    }
`;
document.head.appendChild(style);

// Global search functionality
document.addEventListener('DOMContentLoaded', () => {
    const searchForm = document.getElementById('search-form');
    const searchInput = document.getElementById('query');

    if (searchForm && searchInput) {
        // Live search functionality
        searchInput.addEventListener('input', handleSearch);
        
        // Form submit
        searchForm.addEventListener('submit', (e) => {
            e.preventDefault();
            handleSearch();
        });
    }
});

function handleSearch() {
    const query = document.getElementById('query').value.toLowerCase().trim();
    if (!query) {
        clearSearchHighlights();
        return;
    }

    // Search in all content
    const searchableElements = [
        ...document.querySelectorAll('h1, h2, h3, h4, p, td, th, div:not(.sidebar):not(.main-content), span'),
        ...document.querySelectorAll('[data-searchable]')
    ];

    let found = false;
    let firstMatch = null;

    // Clear previous highlights
    clearSearchHighlights();

    // Search through elements
    searchableElements.forEach(element => {
        // Skip if element is not visible or is a script/style tag
        if (!isElementVisible(element) || 
            element.tagName === 'SCRIPT' || 
            element.tagName === 'STYLE' || 
            !element.textContent.trim()) {
            return;
        }

        const content = element.textContent.toLowerCase();
        if (content.includes(query)) {
            found = true;
            if (!firstMatch) firstMatch = element;

            // Highlight matching text
            const regex = new RegExp(query, 'gi');
            element.innerHTML = element.textContent.replace(regex, match => 
                `<span class="search-match">${match}</span>`
            );
        }
    });

    // If query matches a page title/section, suggest navigation
    const pageMatches = {
        'home': 'main_page.html',
        'dashboard': 'main_page.html',
        'parking': 'parking_spaces.html',
        'spaces': 'parking_spaces.html',
        'insights': 'insights.html',
        'statistics': 'insights.html',
        'settings': 'preferences.html',
        'preferences': 'preferences.html',
        'configuration': 'preferences.html'
    };

    if (!found) {
        for (const [key, url] of Object.entries(pageMatches)) {
            if (key.includes(query)) {
                if (confirm(`Would you like to navigate to the ${key} page?`)) {
                    window.location.href = url;
                }
                return;
            }
        }
    } else if (firstMatch) {
        // Scroll to first match
        firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
        firstMatch.classList.add('search-highlight');
    }
}

function clearSearchHighlights() {
    // Remove all search highlights
    document.querySelectorAll('.search-highlight').forEach(el => 
        el.classList.remove('search-highlight')
    );
    
    // Remove all search matches and restore original content
    document.querySelectorAll('.search-match').forEach(el => {
        const parent = el.parentNode;
        if (parent) {
            parent.textContent = parent.textContent;
        }
    });
}

function isElementVisible(element) {
    return element.offsetParent !== null && 
           !element.hidden && 
           getComputedStyle(element).visibility !== 'hidden' &&
           getComputedStyle(element).display !== 'none';
}
