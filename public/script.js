// Global state
let currentDate = getTodayDate();
let timerIntervals = {};
let editingChildId = null;
let editingSource = null; // 'active' or 'completed'
let settings = null; // Will be loaded from backend
let analyticsChart = null; // Will hold chart instance
let historySortBy = 'startTime'; // Default sort column
let historySortDir = 'asc'; // 'asc' or 'desc'

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
  // Load settings first
  await loadSettings();
  initializeDateDisplay();
  loadData();
  setupEventListeners();
  startAutoEndPolling();
});

// Load settings from server
async function loadSettings() {
  try {
    const response = await fetch('/api/settings');
    settings = await response.json();
    // Ensure playZones exists for backwards compatibility with old settings.json
    if (!settings.playZones) {
      settings.playZones = [];
    }
    updatePriceConfig();
  } catch (err) {
    console.error('Error loading settings:', err);
    settings = {
      passTypes: [],
      playZones: [],
      endDayHour: '22:00',
      tvPaginationFrequency: 5
    };
    updatePriceConfig();
  }
}

// Update price-related dropdowns from settings
function updatePriceConfig() {
  updateDurationDropdown();
  updatePlayZoneDropdown();
}

// Get today's date in YYYY-MM-DD format
function getTodayDate() {
  const today = new Date();
  return today.toISOString().split('T')[0];
}

// Polling for auto-end events from server
let lastAutoEndTimestamp = null;
async function startAutoEndPolling() {
  setInterval(async () => {
    try {
      const response = await fetch('/api/checkAutoEnd');
      const event = await response.json();
      
      // Check if auto-end was triggered and it's a new event
      if (event.triggered && event.timestamp !== lastAutoEndTimestamp) {
        lastAutoEndTimestamp = event.timestamp;
        
        // Show auto-end message and reload data
        await showUiAlert('Gün bitdi. Bütün seanslar sonlandırıldı.');
        loadData(); // Reload to show completed sessions
      }
    } catch (error) {
      console.error('Error checking auto-end event:', error);
    }
  }, 60000); // Check every 1 minute
}

// Initialize date display
function initializeDateDisplay() {
  const today = getTodayDate();
  const dateObj = new Date(today + 'T00:00:00');
  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const year = dateObj.getFullYear();
  const formattedDate = `${day}.${month}.${year}`;
  document.getElementById('dateDisplay').textContent = formattedDate;
  
  // Set history date picker to today
  document.getElementById('historyDate').value = today;
}

// Setup event listeners
function setupEventListeners() {
  // Add child form
  document.getElementById('addChildBtn').addEventListener('click', addChild);
  
  // History button
  document.getElementById('historyBtn').addEventListener('click', openHistoryModal);
  document.getElementById('historyCloseBtn').addEventListener('click', closeHistoryModal);
  document.getElementById('loadHistoryBtn').addEventListener('click', () => loadHistoryData(true));
  const historyNameSearch = document.getElementById('historyNameSearch');
  if (historyNameSearch) {
    historyNameSearch.addEventListener('input', () => loadHistoryData(false));
  }
  document.getElementById('historyExportBtn').addEventListener('click', async () => {
    const date = document.getElementById('historyDate').value;
    if (!date) {
      await showUiAlert('Lütfən tarixi seçin.');
      return;
    }
    try {
      const response = await fetch(`/api/exportExcel/${date}`);
      if (!response.ok) {
        const errorData = await response.json();
        await showUiAlert(errorData.error || 'Excel faylını yükləmək mümkün olmadı.');
        return;
      }
      // If successful, download the file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `panda_imisli_${date}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Export error:', error);
      await showUiAlert('Excel faylını yükləyərkən xəta baş verdi.');
    }
  });
  
  // Reports button
  const reportsBtn = document.getElementById('reportsBtn');
  if (reportsBtn) reportsBtn.addEventListener('click', openReportsModal);
  
  // Reports fullscreen button
  const reportsFullBtn = document.getElementById('reportsFullBtn');
  if (reportsFullBtn) {
    reportsFullBtn.addEventListener('click', () => toggleReportsFullscreen(reportsFullBtn));
  }

  // Reports close button
  const reportsCloseBtn = document.getElementById('reportsCloseBtn');
  if (reportsCloseBtn) {
    reportsCloseBtn.addEventListener('click', closeReportsModal);
  }

  // Export today's Excel
  const exportTodayBtn = document.getElementById('exportTodayExcelBtn');
  if (exportTodayBtn) exportTodayBtn.addEventListener('click', async () => {
    try {
      const date = getTodayDate();
      const response = await fetch(`/api/exportExcel/${date}`);
      if (!response.ok) {
        const errorData = await response.json();
        await showUiAlert(errorData.error || 'Excel faylını yükləmək mümkün olmadı.');
        return;
      }
      // If successful, download the file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `panda_imisli_${date}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Export error:', error);
      await showUiAlert('Excel faylını yükləyərkən xəta baş verdi.');
    }
  });

  // Settings button
  const settingsBtn = document.getElementById('settingsBtn');
  if (settingsBtn) settingsBtn.addEventListener('click', openSettingsModal);
  const settingsCloseBtn = document.getElementById('settingsCloseBtn');
  if (settingsCloseBtn) settingsCloseBtn.addEventListener('click', closeSettingsModal);
  const settingsSaveBtn = document.getElementById('settingsSaveBtn');
  if (settingsSaveBtn) settingsSaveBtn.addEventListener('click', saveSettings);
  const settingsCancelBtn = document.getElementById('settingsCancelBtn');
  if (settingsCancelBtn) settingsCancelBtn.addEventListener('click', closeSettingsModal);

  // Reports modal - close when clicking outside of modal content
  const reportsModal = document.getElementById('reportsModal');
  if (reportsModal) {
    reportsModal.addEventListener('click', function(e) {
      if (e.target === this) {
        closeReportsModal();
      }
    });
  }

  // Fullscreen buttons
  const activeFullBtn = document.getElementById('activeFullBtn');
  const completedFullBtn = document.getElementById('completedFullBtn');
  if (activeFullBtn) activeFullBtn.addEventListener('click', () => toggleFullscreen('active'));
  if (completedFullBtn) completedFullBtn.addEventListener('click', () => toggleFullscreen('completed'));

  // Today(stats) button
  const todayBtn = document.getElementById('todayBtn');
  if (todayBtn) todayBtn.addEventListener('click', openStatsModal);

  // UI prompt modal buttons
  document.getElementById('uiPromptCancel').addEventListener('click', () => closeUiPrompt(false));
  document.getElementById('uiPromptOk').addEventListener('click', () => {
    if (_uiAlertResolve) {
      closeUiAlert();
    } else if (_uiPromptResolve) {
      closeUiPrompt(true);
    }
  });
  
  // Modal
  const modal = document.getElementById('editModal');
  const closeBtn = document.querySelector('.close');
  
  closeBtn.addEventListener('click', closeModal);
  window.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
    if (e.target === document.getElementById('historyModal')) closeHistoryModal();
    if (e.target === document.getElementById('statsModal')) closeStatsModal();
  });

  document.getElementById('cancelEditBtn').addEventListener('click', closeModal);
  document.getElementById('saveEditBtn').addEventListener('click', saveEdit);

  // Stats modal buttons
  const statsClose = document.getElementById('closeStatsBtn');
  if (statsClose) statsClose.addEventListener('click', closeStatsModal);
  const statsCancel = document.getElementById('statsCloseBtn');
  if (statsCancel) statsCancel.addEventListener('click', closeStatsModal);
}

