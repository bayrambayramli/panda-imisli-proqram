// Global state
let currentDate = getTodayDate();
let timerIntervals = {};
let editingChildId = null;
let editingSource = null; // 'active' or 'completed'
let editingHistoryDate = null; // For history sessions, track the session's date (not currentDate)
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
    if (response.ok) {
      settings = await response.json();
    } else {
      console.error('Failed to load settings:', response.status, response.statusText);
      settings = null;
    }

    // Ensure playZones exists for backwards compatibility with old settings.json
    if (!settings) {
      settings = {
        passTypes: [],
        playZones: [],
        endDayHour: '22:00',
        tvPaginationFrequency: 5
      };
    } else if (!settings.playZones) {
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
      const event = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(`Auto-end check failed: ${response.status}`);
      }
      
      // Check if auto-end was triggered and it's a new event
      if (event?.triggered && event.timestamp !== lastAutoEndTimestamp) {
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
  document.getElementById('historyAddBtn').addEventListener('click', openHistoryAddModal);
  const historyNameSearch = document.getElementById('historyNameSearch');
  if (historyNameSearch) {
    historyNameSearch.addEventListener('input', () => loadHistoryData(false));
  }
  document.getElementById('historyExportBtn').addEventListener('click', async () => {
    const mode = document.querySelector('input[name="historyMode"]:checked').value;
    
    let url = '';
    let filename = '';
    
    if (mode === 'single') {
      const date = document.getElementById('historyDate').value;
      if (!date) {
        await showUiAlert('Zəhmət olmasa, tarixi seçin.');
        return;
      }
      url = `/api/exportExcel/${date}`;
      filename = `panda_imisli_${date}.xlsx`;
    } else {
      const startDate = document.getElementById('historyStartDate').value;
      const endDate = document.getElementById('historyEndDate').value;
      
      if (!startDate || !endDate) {
        await showUiAlert('Zəhmət olmasa, başlanğıc və son tarixi seçin.');
        return;
      }
      
      if (startDate > endDate) {
        await showUiAlert('Başlanğıc tarixi son tarixdən sonra ola bilməz.');
        return;
      }
      
      url = `/api/exportExcel?startDate=${startDate}&endDate=${endDate}`;
      filename = `panda_imisli_${startDate}_${endDate}.xlsx`;
    }
    
    try {
      const response = await fetch(url);
      if (!response.ok) {
        const errorData = await response.json();
        await showUiAlert(errorData.error || 'Excel faylını yükləmək mümkün olmadı.');
        return;
      }
      // If successful, download the file
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
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

  // Settings button
  const settingsBtn = document.getElementById('settingsBtn');
  if (settingsBtn) settingsBtn.addEventListener('click', openSettingsModal);
  const settingsCloseBtn = document.getElementById('settingsCloseBtn');
  if (settingsCloseBtn) settingsCloseBtn.addEventListener('click', closeSettingsModal);
  const settingsSaveBtn = document.getElementById('settingsSaveBtn');
  if (settingsSaveBtn) settingsSaveBtn.addEventListener('click', saveSettings);
  const settingsCancelBtn = document.getElementById('settingsCancelBtn');
  if (settingsCancelBtn) settingsCancelBtn.addEventListener('click', closeSettingsModal);
  const openPasswordResetBtn = document.getElementById('openPasswordResetBtn');
  if (openPasswordResetBtn) openPasswordResetBtn.addEventListener('click', openPasswordResetModal);
  const passwordResetCloseBtn = document.getElementById('passwordResetCloseBtn');
  if (passwordResetCloseBtn) passwordResetCloseBtn.addEventListener('click', closePasswordResetModal);
  const passwordResetCancelBtn = document.getElementById('passwordResetCancelBtn');
  if (passwordResetCancelBtn) passwordResetCancelBtn.addEventListener('click', closePasswordResetModal);
  const passwordResetSaveBtn = document.getElementById('passwordResetSaveBtn');
  if (passwordResetSaveBtn) passwordResetSaveBtn.addEventListener('click', savePasswordReset);
  ['currentAccessPassword', 'newAccessPassword', 'confirmAccessPassword'].forEach(id => {
    const input = document.getElementById(id);
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          savePasswordReset();
        }
      });
    }
  });

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
  document.getElementById('uiPromptInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (_uiAlertResolve) {
        closeUiAlert();
      } else if (_uiPromptResolve) {
        closeUiPrompt(true);
      }
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
    if (e.target === document.getElementById('passwordResetModal')) closePasswordResetModal();
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
    if (tvBtn) tvBtn.classList.toggle('is-hidden', isNow);
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
    input.classList.add('is-hidden');
    const cancelBtn = document.getElementById('uiPromptCancel');
    const okBtn = document.getElementById('uiPromptOk');
    if (cancelBtn) cancelBtn.classList.add('is-hidden');
    if (okBtn) okBtn.classList.remove('is-hidden');
    modal.classList.add('show');
    _uiAlertResolve = resolve;
  });
}

function closeUiAlert() {
  const modal = document.getElementById('uiPromptModal');
  const cancelBtn = document.getElementById('uiPromptCancel');
  const okBtn = document.getElementById('uiPromptOk');
  modal.classList.remove('show');
  if (cancelBtn) cancelBtn.classList.remove('is-hidden');
  if (okBtn) okBtn.classList.remove('is-hidden');
  if (_uiAlertResolve) {
    _uiAlertResolve(true);
    _uiAlertResolve = null;
  }
}

