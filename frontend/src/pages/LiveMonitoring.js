import { useState, useEffect, useRef } from 'react';
import { AlertCircle, Users, Activity, Camera } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Badge } from '../components/ui/badge';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export default function LiveMonitoring() {
  const [connected, setConnected] = useState(false);
  const [frame, setFrame] = useState(null);
  const [humansDetected, setHumansDetected] = useState(false);
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
        setFrame(data.frame);
        setHumansDetected(data.humans_detected);
        setMotionDetected(data.motion_detected);
        setIncidentDetected(data.incident_detected);
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
      setError('Connection error');
    };

    ws.onclose = () => {
      setConnected(false);
      setError('Surveillance not active. Please start surveillance from Dashboard.');
    };

    wsRef.current = ws;
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
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Camera className="w-5 h-5" />
                  Video Feed
                </CardTitle>
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
                  <Badge variant={humansDetected ? 'default' : 'secondary'}>
                    {humansDetected ? 'Detected' : 'None'}
                  </Badge>
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
                  <span className="font-medium mono">HOG+Motion</span>
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
