import { useState, useEffect } from 'react'
import DiagramCanvas from './components/DiagramCanvas'
import InputDrawer from './components/InputDrawer'
import { loadCorePlugins } from './plugins'
import { runPipeline } from './engine/pipeline'
import { trainingStore } from './agent/training-store'
import { PRESETS } from './diagrams'
import type { DiagramJSON } from './types'

// Register all plugins once at startup
loadCorePlugins()

export default function App() {
  const [svg, setSvg]       = useState<string | undefined>()
  const [error, setError]   = useState<string | undefined>()
  const [active, setActive] = useState<string>('flowchart')

  useEffect(() => {
    loadPreset('flowchart')
  }, [])

  async function loadPreset(id: string) {
    const preset = PRESETS.find(p => p.id === id)
    if (!preset) return
    setActive(id)
    await renderDiagram(preset.diagram)
  }

  async function handleDiagram(diagram: DiagramJSON, description: string) {
    setActive('')
    const ok = await renderDiagram(diagram)
    // Only add to training store if the diagram rendered successfully —
    // this forms the "continuous training" feedback loop.
    if (ok) trainingStore.add(description, diagram)
  }

  async function renderDiagram(diagram: DiagramJSON): Promise<boolean> {
    const result = await runPipeline(diagram)
    if (result.ok) {
      setSvg(result.svg)
      setError(undefined)
      return true
    } else {
      setSvg(undefined)
      setError(result.error)
      return false
    }
  }

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <DiagramCanvas svg={svg} error={error} />
      <InputDrawer
        active={active}
        onSelectPreset={loadPreset}
        onDiagram={handleDiagram}
      />
    </div>
  )
}
