
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import apiKeyService from './services/apiKeyService';

// Initialize API keys before rendering the app to avoid race conditions
apiKeyService.init();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
