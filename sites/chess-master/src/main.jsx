import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
// Order matters: Oat (from index.html) -> our theme -> app layout styles.
import './theme.css'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Register the service worker (relative scope) so the engine caches for offline
// use. Only in production builds; the Vite dev server doesn't serve sw.js.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  })
}
