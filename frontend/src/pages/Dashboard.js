import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Play, Upload, Activity, AlertCircle, FileVideo } from 'lucide-react';
import { Button } from '../components/ui/button.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select.jsx';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function Dashboard() {
  const [status, setStatus] = useState(null);
  const [sensitivity, setSensitivity] = useState('medium');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchStatus = async () => {
    try {
      const response = await axios.get(`${API}/surveillance/status`);
      setStatus(response.data);
    } catch (error) {
      console.error('Failed to fetch status:', error);
    }
  };

  const handleStartSurveillance = async () => {
    try {
      await axios.post(`${API}/surveillance/start`, { sensitivity });
      toast.success('Surveillance started successfully');
      fetchStatus();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to start surveillance');
    }
  };

  const handleStopSurveillance = async () => {
    try {
      await axios.post(`${API}/surveillance/stop`);
      toast.success('Surveillance stopped');
      fetchStatus();
    } catch (error) {
      toast.error('Failed to stop surveillance');
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setUploading(true);
    setUploadProgress({ status: 'uploading', message: 'Uploading video...' });

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post(
        `${API}/surveillance/upload?sensitivity=${sensitivity}`,
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
        }
      );

      setUploadProgress({
        status: 'completed',
        message: `Processing complete! Detected ${response.data.incidents_detected} incidents in ${response.data.frames_processed} frames.`,
      });
      toast.success(`Video processed: ${response.data.incidents_detected} incidents detected`);
      fetchStatus();
    } catch (error) {
      setUploadProgress({ status: 'error', message: 'Failed to process video' });
      toast.error('Failed to process video');
    } finally {
      setUploading(false);
      setTimeout(() => setUploadProgress(null), 5000);
    }
  };

  return (
    <div className="p-6" data-testid="dashboard-page">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
            <p className="text-muted-foreground mt-1">AI-Powered Incident Detection System</p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`status-indicator ${status?.active ? 'active' : 'inactive'}`}
              data-testid="status-indicator"
            />
            <span className="text-sm font-medium mono">
              {status?.active ? 'SYSTEM ACTIVE' : 'SYSTEM IDLE'}
            </span>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {status?.active ? 'Active' : 'Inactive'}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {status?.active ? 'Monitoring in progress' : 'Ready to start'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Incidents</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="total-incidents">{status?.total_incidents || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Recorded detections</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Sensitivity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold capitalize">{status?.sensitivity || 'medium'}</div>
              <p className="text-xs text-muted-foreground mt-1">Detection threshold</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Live Surveillance */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5" />
                Live Surveillance
              </CardTitle>
              <CardDescription>
                Start real-time monitoring using your webcam
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Detection Sensitivity</label>
                <Select value={sensitivity} onValueChange={setSensitivity}>
                  <SelectTrigger data-testid="sensitivity-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High - More sensitive</SelectItem>
                    <SelectItem value="medium">Medium - Balanced</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {!status?.active ? (
                <Button
                  className="w-full"
                  size="lg"
                  onClick={handleStartSurveillance}
                  data-testid="start-surveillance-btn"
                >
                  <Play className="w-4 h-4 mr-2" />
                  Start Surveillance
                </Button>
              ) : (
                <div className="space-y-3">
                  <Button
                    className="w-full"
                    variant="destructive"
                    size="lg"
                    onClick={handleStopSurveillance}
                    data-testid="stop-surveillance-btn"
                  >
                    Stop Surveillance
                  </Button>
                  <Link to="/live">
                    <Button className="w-full" variant="outline" size="lg" data-testid="view-live-btn">
                      View Live Feed
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Video Upload */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileVideo className="w-5 h-5" />
                Video Upload
              </CardTitle>
              <CardDescription>
                Upload and analyze pre-recorded video files
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Processing Sensitivity</label>
                <Select value={sensitivity} onValueChange={setSensitivity}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High - More sensitive</SelectItem>
                    <SelectItem value="medium">Medium - Balanced</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <input
                  type="file"
                  accept="video/*"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="video-upload"
                  disabled={uploading}
                />
                <label htmlFor="video-upload">
                  <Button
                    className="w-full"
                    size="lg"
                    variant="outline"
                    disabled={uploading}
                    asChild
                    data-testid="upload-video-btn"
                  >
                    <span>
                      <Upload className="w-4 h-4 mr-2" />
                      {uploading ? 'Processing...' : 'Upload Video'}
                    </span>
                  </Button>
                </label>
              </div>

              {uploadProgress && (
                <Card className={uploadProgress.status === 'error' ? 'border-destructive' : 'border-primary'}>
                  <CardContent className="pt-4">
                    <div className="flex items-start gap-2">
                      <AlertCircle
                        className={`w-4 h-4 mt-0.5 ${
                          uploadProgress.status === 'error' ? 'text-destructive' : 'text-primary'
                        }`}
                      />
                      <p className="text-sm">{uploadProgress.message}</p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Info */}
        <Card>
          <CardHeader>
            <CardTitle>System Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium">Detection Method:</span>
                <span className="ml-2 text-muted-foreground">HOG + Motion Analysis</span>
              </div>
              <div>
                <span className="font-medium">Camera Status:</span>
                <span className="ml-2 text-muted-foreground">
                  {status?.active ? 'Connected' : 'Standby'}
                </span>
              </div>
              <div>
                <span className="font-medium">Auto Cleanup:</span>
                <span className="ml-2 text-muted-foreground">7 days retention</span>
              </div>
              <div>
                <span className="font-medium">Current Sensitivity:</span>
                <span className="ml-2 text-muted-foreground capitalize">{status?.sensitivity || 'N/A'}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
