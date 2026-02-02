import { useState, useEffect } from 'react';
import { Trash2, Download, AlertCircle, Clock, RefreshCw, Users, Activity, Eye, TrendingUp, Filter, Calendar } from 'lucide-react';
import { Button } from '../components/ui/button.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.jsx';
import { Badge } from '../components/ui/badge.jsx';
import { toast } from 'sonner';
import axios from 'axios';
import { format } from 'date-fns';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function Incidents() {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, human, motion
  const [sortBy, setSortBy] = useState('newest'); // newest, oldest, confidence

  useEffect(() => {
    fetchIncidents();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchIncidents, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchIncidents = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/incidents`);
      setIncidents(response.data);
    } catch (error) {
      toast.error('Failed to fetch incidents');
    } finally {
      setLoading(false);
    }
  };

  const deleteIncident = async (id) => {
    try {
      await axios.delete(`${API}/incidents/${id}`);
      toast.success('Incident deleted');
      fetchIncidents();
    } catch (error) {
      toast.error('Failed to delete incident');
    }
  };

  const cleanupOldIncidents = async () => {
    try {
      const response = await axios.delete(`${API}/incidents/old/cleanup?days=7`);
      toast.success(`Cleaned up ${response.data.deleted_count} old incidents`);
      fetchIncidents();
    } catch (error) {
      toast.error('Failed to cleanup incidents');
    }
  };

  const formatTimestamp = (timestamp) => {
    try {
      return format(new Date(timestamp), 'PPpp');
    } catch {
      return timestamp;
    }
  };

  // Calculate statistics
  const stats = {
    total: incidents.length,
    humanDetections: incidents.filter((i) => i.detection_type.includes('human')).length,
    motionOnly: incidents.filter((i) => i.detection_type === 'motion' && !i.detection_type.includes('human')).length,
    avgConfidence: incidents.length > 0
      ? (incidents.reduce((sum, i) => sum + (i.confidence * 100), 0) / incidents.length)
      : 0,
    highConfidence: incidents.filter((i) => (i.confidence * 100) >= 80).length,
    mediumConfidence: incidents.filter((i) => (i.confidence * 100) >= 50 && (i.confidence * 100) < 80).length,
    lowConfidence: incidents.filter((i) => (i.confidence * 100) < 50).length,
    todayIncidents: incidents.filter((i) => {
      const incidentDate = new Date(i.timestamp);
      const today = new Date();
      return incidentDate.toDateString() === today.toDateString();
    }).length,
  };

  // Filter and sort incidents
  const filteredIncidents = incidents
    .filter((incident) => {
      if (filter === 'all') return true;
      if (filter === 'human') return incident.detection_type.includes('human');
      if (filter === 'motion') return incident.detection_type === 'motion' && !incident.detection_type.includes('human');
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.timestamp) - new Date(a.timestamp);
      if (sortBy === 'oldest') return new Date(a.timestamp) - new Date(b.timestamp);
      if (sortBy === 'confidence') return (b.confidence * 100) - (a.confidence * 100);
      return 0;
    });

  return (
    <div className="p-6" data-testid="incidents-page">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Incident History</h1>
            <p className="text-muted-foreground mt-1">Review all detected incidents with detailed analytics</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={fetchIncidents} data-testid="refresh-incidents-btn">
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
            <Button variant="destructive" onClick={cleanupOldIncidents} data-testid="cleanup-old-btn">
              <Trash2 className="w-4 h-4 mr-2" />
              Cleanup Old (7d+)
            </Button>
          </div>
        </div>

        {/* Enhanced Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Incidents */}
          <Card className="border-l-4 border-l-blue-500">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Incidents</CardTitle>
                <Eye className="w-4 h-4 text-blue-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold" data-testid="total-incidents-count">{stats.total}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.todayIncidents} today
              </p>
            </CardContent>
          </Card>

          {/* Human Detections */}
          <Card className="border-l-4 border-l-green-500">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">Human Detections</CardTitle>
                <Users className="w-4 h-4 text-green-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.humanDetections}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.total > 0 ? ((stats.humanDetections / stats.total) * 100).toFixed(0) : 0}% of total
              </p>
            </CardContent>
          </Card>

          {/* Motion Only */}
          <Card className="border-l-4 border-l-orange-500">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">Motion Only</CardTitle>
                <Activity className="w-4 h-4 text-orange-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.motionOnly}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Without human detection
              </p>
            </CardContent>
          </Card>

          {/* Average Confidence */}
          <Card className="border-l-4 border-l-purple-500">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">Avg Confidence</CardTitle>
                <TrendingUp className="w-4 h-4 text-purple-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {stats.avgConfidence.toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.highConfidence} high, {stats.mediumConfidence} medium, {stats.lowConfidence} low
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Additional Analytics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Detection Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Human + Motion</span>
                <Badge variant="default">
                  {incidents.filter((i) => i.detection_type.includes('motion') && i.detection_type.includes('human')).length}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Live Detection</span>
                <Badge variant="secondary">
                  {incidents.filter((i) => i.detection_type.includes('live')).length}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Uploaded Video</span>
                <Badge variant="outline">
                  {incidents.filter((i) => !i.detection_type.includes('live')).length}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Confidence Distribution</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">High (≥80%)</span>
                <Badge className="bg-green-500">{stats.highConfidence}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Medium (50-79%)</span>
                <Badge className="bg-yellow-500">{stats.mediumConfidence}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Low (&lt;50%)</span>
                <Badge className="bg-red-500">{stats.lowConfidence}</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Today</span>
                <Badge variant="default">{stats.todayIncidents}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Last Incident</span>
                <span className="text-xs mono">
                  {incidents.length > 0 ? format(new Date(incidents[0].timestamp), 'HH:mm') : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Storage Used</span>
                <span className="text-xs mono">~{(stats.total * 50 / 1024).toFixed(1)} MB</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Sorting */}
        <Card>
          <CardContent className="py-4">
            <div className="flex flex-wrap gap-4 items-center">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Filter:</span>
                <div className="flex gap-2">
                  <Button
                    variant={filter === 'all' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFilter('all')}
                  >
                    All ({stats.total})
                  </Button>
                  <Button
                    variant={filter === 'human' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFilter('human')}
                  >
                    Human ({stats.humanDetections})
                  </Button>
                  <Button
                    variant={filter === 'motion' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFilter('motion')}
                  >
                    Motion ({stats.motionOnly})
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-sm font-medium">Sort:</span>
                <select
                  className="px-3 py-1 border rounded-md text-sm"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                >
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                  <option value="confidence">Highest Confidence</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Incidents Grid */}
        {loading ? (
          <div className="text-center py-12">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-muted-foreground" />
            <p className="text-muted-foreground">Loading incidents...</p>
          </div>
        ) : filteredIncidents.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <AlertCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-semibold mb-2">
                {filter === 'all' ? 'No incidents recorded' : `No ${filter} incidents found`}
              </h3>
              <p className="text-muted-foreground">
                {filter === 'all'
                  ? 'Start surveillance to detect and record incidents'
                  : 'Try changing the filter to see more incidents'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredIncidents.map((incident) => {
              const confidencePercent = (incident.confidence * 100).toFixed(1);
              const confidenceColor =
                confidencePercent >= 80 ? 'text-green-500' :
                  confidencePercent >= 50 ? 'text-yellow-500' : 'text-red-500';

              return (
                <Card key={incident.id} className="overflow-hidden hover:shadow-lg transition-shadow" data-testid={`incident-card-${incident.id}`}>
                  <div className="aspect-video bg-black relative group">
                    <img
                      src={`${API}/incidents/${incident.id}/image`}
                      alt="Incident"
                      className="w-full h-full object-cover"
                      data-testid={`incident-image-${incident.id}`}
                    />
                    <Badge
                      className="absolute top-2 right-2"
                      variant={incident.detection_type.includes('human') ? 'destructive' : 'default'}
                    >
                      {incident.detection_type.replace('live_', '').replace('+', ' + ').toUpperCase()}
                    </Badge>
                    <div className={`absolute top-2 left-2 px-2 py-1 rounded text-xs font-bold ${confidenceColor} bg-black/70`}>
                      {confidencePercent}%
                    </div>
                  </div>
                  <CardContent className="p-4">
                    <div className="space-y-2">
                      <div className="flex items-start gap-2 text-sm">
                        <Clock className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                        <span className="mono text-xs">{formatTimestamp(incident.timestamp)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">
                            Confidence:
                          </span>
                          <span className={`font-bold mono ${confidenceColor}`}>
                            {confidencePercent}%
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteIncident(incident.id)}
                          data-testid={`delete-incident-${incident.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Results Summary */}
        {!loading && filteredIncidents.length > 0 && (
          <div className="text-center text-sm text-muted-foreground">
            Showing {filteredIncidents.length} of {stats.total} incidents
          </div>
        )}
      </div>
    </div>
  );
}
