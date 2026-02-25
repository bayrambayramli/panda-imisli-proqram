// Global state
let currentDate = getTodayDate();
let timerIntervals = {};
let editingChildId = null;
let editingSource = null; // 'active' or 'completed'
let settings = null; // Will be loaded from backend
let PRICE_CONFIG = {}; // Will be populated from settings

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
    updatePriceConfig();
  } catch (err) {
    console.error('Error loading settings:', err);
    settings = {
      passTypes: [],
      endDayHour: 22
    };
    updatePriceConfig();
  }
}

// Update PRICE_CONFIG from settings
function updatePriceConfig() {
  PRICE_CONFIG = {};
  settings.passTypes.forEach(pt => {
    PRICE_CONFIG[pt.duration.toString()] = pt.price;
  });
  updateDurationDropdown();
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
  document.getElementById('loadHistoryBtn').addEventListener('click', loadHistoryData);
  document.getElementById('historyExportBtn').addEventListener('click', async () => {
    const date = document.getElementById('historyDate').value;
    if (!date) {
      await showUiAlert('Lütfən tarixi seçin.');
      return;
    }
    window.location.href = `/api/exportExcel/${date}`;
  });
  
  // Export today's Excel
  const exportTodayBtn = document.getElementById('exportTodayExcelBtn');
  if (exportTodayBtn) exportTodayBtn.addEventListener('click', async () => {
    try {
      const response = await fetch(`/api/data/${getTodayDate()}`);
      const data = await response.json();
      
      // Check if there's any data (active + completed sessions)
      if ((data.active.length + data.completed.length) === 0) {
        await showUiAlert('Bu gün ixrac ediləcək məlumat yoxdur.');
        return;
      }
      
      window.location.href = `/api/exportExcel/${getTodayDate()}`;
    } catch (error) {
      console.error('Error checking data:', error);
      window.location.href = `/api/exportExcel/${getTodayDate()}`;
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
  } else {
    const btn = document.getElementById('completedFullBtn');
    if (btn) btn.textContent = isNow ? 'Tam Ekrandan Çıx' : 'Tam Ekran';
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
  count.textContent = children.length;
  
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
  count.textContent = children.length;
  
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
    `<span class="editable-field" onclick="editNotes('${child.id}')">Qeyd əlavə et...</span>`;
  
  // Only show +30/-30 buttons if not unlimited
  const isUnlimited = child.duration === 'unlimited';
  const timeButtonsHtml = isUnlimited ? '' : `<button class="btn-action btn-extend" onclick="extendTime('${child.id}')">+1 saat</button>`;

  const startTimeStr = child.startTime ? new Date(child.startTime).toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit' }) : '-';

  row.innerHTML = `
    <td>${child.name}</td>
    <td>${child.age}</td>
    <td>${child.playZone}</td>
    <td>${startTimeStr}</td>
    <td><span id="timer-${child.id}" class="timer">--:--</span></td>
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
    `<span class="editable-field" onclick="editNotes('${child.id}')">Qeyd əlavə et...</span>`;
  
  const startTime = new Date(child.startTime).toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit' });
  const endTime = child.endTime ? new Date(child.endTime).toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit' }) : '-';
  
  row.innerHTML = `
    <td>${child.name}</td>
    <td>${child.age}</td>
    <td>${child.playZone}</td>
    <td>${child.price} AZN</td>
    <td>${notesContent}</td>
    <td>${startTime}</td>
    <td>${endTime}</td>
    <td>
      <div class="actions-cell">
        <button class="btn-action btn-edit" onclick="openEditModal('${child.id}', 'completed')">Dəyişdir</button>
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
  const duration = document.getElementById('duration').value;
  const notes = document.getElementById('notesInput').value.trim();
  
  // Check if work day is over
  const now = new Date();
  const currentHour = now.getHours();
  const endDayHour = settings.endDayHour || 22;
  
  if (currentHour >= endDayHour) {
    await showUiAlert(`İş günü bitib. Saat ${endDayHour}:00-dan sonra yeni seans əlavə etmək mümkün deyil. Zəhmət olmasa, "Ayarlar"-dan günün bitmə saatını dəyişdirin.`);
    return;
  }
  
  // Validation
  if (!name || !age || !playZone || !duration) {
    await showUiAlert('Lütfən bütün tələb olunan sahələri doldurun (*).');
    return;
  }
  
  // Calculate price based on duration
  const price = PRICE_CONFIG[duration];
  
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
        duration,
        price,
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
  if (!timerEl) return;

  if (durationValue === 'unlimited') {
    timerEl.textContent = 'Limitsiz';
    timerEl.classList.remove('warning', 'danger');
    return;
  }

  const durationMinutes = parseInt(durationValue) || 0;
  const startMs = startTimeISO ? new Date(startTimeISO).getTime() : Date.now();
  let endTime = startMs + durationMinutes * 60 * 1000;

  function updateTimer() {
    const now = Date.now();
    const remaining = Math.max(0, endTime - now);
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);

    if (!timerEl) {
      clearInterval(timerIntervals[childId]);
      return;
    }

    timerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    timerEl.classList.remove('warning', 'danger');

    if (remaining === 0) {
      timerEl.classList.add('danger');
      timerEl.textContent = 'VAXT BİTDİ!';
    } else if (remaining < 5 * 60 * 1000) {
      timerEl.classList.add('warning');
    }
  }

  updateTimer();

  if (timerIntervals[childId]) clearInterval(timerIntervals[childId]);
  timerIntervals[childId] = setInterval(updateTimer, 1000);
}

// Extend time by 1 hour (confirm first)
async function extendTime(childId) {
  try {
    const response = await fetch(`/api/data/${currentDate}`);
    const data = await response.json();
    
    const child = data.active.find(c => c.id == childId);
    if (!child) return;
    
    if (child.duration === 'unlimited') return;
    
    const current = parseInt(child.duration) || 0;
    const newDuration = current + 60;
    const newPrice = parseFloat(((newDuration / 60) * 5).toFixed(2));
    
    const confirmResult = await showUiPrompt(`Seansı ${newDuration} dəq-ə artırmaq istəyirsiniz? Yeni qiymət: ${newPrice} AZN`);
    if (!confirmResult) return;

    await fetch(`/api/children/${childId}?date=${currentDate}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        duration: newDuration.toString(),
        price: newPrice
      })
    });

    loadData();
  } catch (error) {
    console.error('Error extending time:', error);
  }
}

// End session
async function endSession(childId) {
  const ok = await showUiPrompt('Seansı bitirmək istədiyinizə əminsiniz?');
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

// Delete child
async function deleteChild(childId, source) {
  const delConfirm = await showUiPrompt('Bu girişi silmək istəyirsiniz?');
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
  
  let child = data.active.find(c => c.id == childId);
  let source = 'active';
  
  if (!child) {
    child = data.completed.find(c => c.id == childId);
    source = 'completed';
  }
  
  if (!child) return;
  
  const newNotes = await showUiPrompt('Qeydlər daxil edin:', { input: true, defaultValue: child.notes || '' });

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
  document.getElementById('editDuration').value = child.duration;
  document.getElementById('editNotes').value = child.notes || '';
  
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
  
  const duration = document.getElementById('editDuration').value;
  const price = PRICE_CONFIG[duration];
  
  const updates = {
    name: document.getElementById('editName').value,
    age: parseInt(document.getElementById('editAge').value),
    playZone: document.getElementById('editPlayZone').value,
    duration: duration,
    price: price,
    notes: document.getElementById('editNotes').value
  };
  
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


// History Modal Functions
function openHistoryModal() {
  // ensure stats modal is closed when opening history
  closeStatsModal();
  const today = getTodayDate();
  document.getElementById('historyDate').value = today;
  document.getElementById('historyContent').innerHTML = '<p class="no-data-msg">Tarix seçin və yükləyin</p>';
  document.getElementById('historyModal').classList.add('show');
}

// Stats Modal Functions
async function openStatsModal() {
  const date = currentDate;
  try {
    // make sure history modal is closed
    closeHistoryModal();

    const resp = await fetch(`/api/data/${date}`);
    const data = await resp.json();

    const activeCount = data.active.length;
    const completedCount = data.completed.length;
    const total = activeCount + completedCount;

    // Revenue: only count full hours. 'unlimited' uses stored price.
    let revenueSum = 0;
    const all = [...data.active, ...data.completed];
    const nowMs = Date.now();

    all.forEach(c => {
      if (c.duration === 'unlimited') {
        revenueSum += parseFloat(c.price) || 0;
        return;
      }

      // For numeric durations (minutes) compute elapsed minutes from start to end (or now if active)
      const startMs = c.startTime ? new Date(c.startTime).getTime() : null;
      const endMs = c.endTime ? new Date(c.endTime).getTime() : null;
      if (!startMs) return;
      const elapsedMs = (endMs || nowMs) - startMs;
      const elapsedMinutes = Math.floor(elapsedMs / 60000);
      const fullHours = Math.floor(elapsedMinutes / 60);
      revenueSum += fullHours * 5; // 5 AZN per full hour
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

async function loadHistoryData() {
  const selectedDate = document.getElementById('historyDate').value;
  
  if (!selectedDate) {
    await showUiAlert('Lütfən tarixi seçin.');
    return;
  }
  
  // Do not show current date in history
  if (selectedDate === getTodayDate()) {
    await showUiAlert('Tarixçə yalnız dünən və əvvəlki tarixlər üçündür.');
    return;
  }
  
  try {
    const response = await fetch(`/api/data/${selectedDate}`);
    const data = await response.json();
    
    const contentDiv = document.getElementById('historyContent');

    if ((data.completed.length === 0)) {
      contentDiv.innerHTML = '<p class="no-data-msg">Bu tarixdə heç bir məlumat yoxdur.</p>';
      return;
    }

    let html = '';

    // Completed sessions only
    html += `
      <div class="history-section">
        <h3>✅ Bitmiş Seanslar (${data.completed.length})</h3>
        <table class="history-table">
          <thead>
            <tr>
              <th>Ad</th>
              <th>Yaş</th>
              <th>Zona</th>
              <th>Müddət</th>
              <th>Qiymət</th>
              <th>Başlama Vaxtı</th>
              <th>Bitmə Vaxtı</th>
            </tr>
          </thead>
          <tbody>
            ${data.completed.map(child => `
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

    contentDiv.innerHTML = html;
  } catch (error) {
    console.error('Error loading history:', error);
    document.getElementById('historyContent').innerHTML = '<p class="no-data-msg">Məlumat yüklənərkən xəta</p>';
  }
}

// Settings Modal Functions
function openSettingsModal() {
  closeHistoryModal();
  closeStatsModal();

  // Populate all pass types as editable rows in container
  const container = document.getElementById('passTypesContainer');
  if (container) {
    container.innerHTML = '';
    
    // Add header row
    const headerRow = document.createElement('div');
    headerRow.className = 'pass-type-row pass-type-header';
    headerRow.style.display = 'flex';
    headerRow.style.gap = '8px';
    headerRow.innerHTML = `
      <div style="font-weight:bold;flex:1;">Ad</div>
      <div style="font-weight:bold;flex:1;">Müddət</div>
      <div style="font-weight:bold;flex:1;">Qiymət</div>
      <div style="font-weight:bold;width:60px;"></div>
    `;
    container.appendChild(headerRow);
    
    settings.passTypes.forEach(pt => {
      const row = document.createElement('div');
      row.className = 'pass-type-row';
      row.style.display = 'flex';
      row.style.gap = '8px';
      row.setAttribute('data-id', pt.id);
      row.innerHTML = `
        <input type="text" class="pass-name" placeholder="Adı" value="${pt.name}" data-id="${pt.id}" style="flex:1;padding:8px;border:1px solid #ddd;border-radius:4px;" />
        <select class="pass-duration" data-id="${pt.id}" style="flex:1;padding:8px;border:1px solid #ddd;border-radius:4px;">
          <option value="60" ${pt.duration === 60 ? 'selected' : ''}>1 Saat</option>
          <option value="120" ${pt.duration === 120 ? 'selected' : ''}>2 Saat</option>
          <option value="180" ${pt.duration === 180 ? 'selected' : ''}>3 Saat</option>
          <option value="240" ${pt.duration === 240 ? 'selected' : ''}>4 Saat</option>
          <option value="unlimited" ${pt.duration === 'unlimited' ? 'selected' : ''}>Limitsiz</option>
        </select>
        <input type="number" class="pass-price" placeholder="Qiymət" value="${pt.price}" data-id="${pt.id}" step="0.01" style="flex:1;padding:8px;border:1px solid #ddd;border-radius:4px;" />
        <button class="btn-delete" onclick="removePassType(${pt.id})" style="width:60px;padding:8px;border:1px solid #ddd;border-radius:4px;background:#ff6b6b;color:white;cursor:pointer;">Sil</button>
      `;
      container.appendChild(row);
    });
  }

  // Set end day hour
  document.getElementById('endDayHour').value = settings.endDayHour;

  document.getElementById('settingsModal').classList.add('show');
}

function closeSettingsModal() {
  document.getElementById('settingsModal').classList.remove('show');
}

function addPassTypeRow() {
  const container = document.getElementById('passTypesContainer');
  if (!container) return;

  const newId = Math.max(...settings.passTypes.map(p => p.id || 0), 0) + 1;

  const row = document.createElement('div');
  row.className = 'pass-type-row';
  row.style.display = 'flex';
  row.style.gap = '8px';
  row.setAttribute('data-id', newId);
  row.innerHTML = `
    <input type="text" class="pass-name" placeholder="Adı" data-id="${newId}" style="flex:1;padding:8px;border:1px solid #ddd;border-radius:4px;" />
    <select class="pass-duration" data-id="${newId}" style="flex:1;padding:8px;border:1px solid #ddd;border-radius:4px;">
      <option value="60">1 Saat</option>
      <option value="120">2 Saat</option>
      <option value="180">3 Saat</option>
      <option value="240">4 Saat</option>
      <option value="unlimited">Limitsiz</option>
    </select>
    <input type="number" class="pass-price" placeholder="Qiymət" data-id="${newId}" step="0.01" style="flex:1;padding:8px;border:1px solid #ddd;border-radius:4px;" />
    <button class="btn-delete" onclick="removePassType(${newId})" style="width:60px;padding:8px;border:1px solid #ddd;border-radius:4px;background:#ff6b6b;color:white;cursor:pointer;">Sil</button>
  `;
  container.appendChild(row);
}

function removePassType(idOrElem) {
  // idOrElem can be numeric id or element (button passed via 'this')
  let id = null;
  if (typeof idOrElem === 'number') {
    id = idOrElem;
    const row = document.querySelector('.pass-type-row[data-id="' + id + '"]');
    if (row) row.remove();
    settings.passTypes = settings.passTypes.filter(pt => pt.id !== id);
    return;
  }

  // If element (e.g., this from onclick), find row
  const row = idOrElem && idOrElem.closest ? idOrElem.closest('.pass-type-row') : null;
  if (row) {
    const attr = row.getAttribute('data-id');
    if (attr) {
      id = parseInt(attr);
      settings.passTypes = settings.passTypes.filter(pt => pt.id !== id);
    }
    row.remove();
  }
}

async function saveSettings() {
  // Gather all pass rows from container
  const rows = document.querySelectorAll('#passTypesContainer .pass-type-row');
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

  const endDayHour = parseInt(document.getElementById('endDayHour').value);

  if (passTypes.length === 0) {
    await showUiAlert('Ən azı bir bilet əlavə edin!');
    return;
  }

  if (isNaN(endDayHour) || endDayHour < 0 || endDayHour > 23) {
    await showUiAlert('Günü bitirmə saatı 0-23 arasında olmalıdır.');
    return;
  }

  try {
    const response = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passTypes, endDayHour })
    });

    if (response.ok) {
      const result = await response.json();
      settings = result.settings;
      updatePriceConfig();
      updateDurationDropdown();
      closeSettingsModal();
      await showUiAlert('Ayarlar yadda saxlanıldı.');
    } else {
      await showUiAlert('Ayarları yadda saxlayarkən xəta baş verdi. Yenidən cəhd edin.');
    }
  } catch (err) {
    console.error('Error saving settings:', err);
    await showUiAlert('Ayarları yadda saxlayarkən xəta baş verdi. Yenidən cəhd edin.');
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
      
      settings.passTypes.forEach(pt => {
        const option = document.createElement('option');
        option.value = pt.duration;
        option.textContent = `${pt.name} - ${pt.price} AZN`;
        select.appendChild(option);
      });
      
      // Try to restore previous value
      if (settings.passTypes.some(pt => pt.duration.toString() === currentValue)) {
        select.value = currentValue;
      }
    }
  });
}
