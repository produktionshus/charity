// wish-loop.jsx — KidsAid × Ønskeskyen Ønske-loop module.
// 16:9 stage with blurred background video + apple-card foreground cycling.
// Driven entirely by the host (Charity event system) via:
//   (1) window.__WISH_LOOP_CONFIG__ set before this script loads, or
//   (2) postMessage runtime updates ({type:'wish-loop:config', config:{…}})

const { useState, useEffect, useRef, useMemo, useCallback } = React;

const DEFAULTS = {
  direction: 'stack',
  perCardSeconds: 5,
  videoBlur: 36,
  videoDarken: 0.5,
  chrome: true,
  pauseOnHover: true,
  stackDepth: 3,
  eyebrowPretitle: 'Stjernegolf 2026 · Auktion',
  eyebrowTitle: 'Børnenes ønsker',
  sponsorEnabled: true,
  sponsorPretitle: 'Præsenteret af',
  sponsorMode: 'text',
  sponsorMark: 'Ønskeskyen',
  sponsorLogo: '',
};

function resolveCards() {
  const cfg = window.__WISH_LOOP_CONFIG__ || {};
  if (Array.isArray(cfg.cards) && cfg.cards.length) return cfg.cards;
  return [];
}

function PlaceholderApple({ index, total }) {
  return (
    <svg className="apple-svg" viewBox="0 0 600 720" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <filter id="paper-shadow" x="-20%" y="-10%" width="140%" height="130%">
          <feDropShadow dx="0" dy="14" stdDeviation="12" floodColor="#000" floodOpacity="0.18" />
        </filter>
      </defs>
      <path d="M 348 92 C 380 50, 432 38, 470 60 C 458 110, 410 130, 360 118 Z" fill="#3FA34D" />
      <path d="M 332 100 Q 340 78, 352 60" stroke="#3FA34D" strokeWidth="10" strokeLinecap="round" fill="none" />
      <path
        d="M 300 110 C 240 100, 175 110, 125 168 C 70 230, 60 350, 90 470 C 120 580, 200 670, 300 690 C 400 670, 480 580, 510 470 C 540 350, 530 230, 475 168 C 425 110, 360 120, 300 110 Z"
        fill="#F4ECD8" stroke="#3FA34D" strokeWidth="14" filter="url(#paper-shadow)"
      />
      <circle cx="300" cy="320" r="130" fill="#E7DCBC" />
      <circle cx="300" cy="320" r="130" fill="none" stroke="#3FA34D" strokeWidth="6" strokeOpacity="0.35" />
      <text x="300" y="328" textAnchor="middle" fontFamily="JetBrains Mono, ui-monospace, Menlo, monospace" fontSize="56" fontWeight="600" fill="#3FA34D" fillOpacity="0.55" letterSpacing="2">{String(index).padStart(2, '0')}</text>
      <text x="300" y="372" textAnchor="middle" fontFamily="JetBrains Mono, ui-monospace, Menlo, monospace" fontSize="14" fontWeight="500" fill="#3FA34D" fillOpacity="0.55" letterSpacing="3">FOTO KOMMER</text>
      <text x="300" y="540" textAnchor="middle" fontFamily="Plus Jakarta Sans, system-ui, sans-serif" fontSize="58" fontWeight="700" fill="#3FA34D">Barn {index}</text>
      <text x="300" y="600" textAnchor="middle" fontFamily="JetBrains Mono, ui-monospace, monospace" fontSize="20" fontWeight="500" fill="#3FA34D" fillOpacity="0.55" letterSpacing="4">AF {total}</text>
    </svg>
  );
}

function AppleCard({ apple, index, total }) {
  return (
    <div className="apple-frame">
      {apple.src
        ? <img className="apple-img" src={apple.src} alt={apple.alt || `Barn ${apple.id}`} draggable="false" />
        : <PlaceholderApple index={apple.id ?? (index + 1)} total={total} />}
    </div>
  );
}

function Background({ videoSrc, blur, darken }) {
  return (
    <div className="bg" aria-hidden="true">
      {videoSrc ? (
        <video className="bg-video" src={videoSrc} autoPlay muted loop playsInline style={{ filter: `blur(${blur}px) saturate(0.9)` }} />
      ) : (
        <div className="bg-gradient" style={{ filter: `blur(${blur}px)` }}>
          <span className="g g1" /><span className="g g2" /><span className="g g3" /><span className="g g4" /><span className="g g5" />
        </div>
      )}
      <div className="bg-grain" />
      <div className="bg-scrim" style={{ background: `linear-gradient(180deg, rgba(15,30,18,${darken * 0.6}) 0%, rgba(10,15,8,${darken}) 60%, rgba(10,15,8,${darken * 1.1}) 100%)` }} />
      <div className="bg-vignette" />
    </div>
  );
}

