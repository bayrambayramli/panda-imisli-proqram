const timerIntervals = {};

// Pagination variables
let currentPage = 1;
const rowsPerPage = 8;
let totalPages = 1;
let autoRotationInterval = null;
let tvPaginationFrequency = 5; // Default value, will be loaded from settings
let tvCustomMessage = ''; // Custom message for last page
let tvCustomMessageEnabled = false; // Toggle for custom message display

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
  const customMessagePage = document.getElementById('customMessagePage');
  const sectionTitle = document.querySelector('.section h2');
  const pageIndicator = document.getElementById('pageIndicator');

  tbody.innerHTML = '';

  if (!children || children.length === 0) {
    // If custom message is enabled and not empty, show it instead of empty table
    if (tvCustomMessageEnabled && tvCustomMessage.trim()) {
      noMsg.style.display = 'none';
      if (sectionTitle) sectionTitle.style.display = 'none';
      if (pageIndicator) pageIndicator.style.display = 'none';
      customMessagePage.innerHTML = tvCustomMessage;
      customMessagePage.style.display = 'flex';
      customMessagePage.classList.remove('page-hidden');
      stopAutoRotation();
      return;
    }
    
    noMsg.style.display = 'block';
    customMessagePage.style.display = 'none';
    if (sectionTitle) sectionTitle.style.display = 'block';
    updatePageIndicator(0, 0);
    stopAutoRotation();
    return;
  }

  noMsg.style.display = 'none';
  customMessagePage.style.display = 'none';
  if (sectionTitle) sectionTitle.style.display = 'block';

  // Calculate total pages (add 1 if custom message is enabled and set)
  const dataPagesCount = Math.ceil(children.length / rowsPerPage);
  const newTotalPages = (tvCustomMessageEnabled && tvCustomMessage.trim()) ? dataPagesCount + 1 : dataPagesCount;
  
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

// Switch to a specific page with smooth animation
function switchToPage(pageNum) {
  const tableContent = document.getElementById('tableContent');
  const customMessagePage = document.getElementById('customMessagePage');
  const rows = document.querySelectorAll('#activeOnlyTableBody tr');
  
  // Determine if this is the custom message page
  const dataPagesCount = Math.ceil(rows.length / rowsPerPage);
  const isCustomMessagePage = (tvCustomMessageEnabled && tvCustomMessage.trim()) && pageNum > dataPagesCount;
  
  // Add animation class to trigger fade out
  if (tableContent) {
    tableContent.classList.remove('fade-in');
    tableContent.classList.add('fade-out');
  }
  if (customMessagePage) {
    customMessagePage.classList.remove('fade-in');
    customMessagePage.classList.add('fade-out');
  }
  
  // Wait for fade out animation to complete, then switch content and fade in
  setTimeout(() => {
    const sectionTitle = document.querySelector('.section h2');
    const pageIndicator = document.getElementById('pageIndicator');
    
    if (isCustomMessagePage) {
      // Show custom message page
      if (tableContent) {
        tableContent.style.display = 'none';
      }
      if (sectionTitle) {
        sectionTitle.style.display = 'none';
      }
      if (pageIndicator) {
        pageIndicator.style.display = 'none';
      }
      if (customMessagePage) {
        customMessagePage.innerHTML = tvCustomMessage;
        customMessagePage.style.display = 'flex';
        customMessagePage.classList.remove('fade-out');
        customMessagePage.classList.add('fade-in');
      }
    } else {
      // Show table page
      if (customMessagePage) {
        customMessagePage.style.display = 'none';
      }
      if (sectionTitle) {
        sectionTitle.style.display = 'block';
      }
      if (tableContent) {
        tableContent.style.display = 'block';
      }
      
      rows.forEach(row => {
        const rowPage = parseInt(row.getAttribute('data-page'));
        if (rowPage === pageNum) {
          row.classList.remove('page-hidden');
        } else {
          row.classList.add('page-hidden');
        }
      });
      
      // Trigger fade in animation
      if (tableContent) {
        tableContent.classList.remove('fade-out');
        tableContent.classList.add('fade-in');
      }
      
      updatePageIndicator(pageNum, totalPages);
    }
  }, 250); // Half of animation duration
}

// Update page indicator
function updatePageIndicator(current, total) {
  const indicator = document.getElementById('pageIndicator');
  if (indicator) {
    // Calculate actual data pages (excluding custom message page)
    const rows = document.querySelectorAll('#activeOnlyTableBody tr');
    const dataPagesCount = Math.ceil(rows.length / rowsPerPage);
    
    // Only show indicator if there are multiple data pages
    if (dataPagesCount <= 1) {
      indicator.style.display = 'none';
    } else {
      indicator.style.display = 'block';
      // Show only data pages count, not including custom message page
      indicator.textContent = `Səhifə ${current} / ${dataPagesCount}`;
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
  }, tvPaginationFrequency * 1000); // Use frequency from settings
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
    // Reload settings to pick up any changes (including custom message)
    await loadSettings();
    
    const date = getTodayDate();
    const response = await fetch(`/api/data/${date}`);
    const data = await response.json();
    renderActiveSessions(data.active || []);
  } catch (error) {
    console.error('Error loading active sessions:', error);
  }
}

// Load settings and start the app
async function loadSettings() {
  try {
    const response = await fetch('/api/settings');
    const settings = await response.json();
    if (settings.tvPaginationFrequency) {
      tvPaginationFrequency = settings.tvPaginationFrequency;
    }
    if (settings.tvCustomMessage) {
      tvCustomMessage = settings.tvCustomMessage;
    }
    if (settings.tvCustomMessageEnabled !== undefined) {
      tvCustomMessageEnabled = settings.tvCustomMessageEnabled;
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

// Initialize app
loadSettings().then(() => {
  loadActiveSessions();
  setInterval(loadActiveSessions, 30000);
});
