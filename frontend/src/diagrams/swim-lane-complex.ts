const swimLaneComplex = `
flowchart LR
  subgraph Developer
    push[Push Code]
    pr[Open PR]
  end
  subgraph CI [CI / GitHub]
    lint[Lint & Build]
    tests{Tests Pass?}
    artifact[Build Artifact]
    fail[Notify Failure]
  end
  subgraph Staging
    deployStg[Deploy Staging]
    smoke{Smoke Tests OK?}
    rollback[Rollback]
  end
  subgraph Production
    approve[Manual Approval]
    deployPrd[Deploy Production]
    monitor[Monitor & Alert]
  end

  push --> pr
  pr --> lint
  lint --> tests
  tests -->|pass| artifact
  tests -.->|fail| fail
  artifact --> deployStg
  deployStg --> smoke
  smoke -.->|fail| rollback
  smoke -->|pass| approve
  approve --> deployPrd
  deployPrd --> monitor
`

export default swimLaneComplex
