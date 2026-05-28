// Auktion app — composes screens, listens to host config + state.
// Host (parent window) provides:
//   - window.__AUCTION_CONFIG__ = { teams, state } before script load
//   - postMessage({ type: 'auction-display:state', state: {...} }) for state changes
//   - postMessage({ type: 'auction-display:teams', teams: [...] }) for live teams update
//
// `state` matches the AuctionDisplayState type from slides.ts:
//   { screen, revealCount, activeLot, ranking, namesVisible, showBaseLabel }

const { useState: _appState, useEffect: _appEffect, useRef: _appRef } = React;

function AuctionApp() {
  const initial = window.__AUCTION_CONFIG__ || {};
  const [teams, setTeams] = _appState(() => {
    const incoming = Array.isArray(initial.teams) && initial.teams.length
      ? initial.teams
      : SEED_TEAMS;
    return incoming.map(tm => ({
      preAmount: 0,
      auctionAmount: 0,
      ...tm,
      palette: tm.palette || tm.id,
    }));
  });
  const [state, setState] = _appState(() => ({
    screen: 'intro',
    revealCount: 0,
    activeLot: 0,
    ranking: false,
    namesVisible: true,
    showBaseLabel: true,
    ...(initial.state || {}),
  }));

  // Signal to host that React has mounted and is ready to receive
  // postMessage updates.
  _appEffect(() => {
    try { window.parent?.postMessage({ type: 'auction-display:ready' }, '*'); } catch {}
  }, []);

  // Host can swap teams + state at runtime
  _appEffect(() => {
    function onMsg(e) {
      const m = e.data;
      if (!m || typeof m !== 'object') return;
      if (m.type === 'auction-display:state' && m.state) {
        setState(prev => ({ ...prev, ...m.state }));
      } else if (m.type === 'auction-display:teams' && Array.isArray(m.teams)) {
        setTeams(m.teams.map(tm => ({
          preAmount: 0,
          auctionAmount: 0,
          ...tm,
          palette: tm.palette || tm.id,
        })));
      }
    }
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const theme = A_THEME;
  const clock = useClock();
  const phase = state.screen;

  const totalRaised = teams.reduce((sum, tm) => sum + totalForTeam(tm), 0);
  const winner = rankTeams(teams)[0];

  // `total` is the "akkumuleret status" phase between rounds — show live
  // segment + lot dividers, but without the focus panel (auction) or the
  // winner crown (final). `auction` adds focus, `final` reveals winner.
  const showAuctionPart = phase === 'total' || phase === 'auction' || phase === 'final';
  const focusTeamId = phase === 'auction' || phase === 'pause'
    ? teams[state.activeLot]?.id
    : null;
  const focusTeam = teams.find(x => x.id === focusTeamId);

  let revealedIds = new Set();
  if (phase === 'intro') {
    // none
  } else if (phase === 'reveal') {
    teams.slice(0, state.revealCount).forEach(tm => revealedIds.add(tm.id));
  } else {
    teams.forEach(tm => revealedIds.add(tm.id));
  }

  const displayedTeams = state.ranking ? rankTeams(teams) : teams;
  const positionById = {};
  displayedTeams.forEach((tm, i) => { positionById[tm.id] = i; });

  const mv = maxTotal(teams);

  return (
    <div className="led-stage" style={{ background: theme.canvas }}>
      <div
        className="led-canvas"
        style={{
          background: theme.canvas,
          color: theme.headerInk,
          fontFamily: "'Space Grotesk', sans-serif",
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <AuctionHeader
          theme={theme}
          clock={clock}
          phase={phase}
          totalRaised={(phase === 'total' || phase === 'auction' || phase === 'final') ? totalRaised : null}
          teams={teams}
        />
        <div style={{
          flex: 1, position: 'relative',
          padding: '10px 28px 22px',
          display: 'flex', flexDirection: 'column',
          minHeight: 0,
        }}>
          {phase === 'intro' && (
            <IntroScreen teams={teams} theme={theme} anonymous={!state.namesVisible} />
          )}
          {phase === 'pause' && (
            <PauseScreen nextTeam={focusTeam} theme={theme} />
          )}
          {(phase === 'reveal' || phase === 'total' || phase === 'auction' || phase === 'final') && (
            <BarsBoard
              teams={teams}
              displayedTeams={displayedTeams}
              positionById={positionById}
              maxValue={mv}
              theme={theme}
              revealedIds={revealedIds}
              focusTeamId={focusTeamId}
              showAuctionPart={showAuctionPart}
              showLot={phase === 'auction'}
              showBaseLabel={state.showBaseLabel}
              focusOverlay={phase === 'auction' && focusTeam
                ? <LotFocusPanel team={focusTeam} palette={paletteFor(focusTeam)} theme={theme} />
                : null}
              crownOverlay={phase === 'final'
                ? <FinalCrown winner={winner} theme={theme} />
                : null}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function BarsBoard({
  teams, displayedTeams, positionById,
  maxValue, theme, revealedIds, focusTeamId,
  showAuctionPart, showLot, showBaseLabel,
  focusOverlay, crownOverlay,
}) {
  const hasFocus = !!focusOverlay;
  const topPad = hasFocus ? 140 : (crownOverlay ? 120 : 0);

  // Measure available height so rows spread across the full stage instead of
  // clustering at the top with empty space below. Fixed-pixel SLOT looked
  // squished on a 1080p LED because 4×130=520px filled only half the area
  // below the header.
  const containerRef = _appRef(null);
  const [containerH, setContainerH] = _appState(0);
  _appEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerH(el.clientHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const MARGIN_TOP = 8;
  const MIN_SLOT = 130;
  const MAX_SLOT = 220;
  const avail = Math.max(0, containerH - topPad - MARGIN_TOP);
  const rawSlot = containerH > 0 ? avail / teams.length : MIN_SLOT;
  const SLOT = Math.max(MIN_SLOT, Math.min(MAX_SLOT, Math.floor(rawSlot)));

  return (
    <div ref={containerRef} style={{
      position: 'relative', flex: 1, minHeight: 0,
      paddingTop: topPad,
    }}>
      {focusOverlay}
      {crownOverlay}
      <div style={{
        position: 'relative',
        height: `${teams.length * SLOT}px`,
        marginTop: MARGIN_TOP,
      }}>
        {teams.map(tm => {
          const pal = paletteFor(tm);
          return (
            <TeamBar
              key={tm.id}
              team={tm}
              theme={theme}
              palette={pal}
              maxValue={maxValue}
              position={positionById[tm.id]}
              slotHeight={SLOT}
              revealed={revealedIds.has(tm.id)}
              focused={focusTeamId === tm.id}
              ghosted={hasFocus && focusTeamId !== tm.id}
              showAuctionPart={showAuctionPart}
              showLot={showLot}
              showBaseLabel={showBaseLabel}
              anonymous={false}
            />
          );
        })}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<AuctionApp />);
