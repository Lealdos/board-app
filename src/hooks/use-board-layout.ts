import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { computeLayout } from '@/lib/board-layout'
import type { BoardLayout, BoardModel } from '@/lib/types'

/**
 * Recomputes the column split and font scale whenever the board changes.
 * The measuring node must be rendered inside a `.board` root so it inherits
 * the same CSS as the real sheet.
 */
export function useBoardLayout(model: BoardModel | null) {
  const measureRef = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState<BoardLayout | null>(null)
  const [fontsReady, setFontsReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    document.fonts?.ready.then(() => {
      if (!cancelled) setFontsReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useLayoutEffect(() => {
    const host = measureRef.current
    if (!model || !host) {
      setLayout(null)
      return
    }
    setLayout(computeLayout(model, host))
  }, [model, fontsReady])

  return { measureRef, layout }
}
