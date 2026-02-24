# 🎡 Amusement Center Admission Management System

A simple, beautiful web-based application for managing child admissions at amusement centers. Built with Node.js and Express.

## Features

✨ **Beautiful UI**
- Colorful, professional gradient design
- 3 horizontally divided sections (no scrolling needed for main content)
- Responsive layout that works on different screen sizes

🎮 **Core Functionality**
- Add children with name, age, play zone, duration, pass type, price, and notes
- Real-time countdown timers for each child (green → yellow at 5 min → red & flashing at end)
- Live session management with extend (+30min) and decrease (-30min) buttons
- Move completed sessions to a separate section
- Edit any field including notes and price
- Delete entries

💰 **Pricing System**
- Default pricing: 5 AZN per hour, 8 AZN unlimited
- Editable price field
- Auto-calculate price based on duration changes
- Manual price override capability

📊 **Data Management**
- Daily data storage (organized by date)
- View historical data by selecting any date
- Export data to Excel for records
- Start and end time tracking for each child

⚙️ **Advanced Features**
- Dropdown menus with preset options
- Auto-clear form fields after adding a child
- Edit modal for detailed information updates
- Price updates when adjusting duration
- Disabled decrease button when time < 30 minutes
- Session status (active/completed) tracking

## Installation & Setup

### Prerequisites
- Node.js (v12 or higher)
- npm

### Step 1: Install Dependencies

Navigate to the `new-app` folder and run:

```bash
cd new-app
npm install
```

This will install:
- `express` - Web framework
- `body-parser` - Request body parsing
- `exceljs` - Excel file generation

### Step 2: Start the Server

```bash
npm start
```

Or for development:

```bash
node server.js
```

You should see:
```
Amusement Center Admin app running at http://localhost:3000
Press Ctrl+C to stop the server
```

### Step 3: Open in Browser

Open your web browser and navigate to:

```
http://localhost:3000
```

## How to Use

### Adding a Child

1. Fill in all required fields in the "Add New Child" section:
   - **Name**: Child's name
   - **Age**: Child's age (1-18)
   - **Play Zone**: Select from dropdown (Soft Play, Slides, Ball Pit, etc.)
   - **Duration**: Select from preset durations
   - **Pass Type**: New or Multi-pass
   - **Price**: Enter price in AZN
   - **Notes**: Optional additional information

2. Click the **"+ Add Child"** button
3. The form clears automatically, and the child appears in "Active Sessions"

### Managing Active Sessions

For each child in the Active Sessions table:

- **Timer**: Real-time countdown (green → yellow at 5min → red & flashing)
- **Edit**: Modify all child details
- **+30min**: Extend session by 30 minutes (auto-updates price)
- **-30min**: Reduce session by 30 minutes (disabled if time < 30min)
- **End**: Move to completed sessions
- **Delete**: Remove the entry
- **Click on Notes/Price**: Quick edit inline

### Viewing Historical Data

1. Use the date picker at the top of the page
2. Select any date to view that day's data
3. Click "Today" to return to current date

### Exporting Data

1. Go to the date you want to export
2. Click **"📥 Excel-ə Çıxar"** to export today's sessions
3. The Excel file will download automatically with all session data

## Project Structure

```
new-app/
├── package.json          # Node dependencies
├── server.js             # Express server & API routes
├── data/                 # Data storage (auto-created)
│   └── YYYY-MM-DD.json   # Daily data files
└── public/
    ├── index.html        # Main HTML
    ├── styles.css        # All styling
    └── script.js         # Frontend JavaScript
```

## Data Storage

- Data is stored locally in JSON files in the `data` folder
- Each day gets its own file: `YYYY-MM-DD.json`
- No internet connection required
- Data persists between sessions

## API Endpoints

- `GET /api/data/:date` - Get data for a specific date
- `GET /api/dates` - Get list of available dates
- `POST /api/children` - Add new child
- `PUT /api/children/:id` - Update child information
- `POST /api/children/:id/end` - End a session
- `DELETE /api/children/:id` - Delete a child entry
- `GET /api/exportExcel/:date` - Export completed sessions to Excel

## Browser Compatibility

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Pricing Configuration

Current default pricing:
- **1 hour (60 min)**: 5 AZN
- **1.5 hours (90 min)**: 7.5 AZN
- **2 hours (120 min)**: 10 AZN
- **30 minutes**: 2.5 AZN
- **Unlimited**: 8 AZN

To change pricing, edit the price value directly in the app or modify the calculation in `script.js`.

## Tips & Tricks

- Fields with borders are editable - just click on them
- Timer colors indicate session status:
  - 🟢 Green: Active session
  - 🟡 Yellow: Less than 5 minutes remaining
  - 🔴 Red & Flashing: Time's up!
- Use the "+" and "-" buttons to quickly adjust session length
- Always backup your data folder if you have critical data

## Troubleshooting

**Server won't start**
- Make sure port 3000 is not in use
- Check that Node.js is installed: `node --version`
- Make sure dependencies are installed: `npm install`

**Can't access the app**
- Verify the server is running (check console)
- Try accessing http://127.0.0.1:3000 instead
- Clear browser cache and refresh

**Data not saving**
- Check if the `data` folder exists (it's auto-created)
- Ensure the application has write permissions
- Restart the server

## Support

For issues or questions:
1. Check that all files are in the correct locations
2. Ensure Node.js and npm are properly installed
3. Verify that port 3000 is available
4. Check browser console for any error messages

---

**Happy Managing!** 🎉
