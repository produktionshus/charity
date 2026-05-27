// Auktion UI — TeamBar + screen subcomponents

const { useState: _aS, useMemo: _aM, useEffect: _aE, useRef: _aR } = React;

// ────────────────────────────────────────────────────────────────
// HEADER — minimal, consistent with Bordplan
// ────────────────────────────────────────────────────────────────
function AuctionHeader({ theme, clock, phase, totalRaised, teams }) {
  const phaseLabel = {
    intro: "Velkommen",
    reveal: "Pre-event reveal",
    total: "Akkumuleret status",
    pause: "Næste lot",
    auction: "Live auktion",
    final: "Resultat",
  }[phase] || phase;

  return (
    <header
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto 1fr",
        alignItems: "center",
        padding: "12px 28px",
        borderBottom: `1px solid ${theme.line}`,
        marginBottom: 6,
        color: theme.headerInk,
        flex: "0 0 auto",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            width: 22, height: 22, borderRadius: "50%",
            background: theme.headerInk, color: theme.canvas,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontWeight: 700, fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
          }}
        >★</span>
        <span style={{ fontWeight: 600, fontSize: 13, letterSpacing: "0.01em", whiteSpace: "nowrap" }}>
          KidsAid × Luminance
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{
          fontSize: "clamp(18px, 1.8vw, 30px)",
          letterSpacing: "0.28em", fontWeight: 600,
          color: theme.headerInk, whiteSpace: "nowrap",
        }}>
          STJERNEGOLF 2026 · AUKTION
        </div>
        <div style={{
          fontSize: 9, letterSpacing: "0.32em", textTransform: "uppercase",
          color: theme.headerDim, fontFamily: "'JetBrains Mono', monospace", marginTop: 3,
        }}>
          {phaseLabel}
        </div>
      </div>

      <div style={{
        display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 22,
        fontFamily: "'JetBrains Mono', monospace",
        color: theme.headerDim, fontSize: 11,
        letterSpacing: "0.12em", textTransform: "uppercase",
      }}>
        {totalRaised != null && (
          <span style={{ color: theme.headerInk, fontSize: 13 }}>
            Total {formatKr(totalRaised)}
          </span>
        )}
        <span style={{ color: theme.headerInk, fontSize: 13 }}>{clock}</span>
      </div>
    </header>
  );
}

