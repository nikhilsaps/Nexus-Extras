import { useEffect, useRef, useState } from 'react'
import { Chessboard } from 'react-chessboard'
import { BOARD_THEMES } from '../config.js'

// Thin wrapper over react-chessboard (v4). Handles responsive sizing, the
// hint/guidance arrow, display settings, and forwards drops as (from, to).
//
// `display` is an optional settings bundle:
//   { boardTheme, boardSize, showCoordinates, highlightLegal, animationMs, highlightLast }
const SIZE_CAP = { fit: 720, large: 640, medium: 520, small: 420 }

export default function Board({ fen, orientation, onMove, hint, interactive, display = {}, squareStyles }) {
  const wrapRef = useRef(null)
  const [width, setWidth] = useState(480)
  const cap = SIZE_CAP[display.boardSize] ?? 720

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => {
      const w = el.clientWidth || el.getBoundingClientRect().width
      if (w > 0) setWidth(Math.max(260, Math.min(cap, Math.floor(w))))
    }
    measure()
    const raf = requestAnimationFrame(measure)
    const ro = new ResizeObserver(() => measure())
    ro.observe(el)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [cap])

  function handleDrop(sourceSquare, targetSquare, piece) {
    const promotion = piece && piece[1] ? piece[1].toLowerCase() : 'q'
    return onMove(sourceSquare, targetSquare, promotion)
  }

  const theme = BOARD_THEMES[display.boardTheme] ?? BOARD_THEMES.blue
  const arrows = hint ? [[hint.from, hint.to, '#3b82c4']] : []

  return (
    <div className="board-wrap" ref={wrapRef}>
      <Chessboard
        position={fen}
        boardOrientation={orientation}
        onPieceDrop={handleDrop}
        boardWidth={width}
        arePiecesDraggable={interactive}
        customArrows={arrows}
        customSquareStyles={squareStyles || undefined}
        animationDuration={display.animationMs ?? 200}
        showBoardNotation={display.showCoordinates !== false}
        customBoardStyle={{
          borderRadius: '8px',
          boxShadow: '0 6px 18px rgba(15, 23, 42, 0.12)',
        }}
        customDarkSquareStyle={{ backgroundColor: theme.dark }}
        customLightSquareStyle={{ backgroundColor: theme.light }}
      />
    </div>
  )
}
