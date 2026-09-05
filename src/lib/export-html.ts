import boardCss from '../board/board.css?raw'
import { boardHtml, escapeHtml } from './board-html'
import type { BoardLayout, BoardModel } from './types'

export function boardTitle(model: BoardModel): string {
  return model.dateText ? `Daily Event Schedule - ${model.dateText}` : 'Daily Event Schedule'
}

/** "Sunday, September 6, 2026" -> "elevator-board-2026-09-06.html" */
export function boardFileName(model: BoardModel): string {
  const parsed = model.dateText ? new Date(model.dateText) : null
  if (parsed && !Number.isNaN(parsed.getTime())) {
    const iso = [
      parsed.getFullYear(),
      String(parsed.getMonth() + 1).padStart(2, '0'),
      String(parsed.getDate()).padStart(2, '0'),
    ].join('-')
    return `elevator-board-${iso}.html`
  }
  return 'elevator-board.html'
}

/** A standalone board file: same markup, styles inlined, nothing to load. */
export function exportStandaloneHtml(model: BoardModel, layout: BoardLayout): string {
  return `<!doctype html>
<html lang="en">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(boardTitle(model))}</title>
        <style>
            html { background-color: #e2e8f0; }
            body { margin: 0; padding: 16px 0; display: flex; flex-direction: column; align-items: center; }
            .board .sheet { box-shadow: 0 6px 24px rgba(15, 23, 42, 0.18); border-radius: 4px; }
            @media print {
                html { background: none; }
                body { margin: 0; padding: 0; display: block; }
                .board .sheet { box-shadow: none; border-radius: 0; }
            }
${boardCss}
        </style>
    </head>
    <body>
        <div class="board" style="--board-scale:${layout.scale}">
${boardHtml(model, layout)}
        </div>
    </body>
</html>
`
}

export function downloadFile(fileName: string, contents: string, type = 'text/html'): void {
  const blob = new Blob([contents], { type: `${type};charset=utf-8` })
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
