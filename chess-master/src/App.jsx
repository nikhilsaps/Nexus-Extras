import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import Engine from './engine.js'
import * as storage from './storage.js'
import * as coach from './coach.js'
import Board from './components/Board.jsx'
import EvalBar from './components/EvalBar.jsx'
import Controls from './components/Controls.jsx'
import CoachPanel from './components/CoachPanel.jsx'
import ReviewPanel from './components/ReviewPanel.jsx'
import MoveList from './components/MoveList.jsx'
import RatingCard from './components/RatingCard.jsx'
import EngineThinking from './components/EngineThinking.jsx'
import LearnPractice from './components/LearnPractice.jsx'
import ExploreOpenings from './components/ExploreOpenings.jsx'
import TrapsTrainer from './components/TrapsTrainer.jsx'
import PuzzleTrainer from './components/PuzzleTrainer.jsx'
import AnalysisSandbox from './components/AnalysisSandbox.jsx'
import QuantumChess from './components/QuantumChess.jsx'
import SettingsView from './components/SettingsView.jsx'
import { buildDefaults, migrateSettings, PERSONALITIES } from './config.js'
import { random960Standard } from './variants.js'
import { toast, toastSuccess, toastDanger } from './toast.js'

const DEFAULTS = buildDefaults()
const BLUNDER_SHALLOW_DEPTH = 10 // cheap check after each player move

// Pull the display-related settings into the bundle Board.jsx expects.
function displayFrom(s) {
  return {
    boardTheme: s.boardTheme,
    boardSize: s.boardSize,
    showCoordinates: s.showCoordinates,
    highlightLegal: s.highlightLegal,
    animationMs: s.animationMs,
  }
}

// Resolve what a pawn promotes to, honoring the autoPromote setting.
function resolvePromotion(setting, requested) {
  if (setting && setting !== 'ask') return setting
  return requested || 'q'
}

