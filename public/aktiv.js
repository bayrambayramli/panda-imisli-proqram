const timerIntervals = {};

// Pagination variables
let currentPage = 1;
const rowsPerPage = 8;
let totalPages = 1;
let autoRotationInterval = null;

function getTodayDate() {
  const today = new Date();
  return today.toISOString().split('T')[0];
}

function formatTime(isoString) {
  if (!isoString) return '-';
  return new Date(isoString).toLocaleTimeString('az-AZ', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function updateTimer(childId, durationValue, startTimeISO) {
  const timerEl = document.getElementById(`timer-${childId}`);
  const timerCellEl = document.getElementById(`timer-cell-${childId}`);
  if (!timerEl) return;

  if (durationValue === 'unlimited') {
    timerEl.textContent = 'Limitsiz';
    timerEl.classList.remove('warning', 'danger');
    if (timerCellEl) {
      timerCellEl.classList.remove('timer-yellow', 'timer-red');
      timerCellEl.classList.add('timer-green');
    }
    return;
  }

  const durationMinutes = parseInt(durationValue) || 0;
  const totalDuration = durationMinutes * 60 * 1000;
  const startMs = startTimeISO ? new Date(startTimeISO).getTime() : Date.now();
  const endTime = startMs + totalDuration;
  const remaining = Math.max(0, endTime - Date.now());
  const minutes = Math.floor(remaining / 60000);

  if (minutes === 0) {
    timerEl.textContent = '0 dəq';
  } else {
    timerEl.textContent = `${minutes} dəq`;
  }

  timerEl.classList.remove('warning', 'danger');

  if (timerCellEl) {
    timerCellEl.classList.remove('timer-green', 'timer-yellow', 'timer-red');

    if (minutes === 0) {
      timerCellEl.classList.add('timer-red');
      timerEl.classList.add('danger');
      timerEl.textContent = 'VAXT BİTDİ!';
    } else if (minutes > 15) {
      timerCellEl.classList.add('timer-green');
    } else {
      timerCellEl.classList.add('timer-yellow');
    }
  }
}

function startTimer(child) {
  updateTimer(child.id, child.duration, child.startTime);

  if (timerIntervals[child.id]) {
    clearInterval(timerIntervals[child.id]);
  }

  timerIntervals[child.id] = setInterval(() => {
    updateTimer(child.id, child.duration, child.startTime);
  }, 60000);
}

function renderActiveSessions(children) {
  const tbody = document.getElementById('activeOnlyTableBody');
  const noMsg = document.getElementById('noActiveOnlyMsg');

  tbody.innerHTML = '';

  if (!children || children.length === 0) {
    noMsg.style.display = 'block';
    updatePageIndicator(0, 0);
    stopAutoRotation();
    return;
  }

  noMsg.style.display = 'none';

  // Calculate total pages
  const newTotalPages = Math.ceil(children.length / rowsPerPage);
  
  children.forEach((child, index) => {
    const row = document.createElement('tr');
    const startTimeStr = formatTime(child.startTime);
    
    // Calculate which page this row belongs to (1-indexed)
    const pageNumber = Math.floor(index / rowsPerPage) + 1;
    row.setAttribute('data-page', pageNumber);

    row.innerHTML = `
      <td>${child.name}</td>
      <td>${child.age}</td>
      <td>${child.playZone}</td>
      <td>${startTimeStr}</td>
      <td id="timer-cell-${child.id}" class="timer-cell"><span id="timer-${child.id}" class="timer">--:--</span></td>
    `;

    tbody.appendChild(row);
    startTimer(child);
  });
  
  // Preserve current page if possible, otherwise reset to 1
  if (currentPage > newTotalPages) {
    currentPage = 1;
  }
  
  // Update totalPages
  const pagesChanged = totalPages !== newTotalPages;
  totalPages = newTotalPages;
  
  // Switch to current page and restart rotation only if pages changed
  switchToPage(currentPage);
  if (pagesChanged || !autoRotationInterval) {
    startAutoRotation();
  }
}

// Switch to a specific page
function switchToPage(pageNum) {
  const rows = document.querySelectorAll('#activeOnlyTableBody tr');
  
  rows.forEach(row => {
    const rowPage = parseInt(row.getAttribute('data-page'));
    if (rowPage === pageNum) {
      row.classList.remove('page-hidden');
    } else {
      row.classList.add('page-hidden');
    }
  });
  
  updatePageIndicator(pageNum, totalPages);
}

// Update page indicator
function updatePageIndicator(current, total) {
  const indicator = document.getElementById('pageIndicator');
  if (indicator) {
    if (total <= 1) {
      indicator.style.display = 'none';
    } else {
      indicator.style.display = 'block';
      indicator.textContent = `Səhifə ${current} / ${total}`;
    }
  }
}

// Start auto-rotation through pages
function startAutoRotation() {
  stopAutoRotation(); // Clear any existing interval
  
  if (totalPages <= 1) {
    return; // No need to rotate if only 1 page
  }
  
  autoRotationInterval = setInterval(() => {
    currentPage++;
    if (currentPage > totalPages) {
      currentPage = 1;
    }
    switchToPage(currentPage);
  }, 5000); // 5 seconds
}

// Stop auto-rotation
function stopAutoRotation() {
  if (autoRotationInterval) {
    clearInterval(autoRotationInterval);
    autoRotationInterval = null;
  }
}

async function loadActiveSessions() {
  try {
    const date = getTodayDate();
    const response = await fetch(`/api/data/${date}`);
    const data = await response.json();
    renderActiveSessions(data.active || []);
  } catch (error) {
    console.error('Error loading active sessions:', error);
  }
}

loadActiveSessions();
setInterval(loadActiveSessions, 30000);
