const flowchartComplex = `
flowchart TD
    start([Start])
    receive[Receive Order]
    stock{In Stock?}
    payment[Process Payment]
    backorder{Backorder?}
    payok{Payment OK?}
    placeBO[Place Backorder]
    reject[Reject Order]
    ship[Ship Order]
    cancel[Cancel Order]
    notify[Notify Customer]
    finish([End])

    start --> receive
    receive --> stock
    stock -->|yes| payment
    stock -.->|no| backorder
    payment --> payok
    backorder -->|yes| placeBO
    backorder -.->|no| reject
    payok -->|yes| ship
    payok -.->|no| cancel
    ship --> notify
    cancel --> notify
    placeBO --> notify
    reject --> notify
    notify --> finish
`

export default flowchartComplex
