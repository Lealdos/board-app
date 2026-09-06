import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from 'react';
import { AlertTriangle, Printer, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { BoardPreview } from '@/components/board-preview';
import { DropZone } from '@/components/drop-zone';
import { EventEditor } from '@/components/event-editor';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Toaster } from '@/components/ui/sonner';
import { useBoardLayout } from '@/hooks/use-board-layout';
import { visibleEvents } from '@/lib/board-html';
import { boardTitle } from '@/lib/export-html';
import { extractPdfText } from '@/lib/pdf-text';
import { buildModel } from '@/lib/rbl-parser';
import { loadModel, saveModel } from '@/lib/storage';
import type { BoardModel } from '@/lib/types';
import './board/board.css';

/** Width of a letter sheet at 96dpi; the preview scales down to fit its pane. */
const SHEET_WIDTH_PX = 816;

export default function App() {
    const [model, setModel] = useState<BoardModel | null>(() => loadModel());
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { measureRef, layout } = useBoardLayout(model);

    const paneRef = useRef<HTMLDivElement>(null);
    const [previewScale, setPreviewScale] = useState(1);

    useEffect(() => {
        saveModel(model);
        document.title = model ? boardTitle(model) : 'Elevator Board';
    }, [model]);

    useLayoutEffect(() => {
        const pane = paneRef.current;
        if (!pane) return;
        const observer = new ResizeObserver(() => {
            setPreviewScale(Math.min(1, pane.clientWidth / SHEET_WIDTH_PX));
        });
        observer.observe(pane);
        return () => observer.disconnect();
    }, [model]);

    const handleFile = useCallback(async (file: File) => {
        setBusy(true);
        setError(null);
        try {
            const pages = await extractPdfText(await file.arrayBuffer());
            const parsed = buildModel(pages, file.name);
            if (parsed.events.length === 0) {
                setError(
                    `No events found in "${file.name}". Is it an RBL report?`,
                );
                return;
            }
            setModel(parsed);
            toast.success(
                `Loaded ${parsed.events.length} events from ${file.name}`,
            );
        } catch (cause) {
            console.error(cause);
            setError(
                cause instanceof Error
                    ? cause.message
                    : 'Could not read that PDF.',
            );
        } finally {
            setBusy(false);
        }
    }, []);

    const shownCount = model ? visibleEvents(model).length : 0;
    const hiddenCount = model ? model.events.length - shownCount : 0;

    return (
        <div className='min-h-screen bg-muted/30'>
            <Toaster position='top-center' />

            <header className='app-chrome sticky top-0 z-10 border-b bg-background/95 backdrop-blur'>
                <div className='mx-auto flex max-w-[1800px] items-center gap-4 px-6 py-3'>
                    <div className='min-w-0'>
                        <h1 className='truncate text-lg font-semibold'>
                            Elevator Board
                        </h1>
                        <p className='truncate text-sm text-muted-foreground'>
                            {model
                                ? `${model.dateText || 'No date'} · ${model.property || 'No property'}`
                                : 'Turn the daily RBL report into a printable lobby board'}
                        </p>
                    </div>
                    {model ? (
                        <div className='ml-auto flex items-center gap-2'>
                            <Badge variant='secondary'>
                                {shownCount} shown
                            </Badge>
                            {hiddenCount > 0 ? (
                                <Badge variant='outline'>
                                    {hiddenCount} hidden
                                </Badge>
                            ) : null}
                            {layout ? (
                                <Badge variant='outline'>
                                    {layout.sheets.length === 1
                                        ? '1 sheet'
                                        : `${layout.sheets.length} sheets`}{' '}
                                    · {Math.round(layout.scale * 100)}%
                                </Badge>
                            ) : null}
                            <Separator
                                orientation='vertical'
                                className='mx-1 h-6'
                            />
                            <Button
                                size='sm'
                                onClick={() => window.print()}
                                disabled={!layout}
                            >
                                <Printer className='size-4' />
                                Print / Save PDF
                            </Button>
                            <Button
                                variant='ghost'
                                size='sm'
                                onClick={() => {
                                    setModel(null);
                                    setError(null);
                                }}
                            >
                                <RotateCcw className='size-4' />
                                Start over
                            </Button>
                        </div>
                    ) : null}
                </div>
            </header>

            <main className='mx-auto max-w-[1800px] px-6 py-6'>
                {!model ? (
                    <div className='app-chrome mx-auto max-w-2xl space-y-4 py-12'>
                        <DropZone onFile={handleFile} busy={busy} />
                        {error ? (
                            <Alert variant='destructive'>
                                <AlertTriangle className='size-4' />
                                <AlertTitle>
                                    Could not read that file
                                </AlertTitle>
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        ) : null}
                    </div>
                ) : (
                    <div className='grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'>
                        <div className='app-chrome space-y-4'>
                            {model.warnings.length > 0 ? (
                                <Alert>
                                    <AlertTriangle className='size-4' />
                                    <AlertTitle>
                                        Check these before printing
                                    </AlertTitle>
                                    <AlertDescription>
                                        <ul className='list-disc space-y-0.5 pl-4'>
                                            {model.warnings
                                                .slice(0, 6)
                                                .map((warning) => (
                                                    <li key={warning}>
                                                        {warning}
                                                    </li>
                                                ))}
                                        </ul>
                                    </AlertDescription>
                                </Alert>
                            ) : null}
                            {layout?.overflowed ? (
                                <Alert>
                                    <AlertTriangle className='size-4' />
                                    <AlertTitle>
                                        Split across {layout.sheets.length}{' '}
                                        sheets
                                    </AlertTitle>
                                    <AlertDescription>
                                        Too many events to stay readable on one
                                        page. Hide rows to pull it back to one
                                        sheet.
                                    </AlertDescription>
                                </Alert>
                            ) : null}
                            <EventEditor model={model} onChange={setModel} />
                        </div>

                        <div ref={paneRef} className='board-pane'>
                            <div
                                className='board-viewport'
                                style={{
                                    height: layout
                                        ? `${layout.sheets.length * 1056 * previewScale + 32}px`
                                        : undefined,
                                }}
                            >
                                <div
                                    className='board-scaler'
                                    style={{
                                        transform: `scale(${previewScale})`,
                                        width: SHEET_WIDTH_PX,
                                    }}
                                >
                                    <BoardPreview
                                        model={model}
                                        layout={layout}
                                        measureRef={measureRef}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
