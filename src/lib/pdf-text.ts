import * as pdfjs from 'pdfjs-dist'
import type { PDFPageProxy, TextContent, TextItem } from 'pdfjs-dist/types/src/display/api'
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker'
import type { PdfPageText, PdfTextItem } from './types'

// Bundled worker, so the app stays self-contained on any static host.
pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker()

/**
 * `page.getTextContent()` drains its stream with `for await`, and Safari's
 * ReadableStream is not async-iterable ("undefined is not a function"), so the
 * stream is read chunk by chunk instead.
 */
async function readTextItems(page: PDFPageProxy): Promise<TextContent['items']> {
  const reader = page.streamTextContent().getReader()
  const items: TextContent['items'] = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return items
    items.push(...(value as TextContent).items)
  }
}

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
      const items: PdfTextItem[] = []
      for (const raw of await readTextItems(page)) {
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