export default function App() {
  const gameRef = useRef(new Chess())
  const playEngineRef = useRef(null) // opponent (respects strength)
  const analysisEngineRef = useRef(null) // full-strength, for thinking panel
  const acplRef = useRef({ sumCpl: 0, count: 0, acpl: 0 })
  const analysisHandleRef = useRef(null)

  const [mode, setMode] = useState('play') // play | learn | settings
  const [learnTab, setLearnTab] = useState('coached') // coached | explore
  const [tacticsTab, setTacticsTab] = useState('traps') // traps | puzzles
  const [engines, setEngines] = useState(null) // { play, analysis } once ready
  const fileInputRef = useRef(null) // hidden input for data import
  const [fen, setFen] = useState(gameRef.current.fen())
  const [history, setHistory] = useState([])
  const [settings, setSettings] = useState(DEFAULTS)
  const [thinking, setThinking] = useState(false)
  const [evalInfo, setEvalInfo] = useState({ scoreCp: 0, mateIn: null })
  const [hint, setHint] = useState(null)
  const [lastReview, setLastReview] = useState(null)
  const [evalTrace, setEvalTrace] = useState([])
  const [tab, setTab] = useState('play') // play | coach | analysis | review
  const [analysisInfo, setAnalysisInfo] = useState(null)
  const [analysisRunning, setAnalysisRunning] = useState(false)
  const [syncStatus, setSyncStatus] = useState('ready')
  const [engineReady, setEngineReady] = useState(false)
  const [stats, setStats] = useState({ wins: 0, losses: 0, draws: 0 })
  const [rating, setRating] = useState({ elo: null, lastGameElo: null, acpl: null })

  const game = gameRef.current

  // --- Engines -----------------------------------------------------------------
  useEffect(() => {
    const play = new Engine()
    playEngineRef.current = play
    play.whenReady().then(() => {
      play.newGame()
      play.applyTuning(DEFAULTS, PERSONALITIES)
      setEngineReady(true)
    })
    const analysis = new Engine()
    analysisEngineRef.current = analysis
    analysis.whenReady().then(() => {
      analysis.setAnalysisStrength()
      setEngines({ play, analysis })
    })
    return () => {
      play.destroy()
      analysis.destroy()
    }
  }, [])

  useEffect(() => {
    const applyLoaded = (p) => {
      if (!p) return
      const merged = migrateSettings(p)
      setSettings(merged)
      // Push tuning to the play engine once settings load.
      playEngineRef.current?.whenReady().then(() => playEngineRef.current.applyTuning(merged, PERSONALITIES))
    }
    storage.load('settings', { onRemote: applyLoaded }).then(applyLoaded)
    storage.load('stats', { onRemote: (p) => p && setStats(p) }).then((p) => p && setStats(p))
    storage.load('rating', { onRemote: (p) => p && setRating(p) }).then((p) => p && setRating(p))
  }, [])

  const syncFromGame = useCallback(() => {
    setFen(game.fen())
    setHistory(game.history({ verbose: true }))
  }, [game])

  // --- Light eval for the bar + hint (play engine, shallow) --------------------
  const refreshEval = useCallback(async () => {
    if (!settings.teaching || game.isGameOver()) {
      setHint(null)
      return
    }
    const engine = analysisEngineRef.current
    await engine.whenReady()
    const res = await engine.evaluate(game.fen(), { depth: Math.min(14, settings.analysisDepth) })
    const sign = game.turn() === 'w' ? 1 : -1
    setEvalInfo({ scoreCp: res.scoreCp * sign, mateIn: res.mateIn == null ? null : res.mateIn * sign })
    if (settings.showHints && res.bestMove && res.bestMove.length >= 4) {
      setHint({ from: res.bestMove.slice(0, 2), to: res.bestMove.slice(2, 4) })
    } else {
      setHint(null)
    }
  }, [settings.teaching, settings.showHints, settings.analysisDepth, game])

  // --- Rating + stats ----------------------------------------------------------
  const recordResult = useCallback((result) => {
    // Floating result notification.
    if (result === 'win') toastSuccess('You won the game!', 'Checkmate')
    else if (result === 'loss') toast('The engine won this one.', 'Game over', { variant: 'warning' })
    else toast('The game is a draw.', 'Game over')

    setStats((prev) => {
      const next = { ...prev }
      if (result === 'win') next.wins += 1
      else if (result === 'loss') next.losses += 1
      else next.draws += 1
      storage.save('stats', next).then(setSyncStatus)
      return next
    })
    const acc = acplRef.current
    if (acc.count > 0) {
      const gameElo = coach.acplToElo(acc.acpl)
      setRating((prev) => {
        const next = { elo: coach.blendRating(prev.elo, gameElo), lastGameElo: gameElo, acpl: Math.round(acc.acpl) }
        storage.save('rating', next).then(setSyncStatus)
        return next
      })
    }
  }, [])

  const checkGameOver = useCallback(() => {
    if (!game.isGameOver()) return false
    let result = 'draw'
    if (game.isCheckmate()) {
      const loserIsPlayer = game.turn() === settings.playerColor
      result = loserIsPlayer ? 'loss' : 'win'
    }
    recordResult(result)
    setTab('review')
    return true
  }, [game, settings.playerColor, recordResult])

  // --- Engine (opponent) move --------------------------------------------------
  const makeEngineMove = useCallback(async () => {
    const engine = playEngineRef.current
    if (!engine || game.isGameOver()) return
    setThinking(true)
    await engine.whenReady()
    const uci = await engine.getBestMove(game.fen(), { movetime: settings.movetime })
    setThinking(false)
    if (!uci) return
    try {
      game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
    } catch {
      return
    }
    syncFromGame()
    if (!checkGameOver()) refreshEval()
  }, [game, settings.movetime, syncFromGame, checkGameOver, refreshEval])

  // --- Player move: cheap blunder-only coaching (not every-move deep eval) -----
  const onPlayerMove = useCallback(
    async (from, to, requestedPromotion = 'q') => {
      if (thinking) return false
      if (game.turn() !== settings.playerColor) return false
      const promotion = resolvePromotion(settings.autoPromote, requestedPromotion)

      const fenBefore = game.fen()
      const engine = analysisEngineRef.current

      // Shallow "best move" snapshot BEFORE moving (cheap) for blunder detection.
      let before = null
      if (settings.teaching) {
        await engine.whenReady()
        before = await engine.evaluate(fenBefore, { depth: BLUNDER_SHALLOW_DEPTH })
      }

      let moved
      try {
        moved = game.move({ from, to, promotion })
      } catch {
        return false
      }
      if (!moved) return false
      syncFromGame()
      setHint(null)

      if (settings.teaching && before) {
        const after = await engine.evaluate(game.fen(), { depth: BLUNDER_SHALLOW_DEPTH })
        const playerSign = settings.playerColor === 'w' ? 1 : -1
        const beforePlayer = before.scoreCp * (fenBeforeTurn(fenBefore) === 'w' ? 1 : -1) * playerSign
        const afterWhite = after.scoreCp * (game.turn() === 'w' ? 1 : -1)
        const afterPlayer = afterWhite * playerSign
        const cpl = Math.max(0, beforePlayer - afterPlayer)

        acplRef.current = coach.updateAcpl(acplRef.current, cpl)
        setRating((r) => ({ ...r, acpl: Math.round(acplRef.current.acpl) }))
        setEvalInfo({ scoreCp: afterWhite, mateIn: after.mateIn == null ? null : after.mateIn * (game.turn() === 'w' ? 1 : -1) })
        setEvalTrace((t) => [...t, { ply: game.history().length, cpWhite: afterWhite }])

        // Only speak up when the move is at least as bad as the sensitivity.
        if (cpl >= settings.blunderSensitivity) {
          const classification = coach.classifyByCpl(cpl)
          const reason = coach.explainMove({ played: moved, fenBefore, bestUci: before.bestMove, cpl, classification })
          const pvSan = before.pv ? coach.pvToSan(fenBefore, before.pv, 5) : ''
          setLastReview({ san: moved.san, classification, cpl: Math.round(cpl), reason, pvSan })
          setTab('coach')
        } else {
          setLastReview(null)
        }
      }

      if (!checkGameOver()) setTimeout(makeEngineMove, 200)
      return true
    },
    [game, thinking, settings.playerColor, settings.teaching, settings.autoPromote, settings.blunderSensitivity, syncFromGame, checkGameOver, makeEngineMove],
  )

  // --- Live analysis (the "how Stockfish thinks" panel) ------------------------
  const toggleAnalysis = useCallback(() => {
    const engine = analysisEngineRef.current
    if (analysisRunning) {
      analysisHandleRef.current?.stop()
      analysisHandleRef.current = null
      setAnalysisRunning(false)
      return
    }
    setAnalysisInfo(null)
    setAnalysisRunning(true)
    setTab('analysis')
    engine.whenReady().then(() => {
      analysisHandleRef.current = engine.analyze(game.fen(), {
        multiPV: settings.multiPV,
        depth: Math.max(settings.analysisDepth, 18),
        onUpdate: (info) => setAnalysisInfo(info),
        onBestMove: () => setAnalysisRunning(false),
      })
    })
  }, [analysisRunning, game, settings.multiPV, settings.analysisDepth])

  // Stop any running analysis when the position changes.
  useEffect(() => {
    if (analysisHandleRef.current) {
      analysisHandleRef.current.stop()
      analysisHandleRef.current = null
      setAnalysisRunning(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen])

  // --- New game / undo / settings ----------------------------------------------
  const newGame = useCallback(
    (playerColor = settings.playerColor) => {
      if (settings.confirmNewGame && history.length > 0 && !game.isGameOver()) {
        if (!window.confirm('Start a new game? The current game will be lost.')) return
      }
      // Decide the starting position: custom FEN > Freestyle 960 > standard.
      let started = false
      if (settings.startFen && settings.startFen.trim()) {
        try {
          game.load(settings.startFen.trim())
          started = true
        } catch {
          started = false
        }
      }
      if (!started && settings.freestyle960) {
        try {
          game.load(random960Standard())
          started = true
        } catch {
          started = false
        }
      }
      if (!started) game.reset()
      playEngineRef.current?.newGame()
      playEngineRef.current?.setChess960(!!settings.freestyle960)
      playEngineRef.current?.applyTuning(settings, PERSONALITIES)
      acplRef.current = { sumCpl: 0, count: 0, acpl: 0 }
      syncFromGame()
      setEvalInfo({ scoreCp: 0, mateIn: null })
      setHint(null)
      setLastReview(null)
      setEvalTrace([])
      setTab('play')
      const next = { ...settings, playerColor }
      setSettings(next)
      storage.save('settings', next).then(setSyncStatus)
      if (playerColor === 'b') setTimeout(makeEngineMove, 300)
      else refreshEval()
    },
    [game, settings, history.length, syncFromGame, makeEngineMove, refreshEval],
  )

  const undo = useCallback(() => {
    if (!settings.allowTakebacks || thinking || history.length < 2) return
    game.undo()
    game.undo()
    syncFromGame()
    setLastReview(null)
    setEvalTrace((t) => t.slice(0, -2))
    refreshEval()
  }, [game, thinking, history.length, settings.allowTakebacks, syncFromGame, refreshEval])

  const ENGINE_KEYS = ['strength', 'useDirectElo', 'directElo', 'contempt', 'hashMb', 'moveOverheadMs', 'personality']

  const updateSetting = useCallback(
    (key, value) => {
      setSettings((prev) => {
        const next = { ...prev, [key]: value }
        if (ENGINE_KEYS.includes(key)) playEngineRef.current?.applyTuning(next, PERSONALITIES)
        storage.save('settings', next).then(setSyncStatus)
        return next
      })
      if (key === 'teaching' || key === 'showHints') {
        if (value) refreshEval()
        else setHint(null)
      }
    },
    [refreshEval],
  )

  const resetSettingKey = useCallback((key) => {
    const def = DEFAULTS[key]
    updateSetting(key, def)
  }, [updateSetting])

  // --- Data actions (Settings → Data) -----------------------------------------
  const persist = useCallback((name, value, setter) => {
    setter(value)
    storage.save(name, value).then(setSyncStatus)
  }, [])

  const handleAction = useCallback(
    (action) => {
      switch (action) {
        case 'resetStats':
          if (window.confirm('Reset your win/loss/draw record to zero?')) {
            persist('stats', { wins: 0, losses: 0, draws: 0 }, setStats)
            toastSuccess('Your game record was reset.', 'Stats cleared')
          }
          break
        case 'resetRating':
          if (window.confirm('Clear your estimated rating?')) {
            acplRef.current = { sumCpl: 0, count: 0, acpl: 0 }
            persist('rating', { elo: null, lastGameElo: null, acpl: null }, setRating)
            toastSuccess('Your estimated rating was cleared.', 'Rating reset')
          }
          break
        case 'resetSettings':
          if (window.confirm('Reset ALL settings to their defaults?')) {
            const def = buildDefaults()
            setSettings(def)
            storage.save('settings', def).then(setSyncStatus)
            playEngineRef.current?.applyTuning(def, PERSONALITIES)
            toastSuccess('All settings restored to defaults.', 'Settings reset')
          }
          break
        case 'exportData': {
          const blob = new Blob(
            [JSON.stringify({ app: 'chess-master', exportedAt: new Date().toISOString(), settings, stats, rating }, null, 2)],
            { type: 'application/json' },
          )
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = 'chess-master-data.json'
          a.click()
          URL.revokeObjectURL(url)
          toastSuccess('Downloaded chess-master-data.json', 'Data exported')
          break
        }
        case 'importData':
          fileInputRef.current?.click()
          break
        default:
          break
      }
    },
    [settings, stats, rating, persist],
  )

  const onImportFile = useCallback((e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-importing the same file later
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result))
        if (data.settings) {
          const merged = migrateSettings(data.settings)
          setSettings(merged)
          storage.save('settings', merged).then(setSyncStatus)
          playEngineRef.current?.applyTuning(merged, PERSONALITIES)
        }
        if (data.stats) persist('stats', data.stats, setStats)
        if (data.rating) persist('rating', data.rating, setRating)
        toastSuccess('Settings, stats, and rating restored.', 'Data imported')
      } catch {
        toastDanger('That file could not be read as Chess Master data.', 'Import failed')
      }
    }
    reader.readAsText(file)
  }, [persist])

  useEffect(() => {
    if (engineReady) refreshEval()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engineReady])

  const jumpToPly = useCallback(
    (ply) => {
      const verbose = game.history({ verbose: true })
      const replay = new Chess()
      for (let i = 0; i < ply && i < verbose.length; i++) replay.move(verbose[i])
      setFen(replay.fen())
    },
    [game],
  )

  const status = useMemo(() => describeStatus(game, thinking), [game, fen, thinking])
  const boardOrientation = settings.playerColor === 'b' ? 'black' : 'white'

  // Highlight the from/to squares of the most recent move (standard "last move"
  // cue). Gated by the showThreats setting ("Show last-move highlight").
  const lastMoveStyles = useMemo(() => {
    if (!settings.showThreats) return undefined
    const verbose = game.history({ verbose: true })
    const last = verbose[verbose.length - 1]
    if (!last) return undefined
    const hl = { background: 'rgba(246, 196, 83, 0.45)' }
    return { [last.from]: hl, [last.to]: hl }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen, settings.showThreats])

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true">♞</span>
          <div>
            <h1>Chess Master</h1>
            <p className="muted-foreground tagline">Play, analyze &amp; learn — offline</p>
          </div>
        </div>
        <nav className="modenav" role="tablist" aria-label="Mode">
          <button role="tab" aria-selected={mode === 'play'} className={mode === 'play' ? 'active' : 'outline'} onClick={() => setMode('play')}>Play</button>
          <button role="tab" aria-selected={mode === 'learn'} className={mode === 'learn' ? 'active' : 'outline'} onClick={() => setMode('learn')}>Learn</button>
          <button role="tab" aria-selected={mode === 'tactics'} className={mode === 'tactics' ? 'active' : 'outline'} onClick={() => setMode('tactics')}>Tactics</button>
          <button role="tab" aria-selected={mode === 'analysis'} className={mode === 'analysis' ? 'active' : 'outline'} onClick={() => setMode('analysis')}>Analysis</button>
          <button role="tab" aria-selected={mode === 'quantum'} className={mode === 'quantum' ? 'active' : 'outline'} onClick={() => setMode('quantum')}>Quantum</button>
          <button role="tab" aria-selected={mode === 'settings'} className={mode === 'settings' ? 'active' : 'outline'} onClick={() => setMode('settings')}>Settings</button>
        </nav>
        {mode === 'play' && (
          <span className={`status-pill status-${status.kind}`}>
            {!engineReady ? 'Loading engine…' : status.text}
          </span>
        )}
      </header>

      <input ref={fileInputRef} type="file" accept="application/json,.json" hidden onChange={onImportFile} />

      {mode === 'settings' ? (
        <main className="settings-main">
          <SettingsView settings={settings} onChange={updateSetting} onAction={handleAction} onResetKey={resetSettingKey} />
        </main>
      ) : mode === 'analysis' ? (
        <main>
          <AnalysisSandbox display={displayFrom(settings)} />
        </main>
      ) : mode === 'quantum' ? (
        <main>
          <QuantumChess display={displayFrom(settings)} />
        </main>
      ) : mode === 'tactics' ? (
        <main className="learn-main">
          <div className="learn-subnav">
            <button className={tacticsTab === 'traps' ? 'active' : 'outline'} onClick={() => setTacticsTab('traps')}>Winning traps</button>
            <button className={tacticsTab === 'puzzles' ? 'active' : 'outline'} onClick={() => setTacticsTab('puzzles')}>Tactics puzzles</button>
          </div>
          {tacticsTab === 'puzzles' ? (
            <PuzzleTrainer display={displayFrom(settings)} />
          ) : (
            <TrapsTrainer display={displayFrom(settings)} />
          )}
        </main>
      ) : mode === 'learn' ? (
        <main className="learn-main">
          <div className="learn-subnav">
            <button className={learnTab === 'coached' ? 'active' : 'outline'} onClick={() => setLearnTab('coached')}>Coached practice</button>
            <button className={learnTab === 'explore' ? 'active' : 'outline'} onClick={() => setLearnTab('explore')}>Explore all openings</button>
          </div>
          {learnTab === 'explore' ? (
            <ExploreOpenings display={displayFrom(settings)} />
          ) : engines ? (
            <LearnPractice playEngine={engines.play} analysisEngine={engines.analysis} display={displayFrom(settings)} />
          ) : (
            <p className="muted-foreground" aria-busy="true">Loading engine…</p>
          )}
        </main>
      ) : (
        <main className="layout">
          <div className="leftcol">
            <RatingCard rating={rating} />
            <MoveList history={history} />
          </div>

          <section className="board-area card">
            <div className="board-row">
              {settings.teaching && (
                <EvalBar scoreCp={evalInfo.scoreCp} mateIn={evalInfo.mateIn} orientation={boardOrientation} />
              )}
              <Board
                fen={fen}
                orientation={boardOrientation}
                onMove={onPlayerMove}
                hint={settings.showHints ? hint : null}
                interactive={!thinking && game.turn() === settings.playerColor && !game.isGameOver()}
                display={displayFrom(settings)}
                squareStyles={lastMoveStyles}
              />
            </div>
          </section>

          <aside className="sidebar">
            <div className="card panel">
              <nav className="tabs" role="tablist">
                <button role="tab" aria-selected={tab === 'play'} className={tab === 'play' ? 'ghost active' : 'ghost'} onClick={() => setTab('play')}>Play</button>
                <button role="tab" aria-selected={tab === 'coach'} className={tab === 'coach' ? 'ghost active' : 'ghost'} onClick={() => setTab('coach')}>Coach</button>
                <button role="tab" aria-selected={tab === 'analysis'} className={tab === 'analysis' ? 'ghost active' : 'ghost'} onClick={() => setTab('analysis')}>Engine</button>
                <button role="tab" aria-selected={tab === 'review'} className={tab === 'review' ? 'ghost active' : 'ghost'} onClick={() => setTab('review')}>Review</button>
              </nav>

              <div className="panel-body" role="tabpanel">
                {tab === 'play' && (
                  <Controls
                    settings={settings}
                    stats={stats}
                    onNewGame={newGame}
                    onUndo={undo}
                    onFlipSides={() => newGame(settings.playerColor === 'w' ? 'b' : 'w')}
                    onChange={updateSetting}
                    canUndo={history.length >= 2 && !thinking}
                  />
                )}
                {tab === 'coach' && (
                  <CoachPanel review={lastReview} teaching={settings.teaching} thinking={thinking} />
                )}
                {tab === 'analysis' && (
                  <EngineThinking
                    info={analysisInfo}
                    fen={fen}
                    turn={game.turn()}
                    running={analysisRunning}
                    onToggle={toggleAnalysis}
                  />
                )}
                {tab === 'review' && (
                  <ReviewPanel trace={evalTrace} history={history} onJump={jumpToPly} />
                )}
              </div>
            </div>
          </aside>
        </main>
      )}

      <footer className="appfoot muted-foreground">
        <span className={`sync sync-${syncStatus}`}>{syncLabel(syncStatus)}</span>
        <span>Stockfish 19 · chess.js · Oat UI</span>
      </footer>
    </div>
  )
}

function fenBeforeTurn(fen) {
  // "w" or "b" field of a FEN.
  return fen.split(' ')[1] === 'b' ? 'b' : 'w'
}

function describeStatus(game, thinking) {
  if (game.isCheckmate()) return { kind: 'over', text: 'Checkmate' }
  if (game.isStalemate()) return { kind: 'over', text: 'Stalemate — draw' }
  if (game.isInsufficientMaterial()) return { kind: 'over', text: 'Draw — insufficient material' }
  if (game.isThreefoldRepetition()) return { kind: 'over', text: 'Draw — repetition' }
  if (game.isDraw()) return { kind: 'over', text: 'Draw' }
  if (thinking) return { kind: 'thinking', text: 'Engine thinking…' }
  const toMove = game.turn() === 'w' ? 'White' : 'Black'
  if (game.inCheck()) return { kind: 'check', text: `${toMove} to move — check!` }
  return { kind: 'move', text: `${toMove} to move` }
}

function syncLabel(s) {
  switch (s) {
    case 'saved': return 'Saved'
    case 'saving': return 'Saving…'
    case 'offline': return 'Offline (saved locally)'
    default: return 'Local'
  }
}
