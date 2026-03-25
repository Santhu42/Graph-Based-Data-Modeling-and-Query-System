import React, { useState } from 'react';
import { X, Info, ExternalLink } from 'lucide-react';

const NodeInspector = ({ node, onClose }) => {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (!node) return;
    const fetchDetails = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/node/${node.id}`);
        const data = await res.json();
        setDetails(data);
      } catch (err) {
        console.error('Failed to fetch node details:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchDetails();
  }, [node]);

  if (!node) return null;

  return (
    <div className="inspector-panel">
      <div className="inspector-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Info size={18} className="text-accent" />
          <span className="entity-badge">{node.type}</span>
        </div>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <X size={18} />
        </button>
      </div>

      <h2 style={{ fontSize: '18px', marginBottom: '20px', fontWeight: 600 }}>{node.label}</h2>

      {loading ? (
        <div className="loading-dots" style={{ padding: '20px' }}>
          <div className="dot" />
          <div className="dot" />
          <div className="dot" />
        </div>
      ) : details && details.data ? (
        <div className="metadata-container">
          {Object.entries(details.data).map(([key, value]) => (
            value !== null && (
              <div key={key} className="metadata-item">
                <div className="metadata-label">{key}</div>
                <div className="metadata-value">
                  {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}
                </div>
              </div>
            )
          ))}
        </div>
      ) : (
        <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>No metadata found.</div>
      )}
    </div>
  );
};

export default NodeInspector;
