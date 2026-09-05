import * as pdfjs from 'pdfjs-dist'
import type { TextItem } from 'pdfjs-dist/types/src/display/api'
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker'
import type { PdfPageText, PdfTextItem } from './types'

// Bundled worker, so the app stays self-contained on any static host.
pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker()

/**
 * Reads every text run of a PDF with its position, in top-left origin points.
 * The report is text-only, so no rendering or fonts are needed.
 */
export async function extractPdfText(data: ArrayBuffer): Promise<PdfPageText[]> {
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(data),
    useSystemFonts: false,
  })
  const doc = await loadingTask.promise

  try {
    const pages: PdfPageText[] = []
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 1 })
      const content = await page.getTextContent()
      const items: PdfTextItem[] = []
      for (const raw of content.items) {
        const item = raw as TextItem
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
    return pages
  } finally {
    await loadingTask.destroy()
  }
}
