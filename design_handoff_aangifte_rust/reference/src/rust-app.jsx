// ─── Refined Rust — single-page app view ─────────────────────────────────────
const { useState, useRef, useEffect } = React;

function fmtChat(text) {
  // render **bold** and *italic* simply
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (/^\*[^*]+\*$/.test(p)) return <em key={i}>{p.slice(1, -1)}</em>;
    return <span key={i}>{p}</span>;
  });
}

function AttentionCard({ item, defaultOpen, seedChat }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const [resolved, setResolved] = useState(false);
  const [messages, setMessages] = useState(seedChat ? MOCK.sampleChat : []);
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);

  function send(e) {
    e.preventDefault();
    const q = draft.trim();
    if (!q || typing) return;
    setMessages((m) => [...m, { role: "user", content: q }]);
    setDraft("");
    setTyping(true);
    setTimeout(() => {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content:
            "Goede vraag. In het echte product beantwoordt de checker dit op basis van je aangifte en jaaropgaves. Dit is een ontwerp-voorbeeld, dus het antwoord is hier illustratief.",
        },
      ]);
      setTyping(false);
    }, 900);
  }

  const hasChat = messages.length > 0;
  const toggleLabel = open ? "Verberg gesprek" : hasChat ? "Bekijk gesprek" : "Stel een vraag";

  return (
    <div className={"acard" + (resolved ? " resolved" : "")}>
      <div className="head">
        <span className="chip">
          <Icon name={resolved ? "check" : "flag"} size={16} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="t">{item.title}</div>
          <div className="x">{item.explanation}</div>
          {item.institution && (
            <div className="meta">{[item.institution, item.accountNumber].filter(Boolean).join(" · ")}</div>
          )}
        </div>
      </div>

      <div className="actions">
        <button className="gbtn" onClick={() => setOpen((v) => !v)}>
          <Icon name="message" size={14} /> {toggleLabel}
        </button>
        <button className={"gbtn mute" + (resolved ? " on" : "")} onClick={() => setResolved((v) => !v)}>
          <Icon name="check-circle" size={14} /> {resolved ? "Opgelost" : "Markeer als opgelost"}
        </button>
      </div>

      {open && (
        <div className="thread">
          {messages.map((m, i) => (
            <div key={i} className={"bubble " + (m.role === "user" ? "u" : "a")}>
              {m.role === "assistant" ? fmtChat(m.content) : m.content}
            </div>
          ))}
          {typing && <div className="typing">Bezig met antwoorden…</div>}
          <form className="chatin" onSubmit={send}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={hasChat ? "Vervolgvraag…" : "Typ je vraag…"}
            />
            <button type="submit" disabled={!draft.trim() || typing} aria-label="Verstuur">
              <Icon name="send" size={16} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function Section({ tone, icon, title, count, note, children }) {
  return (
    <div className={"sec tone-" + tone}>
      <div className="sechead">
        <span className="chip"><Icon name={icon} size={16} /></span>
        <div>
          <div className="t">{title}</div>
          {note && <div className="note">{note}</div>}
        </div>
        <span className="pill num">{count}</span>
      </div>
      {children}
    </div>
  );
}

const TWEAK_DEFAULTS = { showAttention: true };

function IncrementalCard() {
  return (
    <div className="icard">
      <h2 style={{ fontSize: 15.5, fontWeight: 600, margin: "0 0 3px" }}>Jaaropgave vergeten?</h2>
      <p style={{ fontSize: 12.5, color: "var(--ink-3)", margin: "0 0 14px" }}>
        Upload een vergeten jaaropgave. Alleen de nieuwe bestanden worden opnieuw verwerkt.
      </p>
      <div className="drop">
        <div className="dropic"><Icon name="upload" size={20} /></div>
        <div className="dl">Aanvullende jaaropgaves</div>
        <div className="dh">Sleep de vergeten PDF's hierheen, of klik om te bladeren</div>
      </div>
      <button className="btn" style={{ marginTop: 14 }}>
        Analyseer aanvulling <Icon name="arrow" size={16} />
      </button>
    </div>
  );
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const attention = t.showAttention ? MOCK.attention : [];
  const hasAttn = attention.length > 0;
  const summary = SUMMARY.map((s) => (s.key === "attention" ? { ...s, count: attention.length } : s));
  return (
    <React.Fragment>
      {/* sticky app bar */}
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <div className="logo"><Icon name="shield" size={19} /></div>
            <div>
              <div className="wm">Aangifte Checker</div>
              <div className="sub">Belastingjaar 2024</div>
            </div>
          </div>
          <div className="spacer" />
          <button className="ghostbtn"><Icon name="refresh" size={15} /> <span className="lbl">Opnieuw analyseren</span></button>
        </div>
      </header>

    <div className="page">
      {/* uploaded files */}
      <div className="files">
        <div className="grp">
          <span className="lab">Aangifte</span>
          <span className="fchip ok"><Icon name="check" size={13} /> aangifte-2024.pdf</span>
        </div>
        <div className="grp">
          <span className="lab">Jaaropgaves</span>
          <span className="fchip"><Icon name="file" size={13} /> ing.pdf</span>
          <span className="fchip"><Icon name="file" size={13} /> rabobank.pdf</span>
          <span className="fchip"><Icon name="file" size={13} /> degiro.pdf</span>
        </div>
        <button className="edit"><Icon name="plus" size={14} /> Wijzig</button>
      </div>

      {/* results header */}
      <div style={{ marginTop: 30 }}>
        <div className="eyebrow">Resultaat</div>
        <h1 className="h-res">Je controle is klaar</h1>
        <p className="h-sub">3 jaaropgaves vergeleken met je aangifte over 2024.</p>
      </div>

      {/* summary boxes side-by-side */}
      <div className="statrow" style={{ marginTop: 18 }}>
        {summary.map((s) => (
          <div key={s.key} className={"stat tone-" + s.tone}>
            <div className="stat-top">
              <span className="chip"><Icon name={s.icon} size={17} /></span>
              <div className="n num">{s.count}</div>
            </div>
            <div className="l">{s.label}</div>
          </div>
        ))}
      </div>

      {/* report body — wide main column + sticky side rail on desktop */}
      <div className={"body" + (hasAttn ? "" : " single")} style={{ marginTop: 24 }}>
        <div className="col-main">
      {/* sections */}
      <div className="stack">
        <Section tone="pos" icon="check" title="Gedekt" count={MOCK.covered.length}
          note="Aangifte en jaaropgave komen overeen">
          {MOCK.covered.map((c, i) => (
            <div className="irow" key={i}>
              <div><div className="f">{c.field}</div><div className="m">{c.institution} · {c.accountNumber}</div></div>
              <div className="a num" style={{ color: "var(--pos)" }}>{euro(c.amount)}</div>
            </div>
          ))}
        </Section>

        <Section tone="warn" icon="alert" title="Jaaropgave ontbreekt" count={MOCK.missing.length}
          note="Staat in je aangifte, geen jaaropgave geüpload">
          {MOCK.missing.map((c, i) => (
            <div className="irow" key={i}>
              <div><div className="f">{c.field}</div><div className="m">Box {c.box} · {c.accountNumber}</div></div>
              <div className="a num" style={{ color: "var(--warn)" }}>{euro(c.amount)}</div>
            </div>
          ))}
        </Section>

        <Section tone="info" icon="file-plus" title="Niet ingevuld in aangifte" count={MOCK.notFilled.length}
          note="Staat in je jaaropgaves, ontbreekt in aangifte">
          {MOCK.notFilled.map((c, i) => (
            <div className="irow" key={i}>
              <div><div className="f">{c.description}</div><div className="m">{c.institution} · {c.accountNumber}</div></div>
              <div className="a num" style={{ color: "var(--info)" }}>{euro(c.amount)}</div>
            </div>
          ))}
        </Section>
      </div>
          {!hasAttn && <IncrementalCard />}
        </div>{/* /col-main */}

        {hasAttn && (
          <aside className="col-side">
            <div>
              <div className="ahead">
                <span className="ic"><Icon name="flag" size={18} /></span>
                <h2>Aandachtspunten</h2>
                <span className="pill num">{attention.length}</span>
              </div>
              <div className="stack" style={{ marginTop: 14 }}>
                {attention.map((p, i) => (
                  <AttentionCard key={i} item={p} defaultOpen={i === 0} seedChat={i === 0} />
                ))}
              </div>
            </div>
            <IncrementalCard />
          </aside>
        )}
      </div>{/* /body */}

      <p className="disc">Alleen voor demo — controleer altijd zelf alle informatie.</p>
    </div>
    <TweaksPanel>
      <TweakSection label="Demo-states" />
      <TweakToggle label="Aandachtspunten tonen" value={t.showAttention} onChange={(v) => setTweak("showAttention", v)} />
    </TweaksPanel>
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
