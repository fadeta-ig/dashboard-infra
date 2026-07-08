'use client';

import { useState } from 'react';
import { RouterIcon, Search, AlertCircle } from 'lucide-react';

export default function MikrotikPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDiscovery = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/metrics/mikrotik/discovery');
      if (!res.ok) throw new Error('Failed to fetch SNMP discovery data');
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message || 'Error running discovery');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl animate-fade-in animate-slide-up">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-primary">MikroTik SNMP Integration</h1>
        <p className="text-sm text-muted-foreground mt-1 font-medium">Phase 2 Placeholder: Network traffic and interface monitoring</p>
      </div>

      <div className="bg-card border border-border/60 rounded-xl p-8 shadow-sm text-center flex flex-col items-center transition-all duration-300 hover:shadow-md">
        <div className="h-16 w-16 bg-muted/70 rounded-full flex items-center justify-center mb-6">
          <RouterIcon className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-xl font-medium mb-2">SNMP Interface Monitoring (Coming in Phase 2)</h2>
        <p className="text-muted-foreground max-w-lg mb-8 text-sm">
          This module will monitor MikroTik router interfaces, RX/TX traffic rates, port statuses, and packet drops using the Prometheus SNMP Exporter.
        </p>
        
        <button 
          onClick={handleDiscovery}
          disabled={loading}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-lg font-medium hover:opacity-90 disabled:opacity-50 transition-all duration-300 shadow-sm hover:shadow active:scale-[0.98]"
        >
          {loading ? (
            <div className="h-5 w-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin"></div>
          ) : (
            <Search className="h-5 w-5" />
          )}
          Run SNMP Metric Discovery
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-6 flex items-start gap-4">
          <AlertCircle className="h-6 w-6 text-destructive flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-destructive">Discovery Error</h3>
            <p className="text-sm text-muted-foreground mt-1">{error}</p>
          </div>
        </div>
      )}

      {data && (
        <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
          <div className="bg-muted px-6 py-4 border-b border-border">
            <h3 className="font-semibold">Discovery Results</h3>
            <p className="text-xs text-muted-foreground mt-1">{data.message}</p>
          </div>
          <div className="p-6">
            <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm font-mono text-muted-foreground border border-border">
              {JSON.stringify(data.data, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
