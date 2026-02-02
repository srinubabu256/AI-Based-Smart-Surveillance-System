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

# Recordings directory
RECORDINGS_DIR = ROOT_DIR / 'recordings'
RECORDINGS_DIR.mkdir(exist_ok=True)

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")

# Global variables for surveillance
surveillance_active = False
video_capture = None
detection_sensitivity = 'medium'
video_writer = None  # For recording video
recording_active = False
current_recording_path = None

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
    """Detect humans in frame using HOG with enhanced parameters for better accuracy"""
    try:
        # Resize frame for optimal detection
        height, width = frame.shape[:2]
        original_frame = frame.copy()
        
        if width > 640:
            scale_factor = 640 / width
            frame = cv2.resize(frame, (640, int(height * scale_factor)))
        else:
            scale_factor = 1.0
        
        # Enhanced HOG parameters for better human detection
        boxes, weights = hog.detectMultiScale(
            frame, 
            winStride=(4, 4),       # Fine-grained scanning
            padding=(16, 16),       # Increased padding for edge detection
            scale=1.03,             # Smaller scale steps for better accuracy
            hitThreshold=-0.5,      # More sensitive threshold
            finalThreshold=1.0      # Lower grouping threshold to catch more detections
        )
        
        # Filter and scale back to original size
        if len(boxes) > 0 and len(weights) > 0:
            # Keep detections with reasonable confidence (lowered threshold)
            valid_detections = [(box, weight) for box, weight in zip(boxes, weights) if weight > 0.2]
            
            if scale_factor != 1.0:
                # Scale boxes back to original frame size
                scaled_boxes = []
                for box, weight in valid_detections:
                    x, y, w, h = box
                    scaled_box = (
                        int(x / scale_factor),
                        int(y / scale_factor),
                        int(w / scale_factor),
                        int(h / scale_factor)
                    )
                    scaled_boxes.append(scaled_box)
                valid_boxes = scaled_boxes
            else:
                valid_boxes = [box for box, _ in valid_detections]
            
            valid_weights = [weight for _, weight in valid_detections]
            return len(valid_boxes) > 0, len(valid_boxes), valid_boxes, valid_weights
        
        return False, 0, [], []
    except Exception as e:
        logger.error(f"Human detection error: {e}")
        return False, 0, [], []

def detect_faces(frame):
    """Detect faces using Haar Cascade with enhanced parameters for multi-person capture"""
    try:
        # Load face cascade (using frontal face detector)
        face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
        
        # Convert to grayscale for face detection
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        
        # Apply histogram equalization for better detection in varying lighting
        gray = cv2.equalizeHist(gray)
        
        # Detect faces with optimized parameters
        faces = face_cascade.detectMultiScale(
            gray,
            scaleFactor=1.05,      # Smaller steps for better detection
            minNeighbors=4,        # Lower threshold to catch more faces
            minSize=(25, 25),      # Smaller minimum size
            flags=cv2.CASCADE_SCALE_IMAGE
        )
        
        # Also try profile face detection for better coverage
        profile_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_profileface.xml')
        profile_faces = profile_cascade.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=4,
            minSize=(25, 25)
        )
        
        # Combine frontal and profile detections
        all_faces = list(faces) + list(profile_faces)
        
        return len(all_faces) > 0, len(all_faces), all_faces
    except Exception as e:
        logger.error(f"Face detection error: {e}")
        return False, 0, []

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

def start_recording(frame_width, frame_height, fps=20.0):
    """Start video recording"""
    global video_writer, recording_active, current_recording_path
    
    try:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"recording_{timestamp}.mp4"
        current_recording_path = RECORDINGS_DIR / filename
        
        # Use MP4V codec for better compatibility
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        video_writer = cv2.VideoWriter(
            str(current_recording_path),
            fourcc,
            fps,
            (frame_width, frame_height)
        )
        
        if video_writer.isOpened():
            recording_active = True
            logger.info(f"Recording started: {filename}")
            return True
        else:
            logger.error("Failed to initialize video writer")
            return False
    except Exception as e:
        logger.error(f"Error starting recording: {e}")
        return False

def stop_recording():
    """Stop video recording"""
    global video_writer, recording_active, current_recording_path
    
    try:
        if video_writer:
            video_writer.release()
            video_writer = None
            recording_active = False
            logger.info(f"Recording stopped: {current_recording_path}")
            return True
    except Exception as e:
        logger.error(f"Error stopping recording: {e}")
    
    return False

