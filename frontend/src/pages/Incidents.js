import { useState, useEffect } from 'react';
import { Trash2, Download, AlertCircle, Clock, RefreshCw } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import axios from 'axios';
import { format } from 'date-fns';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function Incidents() {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchIncidents();
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

  return (
    <div className="p-6" data-testid="incidents-page">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Incident History</h1>
            <p className="text-muted-foreground mt-1">Review all detected incidents</p>
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

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Incidents</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="total-incidents-count">{incidents.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Human Detections</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {incidents.filter((i) => i.detection_type.includes('human')).length}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Motion Only</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {incidents.filter((i) => i.detection_type === 'motion').length}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Avg Confidence</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {incidents.length > 0
                  ? ((incidents.reduce((sum, i) => sum + i.confidence, 0) / incidents.length) * 100).toFixed(0)
                  : 0}%
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Incidents Grid */}
        {loading ? (
          <div className="text-center py-12">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-muted-foreground" />
            <p className="text-muted-foreground">Loading incidents...</p>
          </div>
        ) : incidents.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <AlertCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-semibold mb-2">No incidents recorded</h3>
              <p className="text-muted-foreground">Start surveillance to detect and record incidents</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {incidents.map((incident) => (
              <Card key={incident.id} className="overflow-hidden" data-testid={`incident-card-${incident.id}`}>
                <div className="aspect-video bg-black relative">
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
                    {incident.detection_type.replace('+', ' + ').toUpperCase()}
                  </Badge>
                </div>
                <CardContent className="p-4">
                  <div className="space-y-2">
                    <div className="flex items-start gap-2 text-sm">
                      <Clock className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                      <span className="mono text-xs">{formatTimestamp(incident.timestamp)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Confidence: <span className="font-medium mono">{(incident.confidence * 100).toFixed(0)}%</span>
                      </span>
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
