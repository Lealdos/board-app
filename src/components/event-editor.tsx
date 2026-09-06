import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { isTimeRange } from '@/lib/rbl-parser'
import type { BoardModel, EventRow } from '@/lib/types'

interface EventEditorProps {
  model: BoardModel
  onChange: (model: BoardModel) => void
}

export function EventEditor({ model, onChange }: EventEditorProps) {
  const updateEvent = (id: string, patch: Partial<EventRow>) => {
    onChange({
      ...model,
      events: model.events.map((event) => (event.id === id ? { ...event, ...patch } : event)),
    })
  }

  /** Moves a row within its own group; groups keep the report's order. */
  const move = (id: string, direction: -1 | 1) => {
    const index = model.events.findIndex((event) => event.id === id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= model.events.length) return
    if (model.events[index].groupId !== model.events[target].groupId) return
    const events = [...model.events]
    ;[events[index], events[target]] = [events[target], events[index]]
    onChange({ ...model, events })
  }

  const renameGroup = (groupId: string, name: string) => {
    onChange({
      ...model,
      groups: model.groups.map((group) => (group.id === groupId ? { ...group, name } : group)),
    })
  }

  const groupName = (groupId: string) =>
    model.groups.find((group) => group.id === groupId)?.name || 'Ungrouped events'

  /** Takes a whole section off the board without losing it: the rows stay here. */
  const setGroupHidden = (groupId: string, hidden: boolean) => {
    onChange({
      ...model,
      events: model.events.map((event) =>
        event.groupId === groupId ? { ...event, hidden } : event,
      ),
    })
  }

  /** Drops a section and its rows for good; the toast is the only way back. */
  const removeGroup = (groupId: string) => {
    const previous = model
    const removed = model.events.filter((event) => event.groupId === groupId).length
    onChange({
      ...model,
      groups: model.groups.filter((group) => group.id !== groupId),
      events: model.events.filter((event) => event.groupId !== groupId),
    })
    toast.success(`Removed ${groupName(groupId)}`, {
      description: removed === 1 ? '1 event' : `${removed} events`,
      action: { label: 'Undo', onClick: () => onChange(previous) },
    })
  }

  /** How much of each section is on the board, for the section checkbox. */
  const groupTotals = new Map<string, { total: number; shown: number }>()
  for (const event of model.events) {
    const total = groupTotals.get(event.groupId) ?? { total: 0, shown: 0 }
    total.total += 1
    if (!event.hidden) total.shown += 1
    groupTotals.set(event.groupId, total)
  }

  const rows: React.ReactNode[] = []
  let lastGroupId: string | null = null

  model.events.forEach((event, index) => {
    if (event.groupId !== lastGroupId) {
      lastGroupId = event.groupId
      const group = model.groups.find((candidate) => candidate.id === event.groupId)
      const totals = groupTotals.get(event.groupId) ?? { total: 0, shown: 0 }
      const name = groupName(event.groupId)
      rows.push(
        <TableRow key={`group-${event.groupId || index}`} className="bg-muted/60 hover:bg-muted/60">
          <TableCell className="w-10 py-2">
            <Checkbox
              checked={totals.shown === totals.total}
              indeterminate={totals.shown > 0 && totals.shown < totals.total}
              aria-label={`Show ${name} on board`}
              onCheckedChange={(checked) => setGroupHidden(event.groupId, !checked)}
            />
          </TableCell>
          <TableCell colSpan={4} className="py-2">
            <Input
              value={group?.name ?? ''}
              placeholder="No group heading"
              onChange={(e) => renameGroup(event.groupId, e.target.value)}
              className="h-8 border-transparent bg-transparent font-semibold uppercase tracking-wide shadow-none focus-visible:border-input focus-visible:bg-background"
            />
          </TableCell>
          <TableCell className="w-20 py-2">
            <Button
              size="icon"
              variant="ghost"
              className="size-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              aria-label={`Remove ${name}`}
              title={`Remove ${name} and its ${totals.total === 1 ? 'event' : 'events'}`}
              onClick={() => removeGroup(event.groupId)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </TableCell>
        </TableRow>,
      )
    }

    const previous = model.events[index - 1]
    const next = model.events[index + 1]
    const timeInvalid = !isTimeRange(`${event.start} - ${event.end}`)

    rows.push(
      <TableRow key={event.id} className={event.hidden ? 'opacity-45' : undefined}>
        <TableCell className="w-10">
          <Checkbox
            checked={!event.hidden}
            aria-label="Show on board"
            onCheckedChange={(checked) => updateEvent(event.id, { hidden: !checked })}
          />
        </TableCell>
        <TableCell className="w-28">
          <Input
            value={event.start}
            aria-label="Start time"
            aria-invalid={timeInvalid}
            onChange={(e) => updateEvent(event.id, { start: e.target.value.toUpperCase() })}
            className="h-8"
          />
        </TableCell>
        <TableCell className="w-28">
          <Input
            value={event.end}
            aria-label="End time"
            aria-invalid={timeInvalid}
            onChange={(e) => updateEvent(event.id, { end: e.target.value.toUpperCase() })}
            className="h-8"
          />
        </TableCell>
        <TableCell>
          <Input
            value={event.title}
            aria-label="Event title"
            onChange={(e) => updateEvent(event.id, { title: e.target.value })}
            className="h-8"
          />
        </TableCell>
        <TableCell className="w-44">
          <Input
            value={event.room}
            aria-label="Room"
            onChange={(e) => updateEvent(event.id, { room: e.target.value.toUpperCase() })}
            className="h-8"
          />
        </TableCell>
        <TableCell className="w-20">
          <div className="flex gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              aria-label="Move up"
              disabled={!previous || previous.groupId !== event.groupId}
              onClick={() => move(event.id, -1)}
            >
              <ArrowUp className="size-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              aria-label="Move down"
              disabled={!next || next.groupId !== event.groupId}
              onClick={() => move(event.id, 1)}
            >
              <ArrowDown className="size-3.5" />
            </Button>
          </div>
        </TableCell>
      </TableRow>,
    )
  })

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="board-date">Date</Label>
          <Input
            id="board-date"
            value={model.dateText}
            onChange={(e) => onChange({ ...model, dateText: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="board-property">Property</Label>
          <Input
            id="board-property"
            value={model.property}
            onChange={(e) => onChange({ ...model, property: e.target.value })}
          />
        </div>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">On</TableHead>
              <TableHead>Start</TableHead>
              <TableHead>End</TableHead>
              <TableHead>Event</TableHead>
              <TableHead>Room</TableHead>
              <TableHead className="w-20">Order</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>{rows}</TableBody>
        </Table>
      </div>
    </div>
  )
}
