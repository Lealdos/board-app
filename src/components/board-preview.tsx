import type { RefObject } from 'react'
import { boardHtml } from '@/lib/board-html'
import type { BoardLayout, BoardModel } from '@/lib/types'

interface BoardPreviewProps {
  model: BoardModel | null
  layout: BoardLayout | null
  measureRef: RefObject<HTMLDivElement | null>
}

/**
 * The printable board. It is written as HTML rather than JSX so that the exact
 * same markup builder feeds the preview, the hidden measuring pass and the
 * exported standalone file — the print layout can't drift between them.
 */
export function BoardPreview({ model, layout, measureRef }: BoardPreviewProps) {
  return (
    <div className="board" style={{ ['--board-scale' as string]: layout?.scale ?? 1 }}>
      {/* Filled in imperatively by the layout pass. */}
      <div ref={measureRef} className="board-measure" aria-hidden />
      {model && layout ? (
        <div
          className="board-sheets"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: boardHtml() builds the sheet from parsed PDF data and escapes every interpolation via escapeHtml().
          dangerouslySetInnerHTML={{ __html: boardHtml(model, layout) }}
        />
      ) : null}
    </div>
  )
}
