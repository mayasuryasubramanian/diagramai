import type { Plugin } from '../types'

const registry = new Map<string, Plugin>()

export function registerPlugin(plugin: Plugin): void {
  // Validate invariants
  if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(plugin.name)) {
    throw new Error(`Plugin name "${plugin.name}" must be lowercase hyphen-separated`)
  }
  if (registry.has(plugin.name)) {
    // In development, HMR re-runs module initialisation — silently replace.
    // In production there is no HMR so this branch is never reached.
    if (import.meta.env.PROD) {
      throw new Error(`Plugin "${plugin.name}" is already registered`)
    }
    registry.set(plugin.name, plugin)
    return
  }
  if (plugin.feedback_options.length > 6) {
    throw new Error(`Plugin "${plugin.name}" has more than 6 feedback_options`)
  }
  if (!/^\d+\.\d+\.\d+/.test(plugin.version)) {
    throw new Error(`Plugin "${plugin.name}" version "${plugin.version}" is not valid semver`)
  }
  if (typeof plugin.render !== 'function') {
    throw new Error(`Plugin "${plugin.name}" render must be a function`)
  }
  const modes = ['stressed', 'normal', 'liberal'] as const
  for (const mode of modes) {
    const s = plugin.sizes?.[mode]
    if (!s || typeof s.w !== 'number' || typeof s.h !== 'number') {
      throw new Error(`Plugin "${plugin.name}" is missing a valid sizes.${mode} { w, h }`)
    }
  }

  registry.set(plugin.name, plugin)
}

export function getPlugin(name: string): Plugin | undefined {
  return registry.get(name)
}

export function getAllPlugins(): Plugin[] {
  return Array.from(registry.values())
}

export function getRegistrySchema() {
  return {
    plugins: getAllPlugins().map(p => ({
      name: p.name,
      description: p.description,
      visual_form: p.visual_form,
      schema: p.schema,
      supported_animations: p.supported_animations,
    })),
  }
}