// ────────────────────────────────────────────────────────────────
// TEAM BAR — the central visualization
// ────────────────────────────────────────────────────────────────
function TeamBar({
  team, theme, palette,
  maxValue, position, slotHeight,
  revealed, focused, ghosted,
  showAuctionPart, showLot, anonymous,
  showBaseLabel,
}) {
  const pre = team.preAmount || 0;
  const live = showAuctionPart ? (team.auctionAmount || 0) : 0;
  const total = pre + live;

  const preW = revealed ? Math.min(100, (pre / maxValue) * 100) : 0;
  const liveW = revealed ? Math.min(100 - preW, (live / maxValue) * 100) : 0;
  const totalW = preW + liveW;

  return (
    <div
      style={{
        position: "absolute",
        left: 0, right: 0,
        height: slotHeight,
        transform: `translateY(${position * slotHeight}px)`,
        transition: "transform 700ms cubic-bezier(.65,.05,.36,1), opacity 400ms",
        opacity: ghosted ? 0.25 : 1,
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "0 12px",
      }}
    >
      {/* Team-color accent stripe on the left */}
      <div
        style={{
          width: 6,
          alignSelf: "stretch",
          margin: "10px 0",
          borderRadius: 3,
          background: palette.live,
          boxShadow: focused ? `0 0 12px ${palette.live}` : "none",
          transition: "box-shadow .3s",
        }}
      />

      {/* Name + lot */}
      <div style={{
        minWidth: 200,
        maxWidth: 240,
        display: "flex",
        flexDirection: "column",
        gap: 2,
        color: theme.headerInk,
      }}>
        <div style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: focused ? "clamp(20px, 2.0vw, 30px)" : "clamp(17px, 1.7vw, 24px)",
          fontWeight: 600,
          letterSpacing: "0.03em",
          transition: "font-size .3s",
        }}>
          {anonymous ? "HOLD ?" : team.name.toUpperCase()}
        </div>
        {showLot && team.lot && !anonymous && (
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: theme.headerDim,
            lineHeight: 1.2,
            maxWidth: 240,
          }}>
            Lot · {team.lot.title}
          </div>
        )}
      </div>

      {/* The bar itself */}
      <div style={{
        flex: 1,
        height: "min(56%, 38px)",
        background: theme.trackBg,
        borderRadius: 4,
        position: "relative",
        overflow: "visible",
        border: focused ? `1px solid ${palette.live}66` : `1px solid ${theme.line}`,
        transition: "border-color .3s",
      }}>
        {/* Pre-event base segment */}
        <div
          style={{
            position: "absolute",
            top: 0, bottom: 0, left: 0,
            width: `${preW}%`,
            background: palette.base,
            borderRadius: liveW > 0 ? "4px 0 0 4px" : 4,
            transition: "width 1.4s cubic-bezier(.65,.05,.36,1)",
          }}
        />
        {/* Live-auction add segment */}
        <div
          style={{
            position: "absolute",
            top: 0, bottom: 0,
            left: `${preW}%`,
            width: `${liveW}%`,
            background: palette.live,
            borderRadius: "0 4px 4px 0",
            transition: "width 1.0s cubic-bezier(.4,.0,.2,1), left 1.4s cubic-bezier(.65,.05,.36,1)",
            boxShadow: live > 0 && focused ? `inset 0 0 12px ${palette.base}` : "none",
          }}
        />
        {/* Vertical dividers between each lot's contribution within the
            live segment, when a team has multiple lots. */}
        {revealed && showAuctionPart && Array.isArray(team.lotAmounts) && team.lotAmounts.length > 1 && (() => {
          let running = pre;
          return team.lotAmounts.slice(0, -1).map((amt, i) => {
            running += amt;
            const x = (running / maxValue) * 100;
            return (
              <div key={`div-${i}`} style={{
                position: 'absolute',
                left: `${x}%`,
                top: 2, bottom: 2,
                width: 2,
                // Use palette.base (darker color) so divider stays visible
                // against the bright live segment, incl. light-on-light
                // palettes like grey/white.
                background: palette.base,
                transform: 'translateX(-1px)',
                transition: 'left 1.0s cubic-bezier(.4,.0,.2,1)',
                pointerEvents: 'none',
              }} />
            );
          });
        })()}

        {/* Split label at the seam between base + live (only when live exists) */}
        {revealed && showBaseLabel && liveW > 0 && preW > 12 && (
          <div
            style={{
              position: "absolute",
              left: `${preW}%`,
              top: "100%",
              marginTop: 4,
              transform: "translateX(-50%)",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 9,
              letterSpacing: "0.1em",
              color: theme.headerDim,
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}
          >
            base · {formatKr(pre)}
          </div>
        )}

        {/* Subtle tick marker at end of total bar */}
        {revealed && totalW > 0 && (
          <div
            style={{
              position: "absolute",
              left: `${totalW}%`,
              top: -3, bottom: -3,
              width: 2,
              background: palette.live,
              transform: "translateX(-1px)",
              transition: "left 1.4s cubic-bezier(.65,.05,.36,1)",
            }}
          />
        )}
      </div>

      {/* Total amount on the right */}
      <div style={{
        minWidth: 170,
        textAlign: "right",
        fontFamily: "'JetBrains Mono', monospace",
        color: theme.headerInk,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 1,
      }}>
        <div style={{
          fontSize: focused ? "clamp(22px, 2.4vw, 38px)" : "clamp(17px, 1.9vw, 28px)",
          fontWeight: 700,
          letterSpacing: "-0.02em",
          fontFeatureSettings: "'tnum'",
          lineHeight: 1,
          transition: "font-size .3s, color .3s",
          color: focused && live > 0 ? palette.live : theme.headerInk,
        }}>
          {revealed ? formatKr(total) : "—"}
        </div>
        {revealed && live > 0 && (
          <div style={{
            fontSize: 11,
            letterSpacing: "0.06em",
            color: palette.live,
            fontWeight: 600,
            fontFeatureSettings: "'tnum'",
          }}>
            + {formatKr(live)} live
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// LOT FOCUS PANEL — used during live auction
// ────────────────────────────────────────────────────────────────
function LotFocusPanel({ team, palette, theme }) {
  if (!team) return null;
  const live = team.auctionAmount || 0;
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: 16,
        transform: "translateX(-50%)",
        width: "min(82%, 1240px)",
        background: theme.canvasHi,
        border: `1px solid ${palette.live}44`,
        borderRadius: 12,
        padding: "18px 26px",
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        alignItems: "center",
        gap: 24,
        color: theme.headerInk,
        boxShadow: `0 0 0 1px ${palette.base}22, 0 24px 60px rgba(0,0,0,0.4)`,
      }}
    >
      <div style={{
        width: 8, height: 64, borderRadius: 4,
        background: palette.live,
        boxShadow: `0 0 14px ${palette.live}`,
      }} />

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10, letterSpacing: "0.22em",
          textTransform: "uppercase", color: palette.live,
        }}>
          {team.name} · Live lot
        </div>
        <div style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: "clamp(22px, 2.4vw, 38px)",
          fontWeight: 600,
          lineHeight: 1.1,
          letterSpacing: "-0.01em",
        }}>
          {team.lot?.title || "Lot"}
        </div>
        <div style={{
          fontSize: 13,
          color: theme.headerDim,
          fontFamily: "'Space Grotesk', sans-serif",
          maxWidth: 720,
          lineHeight: 1.35,
        }}>
          {team.lot?.description}
        </div>
      </div>

      <div style={{
        display: "flex", flexDirection: "column",
        alignItems: "flex-end", gap: 2,
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        <div style={{
          fontSize: 10,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: theme.headerDim,
        }}>
          Aktuelt bud
        </div>
        <div style={{
          fontSize: "clamp(28px, 3.2vw, 56px)",
          fontWeight: 700,
          color: palette.live,
          letterSpacing: "-0.02em",
          fontFeatureSettings: "'tnum'",
          lineHeight: 1,
        }}>
          {formatKr(live)}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// INTRO SCREEN — 4 team chips, optionally anonymized
// ────────────────────────────────────────────────────────────────
function IntroScreen({ teams, theme, anonymous }) {
  return (
    <div style={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 40,
    }}>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 12, letterSpacing: "0.32em",
        textTransform: "uppercase",
        color: theme.headerDim,
      }}>
        Aftenens fire hold
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 24,
        width: "min(82%, 1100px)",
      }}>
        {teams.map((team) => {
          const pal = paletteFor(team);
          return (
            <div
              key={team.id}
              style={{
                background: theme.canvasHi,
                border: `1px solid ${pal.live}33`,
                borderRadius: 10,
                padding: "32px 20px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 14,
              }}
            >
              <div style={{
                width: 56, height: 56,
                borderRadius: "50%",
                background: pal.live,
                boxShadow: `0 0 24px ${pal.live}66`,
              }} />
              <div style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: 22, fontWeight: 600,
                letterSpacing: "0.05em",
                color: theme.headerInk,
              }}>
                {anonymous ? "HOLD ?" : team.name.toUpperCase()}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// PAUSE SCREEN — "Næste lot kommer op"
// ────────────────────────────────────────────────────────────────
function PauseScreen({ nextTeam, theme }) {
  if (!nextTeam) return null;
  const pal = paletteFor(nextTeam);
  return (
    <div style={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 30,
    }}>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 12, letterSpacing: "0.32em",
        textTransform: "uppercase",
        color: theme.headerDim,
      }}>
        Næste lot kommer op
      </div>
      <div style={{
        width: 100, height: 100,
        borderRadius: "50%",
        background: pal.live,
        boxShadow: `0 0 48px ${pal.live}aa`,
      }} />
      <div style={{
        fontFamily: "'Space Grotesk', sans-serif",
        fontSize: "clamp(36px, 4.5vw, 72px)",
        fontWeight: 600,
        letterSpacing: "0.05em",
        color: theme.headerInk,
      }}>
        {nextTeam.name.toUpperCase()}
      </div>
      <div style={{
        fontFamily: "'Space Grotesk', sans-serif",
        fontSize: "clamp(20px, 2.0vw, 32px)",
        color: pal.live,
        fontWeight: 500,
        textAlign: "center",
        maxWidth: "70%",
      }}>
        {nextTeam.lot?.title}
      </div>
      <div style={{
        fontSize: 14,
        color: theme.headerDim,
        textAlign: "center",
        maxWidth: 560,
        lineHeight: 1.4,
      }}>
        {nextTeam.lot?.description}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// FINAL SCREEN — winner reveal
// ────────────────────────────────────────────────────────────────
function FinalCrown({ winner, theme }) {
  if (!winner) return null;
  const pal = paletteFor(winner);
  return (
    <div style={{
      position: "absolute",
      top: 16, left: "50%",
      transform: "translateX(-50%)",
      background: theme.canvasHi,
      border: `1px solid ${pal.live}66`,
      borderRadius: 12,
      padding: "20px 36px",
      display: "flex",
      alignItems: "center",
      gap: 22,
      color: theme.headerInk,
      boxShadow: `0 0 24px ${pal.live}55, 0 16px 48px rgba(0,0,0,0.4)`,
      zIndex: 10,
    }}>
      <div style={{ fontSize: 38, color: pal.live, lineHeight: 1 }}>★</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          letterSpacing: "0.24em",
          textTransform: "uppercase",
          color: pal.live,
        }}>
          Aftens vinder
        </div>
        <div style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: "clamp(28px, 3.0vw, 48px)",
          fontWeight: 600,
          letterSpacing: "0.04em",
        }}>
          {winner.name.toUpperCase()}
        </div>
      </div>
      <div style={{
        marginLeft: 16,
        paddingLeft: 22,
        borderLeft: `1px solid ${theme.line}`,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: "clamp(22px, 2.4vw, 36px)",
        fontWeight: 700,
        color: pal.live,
        fontFeatureSettings: "'tnum'",
        letterSpacing: "-0.01em",
      }}>
        {formatKr(totalForTeam(winner))}
      </div>
    </div>
  );
}

Object.assign(window, {
  AuctionHeader, TeamBar, LotFocusPanel,
  IntroScreen, PauseScreen, FinalCrown,
});
