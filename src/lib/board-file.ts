import type { BoardModel } from './types'

/** "Sunday, September 6, 2026" -> "elevator-board-2026-09-06.pdf" */
export function boardFileName(model: BoardModel, ext = 'pdf'): string {
  const parsed = model.dateText ? new Date(model.dateText) : null
  if (parsed && !Number.isNaN(parsed.getTime())) {
    const iso = [
      parsed.getFullYear(),
      String(parsed.getMonth() + 1).padStart(2, '0'),
      String(parsed.getDate()).padStart(2, '0'),
    ].join('-')
    return `elevator-board-${iso}.${ext}`
  }
  return `elevator-board.${ext}`
}

/** "640 KB", for the line that tells the user how big the attachment is. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${Math.round(kb)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

/** Hands a generated file to the browser's downloader. */
export function downloadBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Give the browser a tick to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
