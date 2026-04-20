import styles from './DiagramCanvas.module.css'

interface Props {
  svg?:   string
  error?: string
}

export default function DiagramCanvas({ svg, error }: Props) {
  return (
    <div className={styles.canvas}>
      {error ? (
        <div className={styles.error}>
          <p className={styles.errorTitle}>Pipeline error</p>
          <pre className={styles.errorDetail}>{error}</pre>
        </div>
      ) : svg ? (
        <div
          className={styles.svg}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div className={styles.empty}>
          <p>Select a diagram below</p>
        </div>
      )}
    </div>
  )
}
