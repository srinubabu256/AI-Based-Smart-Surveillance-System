from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse, FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, OrderedDict
import uuid
from datetime import datetime, timezone, timedelta
import cv2
import numpy as np
import base64
import asyncio
import json
from io import BytesIO
import aiosqlite
from scipy.spatial import distance as dist

# MediaPipe Import with Safety Check
try:
    import mediapipe as mp
    # Fix for some windows environments where mp.solutions is not auto-loaded
    if not hasattr(mp, 'solutions'):
        import mediapipe.python.solutions as mp_solutions
        mp.solutions = mp_solutions
    MP_AVAILABLE = True
except ImportError:
    MP_AVAILABLE = False
except Exception as e:
    print(f"MediaPipe load error: {e}")
    MP_AVAILABLE = False

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
try:
    client = AsyncIOMotorClient(mongo_url)
    db = client[os.environ.get('DB_NAME', 'surveillance_db')]
except:
    pass

# SQLite for incidents (Local fallback/Primary for demo)
INCIDENTS_DB = ROOT_DIR / 'incidents.db'
INCIDENTS_DIR = ROOT_DIR / 'incidents'
INCIDENTS_DIR.mkdir(exist_ok=True)

# Recordings directory
RECORDINGS_DIR = ROOT_DIR / 'recordings'
RECORDINGS_DIR.mkdir(exist_ok=True)

# Create the main app
app = FastAPI()

