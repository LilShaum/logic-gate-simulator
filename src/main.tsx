import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Reset default body styles so the canvas can fill viewport
document.body.style.margin = '0';
document.body.style.padding = '0';
document.body.style.overflow = 'hidden';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
