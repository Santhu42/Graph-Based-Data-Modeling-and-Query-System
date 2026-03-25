import React, { useState, useCallback } from 'react';
import GraphView from './GraphView';
import ChatView from './ChatView';
import { Network } from 'lucide-react';

function App() {
  const [selectedNode, setSelectedNode] = useState(null);
  const [initialGraphNode, setInitialGraphNode] = useState(null);

  const handleQuerySuccess = (data) => {
    if (data.data && data.data.length > 0) {
      const first = data.data[0];
      const id = first.salesOrder || first.customer || first.billingDocument || first.businessPartner || first.deliveryDocument;
      if (id) {
        setInitialGraphNode(id);
      }
    }
  };

  return (
    <div className="app-container">
      <div style={{ 
        position: 'absolute', 
        top: '20px', 
        left: '50%', 
        transform: 'translateX(-50%)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '8px 20px',
        background: 'var(--glass-bg)',
        backdropFilter: 'blur(10px)',
        border: '1px solid var(--glass-border)',
        borderRadius: '99px',
        boxShadow: 'var(--shadow)'
      }}>
        <Network size={20} color="var(--accent-color)" />
        <h1 style={{ fontSize: '14px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' }}>
          Graph<span style={{ color: 'var(--accent-color)' }}>Explorer</span>
        </h1>
      </div>

      <GraphView initialNodeId={initialGraphNode} onNodeClick={setSelectedNode} />

      <ChatView onQuerySuccess={handleQuerySuccess} />
    </div>
  );
}

export default App;
