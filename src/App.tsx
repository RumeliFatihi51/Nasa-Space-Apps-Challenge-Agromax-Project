import React from 'react';

export function App() {
  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0c140f',
      color: '#e5ece4',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '2rem',
      textAlign: 'center'
    }}>
      <div style={{
        maxWidth: '720px',
        border: '1px solid #1f3627',
        borderRadius: '16px',
        padding: '3rem 2rem',
        backgroundColor: '#121f17',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)'
      }}>
        <div style={{
          display: 'inline-block',
          padding: '6px 14px',
          borderRadius: '9999px',
          backgroundColor: '#1d422a',
          color: '#52d37c',
          fontSize: '0.85rem',
          fontWeight: 600,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          marginBottom: '1.5rem'
        }}>
          NASA Space Apps Challenge
        </div>
        
        <h1 style={{
          fontSize: '2.5rem',
          fontWeight: 800,
          letterSpacing: '-0.02em',
          margin: '0 0 1rem 0',
          color: '#ffffff'
        }}>
          AgroMax Platform
        </h1>

        <p style={{
          fontSize: '1.1rem',
          lineHeight: '1.6',
          color: '#a3baa6',
          marginBottom: '2rem'
        }}>
          Geospatial Intelligence, Earth Observation & Precision Agriculture Decision Support System.
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '1rem',
          marginTop: '2rem'
        }}>
          <div style={{ padding: '1rem', borderRadius: '10px', backgroundColor: '#182b20', border: '1px solid #234330' }}>
            <div style={{ fontSize: '0.8rem', color: '#688a70' }}>Stage</div>
            <div style={{ fontSize: '1rem', fontWeight: 600, color: '#e5ece4', marginTop: '4px' }}>Step 1: Scaffold</div>
          </div>
          <div style={{ padding: '1rem', borderRadius: '10px', backgroundColor: '#182b20', border: '1px solid #234330' }}>
            <div style={{ fontSize: '0.8rem', color: '#688a70' }}>Core Engine</div>
            <div style={{ fontSize: '1rem', fontWeight: 600, color: '#e5ece4', marginTop: '4px' }}>React 19 + TypeScript</div>
          </div>
          <div style={{ padding: '1rem', borderRadius: '10px', backgroundColor: '#182b20', border: '1px solid #234330' }}>
            <div style={{ fontSize: '0.8rem', color: '#688a70' }}>Earth Observation</div>
            <div style={{ fontSize: '1rem', fontWeight: 600, color: '#52d37c', marginTop: '4px' }}>Sentinel & Landsat</div>
          </div>
        </div>
      </div>

      <footer style={{ marginTop: '2.5rem', color: '#5c7863', fontSize: '0.85rem' }}>
        AgroMax — Precision Farming with Satellite Telemetry
      </footer>
    </div>
  );
}

export default App;
