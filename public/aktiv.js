const timerIntervals = {};

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
    return;
  }

  noMsg.style.display = 'none';

  children.forEach(child => {
    const row = document.createElement('tr');
    const startTimeStr = formatTime(child.startTime);

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
