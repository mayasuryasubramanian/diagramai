const swimLane = `
flowchart LR
  subgraph Plan
    spec[Write Spec]
    design[Design API]
  end
  subgraph Build
    impl[Implement]
    test[Write Tests]
  end
  subgraph Ship
    review[Code Review]
    deploy[Deploy]
  end

  spec --> design
  design --> impl
  impl --> test
  test --> review
  review --> deploy
`

export default swimLane
