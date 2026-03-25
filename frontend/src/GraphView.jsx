import React, { useState, useEffect, useCallback, useRef } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { RefreshCw, Maximize2 } from 'lucide-react';

const GraphView = ({ onNodeClick, initialNodeId }) => {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [loading, setLoading] = useState(false);
  const fgRef = useRef();

  const fetchGraph = useCallback(async (nodeId, nodeType = '', depth = 1) => {
    setLoading(true);
    try {
      const url = nodeId 
        ? `/api/graph?nodeId=${nodeId}&nodeType=${nodeType}&depth=${depth}`
        : `/api/graph?depth=1`;
      
      const res = await fetch(url);
      const data = await res.json();
      
      if (data.error) {
        console.error('Graph API Error:', data.error);
        return;
      }

      setGraphData(prev => {
        const newNodes = [...prev.nodes];
        const newLinks = [...prev.links];
        
        const nodes = data.nodes || [];
        const edges = data.edges || [];

        nodes.forEach(n => {
          if (!newNodes.find(en => en.id === n.id)) {
            newNodes.push({ ...n });
          }
        });
        
        edges.forEach(e => {
          if (!newLinks.find(el => el.source === e.source && el.target === e.target)) {
            newLinks.push({ source: e.source, target: e.target, label: e.relation });
          }
        });
        
        return { nodes: newNodes, links: newLinks };
      });
    } catch (err) {
      console.error('Failed to fetch graph:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGraph(initialNodeId);
  }, [fetchGraph, initialNodeId]);

  return (
    <div className="graph-section">
      <div className="graph-controls">
        <button className="control-btn" onClick={() => fetchGraph()}>
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Reset
        </button>
      </div>

      {graphData.nodes.length > 0 ? (
        <ForceGraph2D
          ref={fgRef}
          graphData={graphData}
          nodeLabel={node => `${node.type}: ${node.label}`}
          linkLabel={link => link.label}
          onNodeClick={onNodeClick}
        />
      ) : (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
          {loading ? 'Loading graph data...' : 'No graph data available.'}
        </div>
      )}
    </div>
  );
};

export default GraphView;