function setUiPromptError(message = '') {
  const errorEl = document.getElementById('uiPromptError');
  if (!errorEl) return;

  if (message) {
    errorEl.textContent = message;
    errorEl.classList.remove('is-hidden');
  } else {
    errorEl.textContent = '';
    errorEl.classList.add('is-hidden');
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
    if (cancelBtn) cancelBtn.classList.remove('is-hidden');
    if (okBtn) okBtn.classList.remove('is-hidden');
    setUiPromptError(options.errorMessage || '');
    
    if (options.input) {
      input.classList.remove('is-hidden');
      input.type = options.inputType || 'text';
      input.name = options.inputName || 'uiPromptInput';
      input.autocomplete = options.inputType === 'password' ? 'new-password' : 'off';
      input.autocapitalize = 'off';
      input.autocorrect = 'off';
      input.spellcheck = false;
      input.value = options.defaultValue || '';
    } else {
      input.classList.add('is-hidden');
      input.type = 'text';
      input.name = 'uiPromptInput';
      input.autocomplete = 'off';
    }

    modal.classList.add('show');
    if (options.input) {
      window.requestAnimationFrame(() => {
        input.focus({ preventScroll: true });
        input.select();
      });
    }

    _uiPromptResolve = resolve;
  });
}

function closeUiPrompt(ok) {
  const modal = document.getElementById('uiPromptModal');
  const input = document.getElementById('uiPromptInput');
  modal.classList.remove('show');
  input.type = 'text';
  input.name = 'uiPromptInput';
  input.autocomplete = 'off';
  setUiPromptError('');
  if (_uiPromptResolve) {
    if (ok) {
      if (!input.classList.contains('is-hidden')) {
        _uiPromptResolve(input.value);
      } else {
        _uiPromptResolve(true);
      }
    } else {
      _uiPromptResolve(false);
    }
    _uiPromptResolve = null;
  }
}

async function verifyProtectedViewAccess(viewName) {
  let inlineError = '';

  while (true) {
    const password = await showUiPrompt(`${viewName} üçün şifrəni daxil edin:`, {
      input: true,
      inputType: 'password',
      inputName: 'accessPromptInput',
      defaultValue: '',
      errorMessage: inlineError
    });

    if (password === false) {
      return false;
    }

    if (!String(password).trim()) {
      inlineError = 'Şifrə tələb olunur!';
      continue;
    }

    try {
      const response = await fetch('/api/access/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ password })
      });

      const result = await response.json().catch(() => null);
      if (response.ok) {
        return true;
      }

      inlineError = result?.error || 'Giriş təsdiqlənmədi.';
    } catch (error) {
      console.error('Error verifying protected view access:', error);
      inlineError = 'Giriş yoxlanılarkən xəta baş verdi.';
    }
  }
}

// Load data from server
async function loadData() {
  try {
    const response = await fetch(`/api/data/${currentDate}`);
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const message = data?.error || 'Məlumat yüklənə bilmədi.';
      throw new Error(message);
    }
    
    renderActiveSessions(data.active || []);
    renderCompletedSessions(data.completed || []);
  } catch (error) {
    console.error('Error loading data:', error);
    await showUiAlert('Məlumat yüklənərkən xəta baş verdi. Yenidən cəhd edin.');
  }
}

// Build session count text with zone breakdown
function buildSessionCountText(children) {
  if (children.length === 0) return '0';
  const zoneCounts = {};
  children.forEach(child => {
    zoneCounts[child.playZone] = (zoneCounts[child.playZone] || 0) + 1;
  });
  const parts = [`Cəmi: ${children.length}`];
  if (settings && settings.playZones) {
    settings.playZones.forEach(zone => {
      if (zoneCounts[zone.name]) parts.push(`${zone.name}: ${zoneCounts[zone.name]}`);
    });
  }
  return parts.join(', ');
}

function formatAgeValue(age) {
  return age === undefined || age === null || age === '' ? '-' : age;
}

