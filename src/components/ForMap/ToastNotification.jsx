// components/Common/ToastNotification.jsx
import React, { useEffect, useState } from 'react';

const ToastNotification = ({ message, type, visible }) => {
  const [shouldRender, setShouldRender] = useState(visible);

  useEffect(() => {
    if (visible) {
      setShouldRender(true);
    } else {
      // Даем немного времени для анимации исчезновения перед удалением из DOM
      const timer = setTimeout(() => setShouldRender(false), 500); 
      return () => clearTimeout(timer);
    }
  }, [visible]);

  if (!shouldRender) return null;

  const getBackgroundColor = (type) => {
    switch (type) {
      case 'success':
        return '#4CAF50'; // Зеленый
      case 'error':
        return '#F44336'; // Красный
      case 'info':
        return '#2196F3'; // Синий
      case 'warning':
        return '#FFC107'; // Желтый
      default:
        return '#333';
    }
  };

  const textColor = type === 'warning' ? '#333' : 'white';

  const toastStyle = {
    position: 'fixed',
    top: '20px',
    right: '20px',
    backgroundColor: getBackgroundColor(type),
    color: textColor,
    padding: '12px 20px',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
    zIndex: 10000,
    opacity: visible ? 1 : 0,
    transform: visible ? 'translateY(0)' : 'translateY(-20px)',
    transition: 'opacity 0.5s ease-out, transform 0.5s ease-out',
    maxWidth: '300px',
    wordWrap: 'break-word',
    textAlign: 'center',
    fontSize: '14px',
  };

  return (
    <div style={toastStyle}>
      {message}
    </div>
  );
};

export default ToastNotification;