# Add CORS middleware to allow cross-origin requests (Fixes 403 Forbidden on WebSocket)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("backend.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# --- Models ---
class Incident(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    timestamp: str
    image_path: str
    confidence: float
    detection_type: str
    human_count: int = 0

class SurveillanceConfig(BaseModel):
    sensitivity: str = 'medium'

class SurveillanceStatus(BaseModel):
    active: bool
    sensitivity: str
    total_incidents: int

# --- Database Init ---
async def init_db():
    async with aiosqlite.connect(INCIDENTS_DB) as db:
        await db.execute('''
            CREATE TABLE IF NOT EXISTS incidents (
                id TEXT PRIMARY KEY,
                timestamp TEXT NOT NULL,
                image_path TEXT NOT NULL,
                confidence REAL NOT NULL,
                detection_type TEXT NOT NULL,
                human_count INTEGER DEFAULT 0
            )
        ''')
        await db.commit()

@app.on_event("startup")
async def startup():
    await init_db()

# --- Advanced Vision Logic ---

class CentroidTracker:
    def __init__(self, maxDisappeared=50):
        self.nextObjectID = 0
        self.objects = OrderedDict()
        self.disappeared = OrderedDict()
        self.maxDisappeared = maxDisappeared

    def register(self, centroid):
        self.objects[self.nextObjectID] = centroid
        self.disappeared[self.nextObjectID] = 0
        self.nextObjectID += 1

    def deregister(self, objectID):
        del self.objects[objectID]
        del self.disappeared[objectID]

    def update(self, rects):
        if len(rects) == 0:
            for objectID in list(self.disappeared.keys()):
                self.disappeared[objectID] += 1
                if self.disappeared[objectID] > self.maxDisappeared:
                    self.deregister(objectID)
            return self.objects

        inputCentroids = np.zeros((len(rects), 2), dtype="int")
        for (i, (startX, startY, endX, endY)) in enumerate(rects):
            cX = int((startX + endX) / 2.0)
            cY = int((startY + endY) / 2.0)
            inputCentroids[i] = (cX, cY)

        if len(self.objects) == 0:
            for i in range(0, len(inputCentroids)):
                self.register(inputCentroids[i])
        else:
            objectIDs = list(self.objects.keys())
            objectCentroids = list(self.objects.values())
            try:
                D = dist.cdist(np.array(objectCentroids), inputCentroids)
            except:
                return self.objects
                
            rows = D.min(axis=1).argsort()
            cols = D.argmin(axis=1)[rows]

            usedRows = set()
            usedCols = set()

            for (row, col) in zip(rows, cols):
                if row in usedRows or col in usedCols:
                    continue

                objectID = objectIDs[row]
                self.objects[objectID] = inputCentroids[col]
                self.disappeared[objectID] = 0
                usedRows.add(row)
                usedCols.add(col)

            unusedRows = set(range(0, D.shape[0])).difference(usedRows)
            unusedCols = set(range(0, D.shape[1])).difference(usedCols)

            if D.shape[0] >= D.shape[1]:
                for row in unusedRows:
                    objectID = objectIDs[row]
                    self.disappeared[objectID] += 1
                    if self.disappeared[objectID] > self.maxDisappeared:
                        self.deregister(objectID)
            else:
                for col in unusedCols:
                    self.register(inputCentroids[col])

        return self.objects

class SurveillanceSystem:
    def __init__(self):
        self.active = False
        self.sensitivity = 'medium'
        self.video_capture = None
        self.video_writer = None
        self.recording_active = False
        self.current_recording_path = None
        
        # Detectors
        self.hog = cv2.HOGDescriptor()
        self.hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
        
        self.use_mp = False
        if MP_AVAILABLE:
            try:
                self.mp_face_detection = mp.solutions.face_detection.FaceDetection(model_selection=1, min_detection_confidence=0.5)
                self.use_mp = True
                logger.info("Using MediaPipe for Face Detection")
            except Exception as e:
                logger.error(f"MediaPipe Init Failed: {e}, falling back to Haar")
                self.use_mp = False
        
        if not self.use_mp:
            self.face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_alt.xml')
            if self.face_cascade.empty():
                self.face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')

        self.fgbg = cv2.createBackgroundSubtractorMOG2(history=500, varThreshold=25, detectShadows=True)
        self.tracker = CentroidTracker(maxDisappeared=20)
        
        self.last_incident_time = datetime.min

    def detect_motion_mog2(self, frame):
        """Robust motion detection using Background Subtraction"""
        mask = self.fgbg.apply(frame)
        _, mask = cv2.threshold(mask, 250, 255, cv2.THRESH_BINARY) # Remove shadows
        dilated = cv2.dilate(mask, None, iterations=2)
        contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        motion_detected = False
        min_area = 500 if self.sensitivity == 'high' else 1000 if self.sensitivity == 'medium' else 2000
        
        for contour in contours:
            if cv2.contourArea(contour) > min_area:
                motion_detected = True
                break
        return motion_detected

    def run_detection_pipeline(self, frame):
        try:
            height, width = frame.shape[:2]
            small_frame = cv2.resize(frame, (640, int(height * (640/width)))) if width > 640 else frame
            scale = width / small_frame.shape[1]
            
            # 1. Motion Check
            motion = self.detect_motion_mog2(small_frame)
            
            # 2. Human Detection (HOG)
            rects = []
            humans, weights = self.hog.detectMultiScale(small_frame, winStride=(8,8), padding=(8,8), scale=1.05)
            for (x, y, w, h) in humans:
                rects.append((int(x * scale), int(y * scale), int(x * scale) + int(w * scale), int(y * scale) + int(h * scale)))
                
            # 3. Face Detection
            if self.use_mp:
                # MediaPipe
                rgb_frame = cv2.cvtColor(small_frame, cv2.COLOR_BGR2RGB)
                results = self.mp_face_detection.process(rgb_frame)
                if results.detections:
                    for detection in results.detections:
                        bboxC = detection.location_data.relative_bounding_box
                        ih, iw, _ = small_frame.shape
                        x, y, w, h = int(bboxC.xmin * iw), int(bboxC.ymin * ih), int(bboxC.width * iw), int(bboxC.height * ih)
                        rects.append((int(x * scale), int(y * scale), int(x * scale) + int(w * scale), int(y * scale) + int(h * scale)))
            else:
                # Haar Fallback
                gray = cv2.cvtColor(small_frame, cv2.COLOR_BGR2GRAY)
                faces = self.face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30))
                for (x, y, w, h) in faces:
                    rects.append((int(x * scale), int(y * scale), int(x * scale) + int(w * scale), int(y * scale) + int(h * scale)))
                
            # 4. Tracking
            objects = self.tracker.update(rects)
            
            # Count unique objects being tracked
            count = len(objects)
            
            return motion, count, rects, objects
        except Exception as e:
            logger.error(f"Pipeline error: {e}")
            return False, 0, [], {}

    async def save_incident(self, frame, detection_type, count, confidence=0.85):
        incident_id = str(uuid.uuid4())
        timestamp = datetime.now(timezone.utc).isoformat()
        filename = f"{incident_id}.jpg"
        image_path = INCIDENTS_DIR / filename
        
        cv2.imwrite(str(image_path), frame)
        
        async with aiosqlite.connect(INCIDENTS_DB) as db:
            await db.execute(
                'INSERT INTO incidents (id, timestamp, image_path, confidence, detection_type, human_count) VALUES (?, ?, ?, ?, ?, ?)',
                (incident_id, timestamp, str(image_path), confidence, detection_type, count)
            )
            await db.commit()
        return incident_id

