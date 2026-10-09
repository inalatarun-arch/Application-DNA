import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import '@fontsource-variable/inter';
import './index.css';
import App from './App';
import { ThemeProvider } from './context/ThemeContext';
import { requestPersistentStorage } from './db/db';
import { initKeyStore } from './services/apiKeyStore';

void requestPersistentStorage();
// Moves any old plain-text key into the encrypted store and unlocks device-bound keys before the first AI call.
void initKeyStore();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <HashRouter>
        <App />
      </HashRouter>
    </ThemeProvider>
  </StrictMode>,
);
