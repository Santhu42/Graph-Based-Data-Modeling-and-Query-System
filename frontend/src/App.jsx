import React, { useState, useCallback } from 'react';
import GraphView from './GraphView';
import ChatView from './ChatView';
import { Network } from 'lucide-react';

function App() {
  const [selectedNode, setSelectedNode] = useState(null);
  const [initialGraphNode, setInitialGraphNode] = useState(null);

  const handleQuerySuccess = (data) => {
    // If it's a general "list all" query, reset graph to overview
    if (data.query && data.query.toLowerCase().includes('all')) {
      setInitialGraphNode(null);
      // Small hack to force re-fetch if it's already null
      if (initialGraphNode === null) {
        setInitialGraphNode('REFRESH'); 
        setTimeout(() => setInitialGraphNode(null), 10);
      }
      return;
    }

    if (data.data && data.data.length > 0) {
      const first = data.data[0];
      let nodeId = null;
      
      // Determine entity type and ID for formatted node lookup
      if (first.salesOrder) nodeId = `sales_order_headers::${first.salesOrder}`;
      else if (first.deliveryDocument) nodeId = `outbound_delivery_headers::${first.deliveryDocument}`;
      else if (first.billingDocument) nodeId = `billing_document_headers::${first.billingDocument}`;
      else if (first.businessPartner) nodeId = `business_partners::${first.businessPartner}`;
      else if (first.customer) nodeId = `business_partners::${first.customer}`;

      if (nodeId) {
        setInitialGraphNode(nodeId);
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
