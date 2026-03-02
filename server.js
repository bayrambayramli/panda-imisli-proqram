const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const app = express();
const PORT = 3000;

// Auto-end event tracker
let autoEndEvent = {
  triggered: false,
  timestamp: null
};

// Middleware
app.use(bodyParser.json());
app.use(express.static('public'));

// Settings file path
const settingsFilePath = path.join(__dirname, 'settings.json');

// Data directory
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const errorLogPath = path.join(logsDir, 'error.log');

function logError(message, err) {
  console.error(message, err);
  try {
    const timestamp = new Date().toISOString();
    const details = err && err.stack ? err.stack : (err ? JSON.stringify(err) : '');
    const line = details ? `[${timestamp}] ${message} - ${details}\n` : `[${timestamp}] ${message}\n`;
    fs.appendFileSync(errorLogPath, line, 'utf8');
  } catch (logErr) {
    console.error('Error writing error log:', logErr);
  }
}

// Get today's date in YYYY-MM-DD format
function getTodayDate() {
  const today = new Date();
  return today.toISOString().split('T')[0];
}

// Load settings
function loadSettings() {
  try {
    if (fs.existsSync(settingsFilePath)) {
      return JSON.parse(fs.readFileSync(settingsFilePath, 'utf8'));
    }
  } catch (err) {
    logError('Error loading settings:', err);
  }
  return {
    passTypes: [],
    playZones: [],
    endDayHour: '22:00',
    tvPaginationFrequency: 5,
    tvCustomMessage: '',
    tvCustomMessageEnabled: true
  };
}

// Save settings
function saveSettings(settings) {
  try {
    fs.writeFileSync(settingsFilePath, JSON.stringify(settings, null, 2), 'utf8');
  } catch (err) {
    logError('Error saving settings:', err);
  }
}

// Get data file path for a specific date
function getDataFilePath(date) {
  return path.join(dataDir, `${date}.json`);
}

// Load data for a specific date
function loadData(date) {
  const filePath = getDataFilePath(date);
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
      logError('Error reading data file:', err);
      return { active: [], completed: [] };
    }
  }
  return { active: [], completed: [] };
}

// Save data for a specific date
function saveData(date, data) {
  const filePath = getDataFilePath(date);
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    logError('Error writing data file:', err);
  }
}

// API Routes

// Get data for a specific date
app.get('/api/data/:date', (req, res) => {
  const { date } = req.params;
  const data = loadData(date);
  res.json(data);
});

// Get available dates
app.get('/api/dates', (req, res) => {
  try {
    const files = fs.readdirSync(dataDir).filter(f => f.match(/\d{4}-\d{2}-\d{2}\.json/));
    const dates = files.map(f => f.replace('.json', '')).sort().reverse();
    res.json(dates);
  } catch (err) {
    res.json([]);
  }
});

// Get history for a single date
app.get('/api/history/:date', (req, res) => {
  const { date } = req.params;
  const data = loadData(date);
  res.json(data);
});

// Get history for a date range
app.get('/api/history', (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }
    
    // Collect all matching files in the date range
    const files = fs.readdirSync(dataDir).filter(f => f.match(/\d{4}-\d{2}-\d{2}\.json/));
    const matchingFiles = files.filter(file => {
      const fileDate = file.replace('.json', '');
      return fileDate >= startDate && fileDate <= endDate;
    });
    
    // Combine data from all matching dates
    let combinedData = {
      active: [],
      completed: []
    };
    
    matchingFiles.sort().forEach(file => {
      const fileDate = file.replace('.json', '');
      const data = loadData(fileDate);
      combinedData.active = combinedData.active.concat(data.active || []);
      combinedData.completed = combinedData.completed.concat(data.completed || []);
    });
    
    res.json(combinedData);
  } catch (err) {
    logError('Error getting history for date range:', err);
    res.status(500).json({ error: 'Failed to get history' });
  }
});