// Fullscreen toggle
function toggleFullscreen(section) {
  const selector = section === 'active' ? '.active-sessions-section' : '.completed-sessions-section';
  const el = document.querySelector(selector);
  if (!el) return;
  const isNow = el.classList.toggle('fullscreen-section');
  // update button text
  if (section === 'active') {
    const btn = document.getElementById('activeFullBtn');
    if (btn) btn.textContent = isNow ? 'Tam Ekrandan Çıx' : 'Tam Ekran';
    // Hide/show TV Ekranı button
    const tvBtn = document.getElementById('activeTvBtn');
    if (tvBtn) tvBtn.style.display = isNow ? 'none' : 'block';
  } else {
    const btn = document.getElementById('completedFullBtn');
    if (btn) btn.textContent = isNow ? 'Tam Ekrandan Çıx' : 'Tam Ekran';
  }
}

// Toggle collapse/expand completed sessions
function toggleCompletedSessions() {
  const section = document.querySelector('.completed-sessions-section');
  const content = document.querySelector('.content');
  const btn = document.getElementById('completedCollapseBtn');
  if (!section || !btn || !content) return;
  
  const isCollapsed = section.classList.toggle('collapsed');
  btn.textContent = isCollapsed ? '▶ Göstər' : '▼ Gizlət';
  
  // Toggle class on content to control active sessions expansion
  if (isCollapsed) {
    content.classList.add('completed-collapsed');
  } else {
    content.classList.remove('completed-collapsed');
  }
}

// UI alert implementation (info/error only - just OK button)
let _uiAlertResolve = null;
function showUiAlert(message) {
  return new Promise(resolve => {
    const modal = document.getElementById('uiPromptModal');
    document.getElementById('uiPromptMessage').textContent = message;
    const input = document.getElementById('uiPromptInput');
    input.style.display = 'none';
    
    // Hide cancel button for alerts
    const cancelBtn = document.getElementById('uiPromptCancel');
    const okBtn = document.getElementById('uiPromptOk');
    if (cancelBtn) cancelBtn.style.display = 'none';
    if (okBtn) okBtn.style.display = 'block';
    
    modal.classList.add('show');
    _uiAlertResolve = resolve;
  });
}

function closeUiAlert() {
  const modal = document.getElementById('uiPromptModal');
  const cancelBtn = document.getElementById('uiPromptCancel');
  const okBtn = document.getElementById('uiPromptOk');
  modal.classList.remove('show');
  if (cancelBtn) cancelBtn.style.display = 'block'; // restore for prompts
  if (okBtn) okBtn.style.display = 'block';
  if (_uiAlertResolve) {
    _uiAlertResolve(true);
    _uiAlertResolve = null;
  }
}

// UI prompt implementation (returns Promise)
let _uiPromptResolve = null;
function showUiPrompt(message, options = { input: false, defaultValue: '' }) {
  return new Promise(resolve => {
    const modal = document.getElementById('uiPromptModal');
    document.getElementById('uiPromptMessage').textContent = message;
    const input = document.getElementById('uiPromptInput');
    const cancelBtn = document.getElementById('uiPromptCancel');
    const okBtn = document.getElementById('uiPromptOk');
    
    // Show cancel button for prompts
    if (cancelBtn) cancelBtn.style.display = 'block';
    if (okBtn) okBtn.style.display = 'block';
    
    if (options.input) {
      input.style.display = 'block';
      input.value = options.defaultValue || '';
      input.focus();
    } else {
      input.style.display = 'none';
    }
    modal.classList.add('show');
    _uiPromptResolve = resolve;
  });
}

function closeUiPrompt(ok) {
  const modal = document.getElementById('uiPromptModal');
  const input = document.getElementById('uiPromptInput');
  modal.classList.remove('show');
  if (_uiPromptResolve) {
    if (ok) {
      if (input.style.display === 'block') {
        _uiPromptResolve(input.value);
      } else {
        _uiPromptResolve(true);
      }
    } else {
      _uiPromptResolve(ok ? true : false);
    }
    _uiPromptResolve = null;
  }
}

// Load data from server
async function loadData() {
  try {
    const response = await fetch(`/api/data/${currentDate}`);
    const data = await response.json();
    
    renderActiveSessions(data.active);
    renderCompletedSessions(data.completed);
  } catch (error) {
    console.error('Error loading data:', error);
  }
}

// Render active sessions
function renderActiveSessions(children) {
  const tbody = document.getElementById('activeTableBody');
  const noMsg = document.getElementById('noActiveMsg');
  const count = document.getElementById('activeCount');
  
  tbody.innerHTML = '';
  
  // Count children by zone
  const zoneCounts = {};
  children.forEach(child => {
    zoneCounts[child.playZone] = (zoneCounts[child.playZone] || 0) + 1;
  });
  
  // Format count with zone breakdown (dynamic based on settings)
  let countText = children.length;
  if (children.length > 0) {
    const parts = [`Cəmi: ${children.length}`];
    
    // Add zone counts dynamically from settings
    if (settings && settings.playZones) {
      settings.playZones.forEach(zone => {
        if (zoneCounts[zone.name]) {
          parts.push(`${zone.name}: ${zoneCounts[zone.name]}`);
        }
      });
    }
    
    countText = parts.join(', ');
  }
  count.textContent = countText;
  
  if (children.length === 0) {
    noMsg.style.display = 'block';
    return;
  }
  
  noMsg.style.display = 'none';
  
  children.forEach(child => {
    const row = createActiveRow(child);
    tbody.appendChild(row);
    
    // Start timer (use stored startTime)
    startTimer(child.id, child.duration, child.startTime);
  });
}

// Render completed sessions
function renderCompletedSessions(children) {
  const tbody = document.getElementById('completedTableBody');
  const noMsg = document.getElementById('noCompletedMsg');
  const count = document.getElementById('completedCount');
  
  tbody.innerHTML = '';
  
  // Count children by zone
  const zoneCounts = {};
  children.forEach(child => {
    zoneCounts[child.playZone] = (zoneCounts[child.playZone] || 0) + 1;
  });
  
  // Format count with zone breakdown (dynamic based on settings)
  let countText = children.length;
  if (children.length > 0) {
    const parts = [`Cəmi: ${children.length}`];
    
    // Add zone counts dynamically from settings
    if (settings && settings.playZones) {
      settings.playZones.forEach(zone => {
        if (zoneCounts[zone.name]) {
          parts.push(`${zone.name}: ${zoneCounts[zone.name]}`);
        }
      });
    }
    
    countText = parts.join(', ');
  }
  count.textContent = countText;
  
  if (children.length === 0) {
    noMsg.style.display = 'block';
    return;
  }
  
  noMsg.style.display = 'none';
  
  children.forEach(child => {
    const row = createCompletedRow(child);
    tbody.appendChild(row);
  });
}

// Create active session row
function createActiveRow(child) {
  const row = document.createElement('tr');
  row.classList.add('row-active');
  
  const notesContent = child.notes ? 
    `<span class="editable-field" onclick="editNotes('${child.id}')">${child.notes}</span>` : 
    `<span class="editable-field editable-placeholder" onclick="editNotes('${child.id}')">Qeyd əlavə et...</span>`;
  
  const startTimeStr = child.startTime ? new Date(child.startTime).toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit' }) : '-';
  const timeButtonsHtml = '';

  row.innerHTML = `
    <td>${child.name}</td>
    <td>${child.age}</td>
    <td>${child.playZone}</td>
    <td>${startTimeStr}</td>
    <td id="timer-cell-${child.id}" class="timer-cell"><span id="timer-${child.id}" class="timer">--:--</span></td>
    <td>${child.passTypeName || (child.duration === 'unlimited' ? 'Limitsiz' : child.duration + ' dəq')}</td>
    <td>${child.price} AZN</td>
    <td>${notesContent}</td>
    <td>
      <div class="actions-cell">
        <button class="btn-action btn-edit" onclick="openEditModal('${child.id}', 'active')">Dəyişdir</button>
        ${timeButtonsHtml}
        <button class="btn-action btn-end" onclick="endSession('${child.id}')">Bitir</button>
        <button class="btn-action btn-delete" onclick="deleteChild('${child.id}', 'active')">Sil</button>
      </div>
    </td>
  `;
  
  return row;
}

