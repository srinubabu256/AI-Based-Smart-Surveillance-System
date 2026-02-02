import { useState, useEffect, useRef } from 'react';
import { AlertCircle, Users, Activity, Camera, StopCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.jsx';
import { Alert, AlertDescription } from '../components/ui/alert.jsx';
import { Badge } from '../components/ui/badge.jsx';
import { Button } from '../components/ui/button.jsx';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function LiveMonitoring() {
  const [connected, setConnected] = useState(false);
  const [frame, setFrame] = useState(null);
  const [humansDetected, setHumansDetected] = useState(false);
  const [humanCount, setHumanCount] = useState(0);
  const [faceCount, setFaceCount] = useState(0);
  const [confidence, setConfidence] = useState(0);
  const [motionDetected, setMotionDetected] = useState(false);
  const [incidentDetected, setIncidentDetected] = useState(false);
  const [error, setError] = useState(null);
  const wsRef = useRef(null);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const connectWebSocket = () => {
    const wsUrl = BACKEND_URL.replace('https://', 'wss://').replace('http://', 'ws://');
    const ws = new WebSocket(`${wsUrl}/api/surveillance/stream`);

    ws.onopen = () => {
      setConnected(true);
      setError(null);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.error) {
          setError(data.error);
          return;
        }

        if (data.status === 'idle') {
          setConnected(true); // It is connected, just idle
          setFrame(null);
          setHumanCount(0);
          setFaceCount(0);
          setConfidence(0);
          return;
        }

        setFrame(data.frame);
        setHumansDetected(data.humans_detected);
        setHumanCount(data.human_count || 0);
        setFaceCount(data.face_count || 0);
        setConfidence(data.confidence || 0);
        setMotionDetected(data.motion_detected);
        setIncidentDetected(data.incident_detected);
        setConnected(true);
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
      // Don't set hard error immediately on typical disconnects, let close handle it
    };

    ws.onclose = () => {
      setConnected(false);
      // Only show error if we expected it to be open. 
      // For now, just reset state.
    };

    wsRef.current = ws;
  };

  const handleStopSurveillance = async () => {
    try {
      await axios.post(`${API}/surveillance/stop`);
      toast.success('Surveillance stopped');
      setFrame(null);
    } catch (error) {
      toast.error('Failed to stop surveillance');
    }
  };

  return (
    <div className="p-6" data-testid="live-monitoring-page">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Live Monitoring</h1>
            <p className="text-muted-foreground mt-1">Real-time video feed with AI detection</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`status-indicator ${connected ? 'active' : 'inactive'}`} data-testid="connection-status" />
            <span className="text-sm font-medium mono">
              {connected ? 'CONNECTED' : 'DISCONNECTED'}
            </span>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive" data-testid="error-alert">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Video Feed */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="flex items-center gap-2">
                  <Camera className="w-5 h-5" />
                  Video Feed
                </CardTitle>
                {frame && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleStopSurveillance}
                  >
                    <StopCircle className="w-4 h-4 mr-2" />
                    Stop Surveillance
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                <div className="relative bg-black rounded-sm overflow-hidden aspect-video" data-testid="video-feed">
                  {frame ? (
                    <>
                      <img
                        src={`data:image/jpeg;base64,${frame}`}
                        alt="Live feed"
                        className="w-full h-full object-contain"
                      />
                      <div className="viewfinder-overlay">
                        <div className={`viewfinder-corner top-left ${incidentDetected ? 'incident-detected' : ''}`} />
                        <div className={`viewfinder-corner top-right ${incidentDetected ? 'incident-detected' : ''}`} />
                        <div className={`viewfinder-corner bottom-left ${incidentDetected ? 'incident-detected' : ''}`} />
                        <div className={`viewfinder-corner bottom-right ${incidentDetected ? 'incident-detected' : ''}`} />
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      <div className="text-center">
                        <Camera className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>Waiting for video feed...</p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Detection Status */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Detection Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-sm border border-border" data-testid="human-detection-status">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Humans</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={humansDetected ? 'default' : 'secondary'}>
                      {humanCount > 0 ? `${humanCount} ${humanCount === 1 ? 'Person' : 'Persons'}` : 'None'}
                    </Badge>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 rounded-sm border border-border" data-testid="motion-detection-status">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Motion</span>
                  </div>
                  <Badge variant={motionDetected ? 'default' : 'secondary'}>
                    {motionDetected ? 'Detected' : 'None'}
                  </Badge>
                </div>

                <div className="flex items-center justify-between p-3 rounded-sm border border-border" data-testid="incident-detection-status">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Incident</span>
                  </div>
                  <Badge variant={incidentDetected ? 'destructive' : 'secondary'}>
                    {incidentDetected ? 'ALERT' : 'Normal'}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">System Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Stream Status</span>
                  <span className="font-medium mono">{connected ? 'LIVE' : 'OFFLINE'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Processing</span>
                  <span className="font-medium mono">~20 FPS</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Detection</span>
                  <span className="font-medium mono">HOG+Face</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Faces Detected</span>
                  <span className="font-medium mono">{faceCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Confidence</span>
                  <span className={`font-medium mono ${confidence > 70 ? 'text-green-500' : confidence > 50 ? 'text-yellow-500' : 'text-gray-500'}`}>
                    {confidence > 0 ? `${confidence.toFixed(1)}%` : 'N/A'}
                  </span>
                </div>
              </CardContent>
            </Card>

            {incidentDetected && (
              <Alert variant="destructive" data-testid="incident-alert">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Incident Detected!</strong><br />
                  Abnormal activity recorded and saved.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
