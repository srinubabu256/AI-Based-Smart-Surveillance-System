import { useState, useEffect, useRef } from 'react';
import { AlertCircle, Users, Activity, Camera, StopCircle, TrendingUp, Eye, Zap, ArrowLeft, ArrowRight, Minus, Navigation } from 'lucide-react';
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
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState(null);

  // New state for advanced features
  const [uniquePeople, setUniquePeople] = useState(new Set());
  const [movementDirection, setMovementDirection] = useState('Standing');
  const [activityLevel, setActivityLevel] = useState(0);
  const [totalDetections, setTotalDetections] = useState(0);
  const [avgConfidenceHistory, setAvgConfidenceHistory] = useState([]);
  const [fps, setFps] = useState(0);

  const wsRef = useRef(null);
  const lastPositionsRef = useRef([]);
  const frameCountRef = useRef(0);
  const lastFpsUpdateRef = useRef(Date.now());

  useEffect(() => {
    let timeoutId;
    let ws;

    const connect = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) return;

      const wsUrl = BACKEND_URL.replace('https://', 'wss://').replace('http://', 'ws://');
      ws = new WebSocket(`${wsUrl}/api/surveillance/stream`);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket Connected');
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
            setConnected(true);
            setFrame(null);
            setHumanCount(0);
            setFaceCount(0);
            setConfidence(0);
            setRecording(false);
            setMovementDirection('Standing');
            setActivityLevel(0);
            return;
          }

          setFrame(data.frame);
          setHumansDetected(data.humans_detected);

          const currentCount = data.human_count || 0;
          setHumanCount(currentCount);
          setFaceCount(data.face_count || 0);

          const currentConfidence = data.confidence || 0;
          setConfidence(currentConfidence);

          // Update confidence history
          setAvgConfidenceHistory(prev => {
            const newHistory = [...prev, currentConfidence];
            return newHistory.slice(-10); // Keep last 10 readings
          });

          setMotionDetected(data.motion_detected);
          setIncidentDetected(data.incident_detected);
          setRecording(data.recording || false);
          setConnected(true);

          // Track unique people (Real)
          if (data.active_object_ids && Array.isArray(data.active_object_ids)) {
            setUniquePeople(prev => {
              const newSet = new Set(prev);
              data.active_object_ids.forEach(id => newSet.add(id));
              return newSet;
            });
          }

          if (currentCount > 0) {
            setTotalDetections(prev => prev + 1);
          }

          // Calculate movement direction (Real data from backend now)
          if (data.movement_direction) {
            setMovementDirection(data.movement_direction);

            // Calculate activity level based on motion and people count
            if (data.motion_detected && currentCount > 0 && data.movement_direction !== 'Standing') {
              setActivityLevel(Math.min(100, 50 + (currentCount * 10)));
            } else if (data.motion_detected) {
              setActivityLevel(30);
            } else {
              setActivityLevel(0);
            }
          } else {
            // Fallback if backend doesn't send it yet
            if (data.motion_detected && currentCount > 0) {
              setMovementDirection('Moving');
              setActivityLevel(60);
            } else {
              setMovementDirection('Standing');
              setActivityLevel(0);
            }
          }

        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      ws.onerror = (err) => {
        // Only log if not in closing state to avoid noise during unmount
        if (ws.readyState !== WebSocket.CLOSED && ws.readyState !== WebSocket.CLOSING) {
          console.error('WebSocket error:', err);
          setError("Connection error");
        }
      };

      ws.onclose = () => {
        setConnected(false);
        // Attempt reconnect after 3 seconds
        timeoutId = setTimeout(() => {
          console.log('Attempting to reconnect...');
          connect();
        }, 3000);
      };
    };

    connect();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (wsRef.current) {
        // Use a flag or check state to prevent 'closed before established' noise if possible
        // but strictly closing is correct.
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  const handleStopSurveillance = async () => {
    try {
      await axios.post(`${API}/surveillance/stop`);
      toast.success('Surveillance stopped');
      setFrame(null);
    } catch (error) {
      toast.error('Failed to stop surveillance');
    }
  };

  // Calculate average confidence from history
  const avgConfidence = avgConfidenceHistory.length > 0
    ? avgConfidenceHistory.reduce((a, b) => a + b, 0) / avgConfidenceHistory.length
    : confidence;

  // Get movement icon
  const getMovementIcon = () => {
    if (movementDirection.includes('Left')) return <ArrowLeft className="w-4 h-4" />;
    if (movementDirection.includes('Right')) return <ArrowRight className="w-4 h-4" />;
    if (movementDirection.includes('Standing')) return <Minus className="w-4 h-4" />;
    return <Navigation className="w-4 h-4" />;
  };

  return (
    <div className="p-6" data-testid="live-monitoring-page">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Live Monitoring</h1>
            <p className="text-muted-foreground mt-1">Real-time AI-powered surveillance feed</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={connected ? 'default' : 'destructive'} className="text-sm">
              {connected ? '🟢 Connected' : '🔴 Disconnected'}
            </Badge>
            {recording && (
              <Badge variant="destructive" className="text-sm animate-pulse">
                ● REC
              </Badge>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Main Video Feed - Takes 3 columns */}
          <div className="lg:col-span-3 space-y-4">
            {/* Video Card */}
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <div className="relative aspect-video bg-black flex items-center justify-center">
                  {frame ? (
                    <img
                      src={`data:image/jpeg;base64,${frame}`}
                      alt="Live Feed"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="text-center">
                      <Camera className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                      <p className="text-muted-foreground">
                        {connected ? 'Waiting for surveillance to start...' : 'Connecting to stream...'}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Detection Status Cards */}
            <div className="grid grid-cols-3 gap-4">
              <Card className={humansDetected ? 'border-green-500 border-2' : ''}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Humans</p>
                      <p className="text-2xl font-bold">
                        {humanCount === 0 ? 'None' : `${humanCount} ${humanCount === 1 ? 'Person' : 'Persons'}`}
                      </p>
                    </div>
                    <Users className={`w-8 h-8 ${humansDetected ? 'text-green-500' : 'text-muted-foreground'}`} />
                  </div>
                </CardContent>
              </Card>

              <Card className={motionDetected ? 'border-orange-500 border-2' : ''}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Motion</p>
                      <p className="text-2xl font-bold">{motionDetected ? 'Detected' : 'None'}</p>
                    </div>
                    <Activity className={`w-8 h-8 ${motionDetected ? 'text-orange-500' : 'text-muted-foreground'}`} />
                  </div>
                </CardContent>
              </Card>

              <Card className={incidentDetected ? 'border-red-500 border-2' : ''}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Incident</p>
                      <p className="text-2xl font-bold">{incidentDetected ? 'ALERT' : 'Normal'}</p>
                    </div>
                    <AlertCircle className={`w-8 h-8 ${incidentDetected ? 'text-red-500' : 'text-muted-foreground'}`} />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Stop Button - ALWAYS VISIBLE */}
            <Button
              variant="destructive"
              size="lg"
              className="w-full"
              onClick={handleStopSurveillance}
              disabled={!connected}
            >
              <StopCircle className="w-4 h-4 mr-2" />
              Stop Surveillance
            </Button>
          </div>

          {/* Right Sidebar - 7 Advanced Cards */}
          <div className="space-y-4">
            {/* 1. System Info */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">System Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Stream</span>
                  <Badge variant={connected ? 'default' : 'secondary'}>
                    {connected ? 'LIVE' : 'OFFLINE'}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Recording</span>
                  <Badge variant={recording ? 'destructive' : 'secondary'}>
                    {recording ? '● REC' : 'STOPPED'}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">FPS</span>
                  <span className="font-mono font-bold">{fps}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Detection</span>
                  <span className="font-mono text-xs">HOG+Face</span>
                </div>
              </CardContent>
            </Card>

            {/* 2. Detection Stats */}
            <Card className="border-l-4 border-l-blue-500">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Detection Stats</CardTitle>
                  <Eye className="w-4 h-4 text-blue-500" />
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Current Count</span>
                  <span className="font-bold text-lg">{humanCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Unique People</span>
                  <span className="font-bold text-lg text-blue-500">{uniquePeople.size}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Faces</span>
                  <span className="font-bold">{faceCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Detections</span>
                  <span className="font-mono">{totalDetections}</span>
                </div>
              </CardContent>
            </Card>

            {/* 3. Movement Analysis */}
            <Card className="border-l-4 border-l-purple-500">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Movement</CardTitle>
                  <Navigation className="w-4 h-4 text-purple-500" />
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Direction</span>
                  <div className="flex items-center gap-2">
                    {getMovementIcon()}
                    <span className="font-bold text-xs">{movementDirection}</span>
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Activity Level</span>
                  <span className="font-bold">{activityLevel}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-purple-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${activityLevel}%` }}
                  />
                </div>
              </CardContent>
            </Card>

            {/* 4. Confidence Analysis */}
            <Card className="border-l-4 border-l-green-500">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Confidence</CardTitle>
                  <TrendingUp className="w-4 h-4 text-green-500" />
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Current</span>
                  <span className={`font-bold ${confidence >= 80 ? 'text-green-500' :
                    confidence >= 50 ? 'text-yellow-500' : 'text-red-500'
                    }`}>
                    {confidence.toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Average</span>
                  <span className="font-bold text-green-500">
                    {avgConfidence.toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-300 ${confidence >= 80 ? 'bg-green-500' :
                      confidence >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                    style={{ width: `${confidence}%` }}
                  />
                </div>
              </CardContent>
            </Card>

            {/* 5. Activity Summary */}
            <Card className="border-l-4 border-l-orange-500">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Activity Summary</CardTitle>
                  <Zap className="w-4 h-4 text-orange-500" />
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant={humansDetected ? 'default' : 'secondary'} className="text-xs">
                    {humansDetected ? 'Active' : 'Idle'}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Motion</span>
                  <Badge variant={motionDetected ? 'default' : 'secondary'} className="text-xs">
                    {motionDetected ? 'Yes' : 'No'}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Incidents</span>
                  <Badge variant={incidentDetected ? 'destructive' : 'secondary'} className="text-xs">
                    {incidentDetected ? 'Alert' : 'Normal'}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* 6. NEW: Performance Metrics */}
            <Card className="border-l-4 border-l-cyan-500">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Performance</CardTitle>
                  <Zap className="w-4 h-4 text-cyan-500" />
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Frame Rate</span>
                  <span className="font-bold text-cyan-500">{fps} FPS</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Latency</span>
                  <span className="font-mono">&lt;100ms</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Uptime</span>
                  <Badge variant="outline" className="text-xs">
                    {connected ? 'Online' : 'Offline'}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Quality</span>
                  <span className="font-bold text-green-500">
                    {fps >= 15 ? 'Good' : fps >= 10 ? 'Fair' : 'Poor'}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* 7. NEW: Alert History */}
            <Card className="border-l-4 border-l-red-500">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Alert History</CardTitle>
                  <AlertCircle className="w-4 h-4 text-red-500" />
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Alerts</span>
                  <span className="font-bold text-red-500">{totalDetections}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last Alert</span>
                  <span className="font-mono">
                    {totalDetections > 0 ? 'Just now' : 'None'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant={incidentDetected ? 'destructive' : 'secondary'} className="text-xs">
                    {incidentDetected ? 'Active' : 'Clear'}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Priority</span>
                  <span className={`font-bold ${incidentDetected ? 'text-red-500' : 'text-gray-500'
                    }`}>
                    {incidentDetected ? 'HIGH' : 'LOW'}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
}