// Add new child
app.post('/api/children', (req, res) => {
  const { date } = req.query;
  const currentDate = date || getTodayDate();
  
  // Validate input
  const { name, age, playZone, duration, price } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }
  if (!age || !playZone || !duration) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  
  const data = loadData(currentDate);
  
  const newChild = {
    id: Date.now(),
    ...req.body,
    startTime: new Date().toISOString(),
    endTime: null
  };
  
  data.active.push(newChild);
  saveData(currentDate, data);
  res.json(newChild);
});

// Update child
app.put('/api/children/:id', (req, res) => {
  const { date } = req.query;
  const currentDate = date || getTodayDate();
  const { id } = req.params;
  
  const data = loadData(currentDate);
  
  const childIndex = data.active.findIndex(c => c.id == id);
  if (childIndex !== -1) {
    data.active[childIndex] = { ...data.active[childIndex], ...req.body };
    saveData(currentDate, data);
    res.json(data.active[childIndex]);
  } else {
    const completedIndex = data.completed.findIndex(c => c.id == id);
    if (completedIndex !== -1) {
      data.completed[completedIndex] = { ...data.completed[completedIndex], ...req.body };
      saveData(currentDate, data);
      res.json(data.completed[completedIndex]);
    } else {
      res.status(404).json({ error: 'Child not found' });
    }
  }
});

// End session (move from active to completed)
app.post('/api/children/:id/end', (req, res) => {
  const { date } = req.query;
  const currentDate = date || getTodayDate();
  const { id } = req.params;
  
  const data = loadData(currentDate);
  
  const childIndex = data.active.findIndex(c => c.id == id);
  if (childIndex !== -1) {
    const child = data.active[childIndex];
    child.endTime = new Date().toISOString();
    data.completed.push(child);
    data.active.splice(childIndex, 1);
    saveData(currentDate, data);
    res.json(child);
  } else {
    res.status(404).json({ error: 'Child not found' });
  }
});

// Restore session (move from completed back to active) within 5 minutes
app.post('/api/children/:id/restore', (req, res) => {
  const { date } = req.query;
  const currentDate = date || getTodayDate();
  const { id } = req.params;

  const data = loadData(currentDate);

  const completedIndex = data.completed.findIndex(c => c.id == id);
  if (completedIndex === -1) {
    return res.status(404).json({ error: 'Child not found in completed sessions' });
  }

  const child = data.completed[completedIndex];
  if (!child.endTime) {
    return res.status(400).json({ error: 'Session end time is missing' });
  }

  const endedAtMs = new Date(child.endTime).getTime();
  const nowMs = Date.now();
  const restoreWindowMs = 5 * 60 * 1000;

  if (!Number.isFinite(endedAtMs) || (nowMs - endedAtMs) > restoreWindowMs) {
    return res.status(400).json({ error: 'Restore window expired (5 minutes)' });
  }

  child.endTime = null;
  data.active.push(child);
  data.completed.splice(completedIndex, 1);
  saveData(currentDate, data);

  return res.json(child);
});

// Delete child
app.delete('/api/children/:id', (req, res) => {
  const { date } = req.query;
  const currentDate = date || getTodayDate();
  const { id } = req.params;
  
  const data = loadData(currentDate);
  
  const activeIndex = data.active.findIndex(c => c.id == id);
  if (activeIndex !== -1) {
    data.active.splice(activeIndex, 1);
    saveData(currentDate, data);
    res.json({ success: true });
  } else {
    const completedIndex = data.completed.findIndex(c => c.id == id);
    if (completedIndex !== -1) {
      data.completed.splice(completedIndex, 1);
      saveData(currentDate, data);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Child not found' });
    }
  }
});



