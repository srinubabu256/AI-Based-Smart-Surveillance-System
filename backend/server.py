from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse, FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import cv2
import numpy as np
import base64
import asyncio
import json
from io import BytesIO
from PIL import Image
import aiosqlite

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# SQLite for incidents
INCIDENTS_DB = ROOT_DIR / 'incidents.db'
INCIDENTS_DIR = ROOT_DIR / 'incidents'
INCIDENTS_DIR.mkdir(exist_ok=True)

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")

# Global variables for surveillance
surveillance_active = False
video_capture = None
detection_sensitivity = 'medium'

# Initialize HOG detector for human detection
hog = cv2.HOGDescriptor()
hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())

# Models
class Incident(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    timestamp: str
    image_path: str
    confidence: float
    detection_type: str

class IncidentCreate(BaseModel):
    detection_type: str = "motion"

class SurveillanceConfig(BaseModel):
    sensitivity: str = 'medium'

class SurveillanceStatus(BaseModel):
    active: bool
    sensitivity: str
    total_incidents: int

# Initialize database
async def init_db():
    async with aiosqlite.connect(INCIDENTS_DB) as db:
        await db.execute('''
            CREATE TABLE IF NOT EXISTS incidents (
                id TEXT PRIMARY KEY,
                timestamp TEXT NOT NULL,
                image_path TEXT NOT NULL,
                confidence REAL NOT NULL,
                detection_type TEXT NOT NULL
            )
        ''')
        await db.commit()

@app.on_event("startup")
async def startup():
    await init_db()

# Utility functions
def detect_motion(frame1, frame2, sensitivity='medium'):
    """Detect motion between two frames"""
    diff = cv2.absdiff(frame1, frame2)
    gray = cv2.cvtColor(diff, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    
    # Sensitivity thresholds
    thresholds = {'high': 20, 'medium': 30, 'low': 50}
    threshold_value = thresholds.get(sensitivity, 30)
    
    _, thresh = cv2.threshold(blur, threshold_value, 255, cv2.THRESH_BINARY)
    dilated = cv2.dilate(thresh, None, iterations=3)
    contours, _ = cv2.findContours(dilated, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
    
    significant_motion = False
    for contour in contours:
        if cv2.contourArea(contour) > 1000:
            significant_motion = True
            break
    
    return significant_motion

def detect_humans(frame):
    """Detect humans in frame using HOG"""
    try:
        boxes, weights = hog.detectMultiScale(frame, winStride=(8,8), padding=(4,4), scale=1.05)
        return len(boxes) > 0, len(boxes)
    except:
        return False, 0

async def save_incident(frame, detection_type='motion', confidence=0.85):
    """Save incident to database and file system"""
    incident_id = str(uuid.uuid4())
    timestamp = datetime.now(timezone.utc).isoformat()
    filename = f"{incident_id}.jpg"
    image_path = INCIDENTS_DIR / filename
    
    # Save image
    cv2.imwrite(str(image_path), frame)
    
    # Save to database
    async with aiosqlite.connect(INCIDENTS_DB) as db:
        await db.execute(
            'INSERT INTO incidents (id, timestamp, image_path, confidence, detection_type) VALUES (?, ?, ?, ?, ?)',
            (incident_id, timestamp, str(image_path), confidence, detection_type)
        )
        await db.commit()
    
    return incident_id

# API Routes
@api_router.get("/")
async def root():
    return {"message": "Smart Surveillance System API"}

@api_router.get("/surveillance/status", response_model=SurveillanceStatus)
async def get_surveillance_status():
    async with aiosqlite.connect(INCIDENTS_DB) as db:
        cursor = await db.execute('SELECT COUNT(*) FROM incidents')
        row = await cursor.fetchone()
        total_incidents = row[0] if row else 0
    
    return SurveillanceStatus(
        active=surveillance_active,
        sensitivity=detection_sensitivity,
        total_incidents=total_incidents
    )

@api_router.post("/surveillance/start")
async def start_surveillance(config: SurveillanceConfig):
    global surveillance_active, video_capture, detection_sensitivity
    
    if surveillance_active:
        raise HTTPException(status_code=400, detail="Surveillance already active")
    
    try:
        video_capture = cv2.VideoCapture(0)
        if not video_capture.isOpened():
            raise HTTPException(status_code=500, detail="Could not open webcam")
        
        surveillance_active = True
        detection_sensitivity = config.sensitivity
        return {"status": "started", "sensitivity": detection_sensitivity}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/surveillance/stop")
async def stop_surveillance():
    global surveillance_active, video_capture
    
    if not surveillance_active:
        raise HTTPException(status_code=400, detail="Surveillance not active")
    
    surveillance_active = False
    if video_capture:
        video_capture.release()
        video_capture = None
    
    return {"status": "stopped"}

@api_router.post("/surveillance/upload")
async def upload_video(file: UploadFile = File(...), sensitivity: str = 'medium'):
    """Process uploaded video file"""
    try:
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        
        # Save temporarily
        temp_video_path = INCIDENTS_DIR / f"temp_{uuid.uuid4()}.mp4"
        with open(temp_video_path, 'wb') as f:
            f.write(contents)
        
        # Process video
        cap = cv2.VideoCapture(str(temp_video_path))
        incidents_detected = 0
        
        ret, prev_frame = cap.read()
        frame_count = 0
        
        while ret:
            ret, curr_frame = cap.read()
            if not ret:
                break
            
            frame_count += 1
            # Process every 10th frame to speed up
            if frame_count % 10 != 0:
                continue
            
            # Detect humans
            humans_detected, count = detect_humans(curr_frame)
            
            # Detect motion
            motion_detected = detect_motion(prev_frame, curr_frame, sensitivity)
            
            if humans_detected and motion_detected:
                await save_incident(curr_frame, 'motion+human', 0.90)
                incidents_detected += 1
            
            prev_frame = curr_frame.copy()
        
        cap.release()
        temp_video_path.unlink()  # Delete temp file
        
        return {
            "status": "processed",
            "incidents_detected": incidents_detected,
            "frames_processed": frame_count
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/incidents", response_model=List[Incident])
async def get_incidents():
    async with aiosqlite.connect(INCIDENTS_DB) as db:
        cursor = await db.execute(
            'SELECT id, timestamp, image_path, confidence, detection_type FROM incidents ORDER BY timestamp DESC LIMIT 100'
        )
        rows = await cursor.fetchall()
        
        incidents = []
        for row in rows:
            incidents.append(Incident(
                id=row[0],
                timestamp=row[1],
                image_path=row[2],
                confidence=row[3],
                detection_type=row[4]
            ))
        
        return incidents

@api_router.delete("/incidents/{incident_id}")
async def delete_incident(incident_id: str):
    async with aiosqlite.connect(INCIDENTS_DB) as db:
        # Get image path
        cursor = await db.execute('SELECT image_path FROM incidents WHERE id = ?', (incident_id,))
        row = await cursor.fetchone()
        
        if not row:
            raise HTTPException(status_code=404, detail="Incident not found")
        
        # Delete file
        image_path = Path(row[0])
        if image_path.exists():
            image_path.unlink()
        
        # Delete from database
        await db.execute('DELETE FROM incidents WHERE id = ?', (incident_id,))
        await db.commit()
    
    return {"status": "deleted"}

@api_router.delete("/incidents/old/cleanup")
async def cleanup_old_incidents(days: int = 7):
    """Delete incidents older than specified days"""
    cutoff_date = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    
    async with aiosqlite.connect(INCIDENTS_DB) as db:
        # Get old incidents
        cursor = await db.execute(
            'SELECT id, image_path FROM incidents WHERE timestamp < ?',
            (cutoff_date,)
        )
        rows = await cursor.fetchall()
        
        # Delete files and records
        deleted_count = 0
        for row in rows:
            image_path = Path(row[1])
            if image_path.exists():
                image_path.unlink()
            deleted_count += 1
        
        await db.execute('DELETE FROM incidents WHERE timestamp < ?', (cutoff_date,))
        await db.commit()
    
    return {"status": "cleaned", "deleted_count": deleted_count}

@api_router.get("/incidents/{incident_id}/image")
async def get_incident_image(incident_id: str):
    async with aiosqlite.connect(INCIDENTS_DB) as db:
        cursor = await db.execute('SELECT image_path FROM incidents WHERE id = ?', (incident_id,))
        row = await cursor.fetchone()
        
        if not row:
            raise HTTPException(status_code=404, detail="Incident not found")
        
        image_path = Path(row[0])
        if not image_path.exists():
            raise HTTPException(status_code=404, detail="Image file not found")
        
        return FileResponse(image_path, media_type="image/jpeg")

@api_router.websocket("/surveillance/stream")
async def video_stream(websocket: WebSocket):
    await websocket.accept()
    
    global surveillance_active, video_capture, detection_sensitivity
    
    if not surveillance_active or not video_capture:
        await websocket.send_json({"error": "Surveillance not active"})
        await websocket.close()
        return
    
    prev_frame = None
    last_incident_time = datetime.now()
    
    try:
        while surveillance_active:
            ret, frame = video_capture.read()
            if not ret:
                break
            
            # Detect humans
            humans_detected, human_count = detect_humans(frame)
            
            # Detect motion
            motion_detected = False
            if prev_frame is not None:
                motion_detected = detect_motion(prev_frame, frame, detection_sensitivity)
            
            # Save incident if both detected and cooldown passed
            incident_detected = False
            if humans_detected and motion_detected:
                time_since_last = (datetime.now() - last_incident_time).seconds
                if time_since_last > 5:  # 5 second cooldown
                    await save_incident(frame, 'live_motion+human', 0.85)
                    incident_detected = True
                    last_incident_time = datetime.now()
            
            # Draw detection boxes
            if humans_detected:
                boxes, _ = hog.detectMultiScale(frame, winStride=(8,8), padding=(4,4), scale=1.05)
                for (x, y, w, h) in boxes:
                    cv2.rectangle(frame, (x, y), (x+w, y+h), (0, 255, 0), 2)
            
            # Add status text
            status_text = f"Humans: {human_count} | Motion: {'YES' if motion_detected else 'NO'}"
            cv2.putText(frame, status_text, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            
            # Encode frame
            _, buffer = cv2.imencode('.jpg', frame)
            frame_base64 = base64.b64encode(buffer).decode('utf-8')
            
            # Send frame
            await websocket.send_json({
                "frame": frame_base64,
                "humans_detected": humans_detected,
                "motion_detected": motion_detected,
                "incident_detected": incident_detected
            })
            
            prev_frame = frame.copy()
            await asyncio.sleep(0.05)  # ~20 FPS
            
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logging.error(f"WebSocket error: {e}")
    finally:
        try:
            await websocket.close()
        except:
            pass

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    global video_capture
    if video_capture:
        video_capture.release()
    client.close()
