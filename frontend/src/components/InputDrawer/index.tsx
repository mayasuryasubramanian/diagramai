import { useState, useRef, useEffect } from 'react'
import { PRESETS } from '../../diagrams'
import { translate } from '../../agent/translation-agent'
import styles from './InputDrawer.module.css'

interface Props {
  active:         string
  onSelectPreset: (id: string) => void
  onGenerated:    (syntax: string, description: string) => void
}

export default function InputDrawer({ active, onSelectPreset, onGenerated }: Props) {
  const [open, setOpen]       = useState(false)
  const [text, setText]       = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus]   = useState<{ type: 'info' | 'error'; msg: string } | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const timerRef              = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  async function handleGenerate() {
    const description = text.trim()
    if (!description) return

    setLoading(true)
    setElapsed(0)
    setStatus({ type: 'info', msg: 'Thinking…' })

    const start = Date.now()
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000))
    }, 1000)

    const result = await translate(description)

    clearInterval(timerRef.current!)
    timerRef.current = null

    if (result.ok) {
      setStatus({ type: 'info', msg: 'Generated' })
      onGenerated(result.syntax, description)
    } else {
      setStatus({ type: 'error', msg: result.error })
    }

    setLoading(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleGenerate()
    }
  }

  return (
    <div className={`${styles.drawer} ${open ? styles.open : ''}`}>
      <button
        className={styles.handle}
        onClick={() => setOpen(v => !v)}
        aria-label={open ? 'Collapse input' : 'Expand input'}
      >
        <span className={styles.pill} />
        {!open && <span className={styles.peekLabel}>Describe or choose a diagram</span>}
      </button>

      <div className={styles.content}>
        <p className={styles.sectionLabel}>Describe your diagram</p>
        <textarea
          className={styles.textarea}
          placeholder="e.g. A microservices architecture with an API gateway, auth service, user service, and PostgreSQL database"
          rows={3}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
        />
        <div className={styles.generateRow}>
          <button
            className={styles.generateBtn}
            onClick={handleGenerate}
            disabled={loading || !text.trim()}
          >
            {loading ? 'Generating…' : 'Generate'}
          </button>
          {status && (
            <span className={status.type === 'error' ? styles.statusError : styles.statusText}>
              {status.msg}
              {loading && elapsed > 0 && (
                <span className={styles.elapsed}>{elapsed}s</span>
              )}
            </span>
          )}
          {!status && <span className={styles.statusText}>⌘↵ to generate</span>}
        </div>

        <p className={styles.sectionLabel} style={{ marginTop: 20 }}>Examples</p>
        <div className={styles.presets}>
          {PRESETS.map(p => (
            <button
              key={p.id}
              className={`${styles.preset} ${active === p.id ? styles.presetActive : ''}`}
              onClick={() => onSelectPreset(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
