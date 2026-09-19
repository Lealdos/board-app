# Elevator Board

Turns the daily RBL report (the PDF from the event system) into the printable
lobby board, in the browser. Drop the PDF in, fix anything that needs fixing,
print it or send it out by email.

Everything runs client-side: the PDF is read in the browser and never uploaded,
so guest and client data stays on the machine that opened the page.

## Running it

```sh
bun install
bun run dev      # http://localhost:5173
bun test         # parser tests against the sample reports
bun run build    # static site in dist/
bun run lint     # biome (bun run lint:fix applies the safe fixes)
```

## Deploying

`bun run build` writes a plain static site to `dist/` — no backend, no env
vars. Upload the contents anywhere (Netlify drop, S3 + CloudFront, nginx,
GitHub Pages). `vite.config.ts` sets `base: './'`, so it also works from a
subdirectory. Serve it over HTTPS so the saved draft (localStorage) and
printing behave the same in every browser.

## How it works

| File | Job |
| --- | --- |
| `src/lib/pdf-text.ts` | pdf.js text extraction, worker bundled with the app |
| `src/lib/rbl-parser.ts` | positioned text → `BoardModel`; no DOM, unit tested |
| `src/lib/board-html.ts` | the board markup, shared by preview, measuring and printing |
| `src/lib/board-layout.ts` | column split, one shared row height, font auto-fit |
| `src/lib/board-pdf.ts` | the same markup rasterised into a letter PDF (loaded on demand) |
| `src/lib/mail.ts` | the mailto: draft: recipients, subject, body |
| `src/board/board.css` | the printed sheet (plain CSS, millimetres) |
| `src/components/*` | editor UI (React + shadcn/ui) |

### Curating the board

Rows are toggled off the printed board with the `On` checkbox and stay in the
editor. The same checkbox on a section heading applies to the whole group — it
shows a dash while only part of the section is on the board — and hiding every
row in a group also drops its heading band from the sheet. The trash button on
the heading removes the section and its events outright; the toast that follows
carries the only undo.

### Emailing the board

`Email board` builds the PDF in the browser — the same `board-html.ts` markup and
`board.css` the preview and the printout use, captured sheet by sheet — and then
hands it to whatever mail client the machine already has. There is still no
server in the loop.

How it gets attached depends on the browser, and neither route carries
everything. Where `navigator.canShare()` takes files (Safari, Chrome on most
platforms), `Share as attachment` passes the PDF straight to the system share
sheet and it lands in the draft — but the sheet drops the addresses, so they go
to the clipboard on the way past, ready to paste. `Download & open email` is the
mirror image: `mailto:` fills in recipients, subject and body but cannot carry a
file, so the PDF is saved and the last drag is manual. Recipients are remembered
in localStorage next to the board draft.

The captured sheet follows the *printed* board, not the on-screen preview: the
preview's slate page and rounded corners would reach the recipient as a
full-bleed grey page, and a lobby board exists to be printed.

The PDF is a 192dpi image of each sheet rather than PDF text. That keeps
`board-layout.ts` the only thing that decides where a row goes, at the cost of
selectable text; `CAPTURE_SCALE` and `JPEG_QUALITY` at the top of `board-pdf.ts`
are the two knobs if the attachment comes out too heavy.

### Reading the report

The report comes out of BIRT Report Engine with fixed geometry, so parsing is
positional rather than guesswork:

| Element | x | font size |
| --- | --- | --- |
| Property (`COLUMBUS HR`) | centered | 22 |
| Date / group heading | centered | 16 |
| Time (`07:00 AM - 06:00 PM`) | 28 | 13 |
| Event title (may wrap over 2–3 lines) | 211 | 13 |
| Room | 414 | 13 |

Titles that wrap put lines above and below their time, but rows are ≥ 35pt
apart and title lines only 15pt, so each line attaches to its nearest time
anchor. A group heading keeps applying across page breaks — the repeated
property/date header at the top of page 2 is ignored. All of the thresholds
live in `LAYOUT_HINTS` at the top of `src/lib/rbl-parser.ts`; if the report
template ever changes, that is the only place to edit.

### Laying out the board

Every row on a sheet gets the same height, so both columns land on one baseline
grid. The layout pass measures real rows in an off-screen sheet, then:

1. finds the largest type scale where no title word has to be broken mid-word,
2. binary-searches the column split that evens out the two columns,
3. shrinks the scale until it fits (down to 0.72),
4. and only then starts a second sheet, repeating the header.

A group split across columns gets its band repeated with `(cont.)`, and a band
is never left stranded at the bottom of a column.

## Tests

`tests/rbl-parser.test.ts` runs the parser against two real reports in
`tests/fixtures/`: a single-group day (22 events) and a five-group day that
spans two pages with multi-line titles (23 events). They use the pdf.js legacy
build (`tests/extract-node.ts`) because Bun has no DOM or worker.