// Render active sessions
function renderActiveSessions(children) {
  const tbody = document.getElementById('activeTableBody');
  const noMsg = document.getElementById('noActiveMsg');
  const count = document.getElementById('activeCount');
  
  tbody.innerHTML = '';
  count.textContent = buildSessionCountText(children);
  
  if (children.length === 0) {
    noMsg.classList.remove('is-hidden');
    return;
  }
  
  noMsg.classList.add('is-hidden');
  
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
  count.textContent = buildSessionCountText(children);
  
  if (children.length === 0) {
    noMsg.classList.remove('is-hidden');
    return;
  }
  
  noMsg.classList.add('is-hidden');
  
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

  row.innerHTML = `
    <td>${child.name}</td>
    <td>${formatAgeValue(child.age)}</td>
    <td>${child.playZone}</td>
    <td>${startTimeStr}</td>
    <td id="timer-cell-${child.id}" class="timer-cell"><span id="timer-${child.id}" class="timer">--:--</span></td>
    <td>${child.passTypeName || (child.duration === 'unlimited' ? 'Limitsiz' : child.duration + ' dəq')}</td>
    <td>${child.price} AZN</td>
    <td>${notesContent}</td>
    <td>
      <div class="actions-cell">
        <button class="btn-action btn-edit" onclick="openEditModal('${child.id}', 'active')">Dəyişdir</button>
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
    <td>${formatAgeValue(child.age)}</td>
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
  if (!name || !playZone || !passTypeId) {
    await showUiAlert('Zəhmət olmasa, bütün tələb olunan xanaları doldurun (*).');
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
        age: age ? parseInt(age) : '-',
        playZone,
        duration: passType.duration,
        price: passType.price,
        passTypeId: passType.id,
        passTypeName: passType.name,
        notes
      })
    });
    
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      const message = result?.error || 'Uşaq əlavə etmək mümkün olmadı.';
      await showUiAlert(message);
      return;
    }
    
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
  const totalDuration = (durationMinutes + 1) * 60 * 1000; // Add 1 minute prep time
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
    const response = await fetch(`/api/children/${childId}/end?date=${currentDate}`, {
      method: 'POST'
    });

    const result = await response.json().catch(() => null);
    if (!response.ok) {
      const message = result?.error || 'Seansı bitirmək mümkün olmadı.';
      await showUiAlert(message);
      return;
    }

    // Clear timer
    if (timerIntervals[childId]) {
      clearInterval(timerIntervals[childId]);
    }

    loadData();
  } catch (error) {
    console.error('Error ending session:', error);
    await showUiAlert('Seansı bitirərkən xəta baş verdi. Yenidən cəhd edin.');
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
  const delConfirm = await showUiPrompt('Bu seansı silmək istəyirsiniz? Bu əməliyyatı geri qaytarmaq mümkün olmayacaq.');
  if (!delConfirm) {
    return;
  }
  
  try {
    const response = await fetch(`/api/children/${childId}?date=${currentDate}`, {
      method: 'DELETE'
    });

    const result = await response.json().catch(() => null);
    if (!response.ok) {
      const message = result?.error || 'Seansı silmək mümkün olmadı.';
      await showUiAlert(message);
      return;
    }
    
    // Clear timer
    if (timerIntervals[childId]) {
      clearInterval(timerIntervals[childId]);
    }
    
    loadData();
  } catch (error) {
    console.error('Error deleting child:', error);
    await showUiAlert('Seansı silərkən xəta baş verdi. Yenidən cəhd edin.');
  }
}

// Delete a session from history (completed)
async function deleteHistorySession(childId, date) {
  const delConfirm = await showUiPrompt('Bu seansı silmək istəyirsiniz? Bu əməliyyatı geri qaytarmaq mümkün olmayacaq.');
  if (!delConfirm) return;

  try {
    const response = await fetch(`/api/children/${childId}?date=${date}`, { method: 'DELETE' });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      const message = result?.error || 'Seansı silmək mümkün olmadı.';
      await showUiAlert(message);
      return;
    }
    loadHistoryData(false);
  } catch (error) {
    console.error('Error deleting history session:', error);
    await showUiAlert('Seansı silərkən xəta baş verdi.');
  }
}

// Edit notes
async function editNotes(childId) {
  const response = await fetch(`/api/data/${currentDate}`);
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.error || 'Məlumat yüklənə bilmədi.';
    await showUiAlert(message);
    return;
  }
  
  let child = data.active.find(c => c.id == childId);
  if (!child) {
    child = data.completed.find(c => c.id == childId);
  }
  
  if (!child) return;
  
  const newNotes = await showUiPrompt('Qeyd əlavə edin:', { input: true, defaultValue: child.notes || '' });

  if (newNotes !== false) {
    try {
      const updateResponse = await fetch(`/api/children/${childId}?date=${currentDate}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: newNotes })
      });
      const updateResult = await updateResponse.json().catch(() => null);
      if (!updateResponse.ok) {
        const message = updateResult?.error || 'Qeyd yenilənə bilmədi.';
        await showUiAlert(message);
        return;
      }

      loadData();
    } catch (error) {
      console.error('Error updating notes:', error);
      await showUiAlert('Qeyd yenilənərkən xəta baş verdi. Yenidən cəhd edin.');
    }
  }
}


