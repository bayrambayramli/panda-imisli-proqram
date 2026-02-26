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
    console.error('Error loading settings:', err);
  }
  return {
    passTypes: [],
    playZones: [],
    endDayHour: 22
  };
}

// Save settings
function saveSettings(settings) {
  try {
    fs.writeFileSync(settingsFilePath, JSON.stringify(settings, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving settings:', err);
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
      console.error('Error reading data file:', err);
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
    console.error('Error writing data file:', err);
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

// Add new child
app.post('/api/children', (req, res) => {
  const { date } = req.query;
  const currentDate = date || getTodayDate();
  
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
    res.status(404).json({ error: 'Child not found' });
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
    { header: 'Müddət', key: 'duration', width: 12 },
    { header: 'Qiymət', key: 'price', width: 10 },
    { header: 'Qeydlər', key: 'notes', width: 30 },
    { header: 'Başlama Vaxtı', key: 'startTime', width: 20 },
    { header: 'Bitmə Vaxtı', key: 'endTime', width: 20 }
  ];

  allChildren.forEach(child => {
    // Translate unlimited duration to Azerbaijani
    const durationDisplay = child.duration === 'unlimited' ? 'Limitsiz' : child.duration;
    
    sheet.addRow({
      name: child.name,
      age: child.age,
      playZone: child.playZone,
      duration: durationDisplay,
      price: child.price,
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
      if (err) console.error('Error downloading file:', err);
      setTimeout(() => {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }, 1000);
    });
  } catch (err) {
    console.error('Error writing Excel:', err);
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
  const { passTypes, playZones, endDayHour } = req.body;
  const settings = { passTypes, playZones, endDayHour };
  saveSettings(settings);
  
  // Auto-end sessions at the specified hour
  checkAndAutoEndSessions(endDayHour);
  
  res.json({ success: true, settings });
});

// Auto-end sessions at specified hour
function checkAndAutoEndSessions(endDayHour) {
  const now = new Date();
  const currentHour = now.getHours();
  
  if (currentHour === endDayHour) {
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
      
      console.log(`Auto-ended all sessions at ${endDayHour}:00`);
      
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
    console.error('Error generating monthly report:', err);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Get play zone comparison (all time or filtered by month)
app.get('/api/report/play-zones', (req, res) => {
  try {
    const { month } = req.query; // Format: YYYY-MM
    const files = fs.readdirSync(dataDir).filter(f => f.match(/\d{4}-\d{2}-\d{2}\.json/));
    const zoneData = {};

    files.forEach(file => {
      const date = file.replace('.json', '');
      
      // If month filter is specified, skip other months
      if (month && !date.startsWith(month)) return;
      
      const data = loadData(date);
      
      (data.completed || []).forEach(child => {
        const zone = child.playZone || 'Unknown';
        
        if (!zoneData[zone]) {
          zoneData[zone] = {
            zone: zone,
            totalChildren: 0,
            totalRevenue: 0
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

    res.json(result.sort((a, b) => b.totalChildren - a.totalChildren));
  } catch (err) {
    console.error('Error generating play zone report:', err);
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
    console.error('Error generating age demographics:', err);
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
    console.error('Error getting available months:', err);
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
    console.error('Error getting filtered statistics:', err);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Panda Imisli app running at http://localhost:${PORT}`);
  console.log(`Settings loaded: ${settingsFilePath}`);
});
