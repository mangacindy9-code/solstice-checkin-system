import React, { useState, useEffect } from 'react';
import './App.css';

interface Attendee {
  id: string;
  name: string;
  email: string;
  status: 'not-checked-in' | 'pending' | 'checked-in';
  printJobId?: string;
}

const App: React.FC = () => {
  const [attendees, setAttendees] = useState<Attendee[]>([
    { id: 'A001', name: 'Alice Johnson', email: 'alice@example.com', status: 'not-checked-in' },
    { id: 'A002', name: 'Bob Smith', email: 'bob@example.com', status: 'not-checked-in' },
    { id: 'A003', name: 'Carol Davis', email: 'carol@example.com', status: 'not-checked-in' },
  ]);
  const [selectedAttendee, setSelectedAttendee] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    // Set up EventSource for real-time webhook callbacks
    const eventSource = new EventSource('http://localhost:3001/events');
    
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'PRINT_CONFIRMED') {
        setAttendees(prev => 
          prev.map(a => 
            a.id === data.attendeeId 
              ? { ...a, status: 'checked-in', printJobId: data.printJobId }
              : a
          )
        );
        addLog(`✅ ${data.attendeeName} checked in successfully (Print Job: ${data.printJobId})`);
      } else if (data.type === 'PRINT_FAILED') {
        setAttendees(prev => 
          prev.map(a => 
            a.id === data.attendeeId 
              ? { ...a, status: 'not-checked-in' }
              : a
          )
        );
        addLog(`❌ Print failed for ${data.attendeeName}: ${data.reason}`);
      }
    };

    // Initial load - fetch current status
    fetchAttendees();

    return () => {
      eventSource.close();
    };
  }, []);

  const fetchAttendees = async () => {
    try {
      const response = await fetch('http://localhost:3001/attendees');
      const data = await response.json();
      setAttendees(data);
    } catch (error) {
      console.error('Failed to fetch attendees:', error);
    }
  };

  const addLog = (message: string) => {
    setLogs(prev => [new Date().toLocaleTimeString() + ' ' + message, ...prev.slice(0, 49)]);
  };

  const handleScan = async (attendeeId: string) => {
    setSelectedAttendee(attendeeId);
    
    try {
      const response = await fetch('http://localhost:3001/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendeeId }),
      });

      const result = await response.json();

      if (response.status === 400) {
        addLog(`⚠️ ${result.message}`);
      } else if (response.status === 200) {
        // Update local status to 'pending' immediately
        setAttendees(prev => 
          prev.map(a => 
            a.id === attendeeId 
              ? { ...a, status: 'pending', printJobId: result.printJobId }
              : a
          )
        );
        addLog(`⏳ Print request submitted for ${result.attendeeName} (Job: ${result.printJobId})`);
        addLog(`   Waiting for webhook confirmation...`);
      }
    } catch (error) {
      addLog(`❌ Error scanning attendee: ${error}`);
    } finally {
      setSelectedAttendee(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'checked-in': return '#4CAF50';
      case 'pending': return '#FFA500';
      default: return '#ccc';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'checked-in': return '✅ Checked In';
      case 'pending': return '⏳ Pending...';
      default: return '⬜ Not Checked In';
    }
  };

  return (
    <div className="app">
      <header>
        <h1>🎫 Solstice Events - Check-in Kiosk</h1>
        <p className="subtitle">Multi-day Tech Conference</p>
      </header>

      <div className="main-content">
        <div className="attendee-list">
          <h2>Attendees</h2>
          {attendees.map(attendee => (
            <div key={attendee.id} className="attendee-card">
              <div className="attendee-info">
                <strong>{attendee.name}</strong>
                <span className="attendee-id">{attendee.id}</span>
                <span className="attendee-email">{attendee.email}</span>
                <span 
                  className="status-badge" 
                  style={{ backgroundColor: getStatusColor(attendee.status) }}
                >
                  {getStatusText(attendee.status)}
                </span>
                {attendee.printJobId && attendee.status === 'pending' && (
                  <span className="job-id">Job: {attendee.printJobId}</span>
                )}
              </div>
              <button
                onClick={() => handleScan(attendee.id)}
                disabled={attendee.status === 'checked-in' || attendee.status === 'pending' || selectedAttendee === attendee.id}
                className={`scan-btn ${attendee.status === 'checked-in' ? 'checked-in' : ''}`}
              >
                {attendee.status === 'checked-in' 
                  ? 'Already Checked In' 
                  : attendee.status === 'pending'
                  ? 'Processing...'
                  : '📱 Scan QR Code'}
              </button>
            </div>
          ))}
        </div>

        <div className="logs-panel">
          <h2>Activity Log</h2>
          <div className="logs">
            {logs.length === 0 ? (
              <p className="no-logs">No activity yet. Scan an attendee!</p>
            ) : (
              logs.map((log, index) => (
                <div key={index} className="log-entry">{log}</div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="status-info">
        <div className="legend">
          <span className="legend-item">
            <span className="legend-dot" style={{ backgroundColor: '#ccc' }}></span> Not Checked In
          </span>
          <span className="legend-item">
            <span className="legend-dot" style={{ backgroundColor: '#FFA500' }}></span> Pending
          </span>
          <span className="legend-item">
            <span className="legend-dot" style={{ backgroundColor: '#4CAF50' }}></span> Checked In
          </span>
        </div>
        <p className="info-text">
          <strong>ℹ️ Async Model:</strong> Check-in confirms only after printer webhook callback
        </p>
      </div>
    </div>
  );
};

export default App;
