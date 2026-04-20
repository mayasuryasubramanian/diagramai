/**
 * Training Store — manages few-shot examples for the Translation Agent.
 *
 * Two layers:
 *   1. Seed examples — hard-coded, always available, cover the core component types
 *   2. Learned examples — stored in localStorage, grow as users accept/correct diagrams
 *
 * Retrieval: simple TF-IDF-like keyword overlap scores each example against the
 * incoming description and returns the top-N most relevant. No embeddings needed
 * for this narrow domain.
 */

import type { DiagramJSON } from '../types'

export interface TrainingExample {
  id:          string
  description: string
  diagram:     DiagramJSON
  source:      'seed' | 'learned'
  createdAt:   number
}

const STORAGE_KEY = 'diagramai:training-examples'

// ─── Seed examples ────────────────────────────────────────────────────────────

const SEED_EXAMPLES: TrainingExample[] = [
  {
    id: 'seed-flowchart-login',
    source: 'seed',
    createdAt: 0,
    description: 'A flowchart for user login: start, enter credentials, check if valid, if yes go to dashboard, if no show error and retry',
    diagram: {
      diagramai_version: '0.1',
      diagram_style: 'clean',
      components: [
        { id: 'start-01', type: 'start-end', props: { label: 'Start', theme_category: 'neutral' }, parent: null },
        { id: 'enter-creds', type: 'process-box', props: { label: 'Enter Credentials', theme_category: 'neutral' }, parent: null },
        { id: 'check-valid', type: 'decision-box', props: { label: 'Valid?', theme_category: 'neutral' }, parent: null },
        { id: 'dashboard', type: 'process-box', props: { label: 'Go to Dashboard', theme_category: 'application' }, parent: null },
        { id: 'show-error', type: 'process-box', props: { label: 'Show Error', theme_category: 'security' }, parent: null },
        { id: 'end-01', type: 'start-end', props: { label: 'End', theme_category: 'neutral' }, parent: null },
        { id: 'a-01', type: 'arrow', props: { from: 'start-01', to: 'enter-creds', semantic: 'begins', style: { line: 'solid', direction: 'forward', weight: 'normal' } }, parent: null },
        { id: 'a-02', type: 'arrow', props: { from: 'enter-creds', to: 'check-valid', semantic: 'validates', style: { line: 'solid', direction: 'forward', weight: 'normal' } }, parent: null },
        { id: 'a-03', type: 'arrow', props: { from: 'check-valid', to: 'dashboard', label: 'yes', semantic: 'authenticated', style: { line: 'solid', direction: 'forward', weight: 'normal' } }, parent: null },
        { id: 'a-04', type: 'arrow', props: { from: 'check-valid', to: 'show-error', label: 'no', semantic: 'invalid', style: { line: 'dashed', direction: 'forward', weight: 'normal' } }, parent: null },
        { id: 'a-05', type: 'arrow', props: { from: 'dashboard', to: 'end-01', semantic: 'completes', style: { line: 'solid', direction: 'forward', weight: 'normal' } }, parent: null },
        { id: 'a-06', type: 'arrow', props: { from: 'show-error', to: 'end-01', semantic: 'completes', style: { line: 'solid', direction: 'forward', weight: 'normal' } }, parent: null },
      ],
    },
  },
  {
    id: 'seed-architecture-api',
    source: 'seed',
    createdAt: 0,
    description: 'Architecture diagram: browser talks to API gateway, gateway routes to auth service and user service, both services read from a PostgreSQL database',
    diagram: {
      diagramai_version: '0.1',
      diagram_style: 'clean',
      components: [
        { id: 'browser-01', type: 'process-box', props: { label: 'Browser', theme_category: 'actor' }, parent: null },
        { id: 'api-gateway', type: 'process-box', props: { label: 'API Gateway', theme_category: 'infrastructure' }, parent: null },
        { id: 'auth-service', type: 'process-box', props: { label: 'Auth Service', theme_category: 'security' }, parent: null },
        { id: 'user-service', type: 'process-box', props: { label: 'User Service', theme_category: 'application' }, parent: null },
        { id: 'postgres-01', type: 'process-box', props: { label: 'PostgreSQL', theme_category: 'infrastructure' }, parent: null },
        { id: 'a-01', type: 'arrow', props: { from: 'browser-01', to: 'api-gateway', label: 'HTTPS', semantic: 'sends request to', style: { line: 'solid', direction: 'forward', weight: 'normal' } }, parent: null },
        { id: 'a-02', type: 'arrow', props: { from: 'api-gateway', to: 'auth-service', label: 'verify', semantic: 'authenticates via', style: { line: 'solid', direction: 'forward', weight: 'normal' } }, parent: null },
        { id: 'a-03', type: 'arrow', props: { from: 'api-gateway', to: 'user-service', semantic: 'routes to', style: { line: 'solid', direction: 'forward', weight: 'normal' } }, parent: null },
        { id: 'a-04', type: 'arrow', props: { from: 'auth-service', to: 'postgres-01', label: 'SQL', semantic: 'reads from', style: { line: 'solid', direction: 'bidirectional', weight: 'normal' } }, parent: null },
        { id: 'a-05', type: 'arrow', props: { from: 'user-service', to: 'postgres-01', label: 'SQL', semantic: 'reads from', style: { line: 'solid', direction: 'bidirectional', weight: 'normal' } }, parent: null },
      ],
    },
  },
  {
    // Demonstrates: swim-lane containers, decision-box inside a lane,
    // dashed failure arrow, cross-lane arrows — all in one example.
    id: 'seed-swimlane-support',
    source: 'seed',
    createdAt: 0,
    description: 'Swim-lane diagram for customer support: Customer lane submits ticket, Support lane triages and checks if urgent, if urgent escalate to Engineering lane to fix and close, if not urgent resolve directly',
    diagram: {
      diagramai_version: '0.1',
      diagram_style: 'clean',
      components: [
        { id: 'lane-customer', type: 'swim-lane', props: { label: 'Customer', theme_category: 'actor' }, parent: null },
        { id: 'lane-support',  type: 'swim-lane', props: { label: 'Support',  theme_category: 'application' }, parent: null },
        { id: 'lane-eng',      type: 'swim-lane', props: { label: 'Engineering', theme_category: 'infrastructure' }, parent: null },
        { id: 'submit-ticket', type: 'process-box',  props: { label: 'Submit Ticket', theme_category: 'actor' }, parent: 'lane-customer' },
        { id: 'triage',        type: 'process-box',  props: { label: 'Triage Ticket', theme_category: 'application' }, parent: 'lane-support' },
        { id: 'check-urgent',  type: 'decision-box', props: { label: 'Urgent?', theme_category: 'neutral' }, parent: 'lane-support' },
        { id: 'resolve',       type: 'process-box',  props: { label: 'Resolve Directly', theme_category: 'application' }, parent: 'lane-support' },
        { id: 'escalate',      type: 'process-box',  props: { label: 'Escalate Issue', theme_category: 'security' }, parent: 'lane-eng' },
        { id: 'fix-bug',       type: 'process-box',  props: { label: 'Fix & Close', theme_category: 'infrastructure' }, parent: 'lane-eng' },
        { id: 'a-01', type: 'arrow', props: { from: 'submit-ticket', to: 'triage',       semantic: 'creates',   style: { line: 'solid',  direction: 'forward', weight: 'normal' } }, parent: null },
        { id: 'a-02', type: 'arrow', props: { from: 'triage',        to: 'check-urgent', semantic: 'leads to',  style: { line: 'solid',  direction: 'forward', weight: 'normal' } }, parent: null },
        { id: 'a-03', type: 'arrow', props: { from: 'check-urgent',  to: 'escalate', label: 'yes', semantic: 'escalates',  style: { line: 'solid',  direction: 'forward', weight: 'normal' } }, parent: null },
        { id: 'a-04', type: 'arrow', props: { from: 'check-urgent',  to: 'resolve',  label: 'no',  semantic: 'resolves',   style: { line: 'dashed', direction: 'forward', weight: 'normal' } }, parent: null },
        { id: 'a-05', type: 'arrow', props: { from: 'escalate',      to: 'fix-bug',      semantic: 'then',      style: { line: 'solid',  direction: 'forward', weight: 'normal' } }, parent: null },
      ],
    },
  },
  {
    // Demonstrates: swim-lane CI/CD with multiple decision-boxes and
    // parallel steps in the same lane.
    id: 'seed-swimlane-cicd',
    source: 'seed',
    createdAt: 0,
    description: 'CI/CD pipeline swim lanes for Developer and CI System: Developer pushes code, CI runs tests, if tests pass do code review, if approved build and deploy, if tests fail notify developer',
    diagram: {
      diagramai_version: '0.1',
      diagram_style: 'clean',
      components: [
        { id: 'lane-dev', type: 'swim-lane', props: { label: 'Developer', theme_category: 'actor' }, parent: null },
        { id: 'lane-ci',  type: 'swim-lane', props: { label: 'CI System', theme_category: 'infrastructure' }, parent: null },
        { id: 'push-code',    type: 'process-box',  props: { label: 'Push Code',       theme_category: 'actor' },          parent: 'lane-dev' },
        { id: 'notify-fail',  type: 'process-box',  props: { label: 'Notify Failure',  theme_category: 'security' },       parent: 'lane-dev' },
        { id: 'run-tests',    type: 'process-box',  props: { label: 'Run Tests',        theme_category: 'infrastructure' }, parent: 'lane-ci' },
        { id: 'check-tests',  type: 'decision-box', props: { label: 'Tests Pass?',      theme_category: 'neutral' },        parent: 'lane-ci' },
        { id: 'code-review',  type: 'process-box',  props: { label: 'Code Review',      theme_category: 'application' },   parent: 'lane-ci' },
        { id: 'check-review', type: 'decision-box', props: { label: 'Approved?',         theme_category: 'neutral' },        parent: 'lane-ci' },
        { id: 'build-deploy', type: 'process-box',  props: { label: 'Build & Deploy',   theme_category: 'infrastructure' }, parent: 'lane-ci' },
        { id: 'a-01', type: 'arrow', props: { from: 'push-code',    to: 'run-tests',    semantic: 'triggers',  style: { line: 'solid',  direction: 'forward', weight: 'normal' } }, parent: null },
        { id: 'a-02', type: 'arrow', props: { from: 'run-tests',    to: 'check-tests',  semantic: 'results in', style: { line: 'solid', direction: 'forward', weight: 'normal' } }, parent: null },
        { id: 'a-03', type: 'arrow', props: { from: 'check-tests',  to: 'code-review',  label: 'pass', semantic: 'passes',   style: { line: 'solid',  direction: 'forward', weight: 'normal' } }, parent: null },
        { id: 'a-04', type: 'arrow', props: { from: 'check-tests',  to: 'notify-fail',  label: 'fail', semantic: 'fails',    style: { line: 'dashed', direction: 'forward', weight: 'normal' } }, parent: null },
        { id: 'a-05', type: 'arrow', props: { from: 'code-review',  to: 'check-review', semantic: 'leads to',  style: { line: 'solid',  direction: 'forward', weight: 'normal' } }, parent: null },
        { id: 'a-06', type: 'arrow', props: { from: 'check-review', to: 'build-deploy', label: 'approved', semantic: 'approved', style: { line: 'solid',  direction: 'forward', weight: 'normal' } }, parent: null },
      ],
    },
  },
]