// Create completed session row
function createCompletedRow(child) {
  const row = document.createElement('tr');
  row.classList.add('row-completed');
  
  const notesContent = child.notes ? 
    `<span class="editable-field" onclick="editNotes('${child.id}')">${child.notes}</span>` : 
    `<span class="editable-field editable-placeholder" onclick="editNotes('${child.id}')">Qeyd əlavə et...</span>`;
  
  const startTime = new Date(child.startTime).toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit' });
  const endTime = child.endTime ? new Date(child.endTime).toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit' }) : '-';
  const canRestore = child.endTime && (Date.now() - new Date(child.endTime).getTime() <= 5 * 60 * 1000);
  const restoreButtonHtml = canRestore ? `<button class="btn-action btn-restore" onclick="restoreSession('${child.id}')">Bərpa et</button>` : '';
  
  row.innerHTML = `
    <td>${child.name}</td>
    <td>${child.age}</td>
    <td>${child.playZone}</td>
    <td>${startTime}</td>
    <td>${endTime}</td>
    <td>${child.passTypeName || (child.duration === 'unlimited' ? 'Limitsiz' : child.duration + ' dəq')}</td>
    <td>${child.price} AZN</td>
    <td>${notesContent}</td>
    <td>
      <div class="actions-cell">
        <button class="btn-action btn-edit" onclick="openEditModal('${child.id}', 'completed')">Dəyişdir</button>
        ${restoreButtonHtml}
        <button class="btn-action btn-delete" onclick="deleteChild('${child.id}', 'completed')">Sil</button>
      </div>
    </td>
  `;
  
  return row;
}

// Add new child
async function addChild() {
  const name = document.getElementById('childName').value.trim();
  const age = document.getElementById('childAge').value;
  const playZone = document.getElementById('playZone').value;
  const passTypeId = document.getElementById('duration').value;
  const notes = document.getElementById('notesInput').value.trim();
  
  // Check if work day is over
  const now = new Date();
  const currentHour = String(now.getHours()).padStart(2, '0');
  const currentMinute = String(now.getMinutes()).padStart(2, '0');
  const currentTimeStr = `${currentHour}:${currentMinute}`;
  const endDayTime = settings.endDayHour || '22:00';
  
  if (currentTimeStr >= endDayTime) {
    await showUiAlert(`İş günü bitib. Saat ${endDayTime}-dan sonra yeni seans əlavə etmək mümkün deyil. Zəhmət olmasa, "Ayarlar"-dan günün bitmə vaxtını dəyişdirin.`);
    return;
  }
  
  // Validation
  if (!name || !age || !playZone || !passTypeId) {
    await showUiAlert('Lütfən bütün tələb olunan xanaları doldurun (*).');
    return;
  }
  
  // Get pass type details
  const passType = settings.passTypes.find(pt => pt.id.toString() === passTypeId);
  if (!passType) {
    await showUiAlert('Seçilmiş bilet tipi tapılmadı.');
    return;
  }
  
  try {
    const response = await fetch(`/api/children?date=${currentDate}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name,
        age: parseInt(age),
        playZone,
        duration: passType.duration,
        price: passType.price,
        passTypeId: passType.id,
        passTypeName: passType.name,
        notes
      })
    });
    
    const child = await response.json();
    
    // Clear form
    document.getElementById('childName').value = '';
    document.getElementById('childAge').value = '';
    document.getElementById('playZone').value = '';
    document.getElementById('duration').value = '';
    document.getElementById('notesInput').value = '';
    
    // Reload data
    loadData();
  } catch (error) {
    console.error('Error adding child:', error);
    await showUiAlert('Uşaq əlavə edilərkən xəta baş verdi. Yenidən cəhd edin.');
  }
}

// Timer functionality
function startTimer(childId, durationValue, startTimeISO) {
  const timerEl = document.getElementById(`timer-${childId}`);
  const timerCellEl = document.getElementById(`timer-cell-${childId}`);
  if (!timerEl) return;

  if (durationValue === 'unlimited') {
    timerEl.textContent = 'Limitsiz';
    timerEl.classList.remove('warning', 'danger');
    if (timerCellEl) {
      timerCellEl.classList.add('timer-green');
    }
    return;
  }

  const durationMinutes = parseInt(durationValue) || 0;
  const totalDuration = durationMinutes * 60 * 1000; // Total duration in milliseconds
  const startMs = startTimeISO ? new Date(startTimeISO).getTime() : Date.now();
  let endTime = startMs + totalDuration;
  let lastDisplayedMinute = -1; // Track last displayed minute to reduce updates

  function updateTimer() {
    const now = Date.now();
    const remaining = Math.max(0, endTime - now);
    const minutes = Math.floor(remaining / 60000);

    if (!timerEl) {
      clearInterval(timerIntervals[childId]);
      return;
    }

    // Only update if minute has changed
    if (minutes !== lastDisplayedMinute) {
      lastDisplayedMinute = minutes;
      
      // Display minutes with "dəq" label
      if (minutes === 0) {
        timerEl.textContent = '0 dəq';
      } else {
        timerEl.textContent = `${minutes} dəq`;
      }
      
      timerEl.classList.remove('warning', 'danger');

      // Apply color based on remaining minutes: >15 (green), ≤15 (yellow), 0 (red)
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
  }

  updateTimer();

  if (timerIntervals[childId]) clearInterval(timerIntervals[childId]);
  // Check every 60 seconds (1 minute) for efficiency
  timerIntervals[childId] = setInterval(updateTimer, 60000);
}

// End session
async function endSession(childId) {
  const ok = await showUiPrompt('Seansı bitirmək istədiyinizə əminsiniz? Bitirdikdən sonra ilk 5 dəqiqə ərzində seansı bərpa etmək mümkündür.');
  if (!ok) return;

  try {
    await fetch(`/api/children/${childId}/end?date=${currentDate}`, {
      method: 'POST'
    });

    // Clear timer
    if (timerIntervals[childId]) {
      clearInterval(timerIntervals[childId]);
    }

    loadData();
  } catch (error) {
    console.error('Error ending session:', error);
  }
}

// Restore completed session back to active (within 5 minutes)
async function restoreSession(childId) {
  const ok = await showUiPrompt('Bitmiş seansı geri qaytarmaq istəyirsiniz?');
  if (!ok) return;

  try {
    const response = await fetch(`/api/children/${childId}/restore?date=${currentDate}`, {
      method: 'POST'
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message = errorData.error || 'Seansı bərpa etmək mümkün olmadı.';
      await showUiAlert(message);
      return;
    }

    loadData();
  } catch (error) {
    console.error('Error restoring session:', error);
    await showUiAlert('Seansı bərpa edərkən xəta baş verdi.');
  }
}

// Delete child
async function deleteChild(childId, source) {
  const delConfirm = await showUiPrompt('Bu girişi silmək istəyirsiniz? Bu əməliyyatı geri qaytarmaq mümkün olmayacaq.');
  if (!delConfirm) {
    return;
  }
  
  try {
    await fetch(`/api/children/${childId}?date=${currentDate}`, {
      method: 'DELETE'
    });
    
    // Clear timer
    if (timerIntervals[childId]) {
      clearInterval(timerIntervals[childId]);
    }
    
    loadData();
  } catch (error) {
    console.error('Error deleting child:', error);
  }
}

// Edit notes
async function editNotes(childId) {
  const response = await fetch(`/api/data/${currentDate}`);
  const data = await response.json();
  
  let child;
  let source;
  
  // Search active sessions first
  child = data.active.find(c => c.id == childId);
  if (child) {
    source = 'active';
  } else {
    // Then search completed sessions
    child = data.completed.find(c => c.id == childId);
    source = 'completed';
  }
  
  if (!child) return;
  
  const newNotes = await showUiPrompt('Qeyd əlavə edin:', { input: true, defaultValue: child.notes || '' });

  if (newNotes !== false) {
    try {
      await fetch(`/api/children/${childId}?date=${currentDate}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: newNotes })
      });

      loadData();
    } catch (error) {
      console.error('Error updating notes:', error);
    }
  }
}


