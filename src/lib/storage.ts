import type { BoardModel } from './types'

const KEY = 'elevator-board:model:v1'

export function saveModel(model: BoardModel | null): void {
  try {
    if (model) localStorage.setItem(KEY, JSON.stringify(model))
    else localStorage.removeItem(KEY)
  } catch {
    // Private windows and blocked site data: losing the draft is acceptable,
    // crashing the editor is not.
  }
}

export function loadModel(): BoardModel | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as BoardModel
    if (!Array.isArray(parsed.events) || !Array.isArray(parsed.groups)) return null
    return parsed
  } catch {
    return null
  }
}
