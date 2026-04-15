import DemoBanner from '../components/DemoBanner';
import { useMemo, useState } from 'react';

export default function Home() {
  const [status, setStatus] = useState('unknown');
  const [demoLoaded, setDemoLoaded] = useState(false);
  const [demoSummary, setDemoSummary] = useState<string>('');

  const apiBaseUrl = useMemo(
    () => process.env.NEXT_PUBLIC_SENTINEL_API_BASE_URL ?? 'http://localhost:4000',
    []
  );

  async function checkHealth() {
    const res = await fetch(`${apiBaseUrl}/health`);
    const data = await res.json();
    setStatus(data.status);
  }

  async function loadPilotDemo() {
    const res = await fetch(`${apiBaseUrl}/pilot/trigent/demo`);
    const data = await res.json();
    const recommendations = data?.analysis?.report?.recommendations ?? [];
    setDemoSummary(recommendations.join(' '));
    setDemoLoaded(true);
  }

  return (
    <div style={{ fontFamily: 'Georgia, serif', minHeight: '100vh', background: '#f8f5ef', color: '#1f2937' }}>
      <DemoBanner />

      <main style={{ maxWidth: 980, margin: '0 auto', padding: '48px 24px 80px' }}>
        <p style={{ textTransform: 'uppercase', letterSpacing: '0.12em', color: '#0f766e', fontSize: 12 }}>
          SentinelOS by Cody Nunn
        </p>
        <h1 style={{ fontSize: '3rem', marginBottom: 12 }}>SentinelOS Trigent Pilot Command Center</h1>
        <p style={{ fontSize: '1.05rem', maxWidth: 760, lineHeight: 1.7, color: '#4b5563' }}>
          SentinelOS is being prepared as an operator-grade control plane for pricing intelligence, workflow
          optimization, and governed action execution across ITAD operations.
        </p>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginTop: 32 }}>
          <div style={{ background: '#fff', border: '1px solid #d6c8a8', borderRadius: 16, padding: 20 }}>
            <h2>System Status</h2>
            <p>Sentinel API status: <strong>{status}</strong></p>
            <button onClick={checkHealth}>Check Sentinel Health</button>
          </div>
          <div style={{ background: '#fff', border: '1px solid #d6c8a8', borderRadius: 16, padding: 20 }}>
            <h2>Trigent Pilot Demo</h2>
            <p>Load the sample pricing and workflow analysis that powers the pilot conversation.</p>
            <button onClick={loadPilotDemo}>Load Pilot Demo</button>
            {demoLoaded ? <p style={{ marginTop: 12, color: '#4b5563' }}>{demoSummary}</p> : null}
          </div>
        </section>

        <section style={{ marginTop: 40, background: '#fffaf0', border: '1px solid #d6c8a8', borderRadius: 16, padding: 24 }}>
          <h2>Pilot Focus</h2>
          <ul>
            <li>Pricing validation and margin opportunity detection</li>
            <li>Workflow step tracking from intake to disposition</li>
            <li>Bottleneck analysis for operational optimization</li>
            <li>Structured command execution through the Sentinel API</li>
          </ul>
        </section>
      </main>
    </div>
  );
}