function Chrome({ index, total, paused, eyebrowPretitle, eyebrowTitle, sponsorEnabled, sponsorPretitle, sponsorMode, sponsorMark, sponsorLogo }) {
  const pct = total > 1 ? (index / (total - 1)) * 100 : 0;
  const effectiveMode = sponsorMode === 'logo' && sponsorLogo ? 'logo' : 'text';
  const showSponsor = sponsorEnabled !== false && ((effectiveMode === 'logo') || (effectiveMode === 'text' && sponsorMark));
  return (
    <>
      <div className="chrome chrome--top-left">
        <div className="kidsaid-mark"><img src="logo-kidsaid.png" alt="KidsAID" /></div>
        <div className="eyebrow-block">
          {eyebrowPretitle && <div className="eyebrow-pretitle">{eyebrowPretitle}</div>}
          {eyebrowTitle && <div className="eyebrow-title">{eyebrowTitle}</div>}
        </div>
      </div>
      {showSponsor && (
        <div className="chrome chrome--top-right">
          <div className="sponsor">
            {sponsorPretitle && <span className="sponsor-pre">{sponsorPretitle}</span>}
            {effectiveMode === 'logo'
              ? <img className="sponsor-logo" src={sponsorLogo} alt="Sponsor" />
              : <span className="sponsor-name">{sponsorMark}</span>}
          </div>
        </div>
      )}
      <div className="chrome chrome--bottom">
        <div className="counter">
          <span className="counter-num">{String(index + 1).padStart(2, '0')}</span>
          <span className="counter-sep">/</span>
          <span className="counter-total">{String(total).padStart(2, '0')}</span>
        </div>
        <div className="progress">
          <div className="progress-track"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
        </div>
        <div className={`status ${paused ? 'is-paused' : ''}`}>
          <span className="status-dot" />
          <span className="status-label">{paused ? 'Paused' : 'Live'}</span>
        </div>
      </div>
    </>
  );
}

function WishLoop() {
  const hostCfgRef = useRef(window.__WISH_LOOP_CONFIG__ || {});
  const initialTweaks = useMemo(() => {
    const cfg = hostCfgRef.current;
    const out = { ...DEFAULTS };
    for (const k of Object.keys(DEFAULTS)) {
      if (cfg[k] !== undefined) out[k] = cfg[k];
    }
    return out;
  }, []);
  const [t, setT] = useState(initialTweaks);
  const [cards, setCards] = useState(resolveCards);
  const [active, setActive] = useState(0);
  const [hover, setHover] = useState(false);
  const [externalPaused, setExternalPaused] = useState(false);

  useEffect(() => {
    function onMsg(e) {
      const m = e.data;
      if (!m || typeof m !== 'object') return;
      if (m.type === 'wish-loop:config' && m.config) {
        const cfg = m.config;
        hostCfgRef.current = { ...hostCfgRef.current, ...cfg };
        if (Array.isArray(cfg.cards)) setCards(cfg.cards);
        if (cfg.videoSrc !== undefined) hostCfgRef.current.videoSrc = cfg.videoSrc;
        const knobs = Object.keys(DEFAULTS);
        const updates = {};
        for (const k of knobs) if (cfg[k] !== undefined) updates[k] = cfg[k];
        if (Object.keys(updates).length) setT(prev => ({ ...prev, ...updates }));
      } else if (m.type === 'wish-loop:goto' && typeof m.index === 'number') {
        setActive(((m.index % cards.length) + cards.length) % cards.length);
      } else if (m.type === 'wish-loop:pause') {
        setExternalPaused(true);
      } else if (m.type === 'wish-loop:play') {
        setExternalPaused(false);
      }
    }
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [cards.length]);

  const paused = externalPaused || (t.pauseOnHover && hover);

  useEffect(() => {
    if (paused || cards.length < 2) return;
    const id = setInterval(() => setActive(a => (a + 1) % cards.length), Math.max(1, t.perCardSeconds) * 1000);
    return () => clearInterval(id);
  }, [paused, t.perCardSeconds, cards.length]);

  const hostCfg = hostCfgRef.current;
  const videoSrc = hostCfg.videoSrc || '';

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'ArrowRight') setActive(a => (a + 1) % cards.length);
      else if (e.key === 'ArrowLeft') setActive(a => (a - 1 + cards.length) % cards.length);
      else if (e.key === ' ') { e.preventDefault(); setExternalPaused(p => !p); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cards.length]);

  const total = cards.length;
  // CSS only defines stack offsets up to 6, so clamp here to that range.
  const stackDepth = Math.max(2, Math.min(6, t.stackDepth));
  const visibleOffsets = useMemo(() => {
    const set = new Map();
    if (total === 0) return set;
    for (let off = -1; off <= stackDepth; off++) {
      const i = ((active + off) % total + total) % total;
      if (!set.has(i)) set.set(i, off);
    }
    return set;
  }, [active, total, stackDepth]);

  return (
    <div
      className={`stage stage--${t.direction}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ '--per-card': `${t.perCardSeconds}s` }}
    >
      <Background videoSrc={videoSrc} blur={t.videoBlur} darken={t.videoDarken} />
      <div className="cards">
        {cards.map((c, i) => {
          const off = visibleOffsets.get(i);
          if (off === undefined) return null;
          return (
            <div key={c.id ?? i} className="card" data-offset={off} data-stack-depth={stackDepth} style={{ '--off': off, '--depth': stackDepth }}>
              <AppleCard apple={c} index={i} total={total} />
            </div>
          );
        })}
      </div>
      {t.chrome && (
        <Chrome
          index={active}
          total={total}
          paused={paused}
          eyebrowPretitle={t.eyebrowPretitle}
          eyebrowTitle={t.eyebrowTitle}
          sponsorEnabled={t.sponsorEnabled}
          sponsorPretitle={t.sponsorPretitle}
          sponsorMode={t.sponsorMode}
          sponsorMark={t.sponsorMark}
          sponsorLogo={t.sponsorLogo}
        />
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<WishLoop />);