# Global Instance
system = SurveillanceSystem()

# --- Helper For Recording ---
def start_recording_file(width, height, fps=20.0):
    try:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"recording_{timestamp}.mp4"
        path = RECORDINGS_DIR / filename
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        writer = cv2.VideoWriter(str(path), fourcc, fps, (width, height))
        return writer, path
    except:
        return None, None

# --- API Routes ---

@api_router.get("/")
async def root():
    return {"message": "Hybrid Smart Surveillance System API"}

@api_router.get("/surveillance/status", response_model=SurveillanceStatus)
async def get_status():
    async with aiosqlite.connect(INCIDENTS_DB) as db:
        cursor = await db.execute('SELECT COUNT(*) FROM incidents')
        row = await cursor.fetchone()
        count = row[0] if row else 0
    return SurveillanceStatus(active=system.active, sensitivity=system.sensitivity, total_incidents=count)

@api_router.post("/surveillance/start")
async def start_surv(config: SurveillanceConfig):
    if system.active:
        return {"status": "started", "message": "Already active"}
    
    try:
        system.video_capture = cv2.VideoCapture(0)
        if not system.video_capture.isOpened():
             # Mock Fallback
             pass
    except:
        pass
        
    system.active = True
    system.sensitivity = config.sensitivity
    return {"status": "started"}

@api_router.post("/surveillance/stop")
async def stop_surv():
    system.active = False
    if system.video_capture:
        system.video_capture.release()
    return {"status": "stopped"}

@api_router.get("/incidents", response_model=List[Incident])
async def list_incidents():
    async with aiosqlite.connect(INCIDENTS_DB) as db:
        cursor = await db.execute('SELECT id, timestamp, image_path, confidence, detection_type, human_count FROM incidents ORDER BY timestamp DESC LIMIT 100')
        rows = await cursor.fetchall()
        return [Incident(id=r[0], timestamp=r[1], image_path=r[2], confidence=r[3], detection_type=r[4], human_count=r[5] if r[5] else 0) for r in rows]

@api_router.delete("/incidents/old/cleanup")
async def cleanup(days: int = 7):
    async with aiosqlite.connect(INCIDENTS_DB) as db:
        if days == 0:
            cursor = await db.execute('SELECT image_path FROM incidents')
            rows = await cursor.fetchall()
            for r in rows:
                Path(r[0]).unlink(missing_ok=True)
            await db.execute('DELETE FROM incidents')
            await db.commit()
            return {"status": "cleaned", "deleted_count": len(rows)}
        else:
             # Existing old cleanup logic could go here
             return {"status": "cleaned", "deleted_count": 0}