// Open edit modal
async function openEditModal(childId, source, historyDate = null) {
  editingChildId = childId;
  editingSource = source;
  editingHistoryDate = historyDate;
  const editModalTitle = document.querySelector('#editModal .modal-content h2');
  if (editModalTitle) editModalTitle.textContent = 'Məlumatları Dəyiş';
  
  // Use historyDate if provided (for history sessions), otherwise use currentDate
  const dateToUse = historyDate || currentDate;
  
  const response = await fetch(`/api/data/${dateToUse}`);
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.error || 'Məlumat yüklənə bilmədi.';
    await showUiAlert(message);
    return;
  }
  
  let child;
  if (source === 'active') {
    child = data.active.find(c => c.id == childId);
  } else {
    child = data.completed.find(c => c.id == childId);
  }
  
  if (!child) return;
  
  // Populate modal
  document.getElementById('editName').value = child.name;
  document.getElementById('editAge').value = child.age === "-" ? "" : child.age;
  document.getElementById('editPlayZone').value = child.playZone;
  document.getElementById('editNotes').value = child.notes || '';
  
  // Show/hide time fields based on source
  const startTimeGroup = document.getElementById('editStartTimeGroup');
  const endTimeGroup = document.getElementById('editEndTimeGroup');
  const startTimeInput = document.getElementById('editStartTime');
  const endTimeInput = document.getElementById('editEndTime');
  
  if (source === 'history') {
    // For history sessions, show both start and end times
    startTimeGroup.classList.remove('is-hidden');
    endTimeGroup.classList.remove('is-hidden');
    
    if (child.startTime) {
      const startDate = new Date(child.startTime);
      const hours = String(startDate.getHours()).padStart(2, '0');
      const minutes = String(startDate.getMinutes()).padStart(2, '0');
      startTimeInput.value = `${hours}:${minutes}`;
    }
    
    if (child.endTime) {
      const endDate = new Date(child.endTime);
      const hours = String(endDate.getHours()).padStart(2, '0');
      const minutes = String(endDate.getMinutes()).padStart(2, '0');
      endTimeInput.value = `${hours}:${minutes}`;
    } else {
      // Default end time (1 hour after start if available, otherwise suggest)
      if (child.startTime) {
        const startDate = new Date(child.startTime);
        const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
        const hours = String(endDate.getHours()).padStart(2, '0');
        const minutes = String(endDate.getMinutes()).padStart(2, '0');
        endTimeInput.value = `${hours}:${minutes}`;
      }
    }
  } else if (source === 'active' && child.startTime) {
    // For active sessions, show only start time
    startTimeGroup.classList.remove('is-hidden');
    endTimeGroup.classList.add('is-hidden');
    const startDate = new Date(child.startTime);
    const hours = String(startDate.getHours()).padStart(2, '0');
    const minutes = String(startDate.getMinutes()).padStart(2, '0');
    startTimeInput.value = `${hours}:${minutes}`;
  } else {
    startTimeGroup.classList.add('is-hidden');
    endTimeGroup.classList.add('is-hidden');
    startTimeInput.value = '';
    endTimeInput.value = '';
  }
  
  // Find and set the correct pass type in the dropdown
  if (child.passTypeId && settings.passTypes) {
    const passType = settings.passTypes.find(pt => pt.id.toString() === child.passTypeId.toString());
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
  editingHistoryDate = null;
}

