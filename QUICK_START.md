# 🚀 Quick Start Guide - Smart Surveillance System

## ⚡ Fast Setup (5 Minutes)

### Step 1: Start the Application

```powershell
# Navigate to project
cd Smart_Surveillance_Full_Project_1

# Run startup script
./start.ps1
```

This will:
- ✅ Install all dependencies
- ✅ Start backend (port 8000)
- ✅ Start frontend (port 3000)

### Step 2: Open Application

Open your browser: **http://localhost:3000**

### Step 3: Start Surveillance

1. Click **"Dashboard"**
2. Select sensitivity: **Medium** (recommended)
3. Click **"Start Surveillance"**
4. Click **"View Live Feed"**

### Step 4: Watch It Work! 🎉

✅ Camera opens automatically
✅ Recording starts (red "REC" indicator)
✅ Stand in front of camera
✅ Green box appears around you
✅ Yellow box around your face
✅ Count shows "1 Person"
✅ Move around - motion detected
✅ Image automatically captured
✅ Video being recorded

---

## 📁 Where to Find Results

### Captured Images
```
backend/incidents/
└── [uuid].jpg
```

### Recorded Videos
```
backend/recordings/
└── recording_20260202_143000.mp4
```

### Database
```
backend/incidents.db
```

---

## 🎨 What You'll See

### On Video Feed:
- 🟢 **Green boxes** = Detected person
- 🟡 **Yellow boxes** = Detected face
- 🔴 **Red "REC"** = Recording active
- 📊 **"COUNT: X"** = Number of people
- 📈 **"Confidence: XX%"** = Detection accuracy

### On Status Panel:
- **Humans**: Count (e.g., "2 Persons")
- **Motion**: Detected / None
- **Recording**: ● REC / STOPPED
- **Confidence**: XX% (color-coded)

---

## 🔧 Quick Troubleshooting

### Camera Not Working?
→ System uses mock camera automatically (shows "MOCK CAMERA")

### Not Detecting You?
→ Ensure good lighting, stand 2-10 meters away, face camera

### Recording Not Showing?
→ Check `backend/recordings/` folder for MP4 files

### Low Confidence?
→ Improve lighting, move closer, face camera directly

---

## 🎯 Quick Tips

1. **Best Lighting**: Natural or bright indoor light
2. **Best Distance**: 2-10 meters from camera
3. **Best Position**: Face camera, stand upright
4. **Best Sensitivity**: Medium (balanced)

---

## 📊 What Gets Recorded

### Every Incident Includes:
- ✅ Timestamp
- ✅ Image (JPEG)
- ✅ Confidence score
- ✅ Detection type

### Video Recording:
- ✅ All frames
- ✅ Detection overlays
- ✅ MP4 format
- ✅ Timestamp in filename

---

## ⚙️ System Requirements

- **Python**: 3.11+
- **Node.js**: 18+
- **MongoDB**: Running
- **Webcam**: Optional (mock available)
- **RAM**: 2GB minimum
- **Storage**: 1GB for recordings

---

## 🎓 Next Steps

1. **Explore Dashboard** - View statistics
2. **Check Incidents** - Browse captured images
3. **Adjust Sensitivity** - Try High/Medium/Low
4. **Review Videos** - Watch recorded footage

---

**That's it! You're ready to use the Smart Surveillance System!** 🎊

For detailed information, see **README.md**
