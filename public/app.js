const REFRESH_INTERVAL = 30000; // 30 seconds

let lastUpdatedAt = null;
let lastDataFingerprint = null;
let lastDisplayedMinute = null;

// Line groups in display order
const LINE_GROUPS = [
  ['A', 'C'],
  ['B', 'D'],
  ['1']
];

const TRAINS_PER_GROUP = 3;
const MIN_MINUTES_AWAY = 4;

function getLineGroup(line) {
  for (let i = 0; i < LINE_GROUPS.length; i++) {
    if (LINE_GROUPS[i].includes(line)) {
      return i;
    }
  }
  return 999;
}

function groupAndLimitArrivals(arrivals) {
  // Group arrivals by line group
  const groups = LINE_GROUPS.map(() => []);

  for (const arrival of arrivals) {
    const groupIndex = getLineGroup(arrival.line);
    if (groupIndex < groups.length) {
      groups[groupIndex].push(arrival);
    }
  }

  // Sort each group by arrival time and take only first N
  const result = [];
  for (const group of groups) {
    group.sort((a, b) => a.arrivalTime - b.arrivalTime);
    result.push(...group.slice(0, TRAINS_PER_GROUP));
  }

  return result;
}

async function fetchArrivals() {
  try {
    const response = await fetch('/api/arrivals');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    renderArrivals(data);
  } catch (error) {
    console.error('Failed to fetch arrivals:', error);
    renderError(error.message);
  }
}

function formatTime(minutes) {
  if (minutes <= 0) {
    return 'Now';
  } else if (minutes === 1) {
    return '1 min';
  } else {
    return `${minutes} min`;
  }
}

function updateCurrentTime() {
  const now = new Date();
  const currentMinute = now.getHours() * 60 + now.getMinutes();

  if (currentMinute === lastDisplayedMinute) {
    return;
  }
  lastDisplayedMinute = currentMinute;

  const el = document.getElementById('currentTime');
  el.textContent = `It's now ${now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

function updateLastUpdated() {
  const el = document.getElementById('updateTime');
  if (!lastUpdatedAt) {
    el.textContent = 'Loading...';
    return;
  }
  const time = new Date(lastUpdatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  el.textContent = `Last updated ${time}`;
}

function renderDirectionSection(title, arrivals) {
  let html = '<div class="direction-section">';
  html += `<div class="direction-header">${title}</div>`;
  html += '<div class="arrival-list">';

  const filtered = arrivals.filter(a => a.minutesAway >= MIN_MINUTES_AWAY);
  const limited = groupAndLimitArrivals(filtered);

  if (limited.length === 0) {
    html += '<div class="no-arrivals">No upcoming arrivals</div>';
  } else {
    for (const arrival of limited) {
      const isArriving = arrival.minutesAway <= 1;
      html += `
        <div class="arrival-item">
          <div class="line-badge line-${arrival.line}">${arrival.line}</div>
          <div class="direction-label">${title}</div>
          <div class="arrival-time ${isArriving ? 'arriving' : ''}">
            ${formatTime(arrival.minutesAway)}
          </div>
        </div>
      `;
    }
  }

  html += '</div></div>';
  return html;
}

function getDataFingerprint(data) {
  // Create a fingerprint based on train lines and arrival times
  const trains = [...data.arrivals.downtown, ...data.arrivals.uptown];
  return trains.map(t => `${t.line}-${t.arrivalTime}`).join('|');
}

function renderArrivals(data) {
  const container = document.getElementById('arrivals');

  // Check if data has changed
  const fingerprint = getDataFingerprint(data);
  if (fingerprint === lastDataFingerprint) {
    // Data unchanged, skip re-render
    return;
  }
  lastDataFingerprint = fingerprint;

  // Update timestamp only when data changes
  lastUpdatedAt = Date.now();
  updateLastUpdated();

  let html = '';

  // Downtown first, then Uptown
  html += renderDirectionSection('Downtown', data.arrivals.downtown);
  html += renderDirectionSection('Uptown', data.arrivals.uptown);

  container.innerHTML = html;
}

function renderError(message) {
  const container = document.getElementById('arrivals');
  container.innerHTML = `
    <div class="error">
      <p>Failed to load arrivals</p>
      <p style="font-size: 0.85rem; color: #888; margin-top: 8px;">${message}</p>
    </div>
  `;
}

// Update current time immediately and every second
updateCurrentTime();
updateLastUpdated();
setInterval(updateCurrentTime, 1000);

// Initial fetch
fetchArrivals();

// Refresh every 30 seconds
setInterval(fetchArrivals, REFRESH_INTERVAL);
