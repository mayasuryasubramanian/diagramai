const flowchart = `
flowchart TD
    start([Start])
    collect[Collect Data]
    validate{Data Valid?}
    process[Process Data]
    logError[Log Error]
    finish([End])

    start --> collect
    collect --> validate
    validate -->|yes| process
    validate -.->|no| logError
    process --> finish
    logError --> finish
`

export default flowchart