// Export to Excel - for history (completed sessions only)
app.get('/api/exportExcel/:date', async (req, res) => {
  const { date } = req.params;
  
  // Validate date format
  if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return res.status(400).json({ error: 'Invalid date format' });
  }
  
  const data = loadData(date);
  // Only export completed sessions
  const allChildren = data.completed;

  if (allChildren.length === 0) {
    return res.status(404).json({ error: 'Bu tarixdə bitmiş seans yoxdur.' });
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Sessions');

  sheet.columns = [
    { header: 'Ad', key: 'name', width: 20 },
    { header: 'Yaş', key: 'age', width: 8 },
    { header: 'Oyun Zonası', key: 'playZone', width: 15 },
    { header: 'Bilet', key: 'passTypeName', width: 20 },
    { header: 'Müddət', key: 'duration', width: 12 },
    { header: 'Məbləğ', key: 'price', width: 10 },
    { header: 'Tarix', key: 'date', width: 12 },
    { header: 'Qeydlər', key: 'notes', width: 30 },
    { header: 'Başlama Vaxtı', key: 'startTime', width: 20 },
    { header: 'Bitmə Vaxtı', key: 'endTime', width: 20 }
  ];

  allChildren.forEach(child => {
    // Translate unlimited duration to Azerbaijani
    const durationDisplay = child.duration === 'unlimited' ? 'Limitsiz' : child.duration;
    const passTypeDisplay = child.passTypeName || (child.duration === 'unlimited' ? 'Limitsiz' : child.duration + ' dəq');
    const startDate = child.startTime ? new Date(child.startTime) : null;
    const dateStr = startDate ? `${String(startDate.getDate()).padStart(2, '0')}.${String(startDate.getMonth() + 1).padStart(2, '0')}.${startDate.getFullYear()}` : '';
    
    sheet.addRow({
      name: child.name,
      age: child.age,
      playZone: child.playZone,
      passTypeName: passTypeDisplay,
      duration: durationDisplay,
      price: child.price,
      date: dateStr,
      notes: child.notes || '',
      startTime: child.startTime ? new Date(child.startTime).toLocaleString() : '',
      endTime: child.endTime ? new Date(child.endTime).toLocaleString() : ''
    });
  });

  const fileName = `panda_imisli_${date}.xlsx`;
  const filePath = path.join(__dirname, 'public', fileName);

  try {
    await workbook.xlsx.writeFile(filePath);
    res.download(filePath, fileName, (err) => {
      if (err) logError('Error downloading file:', err);
      setTimeout(() => {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }, 1000);
    });
  } catch (err) {
    logError('Error writing Excel:', err);
    res.status(500).json({ error: 'Failed to export Excel' });
  }
});

// Export to Excel - for date range (completed sessions only)
app.get('/api/exportExcel', async (req, res) => {
  const { startDate, endDate } = req.query;
  
  // Validate date format
  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'Start date and end date are required' });
  }
  if (!startDate.match(/^\d{4}-\d{2}-\d{2}$/) || !endDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return res.status(400).json({ error: 'Invalid date format' });
  }
  if (startDate > endDate) {
    return res.status(400).json({ error: 'Start date cannot be after end date' });
  }
  
  // Load data for all dates in the range
  let allCompleted = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    const data = loadData(dateStr);
    allCompleted = allCompleted.concat(data.completed);
  }

  if (allCompleted.length === 0) {
    return res.status(404).json({ error: 'Bu tarix aralığında bitmiş seans yoxdur.' });
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Sessions');

  sheet.columns = [
    { header: 'Ad', key: 'name', width: 20 },
    { header: 'Yaş', key: 'age', width: 8 },
    { header: 'Oyun Zonası', key: 'playZone', width: 15 },
    { header: 'Bilet', key: 'passTypeName', width: 20 },
    { header: 'Müddət', key: 'duration', width: 12 },
    { header: 'Məbləğ', key: 'price', width: 10 },
    { header: 'Tarix', key: 'date', width: 12 },
    { header: 'Qeydlər', key: 'notes', width: 30 },
    { header: 'Başlama Vaxtı', key: 'startTime', width: 20 },
    { header: 'Bitmə Vaxtı', key: 'endTime', width: 20 }
  ];

  allCompleted.forEach(child => {
    // Translate unlimited duration to Azerbaijani
    const durationDisplay = child.duration === 'unlimited' ? 'Limitsiz' : child.duration;
    const passTypeDisplay = child.passTypeName || (child.duration === 'unlimited' ? 'Limitsiz' : child.duration + ' dəq');
    const startDate = child.startTime ? new Date(child.startTime) : null;
    const dateStr = startDate ? `${String(startDate.getDate()).padStart(2, '0')}.${String(startDate.getMonth() + 1).padStart(2, '0')}.${startDate.getFullYear()}` : '';
    
    sheet.addRow({
      name: child.name,
      age: child.age,
      playZone: child.playZone,
      passTypeName: passTypeDisplay,
      duration: durationDisplay,
      price: child.price,
      date: dateStr,
      notes: child.notes || '',
      startTime: child.startTime ? new Date(child.startTime).toLocaleString() : '',
      endTime: child.endTime ? new Date(child.endTime).toLocaleString() : ''
    });
  });

  const fileName = `panda_imisli_${startDate}_${endDate}.xlsx`;
  const filePath = path.join(__dirname, 'public', fileName);

  try {
    await workbook.xlsx.writeFile(filePath);
    res.download(filePath, fileName, (err) => {
      if (err) logError('Error downloading file:', err);
      setTimeout(() => {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }, 1000);
    });
  } catch (err) {
    logError('Error writing Excel:', err);
    res.status(500).json({ error: 'Failed to export Excel' });
  }
});

