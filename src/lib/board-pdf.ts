import { boardHtml, boardTitle } from './board-html'
import type { BoardLayout, BoardModel } from './types'

/** 2x of a 216mm sheet is ~1632px across: 192dpi, sharp and still mailable. */
const CAPTURE_SCALE = 2
/** Flat fills and short text runs: JPEG saves a third over PNG, seam-free. */
const JPEG_QUALITY = 0.92
/** Letter, in the millimetres the document is set up with. */
const PAGE_WIDTH_MM = 215.9
const PAGE_HEIGHT_MM = 279.4
/** White like the printed sheet — see `.board-capture .sheet` in board.css. */
const SHEET_BACKGROUND = '#ffffff'

/**
 * The board as a letter-sized PDF, one page per sheet.
 *
 * The sheets are rasterised rather than laid out a second time in PDF
 * coordinates: board-html.ts and board.css stay the only description of the
 * board, so the attachment cannot drift from the preview or the printout.
 *
 * The capture runs against a fresh off-screen copy instead of the preview,
 * which lives inside the `transform: scale()` of `.board-scaler` — html2canvas
 * reads a transformed ancestor as part of the geometry and crops the page.
 */
export async function renderBoardPdf(
  model: BoardModel,
  layout: BoardLayout,
  options: { signal?: AbortSignal } = {},
): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas-pro'),
    import('jspdf'),
  ])

  const host = document.createElement('div')
  host.className = 'board board-capture'
  host.style.setProperty('--board-scale', String(layout.scale))
  host.innerHTML = boardHtml(model, layout)
  document.body.appendChild(host)

  try {
    // Same guard as the layout pass: measuring or capturing before the fonts
    // settle bakes the fallback metrics into the page.
    await document.fonts?.ready

    const sheets = [...host.querySelectorAll<HTMLElement>('.sheet')]
    if (sheets.length === 0) throw new Error('The board has no sheets to render.')

    const doc = new jsPDF({
      unit: 'mm',
      format: 'letter',
      orientation: 'portrait',
      compress: true,
    })
    doc.setProperties({ title: boardTitle(model), creator: 'Elevator Board' })

    for (const [index, sheet] of sheets.entries()) {
      const canvas = await html2canvas(sheet, {
        scale: CAPTURE_SCALE,
        backgroundColor: SHEET_BACKGROUND,
        logging: false,
        signal: options.signal,
      })
      if (index > 0) doc.addPage()
      doc.addImage(
        canvas.toDataURL('image/jpeg', JPEG_QUALITY),
        'JPEG',
        0,
        0,
        PAGE_WIDTH_MM,
        PAGE_HEIGHT_MM,
      )
      // Two sheets hold ~14MB of pixels each; a phone will not survive keeping
      // them around until the garbage collector gets curious.
      canvas.width = 0
      canvas.height = 0
    }

    return doc.output('blob')
  } finally {
    host.remove()
  }
}
