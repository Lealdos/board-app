import { useEffect, useRef, useState } from 'react';
import {
    AlertTriangle,
    Download,
    Loader2,
    RotateCcw,
    Share2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { boardFileName, downloadBlob, formatBytes } from '@/lib/board-file';
import { defaultBody, defaultSubject, parseRecipients } from '@/lib/mail';
import { loadMailPrefs, saveMailPrefs } from '@/lib/storage';
import type { BoardLayout, BoardModel } from '@/lib/types';

interface SendEmailDialogProps {
    model: BoardModel;
    layout: BoardLayout;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

type RenderState = 'rendering' | 'ready' | 'error';

/**
 * Turns the curated board into a PDF and hands it to the user's own mail
 * client — there is no server in this app to send it for us.
 *
 * The PDF is built as soon as the dialog opens rather than on the send click,
 * because Safari only honours `navigator.share()` inside a user gesture and an
 * `await` in between spends it. By the time the buttons light up the file
 * already exists, so sharing is a straight synchronous call.
 */
export function SendEmailDialog({
    model,
    layout,
    open,
    onOpenChange,
}: SendEmailDialogProps) {
    const [file, setFile] = useState<File | null>(null);
    const [state, setState] = useState<RenderState>('rendering');
    const [error, setError] = useState<string | null>(null);
    const [attempt, setAttempt] = useState(0);

    const [to, setTo] = useState('');
    const [cc, setCc] = useState('');
    const [subject, setSubject] = useState('');
    const [message, setMessage] = useState('');

    // `layout` is a fresh object on every pass, so this only fires on the
    // closed -> open edge: a relayout while the dialog is up must not throw away
    // the addresses the user is halfway through typing.
    const wasOpen = useRef(false);
    useEffect(() => {
        if (open && !wasOpen.current) {
            const prefs = loadMailPrefs();
            setTo(prefs.to);
            setCc(prefs.cc);
            setSubject(defaultSubject(model));
            setMessage(defaultBody(model, layout.sheets.length));
        }
        wasOpen.current = open;
    }, [open, model, layout]);

    useEffect(() => {
        if (!open) return;
        const controller = new AbortController();
        setState('rendering');
        setError(null);
        setFile(null);

        const build = async () => {
            try {
                // Loaded on demand so jsPDF and html2canvas stay out of the initial bundle.
                const { renderBoardPdf } = await import('@/lib/board-pdf');
                const blob = await renderBoardPdf(model, layout, {
                    signal: controller.signal,
                });
                if (controller.signal.aborted) return;
                setFile(
                    new File([blob], boardFileName(model), {
                        type: 'application/pdf',
                    }),
                );
                setState('ready');
            } catch (cause) {
                if (controller.signal.aborted) return;
                console.error(cause);
                setError(
                    cause instanceof Error
                        ? cause.message
                        : 'Could not build the PDF.',
                );
                setState('error');
            }
        };
        build();

        // Closing the dialog stops the capture instead of letting a few seconds of
        // rasterising run on for nobody.
        return () => controller.abort();
    }, [open, model, layout, attempt]);

    const canShare =
        file !== null &&
        typeof navigator !== 'undefined' &&
        Boolean(navigator.canShare?.({ files: [file] }));

    const recipients = [...parseRecipients(to), ...parseRecipients(cc)].join(
        ', ',
    );

    /**
     * Must stay synchronous up to `share()`: the click is the permission, and an
     * `await` in between spends it on Safari.
     *
     * The share sheet takes the file and drops everything else — Mail opens with
     * an empty To field — so the addresses go to the clipboard on the way past.
     */
    const handleShare = () => {
        if (!file) return;
        saveMailPrefs({ to, cc });
        if (recipients)
            void navigator.clipboard?.writeText(recipients).catch(() => {});

        const failed = (cause: unknown) => {
            if (cause instanceof Error && cause.name === 'AbortError') return;
            console.error(cause);
            toast.error(
                'Sharing was not available. Download the PDF and attach it instead.',
            );
        };

        try {
            navigator
                .share({ files: [file], title: subject, text: message })
                .then(() => {
                    toast.success(
                        recipients
                            ? `${file.name} shared — recipients copied, paste them into To.`
                            : `${file.name} handed to your share sheet`,
                    );
                    onOpenChange(false);
                })
                .catch(failed);
        } catch (cause) {
            // Some engines reject the payload synchronously rather than rejecting.
            failed(cause);
        }
    };

    const handleDownload = () => {
        if (!file) return;
        saveMailPrefs({ to, cc });
        downloadBlob(file.name, file);
        toast.success(`${file.name} saved `);
        onOpenChange(false);
    };

    const sheetText =
        layout.sheets.length === 1
            ? '1 sheet'
            : `${layout.sheets.length} sheets`;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className='sm:max-w-lg'>
                <DialogHeader>
                    <DialogTitle>Email the board</DialogTitle>
                    <DialogDescription>
                        The PDF is built here in the browser and handed to your
                        mail client. Nothing is uploaded.
                    </DialogDescription>
                </DialogHeader>

                <div className='grid gap-3'>
                    <div className='grid gap-1.5'>
                        <Label htmlFor='mail-to'>To</Label>
                        <Input
                            id='mail-to'
                            type='text'
                            autoComplete='off'
                            placeholder='lobby@example.com, frontdesk@example.com'
                            value={to}
                            onChange={(event) => setTo(event.target.value)}
                        />
                    </div>
                    <div className='grid gap-1.5'>
                        <Label htmlFor='mail-cc'>Cc</Label>
                        <Input
                            id='mail-cc'
                            type='text'
                            autoComplete='off'
                            value={cc}
                            onChange={(event) => setCc(event.target.value)}
                        />
                    </div>
                    <div className='grid gap-1.5'>
                        <Label htmlFor='mail-subject'>Subject</Label>
                        <Input
                            id='mail-subject'
                            type='text'
                            value={subject}
                            onChange={(event) => setSubject(event.target.value)}
                        />
                    </div>
                    <div className='grid gap-1.5'>
                        <Label htmlFor='mail-message'>Message</Label>
                        <Textarea
                            id='mail-message'
                            rows={3}
                            value={message}
                            onChange={(event) => setMessage(event.target.value)}
                        />
                    </div>

                    {state === 'error' ? (
                        <Alert variant='destructive'>
                            <AlertTriangle className='size-4' />
                            <AlertTitle>Could not build the PDF</AlertTitle>
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    ) : (
                        <p className='flex items-center gap-2 text-sm text-muted-foreground'>
                            {state === 'rendering' ? (
                                <>
                                    <Loader2 className='size-4 animate-spin' />
                                    Preparing the PDF…
                                </>
                            ) : (
                                <>
                                    <span className='font-medium text-foreground'>
                                        {file?.name}
                                    </span>
                                    <span>
                                        · {sheetText} ·{' '}
                                        {formatBytes(file?.size ?? 0)}
                                    </span>
                                </>
                            )}
                        </p>
                    )}

                    {state === 'ready' ? (
                        <p className='text-xs text-muted-foreground'>
                            {canShare
                                ? 'Sharing attaches the PDF but leaves the recipients to you — they go to your clipboard, ready to paste. Downloading fills the draft in instead, and you drag the file across.'
                                : 'This browser cannot attach files for you. The PDF is downloaded and your mail client opens with the draft ready — drag the file in.'}
                        </p>
                    ) : null}
                </div>

                <DialogFooter>
                    {state === 'error' ? (
                        <Button
                            variant='outline'
                            onClick={() => setAttempt((count) => count + 1)}
                        >
                            <RotateCcw className='size-4' />
                            Try again
                        </Button>
                    ) : null}
                    <Button
                        variant='outline'
                        disabled={state !== 'ready'}
                        onClick={handleDownload}
                    >
                        <Download className='size-4' />
                        Download PDF
                    </Button>
                    {canShare ? (
                        <Button
                            disabled={state !== 'ready'}
                            onClick={handleShare}
                        >
                            <Share2 className='size-4' />
                            Share as attachment
                        </Button>
                    ) : null}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
