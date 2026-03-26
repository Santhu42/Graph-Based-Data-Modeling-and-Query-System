import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User } from 'lucide-react';

const ChatView = ({ onQuerySuccess }) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([
    { role: 'ai', text: 'Hello! I can help you explore order data. Try asking "Show all orders" or "Who are our top customers?"' }
  ]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userText = input.trim();
    setMessages(prev => [...prev, { role: 'user', text: userText }]);
    setInput('');
    setLoading(true);

    try {
      // Send the current message history for context (last 5 turns)
      const history = messages.map(m => ({ role: m.role, text: m.text })).slice(-5);
      
      const baseUrl = import.meta.env.VITE_API_BASE_URL || '';
      const res = await fetch(`${baseUrl}/api/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: userText, history })
      });
      const data = await res.json();

      if (data.error) {
        setMessages(prev => [...prev, { role: 'ai', text: data.error, type: 'error' }]);
      } else {
        setMessages(prev => [...prev, { role: 'ai', text: data.answer || 'I found some results.', sql: data.sql }]);
        if (onQuerySuccess) onQuerySuccess(data);
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'ai', text: 'Failied to connect to server.', type: 'error' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="chat-section">
      <div className="chat-header">
        <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Graph Chat</h3>
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>AI Enabled</span>
      </div>

      <div className="chat-messages" ref={scrollRef}>
        {messages.map((m, i) => (
          <div key={i} className={`message ${m.role}`}>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
              {m.role === 'ai' ? <Bot size={14} /> : <User size={14} />}
              <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>
                {m.role === 'ai' ? 'Assistant' : 'You'}
              </span>
            </div>
            {m.text}
            {m.sql && (
              <details style={{ marginTop: '8px', pointerEvents: 'auto' }}>
                <summary style={{ cursor: 'pointer', fontSize: '11px', color: 'var(--accent-color)' }}>View SQL</summary>
                <code style={{ display: 'block', padding: '8px', background: '#0c0c0e', borderRadius: '4px', fontSize: '11px', marginTop: '4px', overflowX: 'auto' }}>
                  {m.sql}
                </code>
              </details>
            )}
          </div>
        ))}
        {loading && (
          <div className="message ai">
            <div className="loading-dots">
              <div className="dot" />
              <div className="dot" />
              <div className="dot" />
            </div>
          </div>
        )}
      </div>

      <div className="chat-input-container">
        <form onSubmit={handleSubmit} className="chat-input-wrapper">
          <input
            className="chat-input"
            placeholder="Ask about orders, customers..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button type="submit" className="send-btn">
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatView;