// Settings endpoints
app.get('/api/settings', (req, res) => {
  const settings = loadSettings();
  res.json(settings);
});

app.get('/api/checkAutoEnd', (req, res) => {
  res.json(autoEndEvent);
});

app.post('/api/settings', (req, res) => {
  const { passTypes, playZones, endDayHour, tvPaginationFrequency, tvShowUnlimitedPassTypes, tvCustomMessage, tvCustomMessageEnabled } = req.body;
  // Validate endDayHour format
  if (!endDayHour || !endDayHour.match(/^([0-1]\d|2[0-3]):[0-5]\d$/)) {
    return res.status(400).json({ error: 'Invalid endDayHour format. Use HH:MM.' });
  }
  // Validate tvPaginationFrequency
  const frequency = parseInt(tvPaginationFrequency) || 5;
  if (frequency < 2) {
    return res.status(400).json({ error: 'TV pagination frequency must be at least 2 seconds.' });
  }
  const settings = { passTypes, playZones, endDayHour, tvPaginationFrequency: frequency, tvShowUnlimitedPassTypes: tvShowUnlimitedPassTypes !== false, tvCustomMessage: tvCustomMessage || '', tvCustomMessageEnabled: tvCustomMessageEnabled === true };
  saveSettings(settings);
  
  // Auto-end sessions at the specified hour
  checkAndAutoEndSessions(endDayHour);
  
  res.json({ success: true, settings });
});

// Auto-end sessions at specified time (HH:MM format)
function checkAndAutoEndSessions(endDayHour) {
  const now = new Date();
  const currentHour = String(now.getHours()).padStart(2, '0');
  const currentMinute = String(now.getMinutes()).padStart(2, '0');
  const currentTimeStr = `${currentHour}:${currentMinute}`;
  const endTime = endDayHour || '22:00';
  
  if (currentTimeStr === endTime) {
    const date = getTodayDate();
    const data = loadData(date);
    
    // Move all active sessions to completed with end time
    if (data.active.length > 0) {
      data.active.forEach(child => {
        child.endTime = new Date().toISOString();
        data.completed.push(child);
      });
      data.active = [];
      
      saveData(date, data);
      
      // Signal auto-end event to frontend
      autoEndEvent = {
        triggered: true,
        timestamp: new Date().toISOString(),
        sessionCount: data.completed.length
      };
      
      console.log(`Auto-ended all sessions at ${endTime}`);
      
      // Clear the flag after 2 minutes so it's only shown once
      setTimeout(() => {
        autoEndEvent.triggered = false;
      }, 120000);
    }
  }
}

// Check auto-end sessions periodically (every minute)
setInterval(() => {
  const settings = loadSettings();
  checkAndAutoEndSessions(settings.endDayHour);
}, 60000);

// ===== ANALYTICS & REPORTING ENDPOINTS =====

