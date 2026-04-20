import { useState, useEffect } from 'react'
import DiagramCanvas from './components/DiagramCanvas'
import InputDrawer from './components/InputDrawer'
import { renderMermaid } from './mermaid/renderer'
import { trainingStore } from './agent/training-store'
import { PRESETS } from './diagrams'

export default function App() {
  const [svg, setSvg]     = useState<string | undefined>()
  const [error, setError] = useState<string | undefined>()
  const [active, setActive] = useState<string>('flowchart')

  useEffect(() => { loadPreset('flowchart') }, [])

  async function loadPreset(id: string) {
    const preset = PRESETS.find(p => p.id === id)
    if (!preset) return
    setActive(id)
    await render(preset.syntax)
  }

  async function handleGenerated(syntax: string, description: string) {
    setActive('')
    const ok = await render(syntax)
    if (ok) trainingStore.add(description, syntax)
  }

  async function render(syntax: string): Promise<boolean> {
    const result = await renderMermaid(syntax)
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
        onGenerated={handleGenerated}
      />
    </div>
  )
}
