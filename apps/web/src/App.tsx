// Root component for the Sunpath PWA. Module: core.

import { Routes, Route, Navigate } from 'react-router-dom'

function Placeholder({ title }: { title: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center p-8 text-center">
      <div>
        <h1 className="text-2xl font-semibold text-sun-400">{title}</h1>
        <p className="mt-2 text-sm text-neutral-400">Phase 0 skeleton — coming soon.</p>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <div className="flex h-full w-full flex-col">
      <main className="flex-1 overflow-hidden">
        <Routes>
          <Route path="/" element={<Navigate to="/map" replace />} />
          <Route path="/map" element={<Placeholder title="Map" />} />
          <Route path="/walk" element={<Placeholder title="Walk List" />} />
          <Route path="/pipeline" element={<Placeholder title="Pipeline" />} />
          <Route path="/settings" element={<Placeholder title="Settings" />} />
          <Route path="*" element={<Placeholder title="Not found" />} />
        </Routes>
      </main>
    </div>
  )
}
