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

const MAIL_KEY = 'elevator-board:mail:v1'

export interface MailPrefs {
  to: string
  cc: string
}

/** Who the board went to last time; the subject and body come from the board. */
export function saveMailPrefs(prefs: MailPrefs): void {
  try {
    localStorage.setItem(MAIL_KEY, JSON.stringify(prefs))
  } catch {
    // Same bargain as the draft: a forgotten address list is not worth a crash.
  }
}

export function loadMailPrefs(): MailPrefs {
  try {
    const raw = localStorage.getItem(MAIL_KEY)
    if (!raw) return { to: '', cc: '' }
    const parsed = JSON.parse(raw) as Partial<MailPrefs>
    return { to: parsed.to ?? '', cc: parsed.cc ?? '' }
  } catch {
    return { to: '', cc: '' }
  }
}
