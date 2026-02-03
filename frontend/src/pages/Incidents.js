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
    if (!window.confirm("Are you sure you want to delete ALL incidents? This cannot be undone.")) return;
    try {
      const response = await axios.delete(`${API}/incidents/old/cleanup?days=0`);
      toast.success(`Cleared ${response.data.deleted_count} incidents`);
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
    maxHumans: incidents.reduce((max, i) => {
      const count = i.human_count || (i.detection_type.includes('human') ? 1 : 0);
      return Math.max(max, count);
    }, 0),
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
      if (filter === 'motion') return incident.detection_type.includes('motion') && !incident.detection_type.includes('human');
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
              Clear All History
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

          {/* Max People Detected (Replaces Motion Only) */}
          <Card className="border-l-4 border-l-orange-500">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">Max People</CardTitle>
                <Users className="w-4 h-4 text-orange-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.maxHumans}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Highest count in single frame
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
              const isHighConf = confidencePercent >= 80;
              const isMedConf = confidencePercent >= 50 && confidencePercent < 80;

              const confidenceColor = isHighConf ? 'text-green-500' : isMedConf ? 'text-yellow-500' : 'text-red-500';
              const confidenceBg = isHighConf ? 'bg-green-500/10' : isMedConf ? 'bg-yellow-500/10' : 'bg-red-500/10';
              const confidenceBorder = isHighConf ? 'border-green-500/20' : isMedConf ? 'border-yellow-500/20' : 'border-red-500/20';

              const hasMotion = incident.detection_type.includes('motion');
              const hasHuman = incident.detection_type.includes('human');

              return (
                <Card
                  key={incident.id}
                  className="group overflow-hidden hover:shadow-xl transition-all duration-300 border-border/50 bg-card/50 backdrop-blur-sm"
                  data-testid={`incident-card-${incident.id}`}
                >
                  {/* Image Section */}
                  <div className="aspect-video bg-black relative overflow-hidden">
                    <img
                      src={`${API}/incidents/${incident.id}/image`}
                      alt="Incident"
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                      data-testid={`incident-image-${incident.id}`}
                    />

                    {/* Overlay Gradient */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60" />

                    {/* Top Badges */}
                    <div className="absolute top-3 left-3 flex gap-2">
                      <Badge variant="secondary" className="bg-black/60 hover:bg-black/70 backdrop-blur-md border-white/10 text-white text-xs font-mono">
                        {format(new Date(incident.timestamp), 'HH:mm:ss')}
                      </Badge>
                    </div>

                    <div className="absolute top-3 right-3 flex gap-2">
                      {hasMotion && (
                        <Badge className="bg-orange-500/90 hover:bg-orange-600 border-none text-white shadow-lg animate-in fade-in zoom-in duration-300">
                          <Activity className="w-3 h-3 mr-1 animate-pulse" />
                          MOTION
                        </Badge>
                      )}
                      {hasHuman && (
                        <Badge className="bg-blue-500/90 hover:bg-blue-600 border-none text-white shadow-lg">
                          <Users className="w-3 h-3 mr-1" />
                          {incident.human_count > 0 ? `${incident.human_count} HUMAN${incident.human_count > 1 ? 'S' : ''}` : 'HUMAN'}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Content Section */}
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className={`flex items-center justify-center w-10 h-10 rounded-full ${confidenceBg} ${confidenceBorder} border`}>
                          <TrendingUp className={`w-5 h-5 ${confidenceColor}`} />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Confidence</p>
                          <p className={`text-lg font-bold ${confidenceColor} font-mono leading-none`}>
                            {confidencePercent}%
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-1">

                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          onClick={() => deleteIncident(incident.id)}
                          data-testid={`delete-incident-${incident.id}`}
                          title="Delete Incident"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-3 mt-2">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{format(new Date(incident.timestamp), 'MMM d, yyyy')}</span>
                      </div>
                      <div className="font-mono opacity-50">
                        ID: {incident.id.slice(0, 8)}
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
