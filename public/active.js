const timerIntervals = {};

// Pagination variables
let currentPage = 1;
const rowsPerPage = 7;
let totalPages = 1;
let autoRotationInterval = null;
let tvPaginationFrequency = 5; // Default value, will be loaded from settings
let tvShowUnlimitedPassTypes = true; // Toggle to show/hide unlimited pass types on TV
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

// Auto-adjust font size to fit content without scrolling
function adjustCustomMessageFontSize(element) {
  if (!element || !element.textContent.trim()) return;
  
  // Start with maximum font size
  let fontSize = 80;
  const minFontSize = 20;
  const step = 2;
  
  // Reset to initial large size
  element.style.fontSize = fontSize + 'px';
  
  // Check if content overflows and reduce font size until it fits
  while (fontSize > minFontSize && element.scrollHeight > element.clientHeight) {
    fontSize -= step;
    element.style.fontSize = fontSize + 'px';
  }
  
  // If still overflowing at minimum size, allow scroll as last resort
  if (element.scrollHeight > element.clientHeight) {
    element.style.overflow = 'auto';
  } else {
    element.style.overflow = 'hidden';
  }
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
  const totalDuration = (durationMinutes + 1) * 60 * 1000; // Add 1 minute prep time
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
  const tableContent = document.getElementById('tableContent');

  // Hide table content during update to prevent visible flash
  if (tableContent) {
    tableContent.classList.add('is-updating');
  }

  tbody.innerHTML = '';

  // Filter out unlimited pass types if the toggle is off
  if (!tvShowUnlimitedPassTypes) {
    children = children.filter(child => child.duration !== 'unlimited');
  }

  if (!children || children.length === 0) {
    // If custom message is enabled and not empty, show it instead of empty table
    if (tvCustomMessageEnabled && tvCustomMessage.trim()) {
      noMsg.classList.add('is-hidden');
      if (sectionTitle) sectionTitle.classList.add('is-hidden');
      if (pageIndicator) pageIndicator.classList.add('is-hidden');
      if (tableContent) {
        tableContent.classList.remove('is-updating');
      }
      customMessagePage.innerHTML = tvCustomMessage;
      customMessagePage.classList.add('show');
      adjustCustomMessageFontSize(customMessagePage);
      stopAutoRotation();
      return;
    }
    
    noMsg.classList.remove('is-hidden');
    customMessagePage.classList.remove('show');
    if (sectionTitle) sectionTitle.classList.remove('is-hidden');
    if (tableContent) {
      tableContent.classList.remove('is-updating');
    }
    updatePageIndicator(0, 0);
    stopAutoRotation();
    return;
  }

  noMsg.classList.add('is-hidden');
  customMessagePage.classList.remove('show');
  if (sectionTitle) sectionTitle.classList.remove('is-hidden');

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
  
  // Restore table visibility after update is complete
  if (tableContent) {
    tableContent.classList.remove('is-updating');
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
        tableContent.classList.add('is-hidden');
      }
      if (sectionTitle) {
        sectionTitle.classList.add('is-hidden');
      }
      if (pageIndicator) {
        pageIndicator.classList.add('is-hidden');
      }
      if (customMessagePage) {
        customMessagePage.innerHTML = tvCustomMessage;
        customMessagePage.classList.add('show');
        customMessagePage.classList.remove('fade-out');
        customMessagePage.classList.add('fade-in');
        adjustCustomMessageFontSize(customMessagePage);
      }
    } else {
      // Show table page
      if (customMessagePage) {
        customMessagePage.classList.remove('show');
      }
      if (sectionTitle) {
        sectionTitle.classList.remove('is-hidden');
      }
      if (tableContent) {
        tableContent.classList.remove('is-hidden');
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
      indicator.classList.add('is-hidden');
    } else {
      indicator.classList.remove('is-hidden');
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
    if (settings.tvShowUnlimitedPassTypes !== undefined) {
      tvShowUnlimitedPassTypes = settings.tvShowUnlimitedPassTypes;
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

// Re-adjust custom message font size on window resize
window.addEventListener('resize', () => {
  const customMessagePage = document.getElementById('customMessagePage');
  if (customMessagePage && customMessagePage.classList.contains('show')) {
    adjustCustomMessageFontSize(customMessagePage);
  }
});