// Save edit
async function saveEdit() {
  const passTypeId = document.getElementById('editDuration').value;
  
  // Get pass type details
  const passType = settings.passTypes.find(pt => pt.id.toString() === passTypeId);
  if (!passType) {
    await showUiAlert('Seçilmiş bilet tipi tapılmadı.');
    return;
  }
  
  const name = document.getElementById('editName').value.trim();
  const ageValue = document.getElementById('editAge').value;
  const age = ageValue ? parseInt(ageValue) : "-";
  const playZone = document.getElementById('editPlayZone').value;
  const notes = document.getElementById('editNotes').value;
  
  // Validate required fields
  if (!name) {
    await showUiAlert('Ad boş ola bilməz.');
    return;
  }
  if (!playZone) {
    await showUiAlert('Zona seçilməlidir.');
    return;
  }
  
  // Use editingHistoryDate if provided, otherwise currentDate
  const dateToUse = editingHistoryDate || currentDate;
  
  // Handle new history session (add)
  if (editingSource === 'history' && !editingChildId) {
    const startTimeInput = document.getElementById('editStartTime').value;
    const endTimeInput = document.getElementById('editEndTime').value;
    
    if (!startTimeInput || !endTimeInput) {
      await showUiAlert('Başlama və bitmə vaxtları seçilməlidir.');
      return;
    }
    
    // Validate times
    const [startH, startM] = startTimeInput.split(':').map(Number);
    const [endH, endM] = endTimeInput.split(':').map(Number);
    if (endH * 60 + endM < startH * 60 + startM) {
      await showUiAlert('Bitmə vaxtı başlama vaxtından sonra olmalıdır.');
      return;
    }
    
    try {
      const startISO = new Date(`${dateToUse}T${startTimeInput}:00`).toISOString();
      const endISO = new Date(`${dateToUse}T${endTimeInput}:00`).toISOString();
      
      const response = await fetch('/api/history/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: dateToUse,
          name,
          age,
          playZone,
          duration: passType.duration,
          price: passType.price,
          passTypeId: passType.id,
          passTypeName: passType.name,
          notes,
          startTime: startISO,
          endTime: endISO
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        await showUiAlert(errorData.error || 'Seansı əlavə etmək mümkün olmadı.');
        return;
      }
      
      closeModal();
      loadHistoryData(false);
      await showUiAlert('Seans uğurla əlavə edildi.');
    } catch (error) {
      console.error('Error adding history session:', error);
      await showUiAlert('Seansı əlavə edilərkən xəta baş verdi.');
    }
    return;
  }
  
  if (!editingChildId) return;
  
  const updates = {
    name,
    age,
    playZone,
    duration: passType.duration,
    price: passType.price,
    passTypeId: passType.id,
    passTypeName: passType.name,
    notes
  };
  
  // Handle time fields based on source
  if (editingSource === 'active') {
    // For active sessions, update start time if provided
    const startTimeInput = document.getElementById('editStartTime').value;
    if (startTimeInput) {
      // Get the current date from the child being edited
      const response = await fetch(`/api/data/${dateToUse}`);
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const message = data?.error || 'Məlumat yüklənə bilmədi.';
        await showUiAlert(message);
        return;
      }
      const child = data.active.find(c => c.id == editingChildId);
      
      if (child && child.startTime) {
        // Keep the same date, update only time
        const startDate = new Date(child.startTime);
        const [hours, minutes] = startTimeInput.split(':');
        startDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
        updates.startTime = startDate.toISOString();
      }
    }
  } else if (editingSource === 'history') {
    // For history sessions, handle both start and end times
    const startTimeInput = document.getElementById('editStartTime').value;
    const endTimeInput = document.getElementById('editEndTime').value;

    if (startTimeInput && endTimeInput) {
      const [startH, startM] = startTimeInput.split(':').map(Number);
      const [endH, endM] = endTimeInput.split(':').map(Number);
      if (endH * 60 + endM < startH * 60 + startM) {
        await showUiAlert('Bitmə vaxtı başlama vaxtından sonra olmalıdır.');
        return;
      }
    }
    
    if (startTimeInput || endTimeInput) {
      const response = await fetch(`/api/data/${dateToUse}`);
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const message = data?.error || 'Məlumat yüklənə bilmədi.';
        await showUiAlert(message);
        return;
      }
      const child = data.completed.find(c => c.id == editingChildId);
      
      if (child) {
        if (startTimeInput) {
          const startDate = new Date(child.startTime || `${dateToUse}T00:00:00`);
          const [hours, minutes] = startTimeInput.split(':');
          startDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
          updates.startTime = startDate.toISOString();
        }
        
        if (endTimeInput) {
          const endDate = new Date(child.endTime || child.startTime || `${dateToUse}T00:00:00`);
          const [hours, minutes] = endTimeInput.split(':');
          endDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
          updates.endTime = endDate.toISOString();
        }
      }
    }
  }
  
  const savedSource = editingSource;
  try {
    const response = await fetch(`/api/children/${editingChildId}?date=${dateToUse}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      const message = result?.error || 'Dəyişikliklər saxlanmadı.';
      await showUiAlert(message);
      return;
    }
    
    closeModal();
    
    // Reload appropriate data based on source
    if (savedSource === 'history') {
      loadHistoryData(false);
    } else {
      loadData();
    }
  } catch (error) {
    console.error('Error saving changes:', error);
    await showUiAlert('Dəyişikliklər saxlanarkən xəta baş verdi. Yenidən cəhd edin.');
  }
}

// ===== ANALYTICS CHART FUNCTIONS =====

// Build reusable Chart.js configuration for analytics charts
function buildChartConfig(labels, childrenCounts, incomeCounts) {
  const maxChildren = Math.max(...childrenCounts, 0);
  const maxIncome = Math.max(...incomeCounts, 0);
  const suggestedChildrenMax = maxChildren === 0 ? 1 : undefined;
  const suggestedIncomeMax = maxIncome === 0 ? 1 : undefined;

  return {
    type: 'line',
    data: {
      labels,
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
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          labels: { font: { size: 12, weight: 'bold' }, color: '#333', padding: 15 }
        }
      },
      scales: {
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          title: { display: true, text: 'Uşaq Sayı', font: { size: 12, weight: 'bold' } },
          grid: { color: 'rgba(0, 0, 0, 0.05)' },
          min: 0,
          suggestedMin: 0,
          suggestedMax: suggestedChildrenMax,
          ticks: {
            beginAtZero: true,
            callback: value => Math.max(0, value)
          }
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          title: { display: true, text: 'Gəlir (AZN)', font: { size: 12, weight: 'bold' } },
          grid: { drawOnChartArea: false },
          min: 0,
          suggestedMin: 0,
          suggestedMax: suggestedIncomeMax,
          ticks: {
            beginAtZero: true,
            callback: value => Math.max(0, value)
          }
        }
      }
    }
  };
}

// History Modal Functions
async function openHistoryModal() {
  const isAuthorized = await verifyProtectedViewAccess('Tarixçə');
  if (!isAuthorized) {
    return;
  }

  // Ensure stats modal is closed when opening history
  closeStatsModal();
  const today = getTodayDate();
  
  // Set single day mode
  document.querySelector('input[name="historyMode"][value="single"]').checked = true;
  document.getElementById('historyDate').value = today;
  document.getElementById('historyStartDate').value = today;
  document.getElementById('historyEndDate').value = today;
  
  // Show single day mode and add button
  document.getElementById('historySingleDayMode').classList.remove('is-hidden');
  document.getElementById('historyDateRangeMode').classList.add('is-hidden');
  const addBtn = document.getElementById('historyAddBtn');
  if (addBtn) addBtn.classList.remove('is-hidden');
  
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

// Toggle between single day and date range history mode
function toggleHistoryMode() {
  const mode = document.querySelector('input[name="historyMode"]:checked').value;
  const singleDayGroup = document.getElementById('historySingleDayMode');
  const dateRangeGroup = document.getElementById('historyDateRangeMode');
  const addBtn = document.getElementById('historyAddBtn');
  const today = getTodayDate();
  
  if (mode === 'single') {
    singleDayGroup.classList.remove('is-hidden');
    dateRangeGroup.classList.add('is-hidden');
    // Set single day date to today
    document.getElementById('historyDate').value = today;
    // Show add button only in single day mode
    if (addBtn) addBtn.classList.remove('is-hidden');
  } else {
    singleDayGroup.classList.add('is-hidden');
    dateRangeGroup.classList.remove('is-hidden');
    // Set date range to today
    document.getElementById('historyStartDate').value = today;
    document.getElementById('historyEndDate').value = today;
    // Hide add button in range mode
    if (addBtn) addBtn.classList.add('is-hidden');
  }
  
  // Clear search and reload
  const nameSearchInput = document.getElementById('historyNameSearch');
  if (nameSearchInput) {
    nameSearchInput.value = '';
  }
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
  
  btn.textContent = isFullscreen ? 'Tam Ekrandan Çıx' : 'Tam Ekran';
  
  // Trigger chart resize when toggling fullscreen
  setTimeout(() => {
    if (analyticsChart) {
      analyticsChart.resize();
    }
  }, 100);
}

// Stats Modal Functions
async function openStatsModal() {
  const isAuthorized = await verifyProtectedViewAccess('Bu gün');
  if (!isAuthorized) {
    return;
  }

  const date = currentDate;
  try {
    // make sure other modals are closed
    closeHistoryModal();

    const resp = await fetch(`/api/data/${date}`);
    const data = await resp.json().catch(() => null);
    if (!resp.ok) {
      const message = data?.error || 'Statistikalar yüklənə bilmədi.';
      throw new Error(message);
    }

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

    // Update modal title with date
    const dateDisplay = document.getElementById('dateDisplay').textContent;
    document.querySelector('#statsModal h2').textContent = `📊 Bu gün: ${dateDisplay}`;

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

// Open modal to add a new session to history (retrospective)
async function openHistoryAddModal() {
  const selectedDate = document.getElementById('historyDate').value;
  if (!selectedDate) {
    await showUiAlert('Zəhmət olmasa, tarixi seçin.');
    return;
  }
  
  // Clear form fields for new entry
  editingSource = 'history';
  editingHistoryDate = selectedDate;
  editingChildId = null;
  const editModalTitle = document.querySelector('#editModal .modal-content h2');
  if (editModalTitle) editModalTitle.textContent = 'Seans Əlavə Et';
  
  // Clear form
  document.getElementById('editName').value = '';
  document.getElementById('editAge').value = '';
  document.getElementById('editPlayZone').value = '';
  document.getElementById('editDuration').value = '';
  document.getElementById('editNotes').value = '';
  
  // Auto-select first available options
  const editPlayZoneSelect = document.getElementById('editPlayZone');
  const editDurationSelect = document.getElementById('editDuration');
  const editAgeSelect = document.getElementById('editAge');
  
  // Select first play zone if available
  if (editPlayZoneSelect && editPlayZoneSelect.options.length > 0) {
    editPlayZoneSelect.value = editPlayZoneSelect.options[0].value;
  }
  
  // Select first pass type if available
  if (editDurationSelect && editDurationSelect.options.length > 0) {
    editDurationSelect.value = editDurationSelect.options[0].value;
  }
  
  // Select age 6 option if available
  if (editAgeSelect && editAgeSelect.options.length > 0) {
    editAgeSelect.value = '6'; // Select age 6 by value instead of index
  }

  // Set time fields
  const startTimeGroup = document.getElementById('editStartTimeGroup');
  const endTimeGroup = document.getElementById('editEndTimeGroup');
  startTimeGroup.classList.remove('is-hidden');
  endTimeGroup.classList.remove('is-hidden');
  document.getElementById('editStartTime').value = '11:00';
  document.getElementById('editEndTime').value = '12:00';
  
  // Show modal
  document.getElementById('editModal').classList.add('show');
}

// Open modal to edit an existing history session
async function openHistoryEditModal(childId, sessionDate) {
  if (!sessionDate) {
    await showUiAlert('Seans tarixi tapılmadı.');
    return;
  }
  await openEditModal(childId, 'history', sessionDate);
}

async function loadHistoryData(showAlertIfEmpty = false) {
  const mode = document.querySelector('input[name="historyMode"]:checked').value;
  const nameSearchInput = document.getElementById('historyNameSearch');
  const searchTerm = nameSearchInput ? nameSearchInput.value.trim().toLowerCase() : '';
  
  let url = '';
  
  if (mode === 'single') {
    const selectedDate = document.getElementById('historyDate').value;
    if (!selectedDate) {
      await showUiAlert('Zəhmət olmasa, tarixi seçin.');
      return;
    }
    url = `/api/history/${selectedDate}`;
  } else {
    const startDate = document.getElementById('historyStartDate').value;
    const endDate = document.getElementById('historyEndDate').value;
    
    if (!startDate || !endDate) {
      await showUiAlert('Zəhmət olmasa, başlanğıc və son tarixi seçin.');
      return;
    }
    
    if (startDate > endDate) {
      await showUiAlert('Başlanğıc tarixi son tarixdən sonra ola bilməz.');
      return;
    }
    
    url = `/api/history?startDate=${startDate}&endDate=${endDate}`;
  }
  
  try {
    const response = await fetch(url);
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.error || 'Tarixçə yüklənə bilmədi.');
    }
    renderHistoryContent(data, searchTerm, showAlertIfEmpty);
  } catch (error) {
    console.error('Error loading history:', error);
    document.getElementById('historyContent').innerHTML = '<p class="no-data-msg">Məlumat yüklənərkən xəta baş verdi.</p>';
  }
}

function renderHistoryContent(data, searchTerm, showAlertIfEmpty) {
  
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
        showUiAlert('Bu tarixdə bitmiş seans yoxdur. Zəhmət olmasa, başqa tarix seçin.');
      }
      // Always show static message in panel
      html = '<p class="no-data-msg">Bu tarixdə bitmiş seans yoxdur. Zəhmət olmasa, başqa tarix seçin.</p>';
    } else if (filteredCompleted.length === 0) {
      html = '<p class="no-data-msg">Axtarışa uyğun bitmiş seans tapılmadı.</p>';
    } else {
      // Sort the data
      const sortedCompleted = sortHistoryData([...filteredCompleted]);
      const completedRevenue = sortedCompleted.reduce((sum, child) => sum + (parseFloat(child.price) || 0), 0);
      
      html += `
        <div class="history-section">
          <h3 class="history-section-title">✅ Bitmiş Seanslar (Cəmi: ${sortedCompleted.length} uşaq. Gəlir: ${completedRevenue.toFixed(2)} AZN)</h3>
          <table class="history-table">
            <thead>
              <tr>
                <th class="sortable" onclick="sortHistoryBy('name')">Ad ${getSortIndicator('name')}</th>
                <th class="sortable" onclick="sortHistoryBy('age')">Yaş ${getSortIndicator('age')}</th>
                <th class="sortable" onclick="sortHistoryBy('playZone')">Zona ${getSortIndicator('playZone')}</th>
                <th class="sortable" onclick="sortHistoryBy('duration')">Müddət ${getSortIndicator('duration')}</th>
                <th class="sortable" onclick="sortHistoryBy('price')">Məbləğ ${getSortIndicator('price')}</th>
                <th class="sortable" onclick="sortHistoryBy('date')">Tarix ${getSortIndicator('date')}</th>
                <th class="sortable" onclick="sortHistoryBy('startTime')">Başlama Vaxtı ${getSortIndicator('startTime')}</th>
                <th class="sortable" onclick="sortHistoryBy('endTime')">Bitmə Vaxtı ${getSortIndicator('endTime')}</th>
                <th>Qeydlər</th>
                <th>Əməliyyat</th>
              </tr>
            </thead>
            <tbody>
              ${sortedCompleted.map(child => {
                const startDate = child.startTime ? new Date(child.startTime) : null;
                const dateStr = startDate ? `${String(startDate.getDate()).padStart(2, '0')}.${String(startDate.getMonth() + 1).padStart(2, '0')}.${startDate.getFullYear()}` : '-';
                const sessionDate = startDate ? startDate.toISOString().split('T')[0] : '';
                return `
                  <tr>
                    <td>${child.name}</td>
                    <td>${formatAgeValue(child.age)}</td>
                    <td>${child.playZone}</td>
                    <td>${child.duration === 'unlimited' ? 'Limitsiz' : (child.duration + ' dəq')}</td>
                    <td>${child.price} AZN</td>
                    <td>${dateStr}</td>
                    <td>${startDate ? startDate.toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                    <td>${child.endTime ? new Date(child.endTime).toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                    <td>${child.notes || '-'}</td>
                    <td>
                      <div class="actions-cell">
                        <button class="btn-action btn-edit" onclick="openHistoryEditModal('${child.id}', '${sessionDate}')">Dəyişdir</button>
                        <button class="btn-action btn-delete" onclick="deleteHistorySession('${child.id}', '${sessionDate}')">Sil</button>
                      </div>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
    }
    contentDiv.innerHTML = html;
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
      
      case 'date':
        aVal = a.startTime ? new Date(a.startTime).getTime() : 0;
        bVal = b.startTime ? new Date(b.startTime).getTime() : 0;
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
  closePasswordResetModal();
}

function setPasswordResetMessage(message = '', type = 'error') {
  const messageEl = document.getElementById('passwordResetMessage');
  if (!messageEl) return;

  if (!message) {
    messageEl.textContent = '';
    messageEl.classList.add('is-hidden');
    messageEl.classList.remove('is-error', 'is-success');
    return;
  }

  messageEl.textContent = message;
  messageEl.classList.remove('is-hidden', 'is-error', 'is-success');
  messageEl.classList.add(type === 'success' ? 'is-success' : 'is-error');
}

function openPasswordResetModal() {
  const currentPasswordInput = document.getElementById('currentAccessPassword');
  const newPasswordInput = document.getElementById('newAccessPassword');
  const confirmPasswordInput = document.getElementById('confirmAccessPassword');

  if (currentPasswordInput) currentPasswordInput.value = '';
  if (newPasswordInput) newPasswordInput.value = '';
  if (confirmPasswordInput) confirmPasswordInput.value = '';
  setPasswordResetMessage('');

  const modal = document.getElementById('passwordResetModal');
  if (modal) modal.classList.add('show');

  if (currentPasswordInput) {
    window.requestAnimationFrame(() => {
      currentPasswordInput.focus({ preventScroll: true });
    });
  }
}

function closePasswordResetModal() {
  const modal = document.getElementById('passwordResetModal');
  if (modal) modal.classList.remove('show');
  setPasswordResetMessage('');
}

async function savePasswordReset() {
  const currentAccessPassword = document.getElementById('currentAccessPassword').value.trim();
  const newAccessPassword = document.getElementById('newAccessPassword').value.trim();
  const confirmAccessPassword = document.getElementById('confirmAccessPassword').value.trim();

  if (!currentAccessPassword || !newAccessPassword || !confirmAccessPassword) {
    setPasswordResetMessage('Şifrəni dəyişdirmək üçün bütün şifrə sahələrini doldurun.');
    return;
  }

  if (newAccessPassword !== confirmAccessPassword) {
    setPasswordResetMessage('Yeni şifrələr uyğun gəlmir.');
    return;
  }

  try {
    const response = await fetch('/api/settings/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentAccessPassword,
        newAccessPassword,
        confirmAccessPassword
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      setPasswordResetMessage(errorData?.error || 'Şifrə yenilənərkən xəta baş verdi.');
      return;
    }

    setPasswordResetMessage('Şifrə uğurla yeniləndi.', 'success');
    document.getElementById('currentAccessPassword').value = '';
    document.getElementById('newAccessPassword').value = '';
    document.getElementById('confirmAccessPassword').value = '';
  } catch (err) {
    console.error('Error updating password:', err);
    setPasswordResetMessage('Şifrə yenilənərkən xəta baş verdi.');
  }
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

  // if (!endDayTime || !endDayTime.match(/^([0-1]\d|2[0-3]):[0-5]\d$/)) {
  //   await showUiAlert('Zəhmət olmasa, günün bitmə vaxtını düzgün formatda daxil edin. Nümunə: 22:00');
  //   return;
  // }

  try {
    const response = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        passTypes,
        playZones,
        endDayHour: endDayTime,
        tvPaginationFrequency,
        tvShowUnlimitedPassTypes,
        tvCustomMessage,
        tvCustomMessageEnabled
      })
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
      const errorData = await response.json().catch(() => null);
      await showUiAlert(errorData?.error || 'Dəyişiklikləri yadda saxlayarkən xəta baş verdi. Yenidən cəhd edin.');
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
      
      // Only add placeholder option to main form select, not to edit modal
      if (select.id === 'duration') {
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Bilet seçin';
        select.appendChild(defaultOption);
      }
      
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
    fullscreenBtn.textContent = 'Tam Ekran';
  }
}

// Load available months for filtering
async function loadAvailableMonths() {
  try {
    const response = await fetch('/api/report/months');
    const months = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(months?.error || 'Hesabat ayları yüklənmədi.');
    }
    
    // Populate all month filters
    const filterSelectors = ['monthlyMonthFilter', 'zonesMonthFilter'];
    
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
    case 'statistics':
      loadStatisticsReport();
      break;
  }
}

// Load statistics report (chart with filters)
async function loadStatisticsReport() {
  // Use updateFilteredStats so current filter selections are respected
  await updateFilteredStats();
}

// Load monthly report
async function loadMonthlyReport() {
  try {
    const month = document.getElementById('monthlyMonthFilter')?.value || '';
    const url = month ? `/api/report/monthly?month=${month}` : '/api/report/monthly';
    const response = await fetch(url);
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.error || 'Aylıq hesabat yüklənə bilmədi.');
    }
    
    const container = document.getElementById('monthlyReportContent');
    if (data.length === 0) {
      container.innerHTML = '<p class="report-no-data">Məlumat yoxdur.</p>';
      return;
    }
    
    let html = '<table class="report-table"><thead><tr><th>Ay</th><th>Ümumi Uşaq Sayı</th><th>Ümumi Gəlir (AZN)</th><th>Günlük Orta Uşaq Sayı</th><th>Günlük Orta Gəlir (AZN)</th></tr></thead><tbody>';
    
    data.forEach(monthData => {
      const [year, monthNum] = monthData.month.split('-');
      const monthName = `${String(monthNum).padStart(2, '0')}/${year}`;
      
      html += `<tr>
        <td>${monthName}</td>
        <td>${monthData.totalChildren}</td>
        <td>${Math.round(monthData.totalRevenue)}</td>
        <td>${monthData.avgChildrenPerDay}</td>
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
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.error || 'Zona hesabatı yüklənə bilmədi.');
    }
    
    const container = document.getElementById('zonesReportContent');
    if (data.length === 0) {
      container.innerHTML = '<p class="report-no-data">Məlumat yoxdur.</p>';
      return;
    }
    
    let html = '<table class="report-table"><thead><tr><th>Oyun Zonası</th><th>Ümumi Uşaq Sayı</th><th>Ümumi Gəlir (AZN)</th><th>Uşaq Başına Orta Gəlir (AZN)</th><th>Populyarlıq</th></tr></thead><tbody>';
    
    data.forEach(zone => {
      html += `<tr>
        <td>${zone.zone}</td>
        <td>${zone.totalChildren}</td>
        <td>${Math.round(zone.totalRevenue)}</td>
        <td>${Math.round(zone.avgRevenuePerChild)}</td>
        <td>${Math.round(zone.percentageOfTotal)}%</td>
      </tr>`;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
  } catch (err) {
    console.error('Error loading zones report:', err);
    document.getElementById('zonesReportContent').innerHTML = '<p class="report-no-data">Hesabat yüklənərkən xəta baş verdi.</p>';
  }
}

// Update filtered statistics
async function updateFilteredStats() {
  const zone = document.getElementById('statZoneFilter')?.value || '';
  const ticketType = document.getElementById('statTicketFilter')?.value || '';
  
  try {
    const params = new URLSearchParams();
    if (zone) params.append('zone', zone);
    if (ticketType) params.append('ticketType', ticketType);
    
    const response = await fetch(`/api/stats/filtered-10days?${params}`);
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.error || 'Filtrlənmiş statistikalar yüklənə bilmədi.');
    }
    
    // Update chart with filtered data
    updateFilteredChart(data);
  } catch (err) {
    console.error('Error updating filtered stats:', err);
  }
}

// Update filtered analytics chart
function updateFilteredChart(stats) {
  const chartContainer = document.getElementById('analyticsChartContainer');
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

  if (days.length === 0) {
    chartContainer.classList.add('is-hidden');
    return;
  }

  chartContainer.classList.remove('is-hidden');

  if (analyticsChart) {
    analyticsChart.destroy();
  }

  analyticsChart = new Chart(ctx.getContext('2d'), buildChartConfig(days, childrenCounts, incomeCounts));
}
