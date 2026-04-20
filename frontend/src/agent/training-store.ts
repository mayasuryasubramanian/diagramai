/**
 * Training Store — few-shot examples for the Mermaid translation agent.
 *
 * Seed examples cover the three diagram types (flowchart, architecture, swim-lane).
 * Learned examples grow from user-accepted AI outputs and are persisted in localStorage.
 * Retrieval uses keyword-overlap scoring — no embeddings needed for this narrow domain.
 */

export interface TrainingExample {
  id:          string
  description: string
  diagram:     string   // raw Mermaid syntax
  source:      'seed' | 'learned'
  createdAt:   number
}

const STORAGE_KEY = 'diagramai:training-examples-v2'

// ─── Seed examples ────────────────────────────────────────────────────────────

const SEED_EXAMPLES: TrainingExample[] = [
  {
    id: 'seed-flowchart-login',
    source: 'seed',
    createdAt: 0,
    description: 'A flowchart for user login: start, enter credentials, check if valid, if yes go to dashboard, if no show error',
    diagram: `flowchart TD
    start([Start])
    enterCreds[Enter Credentials]
    checkValid{Valid?}
    dashboard[Go to Dashboard]
    showError[Show Error]
    finish([End])

    start --> enterCreds
    enterCreds --> checkValid
    checkValid -->|yes| dashboard
    checkValid -.->|no| showError
    dashboard --> finish
    showError --> finish`,
  },
  {
    id: 'seed-architecture-api',
    source: 'seed',
    createdAt: 0,
    description: 'Architecture diagram: browser talks to API gateway, gateway routes to auth service and user service, both read from PostgreSQL',
    diagram: `architecture-beta
  service browser(logos:chrome)[Browser]
  service gateway(logos:nginx)[API Gateway]
  service auth(logos:auth0)[Auth Service]
  service userSvc(logos:nodejs-icon)[User Service]
  service db(logos:postgresql)[PostgreSQL]

  browser:B --> T:gateway
  gateway:L --> R:auth
  gateway:B --> T:userSvc
  auth:R --> L:db
  userSvc:B --> T:db`,
  },
  {
    id: 'seed-swimlane-cicd',
    source: 'seed',
    createdAt: 0,
    description: 'CI/CD pipeline swim lanes: Developer pushes code, CI runs tests, if pass do code review, if approved build and deploy, if fail notify developer',
    diagram: `flowchart LR
  subgraph Developer
    push[Push Code]
    notifyFail[Notify Failure]
  end
  subgraph CI
    runTests[Run Tests]
    checkTests{Tests Pass?}
    codeReview[Code Review]
    checkReview{Approved?}
    buildDeploy[Build & Deploy]
  end

  push --> runTests
  runTests --> checkTests
  checkTests -->|pass| codeReview
  checkTests -.->|fail| notifyFail
  codeReview --> checkReview
  checkReview -->|approved| buildDeploy`,
  },
  {
    id: 'seed-architecture-microservices',
    source: 'seed',
    createdAt: 0,
    description: 'Microservices architecture with load balancer, multiple services, Kafka for messaging, and Redis cache',
    diagram: `architecture-beta
  service client(logos:chrome)[Client]
  service lb(logos:nginx)[Load Balancer]
  service api(logos:nodejs-icon)[API Service]
  service kafka(logos:kafka)[Kafka]
  service worker(logos:nodejs-icon)[Worker Service]
  service db(logos:postgresql)[PostgreSQL]
  service cache(logos:redis)[Redis Cache]

  client:B --> T:lb
  lb:B --> T:api
  api:R --> L:cache
  api:B --> T:kafka
  kafka:B --> T:worker
  worker:B --> T:db`,
  },
]

// ─── Store ────────────────────────────────────────────────────────────────────

class TrainingStore {
  private learned: TrainingExample[] = []

  constructor() { this.load() }

  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) this.learned = JSON.parse(raw)
    } catch {
      this.learned = []
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.learned))
    } catch {
      if (this.learned.length > 0) { this.learned.shift(); this.save() }
    }
  }

  add(description: string, syntax: string): void {
    this.learned.push({
      id:        `learned-${Date.now()}`,
      description,
      diagram:   syntax,
      source:    'learned',
      createdAt: Date.now(),
    })
    this.save()
  }

  selectRelevant(description: string, n = 3): TrainingExample[] {
    const all    = [...SEED_EXAMPLES, ...this.learned]
    const query  = tokenise(description)
    return all
      .map(ex => ({ ex, score: overlap(query, tokenise(ex.description)) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, n)
      .map(s => s.ex)
  }
}

function tokenise(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length > 2)
  )
}

function overlap(a: Set<string>, b: Set<string>): number {
  let count = 0
  for (const t of a) if (b.has(t)) count++
  return count / Math.max(a.size, b.size, 1)
}

export const trainingStore = new TrainingStore()