// ─── Store class ──────────────────────────────────────────────────────────────

class TrainingStore {
  private learned: TrainingExample[] = []

  constructor() {
    this.load()
  }

  // ── Persistence ─────────────────────────────────────────────────────────────

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
      // Storage full — drop oldest learned example and retry
      if (this.learned.length > 0) {
        this.learned.shift()
        this.save()
      }
    }
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  /** Add a learned example (user-accepted or user-corrected diagram). */
  add(description: string, diagram: DiagramJSON): void {
    const example: TrainingExample = {
      id:          `learned-${Date.now()}`,
      description,
      diagram,
      source:      'learned',
      createdAt:   Date.now(),
    }
    this.learned.push(example)
    this.save()
  }

  /** Return top-N most relevant examples for the given description. */
  selectRelevant(description: string, n = 3): TrainingExample[] {
    const all = [...SEED_EXAMPLES, ...this.learned]
    const query = tokenise(description)

    const scored = all.map(ex => ({
      ex,
      score: overlap(query, tokenise(ex.description)),
    }))

    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, n).map(s => s.ex)
  }

  get learnedCount(): number {
    return this.learned.length
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tokenise(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2)
  )
}

function overlap(a: Set<string>, b: Set<string>): number {
  let count = 0
  for (const t of a) if (b.has(t)) count++
  return count / Math.max(a.size, b.size, 1)
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const trainingStore = new TrainingStore()