def write_frame_to_recording(frame):
    """Write a frame to the active recording"""
    global video_writer, recording_active
    
    try:
        if recording_active and video_writer and video_writer.isOpened():
            video_writer.write(frame)
            return True
    except Exception as e:
        logger.error(f"Error writing frame to recording: {e}")
    
    return False

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

class MockVideoCapture:
    """Generates synthetic video frames when real camera is unavailable"""
    def __init__(self):
        self.is_opened = True
    
    def isOpened(self):
        return self.is_opened
    
    def read(self):
        if not self.is_opened:
            return False, None
        
        # Create a dummy frame (black background)
        frame = np.zeros((480, 640, 3), np.uint8)
        
        # Add some dynamic movement (simulated noise/circles)
        t = datetime.now().timestamp()
        cv2.circle(frame, (320 + int(100 * np.sin(t)), 240 + int(50 * np.cos(t))), 30, (0, 255, 255), -1)
        
        # Add text
        cv2.putText(frame, "MOCK CAMERA - NO WEBCAM FOUND", (50, 240), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
        cv2.putText(frame, datetime.now().strftime("%H:%M:%S"), (50, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
        
        return True, frame
    
    def release(self):
        self.is_opened = False

@api_router.post("/surveillance/start")
async def start_surveillance(config: SurveillanceConfig):
    global surveillance_active, video_capture, detection_sensitivity
    
    if surveillance_active:
        return {"status": "started", "sensitivity": detection_sensitivity, "message": "Already active"}
    
    try:
        logger.info("Attempting to open webcam...")
        video_capture = cv2.VideoCapture(0)
        
        if not video_capture.isOpened():
            logger.warning("Failed to open real webcam. Switching to Mock Camera fallback.")
            video_capture = MockVideoCapture()
            # Note: We don't raise error here, we proceed with mock
        else:
            logger.info("Real webcam opened successfully.")
        
        surveillance_active = True
        detection_sensitivity = config.sensitivity
        return {"status": "started", "sensitivity": detection_sensitivity}
    except Exception as e:
        logger.error(f"Error starting surveillance: {e}")
        # Try fallback one last time in case of exception
        video_capture = MockVideoCapture()
        surveillance_active = True
        return {"status": "started_fallback", "sensitivity": detection_sensitivity, "details": str(e)}

@api_router.post("/surveillance/stop")
async def stop_surveillance():
    global surveillance_active, video_capture
    
    # Always succeed in stopping to reset state
    surveillance_active = False
    if video_capture:
        video_capture.release()
        video_capture = None
    
    logger.info("Surveillance stopped.")
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
            
            # Detect humans with improved detection
            humans_detected, count, boxes, weights = detect_humans(curr_frame)
            
            # Calculate dynamic confidence
            confidence = 0.70
            if len(weights) > 0:
                confidence = min(sum(weights) / len(weights) / 2.0, 1.0)
                confidence = max(confidence, 0.70)
            
            # Detect motion
            motion_detected = detect_motion(prev_frame, curr_frame, sensitivity)
            
            if humans_detected and motion_detected:
                await save_incident(curr_frame, 'motion+human', confidence)
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
    
    global surveillance_active, video_capture, detection_sensitivity, recording_active
    
    # Initialize recording when stream starts
    recording_started = False
    prev_frame = None
    last_incident_time = datetime.now()
    
    try:
        while True:
            if not surveillance_active or not video_capture:
                # Stop recording if it was active
                if recording_started:
                    stop_recording()
                    recording_started = False
                
                # Send idle status instead of closing
                await websocket.send_json({
                    "frame": None,
                    "status": "idle",
                    "recording": False,
                    "message": "Surveillance system is currently inactive."
                })
                await asyncio.sleep(1) # Check every second
                continue
            
            # Surveillance is active, read frames
            ret, frame = video_capture.read()
            if not ret:
                # Failed to read frame (camera disconnected?)
                await websocket.send_json({"error": "Failed to capture video frame"})
                await asyncio.sleep(1)
                continue
            
            # Start recording on first successful frame
            if not recording_started:
                height, width = frame.shape[:2]
                if start_recording(width, height):
                    recording_started = True
            
            # Write frame to recording
            if recording_started:
                write_frame_to_recording(frame.copy())
            
            # Detect humans with improved HOG
            humans_detected, human_count, human_boxes, human_weights = detect_humans(frame)
            
            # Detect faces for multi-person face capture
            faces_detected, face_count, face_boxes = detect_faces(frame)
            
            # Use the higher count between HOG and face detection
            final_count = max(human_count, face_count)
            final_detected = humans_detected or faces_detected
            
            # Calculate dynamic confidence based on detection weights
            avg_confidence = 0.0
            if len(human_weights) > 0:
                # Normalize weights to 0-1 range and calculate average
                avg_confidence = min(sum(human_weights) / len(human_weights) / 2.0, 1.0)
            elif faces_detected:
                # If only faces detected, use moderate confidence
                avg_confidence = 0.75
            
            # Detect motion
            motion_detected = False
            if prev_frame is not None:
                motion_detected = detect_motion(prev_frame, frame, detection_sensitivity)
            else:
                prev_frame = frame.copy()

            # Save incident if both detected and cooldown passed
            incident_detected = False
            if final_detected and motion_detected:
                time_since_last = (datetime.now() - last_incident_time).seconds
                if time_since_last > 5:  # 5 second cooldown
                    # Use dynamic confidence
                    incident_confidence = max(avg_confidence, 0.70)
                    await save_incident(frame, 'live_motion+human', incident_confidence)
                    incident_detected = True
                    last_incident_time = datetime.now()
            
            # Draw detection boxes for humans (HOG)
            if humans_detected and len(human_boxes) > 0:
                for (x, y, w, h) in human_boxes:
                    cv2.rectangle(frame, (x, y), (x+w, y+h), (0, 255, 0), 2)
                    # Add label above each detected person
                    cv2.putText(frame, "PERSON", (x, y-10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
            
            # Draw face boxes (different color to distinguish)
            if faces_detected and len(face_boxes) > 0:
                for (x, y, w, h) in face_boxes:
                    cv2.rectangle(frame, (x, y), (x+w, y+h), (255, 255, 0), 2)  # Yellow for faces
                    cv2.putText(frame, "FACE", (x, y-10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 0), 2)
            
            # Add status text with background for better visibility
            status_text = f"Humans: {final_count} | Motion: {'YES' if motion_detected else 'NO'}"
            
            # Draw background rectangle for text
            text_size = cv2.getTextSize(status_text, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)[0]
            cv2.rectangle(frame, (5, 5), (15 + text_size[0], 40), (0, 0, 0), -1)
            cv2.putText(frame, status_text, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            
            # Add confidence indicator
            if avg_confidence > 0:
                conf_text = f"Confidence: {avg_confidence*100:.1f}%"
                conf_size = cv2.getTextSize(conf_text, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)[0]
                cv2.rectangle(frame, (5, 45), (15 + conf_size[0], 75), (0, 0, 0), -1)
                cv2.putText(frame, conf_text, (10, 65), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 0), 2)
            
            # Add recording indicator
            if recording_started:
                rec_text = "REC"
                rec_size = cv2.getTextSize(rec_text, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)[0]
                frame_width = frame.shape[1]
                # Red circle for recording indicator
                cv2.circle(frame, (frame_width - 80, 25), 10, (0, 0, 255), -1)
                cv2.putText(frame, rec_text, (frame_width - 65, 32), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
            
            # Add large count indicator in top right if humans detected
            if final_count > 0:
                count_text = f"COUNT: {final_count}"
                count_size = cv2.getTextSize(count_text, cv2.FONT_HERSHEY_SIMPLEX, 1.2, 3)[0]
                frame_width = frame.shape[1]
                cv2.rectangle(frame, (frame_width - count_size[0] - 20, 5), (frame_width - 5, 50), (0, 0, 0), -1)
                cv2.putText(frame, count_text, (frame_width - count_size[0] - 15, 35), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 255, 255), 3)
            
            
            # Encode frame
            _, buffer = cv2.imencode('.jpg', frame)
            frame_base64 = base64.b64encode(buffer).decode('utf-8')
            
            # Send frame with all detection data
            await websocket.send_json({
                "frame": frame_base64,
                "humans_detected": final_detected,
                "human_count": final_count,
                "face_count": face_count,
                "confidence": round(avg_confidence * 100, 2),  # Send as percentage
                "motion_detected": motion_detected,
                "incident_detected": incident_detected,
                "recording": recording_started,
                "status": "active"
            })
            
            prev_frame = frame.copy()
            await asyncio.sleep(0.05)  # ~20 FPS
            
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected")
        if recording_started:
            stop_recording()
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        if recording_started:
            stop_recording()
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