// Open edit modal
async function openEditModal(childId, source) {
  editingChildId = childId;
  editingSource = source;
  
  const response = await fetch(`/api/data/${currentDate}`);
  const data = await response.json();
  
  let child;
  if (source === 'active') {
    child = data.active.find(c => c.id == childId);
  } else {
    child = data.completed.find(c => c.id == childId);
  }
  
  if (!child) return;
  
  // Populate modal
  document.getElementById('editName').value = child.name;
  document.getElementById('editAge').value = child.age;
  document.getElementById('editPlayZone').value = child.playZone;
  document.getElementById('editNotes').value = child.notes || '';
  
  // Show/hide and populate start time field (only for active sessions)
  const startTimeGroup = document.getElementById('editStartTimeGroup');
  const startTimeInput = document.getElementById('editStartTime');
  if (source === 'active' && child.startTime) {
    startTimeGroup.style.display = 'flex';
    // Convert ISO datetime to HH:MM format for time input
    const startDate = new Date(child.startTime);
    const hours = String(startDate.getHours()).padStart(2, '0');
    const minutes = String(startDate.getMinutes()).padStart(2, '0');
    startTimeInput.value = `${hours}:${minutes}`;
  } else {
    startTimeGroup.style.display = 'none';
    startTimeInput.value = '';
  }
  
  // Find and set the correct pass type in the dropdown
  if (child.passTypeId && settings.passTypes) {
    const passType = settings.passTypes.find(pt => pt.id === child.passTypeId);
    if (passType) {
      document.getElementById('editDuration').value = passType.id;
    }
  } else if (child.duration && settings.passTypes) {
    // Fallback: find by duration
    const passType = settings.passTypes.find(pt => pt.duration === child.duration);
    if (passType) {
      document.getElementById('editDuration').value = passType.id;
    }
  }
  
  // Show modal
  document.getElementById('editModal').classList.add('show');
}

// Close modal
function closeModal() {
  document.getElementById('editModal').classList.remove('show');
  editingChildId = null;
  editingSource = null;
}

