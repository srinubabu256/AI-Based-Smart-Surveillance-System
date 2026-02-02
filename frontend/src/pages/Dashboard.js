import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Play, Upload, Activity, AlertCircle, FileVideo, Eye, TrendingUp, Clock, Shield } from 'lucide-react';
import { Button } from '../components/ui/button.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select.jsx';
import { Badge } from '../components/ui/badge.jsx';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function Dashboard() {
  const navigate = useNavigate();
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
      toast.success('Surveillance started! Redirecting to Live Monitor...');
      fetchStatus();
      setTimeout(() => {
        navigate('/live');
      }, 1000);
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
        {/* Header - Consistent Look */}
        <div className="rounded-lg bg-blue-600 dark:bg-blue-700 p-5 text-white shadow-sm transition-colors duration-300">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Smart Surveillance Dashboard</h1>
              <p className="text-blue-100 text-sm mt-1">AI-Powered Incident Detection System</p>
            </div>
            <Shield className="w-8 h-8 text-blue-200 opacity-80" />
          </div>
        </div>

        {/* Status Banner */}
        <Card className="bg-white dark:bg-slate-900 border-l-4 border-l-green-500 shadow-sm transition-colors duration-300">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-2.5 h-2.5 rounded-full ${status?.active ? 'bg-green-500 animate-pulse' : 'bg-gray-400 dark:bg-slate-600'}`}></div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">
                    {status?.active ? 'System Active' : 'System Idle'}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-slate-400">
                    {status?.active ? 'Monitoring in progress' : 'Ready to start'}
                  </p>
                </div>
              </div>
              <Badge variant={status?.active ? 'default' : 'secondary'}>
                {status?.active ? 'LIVE' : 'OFFLINE'}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-white dark:bg-slate-900 shadow-sm hover:shadow-md transition-all duration-300 border-gray-200 dark:border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500 dark:text-slate-400">System Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {status?.active ? 'Active' : 'Inactive'}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-slate-900 shadow-sm hover:shadow-md transition-all duration-300 border-gray-200 dark:border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500 dark:text-slate-400">Total Incidents</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900 dark:text-white" data-testid="total-incidents">
                {status?.total_incidents || 0}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-slate-900 shadow-sm hover:shadow-md transition-all duration-300 border-gray-200 dark:border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500 dark:text-slate-400">Sensitivity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900 dark:text-white capitalize">
                {status?.sensitivity || 'medium'}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-slate-900 shadow-sm hover:shadow-md transition-all duration-300 border-gray-200 dark:border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500 dark:text-slate-400">Uptime</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {status?.active ? '24/7' : '0h'}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Live Surveillance */}
          <Card className="bg-white dark:bg-slate-900 shadow-sm border border-gray-200 dark:border-slate-800 transition-colors duration-300">
            <CardHeader className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-800">
              <CardTitle className="flex items-center gap-2 text-lg text-gray-900 dark:text-white">
                <Activity className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                Live Surveillance
              </CardTitle>
              <CardDescription className="text-gray-500 dark:text-slate-400">
                Start real-time monitoring using your webcam
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-2 block">Detection Sensitivity</label>
                <Select value={sensitivity} onValueChange={setSensitivity}>
                  <SelectTrigger data-testid="sensitivity-select" className="bg-white dark:bg-slate-950 border-gray-300 dark:border-slate-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High - More sensitive</SelectItem>
                    <SelectItem value="medium">Medium - Balanced</SelectItem>
                    <SelectItem value="low">Low - Less sensitive</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {!status?.active ? (
                <Button
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-600 dark:hover:bg-blue-500"
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
                    <Button className="w-full border-gray-300 dark:border-slate-700 dark:text-white dark:hover:bg-slate-800" variant="outline" size="lg" data-testid="view-live-btn">
                      <Eye className="w-4 h-4 mr-2" />
                      View Live Feed
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Video Upload */}
          <Card className="bg-white dark:bg-slate-900 shadow-sm border border-gray-200 dark:border-slate-800 transition-colors duration-300">
            <CardHeader className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-800">
              <CardTitle className="flex items-center gap-2 text-lg text-gray-900 dark:text-white">
                <FileVideo className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                Video Upload & Analysis
              </CardTitle>
              <CardDescription className="text-gray-500 dark:text-slate-400">
                Analyze pre-recorded video files
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-2 block">Processing Sensitivity</label>
                <Select value={sensitivity} onValueChange={setSensitivity}>
                  <SelectTrigger className="bg-white dark:bg-slate-950 border-gray-300 dark:border-slate-700">
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
                    className="w-full bg-white dark:bg-slate-950 border border-gray-300 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800"
                    size="lg"
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
                <div className={`p-4 rounded-md text-sm ${uploadProgress.status === 'error' ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400' : 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                  }`}>
                  {uploadProgress.message}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link to="/live">
            <Card className="bg-white dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-slate-800 transition-all cursor-pointer border border-gray-200 dark:border-slate-800 shadow-sm">
              <CardContent className="flex flex-col items-center justify-center p-6 text-center">
                <Activity className="w-8 h-8 text-blue-600 dark:text-blue-400 mb-2" />
                <h3 className="font-semibold text-gray-900 dark:text-white">Live Monitor</h3>
                <p className="text-xs text-gray-500 dark:text-slate-400">Real-time feed</p>
              </CardContent>
            </Card>
          </Link>

          <Link to="/incidents">
            <Card className="bg-white dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-slate-800 transition-all cursor-pointer border border-gray-200 dark:border-slate-800 shadow-sm">
              <CardContent className="flex flex-col items-center justify-center p-6 text-center">
                <Eye className="w-8 h-8 text-green-600 dark:text-green-400 mb-2" />
                <h3 className="font-semibold text-gray-900 dark:text-white">Incidents</h3>
                <p className="text-xs text-gray-500 dark:text-slate-400">View history</p>
              </CardContent>
            </Card>
          </Link>

          <Card className="bg-white dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-slate-800 transition-all cursor-pointer border border-gray-200 dark:border-slate-800 shadow-sm">
            <CardContent className="flex flex-col items-center justify-center p-6 text-center">
              <Shield className="w-8 h-8 text-purple-600 dark:text-purple-400 mb-2" />
              <h3 className="font-semibold text-gray-900 dark:text-white">Status</h3>
              <p className="text-xs text-gray-500 dark:text-slate-400">{status?.total_incidents || 0} incidents</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
