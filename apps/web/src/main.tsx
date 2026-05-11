// React entry point for the Sunpath PWA. Module: core.

import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { initObservability } from './lib/observability'
import './index.css'
import 'maplibre-gl/dist/maplibre-gl.css'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('#root not found')

initObservability()

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
)
