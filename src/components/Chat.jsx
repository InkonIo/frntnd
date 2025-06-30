import React, { useState, useEffect, useRef } from 'react';
import './Chat.css';

export default function ChatPage() {
  const [message, setMessage] = useState("");
  const [currentMessages, setCurrentMessages] = useState([]);
  const messagesEndRef = useRef(null);
  const [hideIntro, setHideIntro] = useState(false);
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    if (currentMessages.length > 0 && !hideIntro) {
      setHideIntro(true);
    }
  }, [currentMessages, hideIntro]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [currentMessages]);

  const handleSend = () => {
    if (!message.trim()) return;

    setCurrentMessages(prev => [...prev, { sender: 'user', text: message }]);
    setIsTyping(true);

    fetch('http://localhost:8080/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    })
      .then(res => res.json())
      .then(data => {
        const responseText = data.error ? data.error : data.reply; // <-- исправлено здесь
      setCurrentMessages(prev => [...prev, { sender: 'ai', text: responseText }]);
    })
      .catch(() => {
      setCurrentMessages(prev => [...prev, { sender: 'ai', text: 'Ошибка сервера' }]);
    })
      .finally(() => setIsTyping(false));

    setMessage('');
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  return (
    <div className="chat-container">
      <div className="chat-main">
        <div className={`chat-intro ${hideIntro ? 'hide' : ''}`}>
          <h2>Агрочат ассистент</h2>
          <p>Начните диалог, задав вопрос ниже</p>
        </div>

        <div className="messages">
          {currentMessages.map((msg, index) => (
            <div key={index} className={`message ${msg.sender === 'user' ? 'user' : 'bot'}`}>
              {msg.text}
            </div>
          ))}
          {isTyping && (
            <div className="message bot">
              <div className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef}></div>
        </div>

        <div className="input-area">
          <input
            type="text"
            placeholder="Введите сообщение..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
          />
          <button className="send-button" onClick={handleSend}>
            ➤
          </button>
        </div>
      </div>
    </div>
  );
}
