const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const app = express();
const PORT = 3000;

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
    return res.status(404).json({ error: 'No data to export' });
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Sessions');

  sheet.columns = [
    { header: 'Ad', key: 'name', width: 20 },
    { header: 'Yaş', key: 'age', width: 8 },
    { header: 'Oyun Alanı', key: 'playZone', width: 15 },
    { header: 'Müddət', key: 'duration', width: 12 },
    { header: 'Qiymət', key: 'price', width: 10 },
    { header: 'Qeydlər', key: 'notes', width: 30 },
    { header: 'Başlama Vaxtı', key: 'startTime', width: 20 },
    { header: 'Bitiş Vaxtı', key: 'endTime', width: 20 },
    { header: 'Status', key: 'status', width: 12 }
  ];

  allChildren.forEach(child => {
    sheet.addRow({
      name: child.name,
      age: child.age,
      playZone: child.playZone,
      duration: child.duration,
      price: child.price,
      notes: child.notes || '',
      startTime: child.startTime ? new Date(child.startTime).toLocaleString() : '',
      endTime: child.endTime ? new Date(child.endTime).toLocaleString() : '',
      status: data.active.find(c => c.id == child.id) ? 'Aktivdə' : 'Tamamlanmış'
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

app.post('/api/settings', (req, res) => {
  const { passTypes, endDayHour } = req.body;
  const settings = { passTypes, endDayHour };
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
    data.active.forEach(child => {
      child.endTime = new Date().toISOString();
      data.completed.push(child);
    });
    data.active = [];
    
    saveData(date, data);
    console.log(`Auto-ended all sessions at ${endDayHour}:00`);
  }
}

// Check auto-end sessions periodically (every minute)
setInterval(() => {
  const settings = loadSettings();
  checkAndAutoEndSessions(settings.endDayHour);
}, 60000);

// Start server
app.listen(PORT, () => {
  console.log(`Amusement Center Admin app running at http://localhost:${PORT}`);
  // console.log('Press Ctrl+C to stop the server');
  
  // Check on startup
  const settings = loadSettings();
  // console.log(`Auto-end sessions configured for ${settings.endDayHour}:00`);
});
