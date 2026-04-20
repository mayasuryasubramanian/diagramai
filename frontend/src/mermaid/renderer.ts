/**
 * Mermaid renderer — single entry point for all diagram rendering.
 *
 * Initialises Mermaid once with:
 *   - dark theme matching the DiagramAI UI
 *   - all icon packs (logos, heroicons, lucide, tabler, simple-icons,
 *     mdi, devicon, phosphor, iconoir)
 *
 * Then exposes renderMermaid(syntax) which any caller can use.
 */

import mermaid from 'mermaid'

let ready: Promise<void> | null = null

function init(): Promise<void> {
  if (ready) return ready
  ready = (async () => {
    // Register icon packs — loaded lazily so they don't block the initial render
    mermaid.registerIconPacks([
      { name: 'logos',         loader: async () => (await import('@iconify-json/logos/icons.json')).default        },
      { name: 'heroicons',     loader: async () => (await import('@iconify-json/heroicons/icons.json')).default    },
      { name: 'lucide',        loader: async () => (await import('@iconify-json/lucide/icons.json')).default       },
      { name: 'tabler',        loader: async () => (await import('@iconify-json/tabler/icons.json')).default       },
      { name: 'simple-icons',  loader: async () => (await import('@iconify-json/simple-icons/icons.json')).default },
      { name: 'mdi',           loader: async () => (await import('@iconify-json/mdi/icons.json')).default          },
      { name: 'devicon',       loader: async () => (await import('@iconify-json/devicon/icons.json')).default      },
      { name: 'ph',            loader: async () => (await import('@iconify-json/ph/icons.json')).default           },
      { name: 'iconoir',       loader: async () => (await import('@iconify-json/iconoir/icons.json')).default      },
    ])

    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      darkMode: true,
      fontFamily: 'system-ui, sans-serif',
      fontSize: 14,
      flowchart: {
        curve: 'orthogonal',
        padding: 20,
        nodeSpacing: 60,
        rankSpacing: 80,
        useMaxWidth: false,
      },
      architecture: {
        useMaxWidth: false,
      },
    })
  })()
  return ready
}

// Counter so every render call gets a unique element id
let seq = 0

export type RenderResult =
  | { ok: true;  svg: string }
  | { ok: false; error: string }

export async function renderMermaid(syntax: string): Promise<RenderResult> {
  try {
    await init()
    const id = `mermaid-diagram-${++seq}`
    const { svg } = await mermaid.render(id, syntax)
    return { ok: true, svg }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/** Detect diagram type from first non-empty line of syntax */
export function detectDiagramType(syntax: string): string {
  const first = syntax.trim().split('\n')[0].trim().toLowerCase()
  if (first.startsWith('architecture')) return 'architecture'
  if (first.startsWith('sequencediagram')) return 'sequence'
  if (first.startsWith('flowchart') || first.startsWith('graph')) return 'flowchart'
  return 'flowchart'
}