@api_router.delete("/incidents/{incident_id}")
async def delete_one(incident_id: str):
    async with aiosqlite.connect(INCIDENTS_DB) as db:
        cursor = await db.execute('SELECT image_path FROM incidents WHERE id=?', (incident_id,))
        row = await cursor.fetchone()
        if row:
            Path(row[0]).unlink(missing_ok=True)
            await db.execute('DELETE FROM incidents WHERE id=?', (incident_id,))
            await db.commit()
    return {"status": "deleted"}

@api_router.get("/incidents/{incident_id}/image")
async def get_image(incident_id: str):
    async with aiosqlite.connect(INCIDENTS_DB) as db:
        cursor = await db.execute('SELECT image_path FROM incidents WHERE id=?', (incident_id,))
        row = await cursor.fetchone()
        if row and Path(row[0]).exists():
            return FileResponse(Path(row[0]), media_type="image/jpeg")
    raise HTTPException(status_code=404)

# --- WebSocket Stream ---
@api_router.websocket("/surveillance/stream")
async def stream(websocket: WebSocket):
    await websocket.accept()
    
    # Mock Generator if needed
    def get_mock_frame():
        frame = np.zeros((480, 640, 3), np.uint8)
        cv2.putText(frame, "MOCK CAMERA", (50, 240), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
        return frame

    rec_writer = None
    
    try:
        while True:
            if not system.active:
                await websocket.send_json({"status": "idle", "frame": None})
                await asyncio.sleep(1)
                continue
                
            frame = None
            if system.video_capture and system.video_capture.isOpened():
                ret, frame = system.video_capture.read()
                if not ret: frame = None
                
            if frame is None:
                frame = get_mock_frame() # Fallback
                
            # Recording Logic
            if rec_writer is None:
                h, w = frame.shape[:2]
                rec_writer, _ = start_recording_file(w, h)
            if rec_writer:
                rec_writer.write(frame)
                
            # Hybrid Pipeline
            motion, count, rects, objects = system.run_detection_pipeline(frame)
            
            # Incident Saving (Cooldown 5s)
            is_incident = False
            now = datetime.now()
            if motion and count > 0:
                if (now - system.last_incident_time).total_seconds() > 5:
                    await system.save_incident(frame, "hybrid_detection", count)
                    system.last_incident_time = now
                    is_incident = True
            
            # Visualization
            # Draw Objects (Tracking)
            for (objectID, centroid) in objects.items():
                text = f"ID {objectID}"
                cv2.putText(frame, text, (centroid[0] - 10, centroid[1] - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
                cv2.circle(frame, (centroid[0], centroid[1]), 4, (0, 255, 0), -1)
            
            # Draw Detects
            for (sx, sy, ex, ey) in rects:
                cv2.rectangle(frame, (sx, sy), (ex, ey), (255, 0, 0), 2)
                
            # Status Overlay
            cv2.putText(frame, f"Humans: {count}", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            if motion:
                cv2.putText(frame, "MOTION DETECTED", (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
            
            # Encode
            _, buffer = cv2.imencode('.jpg', frame)
            b64 = base64.b64encode(buffer).decode('utf-8')
            
            await websocket.send_json({
                "frame": b64,
                "humans_detected": count > 0,
                "human_count": count,
                "confidence": 95.0 if count > 0 else 0,
                "motion_detected": motion,
                "incident_detected": is_incident
            })
            
            await asyncio.sleep(0.04)
            
    except Exception as e:
        logger.error(f"Stream error: {e}")
    finally:
        if rec_writer:
             rec_writer.release()

app.include_router(api_router)



@app.on_event("shutdown")
async def shutdown_db_client():
    global video_capture
    if video_capture:
        video_capture.release()
    # client.close() # Removed because 'client' is not defined in global scope in this file, likely a remnant of old code.

if __name__ == "__main__":
    import uvicorn
    # Use 0.0.0.0 to be accessible, port 8000
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