// Get monthly summary report (all months or filtered by month)
app.get('/api/report/monthly', (req, res) => {
  try {
    const { month } = req.query; // Format: YYYY-MM
    const files = fs.readdirSync(dataDir).filter(f => f.match(/\d{4}-\d{2}-\d{2}\.json/));
    const monthlyData = {};

    files.forEach(file => {
      const date = file.replace('.json', '');
      const yearMonth = date.substring(0, 7); // YYYY-MM
      
      // If month filter is specified, skip other months
      if (month && yearMonth !== month) return;
      
      const data = loadData(date);
      
      const totalChildren = (data.completed || []).length;
      const totalRevenue = (data.completed || []).reduce((sum, child) => sum + (child.price || 0), 0);

      if (!monthlyData[yearMonth]) {
        monthlyData[yearMonth] = {
          month: yearMonth,
          totalChildren: 0,
          totalRevenue: 0,
          days: 0
        };
      }
      
      monthlyData[yearMonth].totalChildren += totalChildren;
      monthlyData[yearMonth].totalRevenue += totalRevenue;
      monthlyData[yearMonth].days++;
    });

    const result = Object.values(monthlyData).map(monthData => ({
      ...monthData,
      avgChildrenPerDay: monthData.days > 0 ? Math.round(monthData.totalChildren / monthData.days) : 0,
      avgRevenuePerDay: monthData.days > 0 ? (monthData.totalRevenue / monthData.days).toFixed(2) : 0
    })).sort((a, b) => b.month.localeCompare(a.month));

    res.json(result);
  } catch (err) {
    logError('Error generating monthly report:', err);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Get play zone comparison (all time or filtered by month)
// NOTE: Includes both active zones (from settings) and historical zones (from data) that are no longer in settings
// This ensures accurate historical reporting even after play zones are removed from settings
app.get('/api/report/play-zones', (req, res) => {
  try {
    const { month } = req.query; // Format: YYYY-MM
    const settings = loadSettings();
    const files = fs.readdirSync(dataDir).filter(f => f.match(/\d{4}-\d{2}-\d{2}\.json/));
    
    // Initialize all zones from settings with 0 values
    const zoneData = {};
    if (settings.playZones && Array.isArray(settings.playZones)) {
      settings.playZones.forEach(zone => {
        zoneData[zone.name] = {
          zone: zone.name,
          totalChildren: 0,
          totalRevenue: 0
        };
      });
    }

    files.forEach(file => {
      const date = file.replace('.json', '');
      
      // If month filter is specified, skip other months
      if (month && !date.startsWith(month)) return;
      
      const data = loadData(date);
      
      (data.completed || []).forEach(child => {
        const zone = child.playZone || 'Unknown';
        
        // Count all zones, including historical ones no longer in settings
        if (!zoneData[zone]) {
          zoneData[zone] = {
            zone: zone,
            totalChildren: 0,
            totalRevenue: 0,
            isHistorical: !settings.playZones || !settings.playZones.some(z => z.name === zone)
          };
        }
        zoneData[zone].totalChildren++;
        zoneData[zone].totalRevenue += child.price || 0;
      });
    });

    const result = Object.values(zoneData)
      .map(z => ({
        ...z,
        avgRevenuePerChild: z.totalChildren > 0 ? (z.totalRevenue / z.totalChildren).toFixed(2) : 0,
        percentageOfTotal: 0
      }));

    const totalChildren = result.reduce((sum, z) => sum + z.totalChildren, 0);
    result.forEach(z => {
      z.percentageOfTotal = totalChildren > 0 ? ((z.totalChildren / totalChildren) * 100).toFixed(2) : 0;
    });

    // Sort by: 1) Active zones first, then 2) totalChildren descending
    res.json(result.sort((a, b) => {
      // If one is historical and one is not, active zones come first
      if (a.isHistorical !== b.isHistorical) {
        return a.isHistorical ? 1 : -1;
      }
      
      // If both have same historical status, sort by totalChildren descending
      if (a.totalChildren !== b.totalChildren) {
        return b.totalChildren - a.totalChildren;
      }
      
      // If both have same children count, maintain settings order for active zones
      if (!a.isHistorical && !b.isHistorical && settings.playZones) {
        return settings.playZones.findIndex(z => z.name === a.zone) - settings.playZones.findIndex(z => z.name === b.zone);
      }
      
      return 0;
    }));
  } catch (err) {
    logError('Error generating play zone report:', err);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Get age demographics (all time or filtered by month)
app.get('/api/report/age-demographics', (req, res) => {
  try {
    const { month } = req.query; // Format: YYYY-MM
    const files = fs.readdirSync(dataDir).filter(f => f.match(/\d{4}-\d{2}-\d{2}\.json/));
    const ageRanges = {
      '3-5': { range: '3-5', count: 0, revenue: 0 },
      '6-8': { range: '6-8', count: 0, revenue: 0 },
      '9-12': { range: '9-12', count: 0, revenue: 0 }
    };

    files.forEach(file => {
      const date = file.replace('.json', '');
      
      // If month filter is specified, skip other months
      if (month && !date.startsWith(month)) return;
      
      const data = loadData(date);
      
      (data.completed || []).forEach(child => {
        const age = parseInt(child.age) || 0;
        let range = '3-5';
        
        if (age >= 6 && age <= 8) range = '6-8';
        else if (age >= 9 && age <= 12) range = '9-12';
        
        ageRanges[range].count++;
        ageRanges[range].revenue += child.price || 0;
      });
    });

    const result = Object.values(ageRanges)
      .map(a => ({
        ...a,
        avgRevenuePerChild: a.count > 0 ? (a.revenue / a.count).toFixed(2) : 0,
        percentageOfTotal: 0
      }));

    const totalChildren = result.reduce((sum, a) => sum + a.count, 0);
    result.forEach(a => {
      a.percentageOfTotal = totalChildren > 0 ? ((a.count / totalChildren) * 100).toFixed(2) : 0;
    });

    res.json(result.sort((a, b) => a.range.localeCompare(b.range)));
  } catch (err) {
    logError('Error generating age demographics:', err);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Get available months for report filtering
app.get('/api/report/months', (req, res) => {
  try {
    const files = fs.readdirSync(dataDir).filter(f => f.match(/\d{4}-\d{2}-\d{2}\.json/));
    const months = new Set();

    files.forEach(file => {
      const date = file.replace('.json', '');
      const yearMonth = date.substring(0, 7);
      months.add(yearMonth);
    });

    const result = Array.from(months).sort().reverse();
    res.json(result);
  } catch (err) {
    logError('Error getting available months:', err);
    res.status(500).json({ error: 'Failed to get months' });
  }
});

// Get filtered 10-day statistics
app.get('/api/stats/filtered-10days', (req, res) => {
  try {
    const { zone, ticketType, ageRange } = req.query;
    
    // Get last 10 dates
    const files = fs.readdirSync(dataDir)
      .filter(f => f.match(/\d{4}-\d{2}-\d{2}\.json/))
      .sort()
      .reverse()
      .slice(0, 10)
      .sort();

    const stats = files.map(file => {
      const date = file.replace('.json', '');
      const data = loadData(date);
      
      let filtered = data.completed || [];
      
      if (zone) {
        filtered = filtered.filter(c => c.playZone === zone);
      }
      if (ticketType) {
        filtered = filtered.filter(c => c.duration === ticketType);
      }
      if (ageRange) {
        const [minAge, maxAge] = ageRange.split('-').map(Number);
        filtered = filtered.filter(c => {
          const age = parseInt(c.age) || 0;
          return age >= minAge && age <= maxAge;
        });
      }
      
      const income = filtered.reduce((sum, c) => sum + (c.price || 0), 0);
      
      return {
        date: date,
        children: filtered.length,
        income: income
      };
    });

    res.json(stats);
  } catch (err) {
    logError('Error getting filtered statistics:', err);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Panda Imisli app running at http://localhost:${PORT}`);
  console.log(`Settings loaded: ${settingsFilePath}`);
});
