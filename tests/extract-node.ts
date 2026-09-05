import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { PdfPageText, PdfTextItem } from '../src/lib/types'

/**
 * Same extraction as src/lib/pdf-text.ts, but against the legacy build so it
 * runs under Bun (no DOM, no worker). Kept separate so the app bundle stays on
 * the modern build with a bundled worker.
 */
export async function extractPdfTextNode(path: string): Promise<PdfPageText[]> {
  const data = new Uint8Array(await Bun.file(path).arrayBuffer())
  const loadingTask = pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: false })
  const doc = await loadingTask.promise
  const pages: PdfPageText[] = []
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber)
    const viewport = page.getViewport({ scale: 1 })
    const content = await page.getTextContent()
    const items: PdfTextItem[] = []
    for (const raw of content.items) {
      const item = raw as { str?: string; transform: number[] }
      if (!item.str) continue
      items.push({
        text: item.str,
        x: item.transform[4],
        y: viewport.height - item.transform[5],
        fontSize: Math.abs(item.transform[0]),
        page: pageNumber,
      })
    }
    pages.push({ page: pageNumber, width: viewport.width, height: viewport.height, items })
  }
  await loadingTask.destroy()
  return pages
}