// Save edit
async function saveEdit() {
  if (!editingChildId) return;
  
  const passTypeId = document.getElementById('editDuration').value;
  
  // Get pass type details
  const passType = settings.passTypes.find(pt => pt.id.toString() === passTypeId);
  if (!passType) {
    await showUiAlert('Seçilmiş bilet tipi tapılmadı.');
    return;
  }
  
  const updates = {
    name: document.getElementById('editName').value,
    age: parseInt(document.getElementById('editAge').value),
    playZone: document.getElementById('editPlayZone').value,
    duration: passType.duration,
    price: passType.price,
    passTypeId: passType.id,
    passTypeName: passType.name,
    notes: document.getElementById('editNotes').value
  };
  
  // Update start time if editing an active session
  if (editingSource === 'active') {
    const startTimeInput = document.getElementById('editStartTime').value;
    if (startTimeInput) {
      // Get the current date from the child being edited
      const response = await fetch(`/api/data/${currentDate}`);
      const data = await response.json();
      const child = data.active.find(c => c.id == editingChildId);
      
      if (child && child.startTime) {
        // Keep the same date, update only time
        const startDate = new Date(child.startTime);
        const [hours, minutes] = startTimeInput.split(':');
        startDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
        updates.startTime = startDate.toISOString();
      }
    }
  }
  
  try {
    await fetch(`/api/children/${editingChildId}?date=${currentDate}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    
    closeModal();
    loadData();
  } catch (error) {
    console.error('Error saving changes:', error);
  }
}

// ===== ANALYTICS CHART FUNCTIONS =====

async function updateAnalyticsChart() {
  // Load last 10 days data from backend
  try {
    const response = await fetch('/api/stats/filtered-10days');
    const stats = await response.json();
    
    const days = stats.map(s => {
      const date = new Date(s.date + 'T00:00:00');
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      return `${day}.${month}`;
    });
    const childrenCounts = stats.map(s => s.children);
    const incomeCounts = stats.map(s => s.income);
  
  const chartContainer = document.getElementById('analyticsChartContainer');
  
  if (days.length === 0) {
    chartContainer.style.display = 'none';
    return;
  }
  
  chartContainer.style.display = 'block';
  const ctx = document.getElementById('analyticsChart').getContext('2d');
  
  // Destroy existing chart if it exists
  if (analyticsChart) {
    analyticsChart.destroy();
  }
  
  analyticsChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: days,
      datasets: [
        {
          label: 'Qəbul Edilən Uşaqlar',
          data: childrenCounts,
          borderColor: '#4CAF50',
          backgroundColor: 'rgba(76, 175, 80, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0,
          pointRadius: 5,
          pointBackgroundColor: '#4CAF50',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          yAxisID: 'y'
        },
        {
          label: 'Gəlir (AZN)',
          data: incomeCounts,
          borderColor: '#2196F3',
          backgroundColor: 'rgba(33, 150, 243, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0,
          pointRadius: 5,
          pointBackgroundColor: '#2196F3',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          display: true,
          labels: {
            font: { size: 12, weight: 'bold' },
            color: '#333',
            padding: 15
          }
        }
      },
      scales: {
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          title: {
            display: true,
            text: 'Uşaq Sayı',
            font: { size: 12, weight: 'bold' }
          },
          grid: { color: 'rgba(0, 0, 0, 0.05)' }
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          title: {
            display: true,
            text: 'Gəlir (AZN)',
            font: { size: 12, weight: 'bold' }
          },
          grid: { display: false }
        }
      }
    }
  });
  } catch (error) {
    console.error('Error loading analytics data:', error);
  }
}

// History Modal Functions
function openHistoryModal() {
  // Ensure stats modal is closed when opening history
  closeStatsModal();
  const today = getTodayDate();
  document.getElementById('historyDate').value = today;
  const nameSearchInput = document.getElementById('historyNameSearch');
  if (nameSearchInput) {
    nameSearchInput.value = '';
  }
  // Reset sort to default when opening modal
  historySortBy = 'startTime';
  historySortDir = 'asc';
  document.getElementById('historyModal').classList.add('show');
  
  // Automatically load today's data (without showing alert on modal open)
  loadHistoryData(false);
}

// Toggle Reports fullscreen
function toggleReportsFullscreen(btn) {
  const modal = document.getElementById('reportsModal');
  const modalContent = document.getElementById('reportsModalContent');
  if (!modal || !modalContent) return;
  
  const isFullscreen = modalContent.classList.toggle('fullscreen-modal');
  // Also toggle class on parent to remove flex centering
  modal.classList.toggle('modal-fullscreen-parent');
  
  btn.textContent = isFullscreen ? 'Tam Ekrandan Çıx' : 'Tam ekran';
  
  // Trigger chart resize when toggling fullscreen
  setTimeout(() => {
    if (analyticsChart) {
      analyticsChart.resize();
    }
  }, 100);
}

// Stats Modal Functions
async function openStatsModal() {
  const date = currentDate;
  try {
    // make sure other modals are closed
    closeHistoryModal();

    const resp = await fetch(`/api/data/${date}`);
    const data = await resp.json();

    const activeCount = data.active.length;
    const completedCount = data.completed.length;
    const total = activeCount + completedCount;

    // Revenue: use stored price for completed sessions, regardless of duration completed.
    // For active sessions, use stored price as well (full price charged upon session completion).
    let revenueSum = 0;
    const all = [...data.active, ...data.completed];

    all.forEach(c => {
      // Use the stored price for all sessions
      revenueSum += parseFloat(c.price) || 0;
    });

    const revenue = revenueSum.toFixed(2);

    document.getElementById('statTotal').textContent = total;
    document.getElementById('statActive').textContent = activeCount;
    document.getElementById('statCompleted').textContent = completedCount;
    document.getElementById('statRevenue').textContent = revenue + ' AZN';

    document.getElementById('statsModal').classList.add('show');
  } catch (err) {
    console.error('Error loading stats:', err);
    await showUiAlert('Statistikaları yükləmək mümkün olmadı.');
  }
}

function closeStatsModal() {
  document.getElementById('statsModal').classList.remove('show');
}

function closeHistoryModal() {
  document.getElementById('historyModal').classList.remove('show');
}

async function loadHistoryData(showAlertIfEmpty = false) {
  const selectedDate = document.getElementById('historyDate').value;
  const nameSearchInput = document.getElementById('historyNameSearch');
  const searchTerm = nameSearchInput ? nameSearchInput.value.trim().toLowerCase() : '';
  
  if (!selectedDate) {
    await showUiAlert('Lütfən tarixi seçin.');
    return;
  }
  
  try {
    const response = await fetch(`/api/data/${selectedDate}`);
    const data = await response.json();
    
    const contentDiv = document.getElementById('historyContent');
    let html = '';
    
    // Completed sessions only
    const completed = data.completed || [];
    const filteredCompleted = searchTerm
      ? completed.filter(child => (child.name || '').toLowerCase().includes(searchTerm))
      : completed;
    
    if (completed.length === 0) {
      // Show alert only if Load button was clicked (showAlertIfEmpty = true)
      if (showAlertIfEmpty) {
        await showUiAlert('Bu tarixdə bitmiş seans yoxdur. Zəhmət olmasa başqa tarix seçin.');
      }
      // Always show static message in panel
      html = '<p class="no-data-msg">Bu tarixdə bitmiş seans yoxdur. Zəhmət olmasa başqa tarix seçin.</p>';
    } else if (filteredCompleted.length === 0) {
      html = '<p class="no-data-msg">Axtarışa uyğun bitmiş seans tapılmadı.</p>';
    } else {
      // Sort the data
      const sortedCompleted = sortHistoryData([...filteredCompleted]);
      
      html += `
        <div class="history-section">
          <h3>✅ Bitmiş Seanslar (${sortedCompleted.length})</h3>
          <table class="history-table">
            <thead>
              <tr>
                <th class="sortable" onclick="sortHistoryBy('name')">Ad ${getSortIndicator('name')}</th>
                <th class="sortable" onclick="sortHistoryBy('age')">Yaş ${getSortIndicator('age')}</th>
                <th class="sortable" onclick="sortHistoryBy('playZone')">Zona ${getSortIndicator('playZone')}</th>
                <th class="sortable" onclick="sortHistoryBy('duration')">Müddət ${getSortIndicator('duration')}</th>
                <th class="sortable" onclick="sortHistoryBy('price')">Məbləğ ${getSortIndicator('price')}</th>
                <th class="sortable" onclick="sortHistoryBy('startTime')">Başlama Vaxtı ${getSortIndicator('startTime')}</th>
                <th class="sortable" onclick="sortHistoryBy('endTime')">Bitmə Vaxtı ${getSortIndicator('endTime')}</th>
              </tr>
            </thead>
            <tbody>
              ${sortedCompleted.map(child => `
                <tr>
                  <td>${child.name}</td>
                  <td>${child.age}</td>
                  <td>${child.playZone}</td>
                  <td>${child.duration === 'unlimited' ? 'Limitsiz' : (child.duration + ' dəq')}</td>
                  <td>${child.price} AZN</td>
                  <td>${child.startTime ? new Date(child.startTime).toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                  <td>${child.endTime ? new Date(child.endTime).toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }
    contentDiv.innerHTML = html;
  } catch (error) {
    console.error('Error loading history:', error);
    document.getElementById('historyContent').innerHTML = '<p class="no-data-msg">Məlumat yüklənərkən xəta baş verdi.</p>';
  }
}

// Get sort indicator symbol for column header
function getSortIndicator(column) {
  if (historySortBy !== column) return '';
  return historySortDir === 'asc' ? '▲' : '▼';
}

// Change sort column and direction
function sortHistoryBy(column) {
  if (historySortBy === column) {
    // Toggle direction if same column
    historySortDir = historySortDir === 'asc' ? 'desc' : 'asc';
  } else {
    // New column, default to ascending
    historySortBy = column;
    historySortDir = 'asc';
  }
  loadHistoryData(false);
}

// Sort history data based on current sort settings
function sortHistoryData(data) {
  const sorted = [...data];
  
  sorted.sort((a, b) => {
    let aVal, bVal;
    
    switch (historySortBy) {
      case 'name':
        aVal = (a.name || '').toLowerCase();
        bVal = (b.name || '').toLowerCase();
        return historySortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      
      case 'age':
        aVal = parseInt(a.age) || 0;
        bVal = parseInt(b.age) || 0;
        return historySortDir === 'asc' ? aVal - bVal : bVal - aVal;
      
      case 'playZone':
        aVal = (a.playZone || '').toLowerCase();
        bVal = (b.playZone || '').toLowerCase();
        return historySortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      
      case 'duration':
        // Handle unlimited vs numeric durations
        aVal = a.duration === 'unlimited' ? Infinity : parseInt(a.duration) || 0;
        bVal = b.duration === 'unlimited' ? Infinity : parseInt(b.duration) || 0;
        return historySortDir === 'asc' ? aVal - bVal : bVal - aVal;
      
      case 'price':
        aVal = parseFloat(a.price) || 0;
        bVal = parseFloat(b.price) || 0;
        return historySortDir === 'asc' ? aVal - bVal : bVal - aVal;
      
      case 'startTime':
        aVal = a.startTime ? new Date(a.startTime).getTime() : 0;
        bVal = b.startTime ? new Date(b.startTime).getTime() : 0;
        return historySortDir === 'asc' ? aVal - bVal : bVal - aVal;
      
      case 'endTime':
        aVal = a.endTime ? new Date(a.endTime).getTime() : 0;
        bVal = b.endTime ? new Date(b.endTime).getTime() : 0;
        return historySortDir === 'asc' ? aVal - bVal : bVal - aVal;
      
      default:
        return 0;
    }
  });
  
  return sorted;
}

// Settings Modal Functions
function openSettingsModal() {
  closeHistoryModal();
  closeStatsModal();

  // Populate pass types as editable rows
  const container = document.getElementById('passTypesContainer');
  if (container) {
    container.innerHTML = `
      <table class="pass-types-table">
        <thead>
          <tr>
            <th>Ad</th>
            <th>Müddət</th>
            <th>Qiymət (AZN)</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="passTypesBody">
        </tbody>
      </table>
    `;
    
    const tbody = document.getElementById('passTypesBody');
    settings.passTypes.forEach(pt => {
      const row = document.createElement('tr');
      row.setAttribute('data-id', pt.id);
      row.innerHTML = `
        <td><input type="text" class="pass-name" placeholder="Adı" value="${pt.name}" data-id="${pt.id}" /></td>
        <td><select class="pass-duration" data-id="${pt.id}">
          <option value="60" ${pt.duration === 60 ? 'selected' : ''}>1 Saat</option>
          <option value="120" ${pt.duration === 120 ? 'selected' : ''}>2 Saat</option>
          <option value="180" ${pt.duration === 180 ? 'selected' : ''}>3 Saat</option>
          <option value="240" ${pt.duration === 240 ? 'selected' : ''}>4 Saat</option>
          <option value="unlimited" ${pt.duration === 'unlimited' ? 'selected' : ''}>Limitsiz</option>
        </select></td>
        <td><input type="number" class="pass-price" placeholder="Qiymət" value="${pt.price}" data-id="${pt.id}" step="0.01" /></td>
        <td><button class="btn-delete" onclick="removePassType(${pt.id})">Sil</button></td>
      `;
      tbody.appendChild(row);
    });
  }

  // Set end day hour
  document.getElementById('endDayHour').value = settings.endDayHour || '22:00';

  // Set TV pagination frequency
  const tvFreqInput = document.getElementById('tvPaginationFrequency');
  if (tvFreqInput) {
    tvFreqInput.value = settings.tvPaginationFrequency || 5;
  }

  // Set TV custom message
  const tvCustomMessageInput = document.getElementById('tvCustomMessage');
  if (tvCustomMessageInput) {
    tvCustomMessageInput.value = settings.tvCustomMessage || '';
  }

  // Set TV show unlimited pass types toggle
  const tvShowUnlimitedPassTypesInput = document.getElementById('tvShowUnlimitedPassTypes');
  if (tvShowUnlimitedPassTypesInput) {
    tvShowUnlimitedPassTypesInput.checked = settings.tvShowUnlimitedPassTypes !== false;
  }

  // Set TV custom message enabled toggle
  const tvCustomMessageEnabledInput = document.getElementById('tvCustomMessageEnabled');
  if (tvCustomMessageEnabledInput) {
    tvCustomMessageEnabledInput.checked = settings.tvCustomMessageEnabled !== false;
  }

  // Populate play zones as table
  const zonesContainer = document.getElementById('playZonesContainer');
  if (zonesContainer) {
    zonesContainer.innerHTML = `
      <table class="play-zones-table">
        <thead>
          <tr>
            <th>Zona Adı</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="playZonesBody">
        </tbody>
      </table>
    `;
    
    const tbody = document.getElementById('playZonesBody');
    const playZones = settings.playZones || [];
    playZones.forEach(zone => {
      const row = document.createElement('tr');
      row.setAttribute('data-id', zone.id);
      row.innerHTML = `
        <td><input type="text" class="play-zone-name" placeholder="Zona adı" value="${zone.name}" data-id="${zone.id}" /></td>
        <td><button class="btn-delete" onclick="removePlayZone(${zone.id})">Sil</button></td>
      `;
      tbody.appendChild(row);
    });
  }

  document.getElementById('settingsModal').classList.add('show');
}

function closeSettingsModal() {
  document.getElementById('settingsModal').classList.remove('show');
}

function addPassTypeRow() {
  const container = document.getElementById('passTypesContainer');
  const tbody = document.getElementById('passTypesBody');
  if (!container || !tbody) return;

  const newId = Math.max(...settings.passTypes.map(p => p.id || 0), 0) + 1;

  const row = document.createElement('tr');
  row.setAttribute('data-id', newId);
  row.innerHTML = `
    <td><input type="text" class="pass-name" placeholder="Adı" data-id="${newId}" /></td>
    <td><select class="pass-duration" data-id="${newId}">
      <option value="60">1 Saat</option>
      <option value="120">2 Saat</option>
      <option value="180">3 Saat</option>
      <option value="240">4 Saat</option>
      <option value="unlimited">Limitsiz</option>
    </select></td>
    <td><input type="number" class="pass-price" placeholder="Qiymət" data-id="${newId}" step="0.01" /></td>
    <td><button class="btn-delete" onclick="removePassType(${newId})">Sil</button></td>
  `;
  tbody.appendChild(row);
}

function removePassType(idOrElem) {
  // idOrElem can be numeric id or element (button passed via 'this')
  let id = null;
  if (typeof idOrElem === 'number') {
    id = idOrElem;
    const row = document.querySelector('#passTypesBody tr[data-id="' + id + '"]');
    if (row) row.remove();
    settings.passTypes = settings.passTypes.filter(pt => pt.id !== id);
    return;
  }

  // If element (e.g., this from onclick), find row
  const row = idOrElem && idOrElem.closest ? idOrElem.closest('tr') : null;
  if (row) {
    const attr = row.getAttribute('data-id');
    if (attr) {
      id = parseInt(attr);
      settings.passTypes = settings.passTypes.filter(pt => pt.id !== id);
    }
    row.remove();
  }
}

function addPlayZoneRow() {
  const container = document.getElementById('playZonesContainer');
  const tbody = document.getElementById('playZonesBody');
  if (!container || !tbody) return;

  const playZones = settings.playZones || [];
  const newId = Math.max(...playZones.map(z => z.id || 0), 0) + 1;

  const row = document.createElement('tr');
  row.setAttribute('data-id', newId);
  row.innerHTML = `
    <td><input type="text" class="play-zone-name" placeholder="Zona adı" data-id="${newId}" /></td>
    <td><button class="btn-delete" onclick="removePlayZone(${newId})">Sil</button></td>
  `;
  tbody.appendChild(row);
}

function removePlayZone(idOrElem) {
  // idOrElem can be numeric id or element (button passed via 'this')
  let id = null;
  if (typeof idOrElem === 'number') {
    id = idOrElem;
    const row = document.querySelector('#playZonesBody tr[data-id="' + id + '"]');
    if (row) row.remove();
    if (!settings.playZones) settings.playZones = [];
    settings.playZones = settings.playZones.filter(z => z.id !== id);
    return;
  }

  // If element (e.g., this from onclick), find row
  const row = idOrElem && idOrElem.closest ? idOrElem.closest('tr') : null;
  if (row) {
    const attr = row.getAttribute('data-id');
    if (attr) {
      id = parseInt(attr);
      if (!settings.playZones) settings.playZones = [];
      settings.playZones = settings.playZones.filter(z => z.id !== id);
    }
    row.remove();
  }
}

async function saveSettings() {
  // Gather all pass rows from table
  const rows = document.querySelectorAll('#passTypesContainer tbody tr');
  const passTypes = [];

  rows.forEach(row => {
    const idAttr = row.getAttribute('data-id');
    const id = idAttr ? parseInt(idAttr) : (Math.max(...passTypes.map(p => p.id || 0), 0) + 1);
    const nameEl = row.querySelector('.pass-name');
    const durationEl = row.querySelector('.pass-duration');
    const priceEl = row.querySelector('.pass-price');
    
    const name = nameEl ? nameEl.value.trim() : '';
    const durationRaw = durationEl ? durationEl.value : '';
    const durationVal = durationRaw === 'unlimited' ? 'unlimited' : (durationRaw ? parseInt(durationRaw) : 0);
    const price = priceEl ? parseFloat(priceEl.value) || 0 : 0;

    if (name && durationVal && !isNaN(price) && price >= 0) {
      passTypes.push({ id, name, duration: durationVal, price });
    }
  });

  // Gather all play zone rows from table
  const zoneRows = document.querySelectorAll('#playZonesContainer tbody tr');
  const playZones = [];

  zoneRows.forEach(row => {
    const idAttr = row.getAttribute('data-id');
    const id = idAttr ? parseInt(idAttr) : (Math.max(...playZones.map(z => z.id || 0), 0) + 1);
    const nameEl = row.querySelector('.play-zone-name');
    
    const name = nameEl ? nameEl.value.trim() : '';

    if (name) {
      playZones.push({ id, name });
    }
  });

  const endDayTime = document.getElementById('endDayHour').value;
  const tvPaginationFrequency = parseInt(document.getElementById('tvPaginationFrequency').value) || 5;
  const tvShowUnlimitedPassTypes = document.getElementById('tvShowUnlimitedPassTypes').checked;
  const tvCustomMessage = document.getElementById('tvCustomMessage').value.trim();
  const tvCustomMessageEnabled = document.getElementById('tvCustomMessageEnabled').checked;

  if (tvPaginationFrequency < 2) {
    await showUiAlert('TV ekranı səhifə keçid tezliyi ən azı 2 saniyə olmalıdır.');
    return;
  }

  if (passTypes.length === 0) {
    await showUiAlert('Ən azı bir bilet əlavə edin!');
    return;
  }

  if (playZones.length === 0) {
    await showUiAlert('Ən azı bir oyun zonası əlavə edin!');
    return;
  }

  if (!endDayTime || !endDayTime.match(/^([0-1]\d|2[0-3]):[0-5]\d$/)) {
    await showUiAlert('Lütfən günü bitirmə vaxtını düzgün formatda daxil edin. Nümunə: 22:00');
    return;
  }

  try {
    const response = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passTypes, playZones, endDayHour: endDayTime, tvPaginationFrequency, tvShowUnlimitedPassTypes, tvCustomMessage, tvCustomMessageEnabled })
    });

    if (response.ok) {
      const result = await response.json();
      settings = result.settings;
      updatePriceConfig();
      updateDurationDropdown();
      updatePlayZoneDropdown();
      populateDynamicFilters();
      closeSettingsModal();
      await showUiAlert('Dəyişikliklər yadda saxlanıldı.');
    } else {
      await showUiAlert('Dəyişiklikləri yadda saxlayarkən xəta baş verdi. Yenidən cəhd edin.');
    }
  } catch (err) {
    console.error('Error saving settings:', err);
    await showUiAlert('Dəyişiklikləri yadda saxlayarkən xəta baş verdi. Yenidən cəhd edin.');
  }
}

// Update duration dropdown with dynamic pass types
function updateDurationDropdown() {
  const durationSelect = document.getElementById('duration');
  const editDurationSelect = document.getElementById('editDuration');
  
  [durationSelect, editDurationSelect].forEach(select => {
    if (select) {
      const currentValue = select.value;
      select.innerHTML = '';
      
      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = 'Bilet seçin';
      select.appendChild(defaultOption);
      
      settings.passTypes.forEach(pt => {
        const option = document.createElement('option');
        option.value = pt.id; // Use pass type ID as value
        option.textContent = `${pt.name} - ${pt.price} AZN`;
        select.appendChild(option);
      });
      
      // Try to restore previous value
      if (settings.passTypes.some(pt => pt.id.toString() === currentValue)) {
        select.value = currentValue;
      }
    }
  });
}

// Update play zone dropdowns with dynamic zones
function updatePlayZoneDropdown() {
  const playZoneSelect = document.getElementById('playZone');
  const editPlayZoneSelect = document.getElementById('editPlayZone');
  const playZones = settings.playZones || [];
  
  [playZoneSelect, editPlayZoneSelect].forEach(select => {
    if (select) {
      const currentValue = select.value;
      select.innerHTML = '';
      
      if (select.id === 'playZone') {
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Zona seçin';
        select.appendChild(defaultOption);
      }
      
      playZones.forEach(zone => {
        const option = document.createElement('option');
        option.value = zone.name;
        option.textContent = zone.name;
        select.appendChild(option);
      });
      
      // Try to restore previous value
      if (playZones.some(z => z.name === currentValue)) {
        select.value = currentValue;
      }
    }
  });
}

// ===== REPORTS & ANALYTICS FUNCTIONS =====

// Open reports modal
async function openReportsModal() {
  const modal = document.getElementById('reportsModal');
  if (!modal) return;
  
  modal.classList.add('show');
  
  // Load available months for all filters
  await loadAvailableMonths();
  
  // Populate dynamic filters from settings
  populateDynamicFilters();
  
  // Load statistics report on first open (default tab)
  await loadStatisticsReport();
}

// Close reports modal
function closeReportsModal(e) {
  // Allow closing from event or direct call
  if (e && e.stopPropagation) {
    e.stopPropagation();
  }
  const modal = document.getElementById('reportsModal');
  const modalContent = document.getElementById('reportsModalContent');
  const fullscreenBtn = document.getElementById('reportsFullBtn');
  
  if (modal) {
    modal.classList.remove('show');
    modal.classList.remove('modal-fullscreen-parent');
  }
  
  if (modalContent) {
    modalContent.classList.remove('fullscreen-modal');
  }
  
  // Reset fullscreen button text if needed
  if (fullscreenBtn) {
    fullscreenBtn.textContent = 'Tam ekran';
  }
}

// Load available months for filtering
async function loadAvailableMonths() {
  try {
    const response = await fetch('/api/report/months');
    const months = await response.json();
    
    // Populate all month filters
    const filterSelectors = ['monthlyMonthFilter', 'zonesMonthFilter', 'ageMonthFilter'];
    
    filterSelectors.forEach(selector => {
      const select = document.getElementById(selector);
      if (select) {
        // Clear existing options except "All"
        const options = select.querySelectorAll('option');
        options.forEach((opt, idx) => {
          if (idx > 0) opt.remove();
        });
        
        // Add new options
        months.forEach(month => {
          const option = document.createElement('option');
          option.value = month;
          
          // Format month as MM/YYYY
          const [year, monthNum] = month.split('-');
          const monthName = `${String(monthNum).padStart(2, '0')}/${year}`;
          option.textContent = monthName;
          
          select.appendChild(option);
        });
      }
    });
  } catch (err) {
    console.error('Error loading available months:', err);
  }
}

// Populate play zones and ticket types filters from settings
function populateDynamicFilters() {
  if (!settings) return;

  // Populate Play Zones filter
  const zoneFilter = document.getElementById('statZoneFilter');
  if (zoneFilter && settings.playZones) {
    // Clear existing options except "All"
    const options = zoneFilter.querySelectorAll('option');
    options.forEach((opt, idx) => {
      if (idx > 0) opt.remove();
    });

    // Add play zones from settings
    settings.playZones.forEach(zone => {
      const option = document.createElement('option');
      option.value = zone.name;
      option.textContent = zone.name;
      zoneFilter.appendChild(option);
    });
  }

  // Populate Ticket Types filter
  const ticketFilter = document.getElementById('statTicketFilter');
  if (ticketFilter && settings.passTypes) {
    // Clear existing options except "All"
    const options = ticketFilter.querySelectorAll('option');
    options.forEach((opt, idx) => {
      if (idx > 0) opt.remove();
    });

    // Add ticket types from settings
    settings.passTypes.forEach(pt => {
      const option = document.createElement('option');
      option.value = pt.duration;
      const durationDisplay = pt.duration === 'unlimited' ? 'Limitsiz' : `${pt.duration} dəq`;
      option.textContent = `${pt.name} (${durationDisplay})`;
      ticketFilter.appendChild(option);
    });
  }
}

// Switch report tab
function switchReportTab(tabName) {
  // Hide all tabs
  document.querySelectorAll('.report-tab').forEach(tab => {
    tab.classList.remove('active');
  });
  
  // Remove active class from all buttons
  document.querySelectorAll('.report-tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  // Show selected tab
  const tab = document.getElementById(`${tabName}ReportTab`);
  if (tab) tab.classList.add('active');
  
  // Find and highlight the button that matches this tab by checking onclick
  const buttons = document.querySelectorAll('.report-tab-btn');
  buttons.forEach(btn => {
    if (btn.getAttribute('onclick').includes(`'${tabName}'`)) {
      btn.classList.add('active');
    }
  });
  
  // Load report data
  switch(tabName) {
    case 'monthly':
      loadMonthlyReport();
      break;
    case 'zones':
      loadZonesReport();
      break;
    case 'age':
      loadAgeReport();
      break;
    case 'statistics':
      loadStatisticsReport();
      break;
  }
}

// Load statistics report (chart with filters)
async function loadStatisticsReport() {
  // Load and display analytics chart
  await updateAnalyticsChart();
}

// Load monthly report
async function loadMonthlyReport() {
  try {
    const month = document.getElementById('monthlyMonthFilter')?.value || '';
    const url = month ? `/api/report/monthly?month=${month}` : '/api/report/monthly';
    const response = await fetch(url);
    const data = await response.json();
    
    const container = document.getElementById('monthlyReportContent');
    if (data.length === 0) {
      container.innerHTML = '<p class="report-no-data">Məlumat yoxdur.</p>';
      return;
    }
    
    let html = '<table class="report-table"><thead><tr><th>Ay</th><th>Ümumi Uşaqlar</th><th>Günə Orta Uşaq Sayı</th><th>Ümumi Gəlir (AZN)</th><th>Günə Orta Gəlir (AZN)</th></tr></thead><tbody>';
    
    data.forEach(monthData => {
      const [year, monthNum] = monthData.month.split('-');
      const monthName = `${String(monthNum).padStart(2, '0')}/${year}`;
      
      html += `<tr>
        <td>${monthName}</td>
        <td>${monthData.totalChildren}</td>
        <td>${monthData.avgChildrenPerDay}</td>
        <td>${Math.round(monthData.totalRevenue)}</td>
        <td>${Math.round(monthData.avgRevenuePerDay)}</td>
      </tr>`;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
  } catch (err) {
    console.error('Error loading monthly report:', err);
    document.getElementById('monthlyReportContent').innerHTML = '<p class="report-no-data">Hesabat yüklənərkən xəta baş verdi.</p>';
  }
}

// Load play zones report
async function loadZonesReport() {
  try {
    const month = document.getElementById('zonesMonthFilter')?.value || '';
    const url = month ? `/api/report/play-zones?month=${month}` : '/api/report/play-zones';
    const response = await fetch(url);
    const data = await response.json();
    
    const container = document.getElementById('zonesReportContent');
    if (data.length === 0) {
      container.innerHTML = '<p class="report-no-data">Məlumat yoxdur.</p>';
      return;
    }
    
    let html = '<table class="report-table"><thead><tr><th>Oyun Zonası</th><th>Ümumi Uşaqlar</th><th>Populyarlıq</th><th>Ümumi Gəlir (AZN)</th><th>Orta Gəlir (AZN)</th></tr></thead><tbody>';
    
    data.forEach(zone => {
      html += `<tr>
        <td>${zone.zone}</td>
        <td>${zone.totalChildren}</td>
        <td>${Math.round(zone.percentageOfTotal)}%</td>
        <td>${Math.round(zone.totalRevenue)}</td>
        <td>${Math.round(zone.avgRevenuePerChild)}</td>
      </tr>`;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
  } catch (err) {
    console.error('Error loading zones report:', err);
    document.getElementById('zonesReportContent').innerHTML = '<p class="report-no-data">Hesabat yüklənərkən xəta baş verdi.</p>';
  }
}

// Load age demographics report
async function loadAgeReport() {
  try {
    const month = document.getElementById('ageMonthFilter')?.value || '';
    const url = month ? `/api/report/age-demographics?month=${month}` : '/api/report/age-demographics';
    const response = await fetch(url);
    const data = await response.json();
    
    const container = document.getElementById('ageReportContent');
    if (data.length === 0) {
      container.innerHTML = '<p class="report-no-data">Məlumat yoxdur.</p>';
      return;
    }
    
    let html = '<table class="report-table"><thead><tr><th>Yaş Qrupu</th><th>Ümumi Uşaqlar</th><th>Populyarlıq</th><th>Ümumi Gəlir (AZN)</th><th>Orta Gəlir (AZN)</th></tr></thead><tbody>';
    
    data.forEach(age => {
      html += `<tr>
        <td>${age.range} yaş</td>
        <td>${age.count}</td>
        <td>${Math.round(age.percentageOfTotal)}%</td>
        <td>${Math.round(age.revenue)}</td>
        <td>${Math.round(age.avgRevenuePerChild)}</td>
      </tr>`;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
  } catch (err) {
    console.error('Error loading age report:', err);
    document.getElementById('ageReportContent').innerHTML = '<p class="report-no-data">Hesabat yüklənərkən xəta baş verdi.</p>';
  }
}

// Update filtered statistics
async function updateFilteredStats() {
  const zone = document.getElementById('statZoneFilter')?.value || '';
  const ticketType = document.getElementById('statTicketFilter')?.value || '';
  const ageRange = document.getElementById('statAgeFilter')?.value || '';
  
  try {
    const params = new URLSearchParams();
    if (zone) params.append('zone', zone);
    if (ticketType) params.append('ticketType', ticketType);
    if (ageRange) params.append('ageRange', ageRange);
    
    const response = await fetch(`/api/stats/filtered-10days?${params}`);
    const data = await response.json();
    
    // Update chart with filtered data
    updateFilteredChart(data);
  } catch (err) {
    console.error('Error updating filtered stats:', err);
  }
}

// Update filtered analytics chart
function updateFilteredChart(stats) {
  const days = stats.map(s => {
    const date = new Date(s.date + 'T00:00:00');
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${day}.${month}`;
  });
  
  const childrenCounts = stats.map(s => s.children);
  const incomeCounts = stats.map(s => s.income);
  
    const ctx = document.getElementById('analyticsChart');
    if (!ctx) return;
    
    if (analyticsChart) {
      analyticsChart.destroy();
    }
    
    analyticsChart = new Chart(ctx.getContext('2d'), {
    type: 'line',
    data: {
      labels: days,
      datasets: [
        {
          label: 'Qəbul Edilən Uşaqlar',
          data: childrenCounts,
          borderColor: '#4CAF50',
          backgroundColor: 'rgba(76, 175, 80, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0,
          pointRadius: 5,
          pointBackgroundColor: '#4CAF50',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          yAxisID: 'y'
        },
        {
          label: 'Gəlir (AZN)',
          data: incomeCounts,
          borderColor: '#2196F3',
          backgroundColor: 'rgba(33, 150, 243, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0,
          pointRadius: 5,
          pointBackgroundColor: '#2196F3',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          display: true,
          labels: {
            font: { size: 12, weight: 'bold' },
            color: '#333',
            padding: 15
          }
        }
      },
      scales: {
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          title: {
            display: true,
            text: 'Uşaq Sayı'
          }
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          title: {
            display: true,
            text: 'Gəlir (AZN)'
          },
          grid: {
            drawOnChartArea: false,
          }
        }
      }
    }
  });
}
