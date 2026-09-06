import { useRef, useState } from 'react'
import { FileText, Loader2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface DropZoneProps {
  onFile: (file: File) => void
  busy?: boolean
  className?: string
}

export function DropZone({ onFile, busy = false, className }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0]
    if (file) onFile(file)
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop is a pointer-only affordance; the "Choose PDF" button and file input cover keyboard users.
    <div
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        handleFiles(event.dataTransfer.files)
      }}
      className={cn(
        'flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-12 text-center transition-colors',
        dragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25',
        className,
      )}
    >
      {busy ? (
        <Loader2 className="size-10 animate-spin text-muted-foreground" />
      ) : (
        <div className="rounded-full bg-muted p-4">
          <FileText className="size-8 text-muted-foreground" />
        </div>
      )}
      <div className="space-y-1">
        <p className="text-lg font-semibold">Drop the RBL report here</p>
        <p className="text-sm text-muted-foreground">
          The PDF is read in your browser. Nothing is uploaded anywhere.
        </p>
      </div>
      <Button onClick={() => inputRef.current?.click()} disabled={busy}>
        <Upload className="size-4" />
        Choose PDF
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(event) => {
          handleFiles(event.target.files)
          event.target.value = ''
        }}
      />
    </div>
  )
}
