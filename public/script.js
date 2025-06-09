// public/script.js
// credits @sinontop | Channel: @mksln

// api
const API_URL = '/api/v1/stock';

// elements
const stockContainer = document.getElementById('stock-container');
const navTabsContainer = document.getElementById('nav-tabs-container');
const refreshButton = document.getElementById('refresh-button');

// state
let refreshInterval;
let countdownIntervals = [];
let currentCategoryFilter = 'all';

// colors (timer)
const categoryTimerColors = {
    cosmetics_stock: { timerBg: '#6a0dad', timerText: '#f8c0ff' },
    egg_stock: { timerBg: '#e67e22', timerText: '#ffe8cc' },
    gear_stock: { timerBg: '#546e7a', timerText: '#eceff1' },
    honey_stock: { timerBg: '#0077c2', timerText: '#e0f7fa' },
    seeds_stock: { timerBg: '#27ae60', timerText: '#d0f0c0' },
    default: { timerBg: '#4a235a', timerText: '#f5eef8' }
};

// format (time)
function formatDisplayTime(hours, minutes, seconds) {
    return `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
}

// start (countdown)
function startDisplayCountdown(element, initialHours, initialMinutes, initialSeconds) {
    let totalSeconds = initialHours * 3600 + initialMinutes * 60 + initialSeconds;

    const updateDisplay = () => {
        if (totalSeconds <= 0) {
            element.innerHTML = `<span class="label">UPDATING...</span>${formatDisplayTime(0,0,0)}`;
            clearInterval(intervalId);
            return;
        }
        let h = Math.floor(totalSeconds / 3600);
        let m = Math.floor((totalSeconds % 3600) / 60);
        let s = totalSeconds % 60;
        element.innerHTML = `<span class="label">NEXT UPDATE</span>${formatDisplayTime(h, m, s)}`;
        totalSeconds--;
    };
    updateDisplay();
    const intervalId = setInterval(updateDisplay, 1000);
    countdownIntervals.push(intervalId);
}

// clear (countdowns)
function clearDisplayCountdowns() {
    countdownIntervals.forEach(clearInterval);
    countdownIntervals = [];
}

// render (stock)
function renderStockDisplay(data) {
    clearDisplayCountdowns();
    stockContainer.innerHTML = '';
    const existingTabs = navTabsContainer.querySelectorAll('button:not([data-category="all"])');
    existingTabs.forEach(tab => tab.remove());
    const categories = Object.keys(data);

    categories.forEach(categoryKey => {
        const categoryData = data[categoryKey];
        const normalizedCategoryKey = categoryKey.toLowerCase();
        const timerStyle = categoryTimerColors[normalizedCategoryKey] || categoryTimerColors.default;

        if (!navTabsContainer.querySelector(`button[data-category="${categoryKey}"]`)) {
            const tabButton = document.createElement('button');
            tabButton.textContent = categoryData.name.replace(/ STOCK$/i, '');
            tabButton.dataset.category = categoryKey;
            navTabsContainer.appendChild(tabButton);
        }
        const categoryDiv = document.createElement('div');
        categoryDiv.className = `stock-category ${categoryKey}`;
        categoryDiv.dataset.categoryKey = categoryKey;

        categoryDiv.innerHTML = `
            <div class="category-header">
                <span class="icon"></span>
                <h2>${categoryData.name.toUpperCase()}</h2>
            </div>
            <div class="next-update-timer" id="timer-${categoryKey}" style="background-color: ${timerStyle.timerBg}; color: ${timerStyle.timerText};">
                Loading...
            </div>
            <ul class="item-list">
                ${categoryData.items.map(item => `
                    <li>
                        <span class="item-name">${item.name}</span>
                        <span class="item-quantity">x${item.quantity}</span>
                    </li>
                `).join('')}
                ${categoryData.items.length === 0 ? '<li>No items listed.</li>' : ''}
            </ul>
        `;
        stockContainer.appendChild(categoryDiv);
        if (categoryData.countdown) {
            startDisplayCountdown(
                document.getElementById(`timer-${categoryKey}`),
                categoryData.countdown.hours,
                categoryData.countdown.minutes,
                categoryData.countdown.seconds
            );
        } else {
            document.getElementById(`timer-${categoryKey}`).innerHTML = `<span class="label">NO TIMER</span>--h --m --s`;
        }
    });
    updateActiveTabDisplay();
    filterCategoriesDisplay();
}

// filter (categories)
function filterCategoriesDisplay() {
    const allCategoryDivs = stockContainer.querySelectorAll('.stock-category');
    allCategoryDivs.forEach(div => {
        if (currentCategoryFilter === 'all' || div.dataset.categoryKey === currentCategoryFilter) {
            div.style.display = 'block';
        } else {
            div.style.display = 'none';
        }
    });
}

// update (active tab)
function updateActiveTabDisplay() {
    const allTabs = navTabsContainer.querySelectorAll('button');
    allTabs.forEach(tab => {
        if (tab.dataset.category === currentCategoryFilter) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });
}

// fetch (stock data)
async function fetchStockDataForDisplay() {
    stockContainer.innerHTML = '<div class="loading">Fetching latest stock...</div>';
    try {
        const response = await fetch(API_URL);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Failed to parse error from server.'}));
            throw new Error(`API Error: ${response.status} - ${errorData.message || response.statusText}`);
        }
        const data = await response.json();
        renderStockDisplay(data);
    } catch (error) {
        console.error('Fetch error for display:', error);
        stockContainer.innerHTML = `<div class="error">Failed to load stock. ${error.message}</div>`;
    }
}

// events
navTabsContainer.addEventListener('click', (event) => {
    if (event.target.tagName === 'BUTTON') {
        currentCategoryFilter = event.target.dataset.category;
        updateActiveTabDisplay();
        filterCategoriesDisplay();
    }
});
refreshButton.addEventListener('click', fetchStockDataForDisplay);

// initial
fetchStockDataForDisplay();
if (refreshInterval) clearInterval(refreshInterval);
refreshInterval = setInterval(fetchStockDataForDisplay, 60000);

// === WEATHER FETCH ===
async function fetchWeather() {
    try {
        const res = await fetch('/api/v1/weather');
        const data = await res.json();
        const weatherList = document.getElementById('weather-list');
        weatherList.innerHTML = '';

        const iconMap = {
            frost: '🧊',
            meteorshower: '🌠',
            rain: '🌧️',
            snow: '❄️',
            thunderstorm: '⛈️'
        };

        for (const [type, info] of Object.entries(data)) {
            const li = document.createElement('li');
            const icon = iconMap[type] || '';
            const status = info.active ? 'Active' : 'Inactive';
            const time = new Date(info.timestamp).toLocaleTimeString();
            li.textContent = `${icon} ${type.charAt(0).toUpperCase() + type.slice(1)}: ${status} (updated ${time})`;
            weatherList.appendChild(li);
        }
    } catch (e) {
        document.getElementById('weather-list').innerHTML = '<li>Failed to load weather</li>';
    }
}
fetchWeather();
setInterval(fetchWeather, 60000);
