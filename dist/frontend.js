// src/styles.ts
var styles = `
.gm-app{--gm-bg:var(--lumiverse-bg,#16181c);--gm-card:var(--lumiverse-bg-secondary,#1e2126);--gm-ink:var(--lumiverse-text,#ece8df);--gm-muted:var(--lumiverse-text-muted,#9fa2a8);--gm-line:color-mix(in srgb,var(--gm-ink) 13%,transparent);--gm-rule:color-mix(in srgb,var(--gm-ink) 7%,transparent);--gm-accent:#8fb3d9;--gm-accent-ink:#0f1a26;--gm-warn:#e0b25c;--gm-good:#8cc49a;color:var(--gm-ink);background:var(--gm-bg);font:14px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;min-height:100%;padding:24px 22px 34px;box-sizing:border-box;color-scheme:dark;container-type:inline-size;overflow-wrap:anywhere}
.gm-app *,.gm-app *:before,.gm-app *:after{box-sizing:border-box}.gm-app [hidden]{display:none!important}.gm-app h1,.gm-app h2,.gm-app h3,.gm-app h4,.gm-app p,.gm-app ul,.gm-app ol{margin:0}
.gm-app h1{font:normal 30px/1.15 Georgia,"Times New Roman",serif;letter-spacing:-.6px}.gm-app h2{font:normal 21px/1.25 Georgia,"Times New Roman",serif}.gm-app h3{font-size:14px;font-weight:650}.gm-app h4{font-size:12px;font-weight:650;letter-spacing:.6px;text-transform:uppercase;color:var(--gm-muted)}
.gm-app button,.gm-app input,.gm-app select,.gm-app textarea{font:inherit}.gm-app button{cursor:pointer}.gm-app button:disabled{cursor:not-allowed;opacity:.45}
.gm-app :is(button,summary,input,select,textarea):focus-visible{outline:2px solid var(--gm-accent);outline-offset:2px}
.gm-app :is(input,select,textarea){width:100%;border:1px solid var(--gm-line);border-radius:8px;background:color-mix(in srgb,var(--gm-bg) 70%,transparent);color:var(--gm-ink);padding:9px 11px;min-width:0}.gm-app textarea{resize:vertical;min-height:120px;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}.gm-app select option{background:var(--gm-card);color:var(--gm-ink)}
.gm-header{display:flex;gap:14px;align-items:flex-start;margin-bottom:20px}.gm-mark{flex:none;width:38px;height:46px;border:1.5px solid var(--gm-accent);border-radius:3px 7px 7px 3px;position:relative;margin-top:3px;background:repeating-linear-gradient(to bottom,transparent 0 9px,var(--gm-rule) 9px 10px)}.gm-mark:before{content:"";position:absolute;left:6px;top:-1px;bottom:-1px;border-left:1.5px solid var(--gm-accent);opacity:.6}
.gm-sub{color:var(--gm-muted);font-size:12.5px;margin-top:4px!important}
.gm-tabs{display:flex;gap:18px;border-bottom:1px solid var(--gm-line);margin-bottom:18px}.gm-tab{background:none;border:0;color:var(--gm-muted);padding:8px 0 11px;border-bottom:2px solid transparent;margin-bottom:-1px;font-size:13px}.gm-tab[aria-selected=true]{color:var(--gm-ink);border-color:var(--gm-accent)}
.gm-stack{display:flex;flex-direction:column;gap:12px}.gm-panel{display:flex;flex-direction:column;gap:16px}.gm-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.gm-row.gm-spread{justify-content:space-between}.gm-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.gm-card{border:1px solid var(--gm-line);border-radius:12px;padding:16px;background:var(--gm-card)}.gm-field{display:flex;flex-direction:column;gap:5px}.gm-label{font-size:12px;font-weight:650}.gm-hint{font-size:11.5px;color:var(--gm-muted);line-height:1.5}.gm-small{font-size:12.5px}
.gm-button{border:1px solid var(--gm-line);border-radius:8px;background:transparent;color:var(--gm-ink);padding:8px 12px;font-weight:600;font-size:12.5px;line-height:1.35}.gm-button:hover:not(:disabled){background:color-mix(in srgb,var(--gm-ink) 7%,transparent)}.gm-primary{background:var(--gm-accent);color:var(--gm-accent-ink);border-color:var(--gm-accent)}.gm-primary:hover:not(:disabled){filter:brightness(1.06)}.gm-danger{color:#e38b7c;border-color:color-mix(in srgb,#e38b7c 45%,transparent)}.gm-wide{width:100%;padding:11px 14px}
.gm-status{font-size:12.5px;min-height:1.4em;color:var(--gm-muted)}.gm-status[data-kind=error]{color:#e38b7c}
.gm-notice{font-size:12.5px;border-left:2px solid var(--gm-warn);padding:6px 10px;background:color-mix(in srgb,var(--gm-warn) 8%,transparent);border-radius:0 6px 6px 0}
.gm-clock{font:normal 26px/1.2 Georgia,"Times New Roman",serif;letter-spacing:-.3px}.gm-source{font-size:11.5px;color:var(--gm-muted)}
.gm-pace{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid var(--gm-line);border-radius:9px;overflow:hidden}.gm-pace button{background:none;border:0;border-right:1px solid var(--gm-line);color:var(--gm-muted);padding:9px 6px;font-weight:600;font-size:12.5px}.gm-pace button:last-child{border-right:0}.gm-pace button[aria-pressed=true]{background:color-mix(in srgb,var(--gm-accent) 18%,transparent);color:var(--gm-ink)}
.gm-switch{display:flex;align-items:center;justify-content:space-between;gap:12px}.gm-switch input{width:38px;height:22px;appearance:none;border-radius:999px;background:var(--gm-line);position:relative;cursor:pointer;flex:none;padding:0;border:0}.gm-switch input:before{content:"";position:absolute;width:16px;height:16px;border-radius:50%;left:3px;top:3px;background:var(--gm-ink);transition:left .15s}.gm-switch input:checked{background:var(--gm-accent)}.gm-switch input:checked:before{left:19px;background:var(--gm-accent-ink)}
.gm-details{border:1px solid var(--gm-line);border-radius:12px;background:var(--gm-card)}.gm-details>summary{padding:13px 16px;cursor:pointer;font-weight:600;font-size:13px;list-style-position:inside}.gm-details>.gm-stack{padding:0 16px 16px}
.gm-fields{list-style:none;padding:0;display:flex;flex-direction:column;gap:6px}.gm-fields li{display:flex;justify-content:space-between;gap:12px;font-size:12.5px;border-bottom:1px solid var(--gm-rule);padding-bottom:6px}.gm-fields li:last-child{border:0}.gm-dot{font-size:11.5px;text-align:right;min-width:0;overflow-wrap:break-word}.gm-fields li>span:first-child{flex:none;max-width:50%}.gm-dot[data-state=verified]{color:var(--gm-good)}.gm-dot[data-state=waiting]{color:var(--gm-warn)}.gm-dot[data-state=unavailable]{color:var(--gm-muted)}
.gm-book{display:flex;flex-direction:column;gap:18px}.gm-book section{display:flex;flex-direction:column;gap:7px}.gm-book ul{padding-left:18px;display:flex;flex-direction:column;gap:5px}.gm-entry{border-top:1px solid var(--gm-rule);padding-top:8px;display:flex;flex-direction:column;gap:3px}.gm-entry:first-of-type{border:0;padding-top:0}.gm-meta{font-size:11.5px;color:var(--gm-muted)}.gm-chip{display:inline-block;font-size:10.5px;font-weight:650;letter-spacing:.3px;padding:1px 7px;border-radius:999px;border:1px solid var(--gm-line);color:var(--gm-muted);margin-left:6px;vertical-align:1px}.gm-chip[data-tone=due]{border-color:var(--gm-warn);color:var(--gm-warn)}.gm-chip[data-tone=done]{border-color:var(--gm-good);color:var(--gm-good)}
.gm-steps{list-style:decimal!important}.gm-steps li[data-status=shown],.gm-steps li[data-status=offscreen]{color:var(--gm-muted)}.gm-steps li[data-status=skipped]{text-decoration:line-through;color:var(--gm-muted)}
.gm-empty{text-align:center;padding:34px 18px;border:1px dashed var(--gm-line);border-radius:12px;color:var(--gm-muted)}
.gm-footer{margin-top:26px;font-size:10px;letter-spacing:1.4px;color:var(--gm-muted);text-transform:uppercase}
.gm-pace-button{box-sizing:border-box;flex:0 0 auto;width:auto;user-select:none;display:inline-flex;white-space:nowrap;align-items:center;gap:6px;border:1px solid var(--lumiverse-border,rgba(255,255,255,.14));background:transparent;color:inherit;border-radius:999px;padding:3px 10px 3px 8px;font:600 12px/1.6 ui-sans-serif,system-ui,sans-serif;cursor:pointer;opacity:.9}.gm-pace-button:hover{opacity:1}.gm-pace-button:focus-visible{outline:2px solid currentColor;outline-offset:2px}.gm-pace-button svg{width:14px;height:14px}.gm-pace-button[hidden]{display:none!important}
.gm-home{margin:14px 0;font:13px/1.45 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--lumiverse-text,inherit)}.gm-home[hidden]{display:none!important}.gm-home-title{display:flex;align-items:center;gap:7px;font-weight:650;font-size:12px;letter-spacing:.5px;text-transform:uppercase;opacity:.75;margin-bottom:8px}.gm-home-title svg{width:15px;height:15px}
.gm-home-list,.gm-story-list{display:flex;gap:8px;flex-wrap:wrap}.gm-story-list{flex-direction:column}
.gm-story{display:flex;flex-direction:column;align-items:flex-start;gap:1px;text-align:left;border:1px solid var(--lumiverse-border,rgba(127,127,127,.28));border-radius:10px;background:var(--lumiverse-bg-secondary,rgba(127,127,127,.08));color:inherit;padding:8px 12px;cursor:pointer;max-width:260px;min-width:0;font:inherit}.gm-story:hover{border-color:var(--lumiverse-primary,#8fb3d9)}.gm-story-name{font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}.gm-story-meta{font-size:11.5px;opacity:.7;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}.gm-story-list .gm-story{max-width:none;width:100%}
.gm-app textarea.gm-talk-input{min-height:72px;font:13px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}.gm-note{display:flex;gap:10px;align-items:flex-start;justify-content:space-between;border-left:2px solid var(--gm-accent);padding:2px 0 2px 10px}.gm-note .gm-button{flex:none;padding:3px 9px;font-size:11.5px}
.gm-talk-log{display:flex;flex-direction:column;gap:8px;border-top:1px solid var(--gm-rule);padding-top:10px}.gm-line{display:flex;flex-direction:column;gap:2px;padding:7px 10px;border-radius:9px;background:color-mix(in srgb,var(--gm-ink) 4%,transparent)}.gm-line-you{align-self:flex-end;max-width:88%;background:color-mix(in srgb,var(--gm-accent) 12%,transparent)}.gm-line-grimoire{align-self:flex-start;max-width:94%}.gm-line-who{font-size:10.5px;font-weight:650;letter-spacing:.5px;text-transform:uppercase;color:var(--gm-muted)}.gm-changes{margin:3px 0 0;padding-left:16px;font-size:11.5px;color:var(--gm-muted)}
.gm-sub{border-top:1px solid var(--gm-rule);padding-top:12px}.gm-part{border-top:1px solid var(--gm-rule);padding-top:12px}.gm-part:first-child{border:0;padding-top:0}
.gm-chips{display:flex;flex-wrap:wrap;gap:6px}.gm-chips .gm-button{padding:6px 11px;font-size:12px;border-radius:999px}
.gm-quiet .gm-button{border-color:transparent;color:var(--gm-muted);padding:4px 8px;font-size:11.5px}.gm-quiet .gm-button:hover:not(:disabled){color:var(--gm-ink)}
.gm-since{font-variant-numeric:tabular-nums;color:var(--gm-muted)}
.gm-live{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;border:1px solid color-mix(in srgb,var(--gm-accent) 50%,transparent);background:color-mix(in srgb,var(--gm-accent) 10%,transparent);animation:gm-breathe 2.6s ease-in-out infinite}.gm-live-words{flex:1;min-width:0;font-size:13px;font-weight:600;overflow-wrap:normal;word-break:normal;hyphens:none}.gm-live .gm-since{display:block;font-weight:500}
.gm-pulse-dot{width:9px;height:9px;flex:none;border-radius:50%;background:var(--gm-accent);animation:gm-pulse 1.1s ease-in-out infinite}
.gm-done{font-size:13px;color:var(--gm-good);font-weight:600}
@keyframes gm-pulse{0%,100%{transform:scale(.7);opacity:.55}50%{transform:scale(1.15);opacity:1}}
@keyframes gm-breathe{0%,100%{background:color-mix(in srgb,var(--gm-accent) 7%,transparent)}50%{background:color-mix(in srgb,var(--gm-accent) 16%,transparent)}}
@media (prefers-reduced-motion:reduce){.gm-live,.gm-pulse-dot{animation:none}}.gm-waiting{opacity:.85;border:1px dashed var(--gm-line)}
@media(prefers-color-scheme:light){.gm-app{--gm-bg:var(--lumiverse-bg,#faf8f3);--gm-card:var(--lumiverse-bg-secondary,#fffdf8);--gm-ink:var(--lumiverse-text,#25231e);--gm-muted:var(--lumiverse-text-muted,#6f6a60);--gm-accent:#2f6699;--gm-accent-ink:#f5f9fd;--gm-warn:#a06d10;--gm-good:#2f7a45;color-scheme:light}}
@container(max-width:380px){.gm-grid{grid-template-columns:1fr}.gm-app h1{font-size:26px}}
`;

// src/clock.ts
function describeDuration(hours) {
  if (hours < 1)
    return `${Math.max(1, Math.round(hours * 60))} minutes`;
  if (hours < 48) {
    const n = Math.round(hours);
    return `${n} hour${n === 1 ? "" : "s"}`;
  }
  if (hours < 24 * 14) {
    const n = Math.round(hours / 24);
    return `${n} days`;
  }
  const n = Math.round(hours / 168);
  return `${n} weeks`;
}

// src/types.ts
var VERSION = "0.19.0";
var CHAPTER_WORKING = "Starting a new chapter";
var CHAPTER_DONE = "New chapter ready";

// src/frontend.ts
var ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h11a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M8 3v18"/><path d="M12 8h3M12 12h3"/></svg>';
var PACE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 16a8 8 0 0 1 16 0"/><path d="M12 16l4-5"/></svg>';
var PACE_LABELS = {
  auto: { name: "Auto", help: "Grimoire reads the story’s rhythm and picks the pace." },
  quiet: { name: "Quiet", help: "Room to breathe. No new trouble starts, but anything already urgent still plays out." },
  fast: { name: "Fast", help: "Tight scenes. Things move toward what comes next, and consequences arrive sooner." }
};
var ORDER = ["auto", "quiet", "fast"];
var nextPace = (pace) => ORDER[(ORDER.indexOf(pace) + 1) % ORDER.length];
function createRpc(ctx, onChanged, timeoutMs = 45000) {
  let sequence = 0, closed = false;
  const prefix = Math.random().toString(36).slice(2);
  const pending = new Map;
  const off = ctx.onBackendMessage((payload) => {
    const message = payload;
    if (message?.type === "grimoire:changed") {
      onChanged();
      return;
    }
    if (message?.type !== "grimoire:response" || typeof message.id !== "string")
      return;
    const request = pending.get(message.id);
    if (!request)
      return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error)
      request.reject(new Error(message.error));
    else
      request.resolve(message.result);
  });
  return {
    request(action, input) {
      if (closed)
        return Promise.reject(new Error("Grimoire has closed. Reopen it and try again."));
      const id = `gm-${prefix}-${++sequence}`;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error("Lumiverse did not answer in time. Try again."));
        }, timeoutMs);
        pending.set(id, { resolve: (v) => resolve(v), reject, timer });
        try {
          ctx.sendToBackend({ type: "grimoire:request", id, action, input });
        } catch (error) {
          clearTimeout(timer);
          pending.delete(id);
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    },
    destroy() {
      closed = true;
      off();
      for (const p of pending.values()) {
        clearTimeout(p.timer);
        p.reject(new Error("Grimoire closed."));
      }
      pending.clear();
    }
  };
}
function el(tag, className = "", text) {
  const node = document.createElement(tag);
  if (className)
    node.className = className;
  if (text !== undefined)
    node.textContent = text;
  return node;
}
var elapsed = (from) => {
  const s = Math.max(0, Math.round((Date.now() - from) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
var ago = (time) => {
  const s = Math.max(0, (Date.now() - time) / 1000), d = Math.round(s / 86400);
  return s < 60 ? "just now" : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${d} ${d === 1 ? "day" : "days"} ago`;
};
var STATUS_WORDS = { verified: "Read from your preset", waiting: "Waiting for a reply to check", unavailable: "Not found, Grimoire keeps this" };
var FIELD_WORDS = { datetime: "Date and time", date: "Date", time: "Time", location: "Place", present: "Who is here" };
function setup(ctx) {
  let destroyed = false, snapshot = null, page = "chat", editing = false, confirmDelete = false;
  let draft = "", draftKeep = false, draftChat = "";
  let refreshing = null, again = false, againForced = false, polling;
  let drawn = "", pendingDraw = false;
  const tab = ctx.ui.registerDrawerTab({ id: "grimoire", title: "Grimoire", shortName: "Grimoire", description: "The story behind your chat: where it is going, why, and how fast.", keywords: ["story", "notebook", "plot", "pace", "pacing"], iconSvg: ICON });
  const teardown = [ctx.dom.addStyle(styles)];
  const app = el("div", "gm-app");
  tab.root.append(app);
  const rpc = createRpc(ctx, () => {
    refresh();
  });
  const status = el("p", "gm-status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const notify = (text, kind = "info") => {
    if (!destroyed) {
      status.textContent = text;
      status.dataset.kind = kind;
    }
  };
  const header = el("header", "gm-header"), mark = el("div", "gm-mark"), titles = el("div");
  titles.append(el("h1", "", "Grimoire"), el("p", "gm-sub", "The story behind your chat: where it is going, why, and how fast."));
  header.append(mark, titles);
  const tabs = el("div", "gm-tabs");
  tabs.setAttribute("role", "tablist");
  const tabButtons = ["chat", "settings"].map((key) => {
    const b = el("button", "gm-tab", key === "chat" ? "This chat" : "Settings");
    b.type = "button";
    b.setAttribute("role", "tab");
    b.addEventListener("click", () => {
      page = key;
      render();
    });
    tabs.append(b);
    return [key, b];
  });
  const body = el("div", "gm-panel"), footer = el("footer", "gm-footer", `Grimoire ${VERSION}`);
  app.append(header, tabs, status, body, footer);
  function button(label, action, kind = "") {
    const b = el("button", `gm-button${kind ? ` gm-${kind}` : ""}`, label);
    b.type = "button";
    b.addEventListener("click", () => {
      (async () => {
        b.disabled = true;
        try {
          await action();
        } catch (error) {
          notify(error instanceof Error ? error.message : String(error), "error");
        } finally {
          if (!destroyed)
            b.disabled = false;
        }
      })();
    });
    return b;
  }
  let fieldCount = 0;
  function labeled(label, control, hint) {
    const wrap = el("div", "gm-field"), caption = el("label", "gm-label", label), id = `gm-${++fieldCount}`;
    control.id = id;
    caption.htmlFor = id;
    wrap.append(caption, control);
    if (hint)
      wrap.append(el("p", "gm-hint", hint));
    return wrap;
  }
  function select(options, value) {
    const s = el("select");
    for (const [v, l] of options) {
      const o = el("option", "", l);
      o.value = v;
      s.append(o);
    }
    s.value = value;
    return s;
  }
  function details(title, open = false) {
    const d = el("details", "gm-details");
    const s = el("summary", "", title);
    const inner = el("div", "gm-stack");
    d.append(s, inner);
    d.open = open;
    return { root: d, body: inner };
  }
  const chatId = () => ctx.getActiveChat().chatId ?? null;
  async function act(action, input = {}) {
    const result = await rpc.request(action, input);
    await refresh(true);
    return result;
  }
  const SHAPE_CHOICES = [["auto", "Let Grimoire choose"], ["conflict", "Conflict: a problem that builds to a climax"], ["kishotenketsu", "Kishōtenketsu: people and discovery, with a turn instead of a fight"]];
  function renderStart(view) {
    const card = el("section", "gm-card gm-stack");
    card.append(el("h2", "", "Start a story notebook"), el("p", "gm-small", "Grimoire reads this chat’s card, your persona, the card’s and the chat’s lorebooks, and anything already said. It writes a private plan for the story: what is really going on, what people want, and the threads that will move over time. You won’t see it unless you open it."));
    const tone = select([["light", "Light"], ["balanced", "Balanced"], ["dark", "Dark"]], view.preferences.tone);
    const twist = el("input");
    twist.type = "checkbox";
    twist.checked = view.preferences.twist;
    twist.style.width = "auto";
    const twistRow = el("label", "gm-row gm-small");
    twistRow.append(twist, document.createTextNode("A twist is allowed, if one fits"));
    const grid = el("div", "gm-stack");
    grid.append(labeled("Tone", tone, "The story keeps going as long as you play: when its threads wrap up, a check-up starts the next part from what happened."));
    const shape = select(SHAPE_CHOICES, view.preferences.shape ?? "auto");
    const lock = el("input");
    lock.type = "checkbox";
    lock.checked = !!view.preferences.lockShape;
    lock.style.width = "auto";
    const lockRow = el("label", "gm-row gm-small");
    lockRow.append(lock, document.createTextNode("Keep this shape for the whole chat"));
    const syncLock = () => {
      lock.disabled = shape.value === "auto";
      if (lock.disabled)
        lock.checked = false;
    };
    shape.addEventListener("change", syncLock);
    syncLock();
    grid.append(labeled("How the story is built", shape, "Grimoire can switch shapes between parts of the story as it goes, unless you keep one."), lockRow);
    const ideas = el("textarea", "gm-talk-input");
    ideas.rows = 4;
    ideas.maxLength = 3000;
    ideas.placeholder = "Like “a slow-burn romance, trouble with old friends, a trip that goes sideways”, or someone you’d like to meet";
    const keepIdeas = el("input");
    keepIdeas.type = "checkbox";
    keepIdeas.style.width = "auto";
    const keepRow = el("label", "gm-row gm-small");
    keepRow.append(keepIdeas, document.createTextNode("Keep these as lasting notes"));
    grid.append(labeled("Anything you’d like in this story? (optional)", ideas, "Grimoire builds the story around your ideas and paces them in over time. It won’t tell you how. Describe someone you’d like to meet and they keep your words."), keepRow);
    const noConnection = !snapshot?.settings.connectionId;
    const parts = view.earlierParts ?? 0;
    const write = button("Write the notebook", async () => {
      await act("create", { chatId: view.chatId, preferences: { tone: tone.value, twist: twist.checked, shape: shape.value, lockShape: lock.checked }, ideas: ideas.value.trim(), keepIdeas: keepIdeas.checked });
      notify(parts ? `Reading the chat, then writing the notebook. This uses ${parts + 1} model requests and can take a few minutes.` : "Writing the notebook. This uses one model request and can take a minute.");
    }, "primary");
    write.classList.add("gm-wide");
    write.disabled = noConnection || view.job?.status === "running";
    card.append(grid, twistRow);
    if (parts)
      card.append(el("p", "gm-hint", `This is a long chat. Grimoire reads it from the beginning first, in ${parts} ${parts === 1 ? "part" : "parts"} (one model request each), so the notebook knows the whole story so far. Then one more request writes the notebook.`));
    card.append(write);
    if (noConnection)
      card.append(el("p", "gm-notice", "Choose a model connection in Settings first."), button("Open settings", () => {
        page = "settings";
        render();
      }));
    return card;
  }
  function since(startedAt) {
    const t = el("span", "gm-since");
    t.dataset.gmSince = String(startedAt);
    t.textContent = elapsed(startedAt);
    return t;
  }
  function renderJob(view) {
    if (!view.job || view.job.status === "complete")
      return null;
    if (view.job.status === "running" && view.job.kind === "talk")
      return null;
    const box = el("div", view.job.status === "failed" ? "gm-notice" : "gm-card gm-small gm-row gm-spread");
    if (view.job.status === "running") {
      const words = el("span");
      words.append(document.createTextNode(`${view.job.label}… `), since(view.job.startedAt));
      box.append(words, button("Stop", async () => {
        await act("cancel", { chatId: view.chatId });
        notify("Stopped. Nothing was changed.");
      }));
    } else
      box.textContent = `${view.job.label}. ${view.job.error ?? ""}`;
    return box;
  }
  function renderSkipOffer(view) {
    const card = el("section", "gm-card gm-stack gm-skip");
    card.append(el("h3", "", "This scene has gone quiet"), el("p", "gm-hint", "Skipping ahead is up to you. The next reply opens with the time that passed."));
    for (const option of view.skipOffer.options)
      card.append(button(option.label, async () => {
        await act("skip", { chatId: view.chatId, amount: option.hours, unit: "hours" });
        notify(`Skipped about ${describeDuration(option.hours)}. The narrator will open with that gap.`);
      }));
    card.append(button("Not now", async () => {
      await act("dismiss-skip", { chatId: view.chatId });
    }));
    return card;
  }
  function renderNow(view) {
    const card = el("section", "gm-card gm-stack");
    const s = view.sources;
    const source = !s ? "" : s.day === "tracker" && s.hour === "tracker" ? "From your preset’s tracker" : s.day === "tracker" || s.hour === "tracker" ? `${s.day === "tracker" ? "Day" : "Hour"} from your preset’s tracker, the rest kept by Grimoire` : "Kept by Grimoire, updated at check-ups";
    card.append(el("h4", "", "Story time"), el("p", "gm-clock", view.clockText || "Not set yet"), el("p", "gm-source", `${source}${s && s.hour !== "unknown" && !s.exact ? " · approximate" : ""}`));
    if (view.skipHours)
      card.append(el("p", "gm-hint", `The narrator will be told that about ${describeDuration(view.skipHours)} have passed.`));
    const group = el("div", "gm-pace");
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", "Story pace");
    for (const pace of ORDER) {
      const b = el("button", "", PACE_LABELS[pace].name);
      b.type = "button";
      b.setAttribute("aria-pressed", String(view.pace === pace));
      b.addEventListener("click", () => {
        act("pace", { chatId: view.chatId, pace }).catch((error) => notify(error.message, "error"));
      });
      group.append(b);
    }
    const pace = el("div", "gm-stack gm-sub");
    pace.append(el("h4", "", "Pace"), group, el("p", "gm-hint", PACE_LABELS[view.pace].help));
    const status = el("div", "gm-sub gm-stack");
    status.append(el("p", "gm-small", view.summary || "No updates yet."), el("p", "gm-hint", `${view.repliesSinceCheck} ${view.repliesSinceCheck === 1 ? "reply" : "replies"} since the last update${view.updatedAt ? ` · saved ${ago(view.updatedAt)}` : ""}`));
    const quick = snapshot?.settings.quick.enabled ? view.quick : undefined;
    if (snapshot?.settings.quick.enabled)
      status.append(el("p", quick && !quick.ok ? "gm-notice" : "gm-hint", !quick ? "Quick check is on. It runs after the next reply." : quick.ok ? `Quick check ran ${ago(quick.at)}.` : `The last quick check didn’t run: ${quick.error}`));
    card.append(pace, renderChapter(view), status);
    return card;
  }
  function renderChapter(view) {
    const box = el("div", "gm-sub gm-stack");
    box.append(el("h4", "", "Chapter"));
    const job = view.job, offline = !snapshot?.settings.connectionId;
    if (job?.status === "running" && job.label === CHAPTER_WORKING) {
      const live = el("div", "gm-live"), words = el("span", "gm-live-words");
      words.append(document.createTextNode("Writing the next chapter… "), since(job.startedAt));
      live.append(el("span", "gm-pulse-dot"), words, button("Stop", async () => {
        await act("cancel", { chatId: view.chatId });
        notify("Stopped. Nothing was changed.");
      }));
      box.append(live, el("p", "gm-hint", "Grimoire is wrapping up what’s run its course and planning what comes next. This takes a minute or two."));
      return box;
    }
    if (job?.status === "complete" && job.label === CHAPTER_DONE && Date.now() - job.startedAt < 10 * 60000)
      box.append(el("p", "gm-done", "A new chapter is set. It begins with the next reply."));
    else if (view.spent)
      box.append(el("p", "gm-notice", "This part of the story has wrapped up. Start a new chapter to begin the next one."));
    const start = button("Start a new chapter", async () => {
      await act("push", { chatId: view.chatId, kind: "chapter" });
      notify("Starting a new chapter. One model request.");
    }, view.spent ? "primary" : "");
    start.classList.add("gm-wide");
    start.disabled = job?.status === "running" || offline || !view.enabled;
    box.append(start, el("p", "gm-hint", "Wraps up what’s run its course and starts the next part from where things stand, sometimes after a jump in time. You won’t be told what’s coming."));
    return box;
  }
  const PUSHES = [["person", "Someone makes a move"], ["secret", "A secret starts to surface"], ["consequence", "Something catches up with me"], ["surprise", "Surprise me"]];
  function renderSteer(view) {
    const card = el("section", "gm-card gm-stack gm-talk");
    if (draftChat !== view.chatId) {
      draft = "";
      draftKeep = false;
      draftChat = view.chatId;
    }
    const busy = view.job?.status === "running", offline = !snapshot?.settings.connectionId;
    card.append(el("h4", "", "Talk to Grimoire"), el("p", "gm-hint", "Tell Grimoire what you’d like from the story, or share an idea. If it’s open-ended, it asks what kind you mean; then it changes its plans without telling you what they are. Stuck for ideas? Ask it for some."));
    if (view.notes.length) {
      const notes = el("div", "gm-stack gm-notes");
      notes.append(el("p", "gm-label", "Your notes"));
      for (const note of view.notes) {
        const row = el("div", "gm-note");
        row.append(el("p", "gm-small", note.text), button("Remove", async () => {
          await act("unpin", { chatId: view.chatId, noteId: note.id });
          notify("Note removed.");
        }));
        notes.append(row);
      }
      notes.append(el("p", "gm-hint", "Notes steer every check-up and every reply until you remove them."));
      card.append(notes);
    }
    const lines = view.talk.slice(-6);
    if (lines.length) {
      const log = el("div", "gm-talk-log");
      for (const line of lines) {
        const item = el("div", `gm-line gm-line-${line.from}`);
        item.append(el("p", "gm-line-who", line.from === "you" ? "You" : "Grimoire"), el("p", "gm-small", line.text));
        if (line.from === "you" && line.keep)
          item.append(el("p", "gm-meta", "Asked to keep as a note"));
        if (line.changes?.length) {
          const ul = el("ul", "gm-changes");
          for (const c of line.changes)
            ul.append(el("li", "", c));
          item.append(ul);
        } else if (line.changes && !line.asked && line.from === "grimoire" && !line.text.startsWith("Undone"))
          item.append(el("p", "gm-meta", "No plans changed."));
        if (line.undone)
          item.append(el("p", "gm-meta", "Undone"));
        log.append(item);
      }
      const talking = busy && view.job?.kind === "talk" && view.job.label !== CHAPTER_WORKING;
      if (talking) {
        const wait = el("div", "gm-line gm-line-grimoire gm-waiting");
        const words = el("p", "gm-small");
        words.append(document.createTextNode(`${view.job.label}… `), since(view.job.startedAt));
        wait.append(el("p", "gm-line-who", "Grimoire"), words, el("p", "gm-meta", "Changing the plans can take a minute or two."));
        log.append(wait);
      }
      const actions = el("div", "gm-row gm-quiet");
      if (talking)
        actions.append(button("Stop", async () => {
          await act("cancel", { chatId: view.chatId });
          notify("Stopped. Nothing was changed.");
        }));
      if (view.canUndo)
        actions.append(button("Undo the last change", async () => {
          await act("undo-talk", { chatId: view.chatId });
          notify("The plans are back the way they were.");
        }));
      actions.append(button("Clear conversation", async () => {
        await act("clear-talk", { chatId: view.chatId });
      }));
      card.append(log, actions);
    }
    const box = el("textarea", "gm-talk-input");
    box.rows = 3;
    box.maxLength = 1000;
    box.value = draft;
    box.placeholder = "Like “This is moving too fast”, “I’d love a road trip someday”, or “Any ideas for Sam?”";
    box.setAttribute("aria-label", "Message to Grimoire");
    box.addEventListener("input", () => {
      draft = box.value;
    });
    const keep = el("input");
    keep.type = "checkbox";
    keep.checked = draftKeep;
    keep.style.width = "auto";
    keep.addEventListener("change", () => {
      draftKeep = keep.checked;
    });
    const keepRow = el("label", "gm-row gm-small");
    keepRow.append(keep, document.createTextNode("Keep this as a lasting note"));
    const send = button("Send", async () => {
      const text = box.value.trim();
      if (!text) {
        notify("Write something for Grimoire first.", "error");
        return;
      }
      await act("talk", { chatId: view.chatId, text, keep: keep.checked });
      draft = "";
      draftKeep = false;
      render();
      notify("Grimoire is thinking. One model request.");
    }, "primary");
    send.disabled = busy || offline;
    box.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !send.disabled)
        send.click();
    });
    const sendRow = el("div", "gm-row gm-spread");
    sendRow.append(keepRow, send);
    card.append(box, sendRow);
    if (busy && view.job?.kind !== "talk")
      card.append(el("p", "gm-hint", "Grimoire is updating the notebook. You can send once it’s done."));
    const stuck = el("div", "gm-sub gm-stack");
    stuck.append(el("p", "gm-label", "Story feeling stuck?"), el("p", "gm-hint", "Say “I’m bored” above, or tap one. Grimoire sets something already in your story in motion. It starts small, and you won’t be told what it is. You can undo it until the next reply."));
    const chips = el("div", "gm-chips");
    for (const [kind, label] of PUSHES) {
      const b = button(label, async () => {
        await act("push", { chatId: view.chatId, kind });
        notify("Setting something in motion. One model request.");
      });
      b.disabled = busy || offline;
      chips.append(b);
    }
    stuck.append(chips);
    card.append(stuck);
    return card;
  }
  function renderMore(view) {
    const d = details("More: check-ups, time skips, story shape, delete");
    const kept = select([["off", "No, let Grimoire choose"], ...SHAPE_CHOICES.slice(1)], view.preferences.lockShape ? view.preferences.shape : "off");
    const keep = button("Save", async () => {
      await act("shape", { chatId: view.chatId, shape: kept.value === "off" ? "auto" : kept.value, lockShape: kept.value !== "off" });
      notify(kept.value === "off" ? "Grimoire will choose the shape of each part." : "Saved. Every part of the story will use this shape.");
    });
    const amount = el("input");
    amount.type = "number";
    amount.min = "1";
    amount.max = "999";
    amount.value = "1";
    const unit = select([["hours", "hours"], ["days", "days"], ["weeks", "weeks"]], "days");
    const busy = view.job?.status === "running";
    const check = button("Check now", async () => {
      await act("checkup", { chatId: view.chatId });
      notify("Checking the story against the chat. One model request.");
    });
    const skip = button("Skip time", async () => {
      const hours = await act("skip", { chatId: view.chatId, amount: Number(amount.value), unit: unit.value });
      notify(`Skipped about ${describeDuration(hours)}. The narrator will open with that gap.`);
    });
    check.disabled = busy || !view.enabled;
    skip.disabled = busy || !view.enabled;
    const skipRow = el("div", "gm-grid");
    skipRow.append(labeled("Skip ahead by", amount), labeled("Unit", unit));
    const remove = button(confirmDelete ? "Tap again to delete this notebook" : "Delete this notebook", async () => {
      if (!confirmDelete) {
        confirmDelete = true;
        render();
        setTimeout(() => {
          confirmDelete = false;
          render();
        }, 5000);
        return;
      }
      confirmDelete = false;
      await act("remove", { chatId: view.chatId });
      notify("Notebook deleted for this chat.");
    }, "danger");
    d.body.append(check, el("p", "gm-hint", "Reads the latest chat and updates the plan. Check-ups also run on their own when a scene changes, time jumps, or enough replies pass."), el("div", "gm-sub"), skipRow, skip, el("div", "gm-sub"), labeled("Keep one story shape for this chat", kept, "If this part of the story already has the other shape, the change starts with the next part."), keep, el("div", "gm-sub"), remove);
    return d.root;
  }
  const QUICK_WORDS = [[/^due_/, "Planned development shown"], [/^moment_/, "Possible moment happened"], [/^detail_mentioned$/, "Breadcrumb mentioned"], [/^echo_heard$/, "Echo heard"], [/^callback_/, "Breadcrumb paid off"], [/^fits_/, "Storyline still fits"], [/^truth_/, "Secret came out"], [/^story_shift$/, "Change of direction"], [/^rushing$/, "Rushing"], [/^intimate$/, "Intimate scene"], [/^new_turn$/, "Something new"], [/^new_problem$/, "New problem"], [/^easy_fix$/, "Solved too easily"]];
  const RHYTHM_WORDS = { calm: "calm", rising: "building", peak: "big moment", aftermath: "aftermath", stalled: "stalled" };
  const STAGE_WORDS = { setup: "setup", rising: "rising action", climax: "climax", resolution: "resolution", ki: "introduction", sho: "development", ten: "the turn", ketsu: "bringing it together" };
  const part = (title) => {
    const s = el("section", "gm-stack gm-part");
    s.append(el("h4", "", title));
    return s;
  };
  function glancePart(view) {
    const s = part("At a glance"), g = view.glance;
    if (!g)
      return s;
    const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
    const speeds = [g.threads.urgent && `${g.threads.urgent} urgent`, g.threads.steady && `${g.threads.steady} steady`, g.threads.slow && `${g.threads.slow} slow`].filter(Boolean).join(", ");
    const rows = [
      ["Story shape", `${g.shape === "kishotenketsu" ? "Kishōtenketsu" : "Conflict"}, ${STAGE_WORDS[g.stage] ?? g.stage}`],
      ["Story threads", `${plural(g.threads.open, "open thread")}${speeds ? ` (${speeds})` : ""}${g.threads.closed ? `, ${g.threads.closed} finished` : ""}`],
      ["Next development", g.dueNow ? `${plural(g.dueNow, "development")} ready now` : g.nextInReplies === null ? "Nothing planned yet" : `within about ${plural(g.nextInReplies, "reply", "replies")}, sooner if story time moves`],
      ["Breadcrumbs", `${g.seeds.planted} planted, ${g.seeds.waiting} waiting, ${g.seeds.paid} paid off${g.seeds.echo ? `, ${g.seeds.echo} still out in the world` : ""}`],
      ["Planned moments", `${g.moments.possible} possible (${g.moments.big} big)${g.moments.happened ? `, ${g.moments.happened} happened` : ""}`],
      ["People", `${g.people.total}, ${g.people.met} met so far`],
      ...g.part ? [["This part of the story", `about ${g.part.elapsed} of roughly ${g.part.length} replies in`]] : []
    ];
    const list = el("ul", "gm-fields");
    for (const [label, value] of rows) {
      const li = el("li");
      li.append(el("span", "", label), el("span", "gm-dot", value));
      list.append(li);
    }
    s.append(list);
    return s;
  }
  function quickPart(view) {
    const s = part("Quick check answers");
    const records = [...view.quickLog ?? []].reverse().slice(0, 12);
    if (!records.length) {
      s.append(el("p", "gm-small", "No quick checks yet."));
      return s;
    }
    const pct = (n) => `${Math.round(n * 100)}%`;
    for (const r of records) {
      const item = el("div", "gm-entry");
      const outcome = [r.marked ? `marked ${r.marked}` : "", r.shifted ? "change of direction" : r.checkup ? "asked for a check-up" : "", r.held ? `held back ${r.held}` : ""].filter(Boolean).join(" · ");
      item.append(el("p", "gm-small", `Reply ${r.reply} · ${ago(r.at)}${r.ok ? "" : ` · didn’t run${r.error ? `: ${r.error.replace(/\.$/, "")}` : ""}`}${outcome ? ` · ${outcome}` : ""}`));
      const parts = [];
      const scene = r.answers.rhythm;
      if (scene && typeof scene === "object")
        parts.push(`Scene: ${RHYTHM_WORDS[scene.choice] ?? scene.choice} (${pct(scene.confidence)})`);
      for (const [key, value] of Object.entries(r.answers)) {
        if (typeof value !== "number")
          continue;
        const label = QUICK_WORDS.find(([re]) => re.test(key))?.[1] ?? key;
        const n = /_(\d+)$/.exec(key)?.[1];
        parts.push(`${label}${n ? ` ${n}` : ""}: ${pct(value)}`);
      }
      if (parts.length)
        item.append(el("p", "gm-meta", parts.join(" · ")));
      s.append(item);
    }
    s.append(el("p", "gm-hint", `How sure the decision model was about each question. Yes counts at ${pct(0.7)} or more.`));
    return s;
  }
  function trackerPart(view) {
    const s = part("What Grimoire reads from your preset");
    if (!view.checks.length) {
      s.append(el("p", "gm-small", "No tracker was found in this chat, so Grimoire keeps the story time itself. If your preset adds a status block later, a check-up can learn to read it."));
      return s;
    }
    const list = el("ul", "gm-fields");
    for (const check of view.checks) {
      const li = el("li");
      const state = el("span", "gm-dot", STATUS_WORDS[check.status]);
      state.dataset.state = check.status;
      li.append(el("span", "", `${FIELD_WORDS[check.name] ?? check.name}${check.value ? `: ${check.value}` : ""}`), state);
      list.append(li);
    }
    s.append(list, el("p", "gm-hint", "Each fact has one owner. Anything read from your preset is never asked for twice."));
    return s;
  }
  function renderBehind(view) {
    const d = details("Behind the scenes · no spoilers");
    d.body.append(glancePart(view));
    if (snapshot?.settings.quick.enabled || view.quickLog?.length)
      d.body.append(quickPart(view));
    d.body.append(trackerPart(view), el("p", "gm-hint", "Only shapes, counts, and numbers: no names, no plans."));
    return d.root;
  }
  function renderBook(notebook, due) {
    const book = el("div", "gm-book"), section = (title) => {
      const s = el("section");
      s.append(el("h4", "", title));
      book.append(s);
      return s;
    };
    const about = section("What it is about");
    about.append(el("p", "", notebook.story.question));
    if (notebook.story.stakes)
      about.append(el("p", "gm-meta", `At stake: ${notebook.story.stakes}`));
    if (notebook.story.direction)
      about.append(el("p", "gm-meta", `Could end: ${notebook.story.direction}`));
    if (notebook.story.hiddenTruth.length || notebook.story.twist) {
      const s = section("What is really going on"), ul = el("ul");
      for (const t of notebook.story.hiddenTruth)
        ul.append(el("li", "", t));
      if (notebook.story.twist)
        ul.append(el("li", "", `Twist: ${notebook.story.twist}`));
      s.append(ul);
    }
    if (notebook.story.cameOut?.length) {
      const s = section("What has come out"), ul = el("ul");
      for (const r of notebook.story.cameOut)
        ul.append(el("li", "", `${r.text}${r.atReply !== undefined ? ` (reply ${r.atReply})` : ""}`));
      s.append(ul);
    }
    const STAGE_WORDS = { setup: "Setup", rising: "Rising action", climax: "Climax", resolution: "Resolution", ki: "Introduction", sho: "Development", ten: "The turn", ketsu: "Bringing it together" };
    const arc = section("Shape of this part");
    arc.append(el("p", "", `${notebook.arc.shape === "kishotenketsu" ? "Kishōtenketsu" : "Conflict"}: ${STAGE_WORDS[notebook.arc.stage] ?? notebook.arc.stage}`));
    if (notebook.arc.turn)
      arc.append(el("p", "gm-meta", `The turn: ${notebook.arc.turn}`));
    const people = section("People");
    for (const p of notebook.people) {
      const e = el("div", "gm-entry");
      const name = el("p");
      name.append(el("strong", "", p.name), ...p.role ? [document.createTextNode(`, ${p.role}`)] : []);
      if (!p.met)
        name.append(el("span", "gm-chip", "not met"));
      if (p.status === "gone")
        name.append(el("span", "gm-chip", "gone"));
      e.append(name, el("p", "gm-small", `Wants ${p.wants}`), ...p.doing ? [el("p", "gm-meta", `Doing: ${p.doing}`)] : [], ...p.voice ? [el("p", "gm-meta", `Voice: ${p.voice}`)] : [], ...p.depth ? [el("p", "gm-meta", `More than their role: ${p.depth}`)] : [], ...p.own ? [el("p", "gm-meta", `Your description: ${p.own}`)] : [], ...p.sheet ? [el("p", "gm-meta", `Sheet: ${p.sheet}`)] : []);
      people.append(e);
    }
    const threads = section("Threads");
    for (const t of notebook.threads) {
      const e = el("div", "gm-entry"), title = el("p");
      title.append(el("strong", "", t.title), el("span", "gm-chip", t.status === "open" ? t.speed : t.status));
      if (t.id === notebook.arc.main)
        title.append(el("span", "gm-chip", "main storyline"));
      if (due.includes(t.id)) {
        const c = el("span", "gm-chip", "due");
        c.dataset.tone = "due";
        title.append(c);
      }
      const steps = el("ol", "gm-steps");
      for (const step of t.steps) {
        const li = el("li", "gm-small", step.text);
        li.dataset.status = step.status;
        if (step.status !== "waiting")
          li.append(el("span", "gm-chip", step.status));
        steps.append(li);
      }
      e.append(title, el("p", "gm-small", t.why), steps, ...t.ifIgnored ? [el("p", "gm-meta", `If left alone: ${t.ifIgnored}`)] : [], ...t.closedReason ? [el("p", "gm-meta", `Closed${t.outcome ? ` (${{ won: "went your way", lost: "went against you", faded: "faded out" }[t.outcome]})` : ""}: ${t.closedReason}`)] : [], ...t.scar ? [el("p", "gm-meta", `Still felt: ${t.scar}`)] : []);
      threads.append(e);
    }
    if (notebook.summary)
      section("Latest note from the model").append(el("p", "gm-small", notebook.summary));
    const beats = section("Possible moments"), ul = el("ul");
    for (const b of notebook.beats) {
      const li = el("li", "gm-small", b.text);
      if (b.status !== "possible") {
        const c = el("span", "gm-chip", b.status);
        if (b.status === "happened")
          c.dataset.tone = "done";
        li.append(c);
      }
      ul.append(li);
    }
    beats.append(ul);
    if (notebook.seeds.length) {
      const s = section("Breadcrumbs"), list = el("ul");
      for (const seed of notebook.seeds) {
        const li = el("li", "gm-small", seed.detail);
        if (seed.status !== "waiting") {
          const c = el("span", "gm-chip", seed.status);
          if (seed.status === "paid")
            c.dataset.tone = "done";
          li.append(c);
        }
        li.append(el("div", "gm-meta", `Later: ${seed.payoff}`));
        list.append(li);
      }
      s.append(list);
    }
    if (notebook.events.length) {
      const s = section("What has happened"), list = el("ul");
      for (const ev of notebook.events)
        list.append(el("li", "gm-small", ev));
      s.append(list);
    }
    return book;
  }
  function renderSpoilers(view) {
    const d = details("Show the notebook · spoilers");
    if (!view.notebook)
      return d.root;
    if (!editing) {
      d.body.append(renderBook(view.notebook, view.dueIds ?? []), button("Edit as text", () => {
        editing = true;
        render();
        d.root.open = true;
      }));
    } else {
      d.root.open = true;
      const area = el("textarea");
      area.rows = 18;
      area.value = JSON.stringify(view.notebook, null, 2);
      area.setAttribute("aria-label", "Notebook as text");
      d.body.append(el("p", "gm-hint", "Change anything you like. Grimoire checks it before saving and keeps the times it recorded."), area, button("Save changes", async () => {
        let value;
        try {
          value = JSON.parse(area.value);
        } catch {
          throw new Error("That is not valid JSON. Check for a missing comma or quote.");
        }
        await act("edit", { chatId: view.chatId, notebook: value });
        editing = false;
        notify("Notebook saved.");
        render();
      }, "primary"), button("Cancel", () => {
        editing = false;
        render();
      }));
    }
    return d.root;
  }
  function renderChat() {
    const view = snapshot?.chat;
    if (!view) {
      const empty = el("div", "gm-empty");
      empty.append(el("p", "", snapshot?.notice || "Open a chat to use Grimoire."));
      body.append(empty);
      if (stories.length) {
        const card = el("section", "gm-card gm-stack");
        card.append(el("h4", "", "Your stories"), storyList("gm-story-list"));
        body.append(card);
      }
      return;
    }
    if (!view.supported) {
      body.append(el("p", "gm-notice", view.reason));
      return;
    }
    const job = renderJob(view);
    if (!view.hasNotebook) {
      if (job)
        body.append(job);
      body.append(renderStart(view));
      return;
    }
    const toggleRow = el("div", "gm-card gm-switch"), toggle = el("input");
    toggle.type = "checkbox";
    toggle.checked = view.enabled;
    toggle.setAttribute("role", "switch");
    toggle.setAttribute("aria-label", "Use Grimoire in this chat");
    toggle.addEventListener("change", () => {
      act("enable", { chatId: view.chatId, enabled: toggle.checked }).catch((error) => {
        toggle.checked = !toggle.checked;
        notify(error.message, "error");
      });
    });
    const words = el("div");
    words.append(el("h3", "", view.name || "This chat"), el("p", "gm-hint", view.enabled ? "Grimoire is guiding this story." : "Turned off. The narrator gets no notes from Grimoire."));
    toggleRow.append(words, toggle);
    body.append(toggleRow);
    if (job)
      body.append(job);
    if (view.needsCheck && view.enabled && view.job?.status !== "running")
      body.append(el("p", "gm-notice", `${view.needsCheck} An update will run after the next reply, or choose Check now under More.`));
    else if (view.behind && view.enabled)
      body.append(el("p", "gm-hint", "You went back in the chat, so Grimoire is using its notebook from before that point. Nothing from the removed replies counts."));
    if (view.reworking && view.enabled)
      body.append(el("p", "gm-hint", "The story changed direction. Grimoire is reworking its plans to fit, and holds older plans back meanwhile. Nothing it already set up is forgotten."));
    if (view.skipOffer && view.enabled)
      body.append(renderSkipOffer(view));
    body.append(renderNow(view), renderSteer(view), renderBehind(view), renderSpoilers(view), renderMore(view));
  }
  function renderSettings() {
    const settings = { ...snapshot?.settings ?? { connectionId: "", maxOutputTokens: 16000, reasoningMode: "inherit", every: 8, quick: { enabled: false, connectionId: "", model: "" }, wait: "medium", homeList: true, intimate: "protect" } };
    const card = el("section", "gm-card gm-stack");
    const connection = select([["", "Choose a connection"], ...(snapshot?.connections ?? []).map((c) => [c.id, `${c.name}${c.model ? ` · ${c.model}` : ""}`])], settings.connectionId);
    const every = el("input");
    every.type = "number";
    every.min = "2";
    every.max = "50";
    every.value = String(settings.every);
    const tokens = select([["8000", "8,000"], ["16000", "16,000"], ["32000", "32,000"], ["64000", "64,000"]], String(settings.maxOutputTokens));
    const reasoning = select([["inherit", "Use the connection’s setting"], ["off", "Off"], ["low", "Low"]], settings.reasoningMode);
    const wait = select([["short", "A few replies (about 8)"], ["medium", "Some replies (about 15)"], ["long", "Many replies (about 30)"]], settings.wait ?? "medium");
    const grid = el("div", "gm-grid");
    grid.append(labeled("Response room (tokens)", tokens), labeled("Reasoning", reasoning));
    card.append(el("h2", "", "Settings"), labeled("Model connection", connection, "Used to write notebooks and run check-ups. Your chat keeps its own connection. A cheaper model may do, but test it on a chat first."), labeled("Longest a story thread waits", wait, "A thread moves on when enough story time has passed, or after this many replies, whichever comes first, so a long scene never leaves the story stuck. Urgent threads wait less and slow ones longer. Big scenes still aren’t interrupted for slow threads; they come in at the next break."), labeled("Check-up after this many replies", every, "A fallback. Check-ups also run when the scene changes or time jumps."), grid);
    const decisions = snapshot?.decisions ?? { available: false, reason: "", connections: [] };
    const quickCard = el("section", "gm-card gm-stack");
    const quickRow = el("label", "gm-switch"), quickOn = el("input");
    quickOn.type = "checkbox";
    quickOn.checked = settings.quick.enabled;
    quickOn.setAttribute("role", "switch");
    quickOn.setAttribute("aria-label", "Quick check after each reply");
    quickRow.append(el("h3", "", "Quick check after each reply"), quickOn);
    const fallback = decisions.connections.find((c) => c.isDefault);
    const decision = select([["", fallback ? `Your default: ${fallback.name}${fallback.model ? ` · ${fallback.model}` : ""}` : "Your default decision connection"], ...decisions.connections.map((c) => [c.id, `${c.name}${c.model ? ` · ${c.model}` : ""}`])], settings.quick.connectionId);
    const model = el("input");
    model.type = "text";
    model.value = settings.quick.model;
    model.placeholder = "Leave empty to use the connection’s model";
    model.spellcheck = false;
    quickCard.append(quickRow, el("p", "gm-hint", "A small decision model reads each new reply and answers a few yes-or-no questions: did a planned development happen, how intense is the scene, did something new come up. The notebook stays current between check-ups, and a full check-up runs only when it’s needed. One small request per reply."));
    if (!decisions.available) {
      quickOn.disabled = true;
      quickCard.append(el("p", "gm-notice", decisions.reason || "Decision models aren’t available."));
    } else {
      if (!decisions.connections.length)
        quickCard.append(el("p", "gm-notice", "Add a decision connection in Lumiverse’s connection settings first (OpenRouter or TypeSafe)."));
      quickCard.append(labeled("Decision connection", decision), labeled("Model", model, "Any decision model works. To use a different one than the connection’s, type its exact ID. Pick one with a version in its name rather than one ending in “latest”, so it doesn’t change without you knowing."));
    }
    const intimate = select([["protect", "Keep the story out until the scene ends"], ["allow", "Let urgent things interrupt"]], settings.intimate ?? "protect");
    card.append(labeled("During intimate scenes", intimate, "The quick check notices these scenes. While one plays out, nothing planned interrupts it, and its replies don’t count toward moving storylines along, so nothing piles up for afterward. Needs the quick check."));
    const homeRow = el("label", "gm-row gm-small"), home = el("input");
    home.type = "checkbox";
    home.checked = settings.homeList !== false;
    home.style.width = "auto";
    homeRow.append(home, document.createTextNode("Show my stories on the home page"));
    card.append(homeRow);
    const save = button("Save settings", async () => {
      await act("settings", { settings: { connectionId: connection.value, every: Number(every.value), maxOutputTokens: Number(tokens.value), reasoningMode: reasoning.value, wait: wait.value, homeList: home.checked, intimate: intimate.value, quick: { enabled: quickOn.checked, connectionId: decision.value, model: model.value } } });
      notify("Settings saved.");
    }, "primary");
    body.append(card, quickCard, save);
  }
  function render() {
    if (destroyed)
      return;
    for (const [key, b] of tabButtons) {
      b.setAttribute("aria-selected", String(page === key));
    }
    const openDetails = [...body.querySelectorAll("details")].map((d) => d.open);
    const scrolled = [];
    for (let node = app;node; node = node.parentElement)
      if (node.scrollTop > 0)
        scrolled.push([node, node.scrollTop]);
    body.replaceChildren();
    if (page === "settings")
      renderSettings();
    else
      renderChat();
    body.querySelectorAll("details").forEach((d, i) => {
      if (openDetails[i])
        d.open = true;
    });
    for (const [node, top] of scrolled)
      node.scrollTop = top;
    drawn = page + JSON.stringify(snapshot);
    pendingDraw = false;
    updatePaceButton();
  }
  function busyHere() {
    if (page === "settings")
      return true;
    const active = document.activeElement;
    return !!active && body.contains(active) && /^(INPUT|SELECT|TEXTAREA)$/.test(active.tagName);
  }
  body.addEventListener("focusout", () => {
    setTimeout(() => {
      if (pendingDraw && !busyHere() && !editing)
        render();
    }, 0);
  });
  let stories = [];
  function openChat(chatId) {
    const surfaces = ctx.host?.surfaces;
    if (surfaces) {
      Promise.resolve(surfaces.invoke({ kind: "route", id: "/chat/:chatId" }, { chatId })).catch((error) => notify(error instanceof Error ? error.message : String(error), "error"));
      return;
    }
    history.pushState(null, "", `/chat/${encodeURIComponent(chatId)}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
  function storyList(className) {
    const list = el("div", className);
    for (const story of stories) {
      const item = el("button", "gm-story");
      item.type = "button";
      item.append(el("span", "gm-story-name", story.character || story.chatName || "A chat"), el("span", "gm-story-meta", `${story.chatName && story.character ? `${story.chatName} · ` : ""}played ${ago(story.playedAt)}${story.enabled ? "" : " · Grimoire off"}`));
      item.title = `Open ${story.character || "this chat"}`;
      item.addEventListener("click", () => openChat(story.chatId));
      list.append(item);
    }
    return list;
  }
  let homeMount = null;
  try {
    homeMount = ctx.ui.mount("landing_hero");
  } catch {
    homeMount = null;
  }
  const home = el("section", "gm-home");
  home.hidden = true;
  if (homeMount) {
    homeMount.append(home);
    teardown.push(() => home.remove());
  }
  function renderHome() {
    const show = !!snapshot && snapshot.settings.homeList !== false && !chatId() && stories.length > 0;
    home.hidden = !show;
    if (!show) {
      home.replaceChildren();
      return;
    }
    const title = el("div", "gm-home-title");
    title.innerHTML = ICON;
    title.append(el("span", "", "Your stories"));
    home.replaceChildren(title, storyList("gm-home-list"));
  }
  async function refreshStories() {
    if (destroyed || chatId()) {
      renderHome();
      return;
    }
    try {
      stories = await rpc.request("stories");
    } catch {
      stories = [];
    }
    renderHome();
    if (!snapshot?.chat)
      render();
  }
  let mount = null, paceButton = null, skipButton = null;
  try {
    mount = ctx.ui.mount("chat_actions");
  } catch {
    mount = null;
  }
  const pill = (className, text, action) => {
    const node = el("span", className, text);
    node.setAttribute("role", "button");
    node.tabIndex = 0;
    node.hidden = true;
    node.addEventListener("click", action);
    node.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        action();
      }
    });
    return node;
  };
  if (mount) {
    paceButton = pill("gm-pace-button", "", () => void cyclePace());
    skipButton = pill("gm-pace-button gm-skip-button", "Skip ahead?", () => {
      page = "chat";
      render();
      tab.activate();
    });
    skipButton.title = "This scene has gone quiet. Open Grimoire to skip ahead, or wave it off.";
    mount.append(paceButton, skipButton);
    teardown.push(() => paceButton?.remove(), () => skipButton?.remove());
  }
  const extras = ctx.ui.registerInputBarAction({ id: "grimoire-pace", label: "Story pace", subtitle: "Grimoire · change the pace", iconSvg: PACE_ICON, enabled: false });
  teardown.push(extras.onClick(() => void cyclePace()), () => extras.destroy());
  async function cyclePace() {
    const view = snapshot?.chat;
    if (!view?.hasNotebook || !view.enabled) {
      tab.activate();
      return;
    }
    try {
      await act("pace", { chatId: view.chatId, pace: nextPace(view.pace) });
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), "error");
    }
  }
  function updatePaceButton() {
    const view = snapshot?.chat, active = !!view?.hasNotebook && view.enabled;
    if (paceButton) {
      paceButton.hidden = !active;
      if (active) {
        paceButton.innerHTML = PACE_ICON;
        paceButton.append(document.createTextNode(PACE_LABELS[view.pace].name));
        paceButton.title = `Story pace: ${PACE_LABELS[view.pace].name}. ${PACE_LABELS[view.pace].help} Click to change.`;
        paceButton.setAttribute("aria-label", `Story pace: ${PACE_LABELS[view.pace].name}. Click to change.`);
      }
    }
    if (skipButton)
      skipButton.hidden = !(active && view.skipOffer);
    extras.setLabel(active ? `Story pace: ${PACE_LABELS[view.pace].name}` : "Story pace");
    extras.setSubtitle(active ? `Grimoire · tap for ${PACE_LABELS[nextPace(view.pace)].name}` : "Grimoire is off in this chat");
    extras.setEnabled(active);
  }
  async function refresh(forced = false) {
    if (destroyed)
      return;
    if (refreshing) {
      again = true;
      againForced ||= forced;
      return refreshing;
    }
    refreshing = (async () => {
      try {
        snapshot = await rpc.request("snapshot", { chatId: chatId() });
        const running = snapshot.chat?.job?.status === "running";
        if (running && !polling)
          polling = setInterval(() => void refresh(), 2500);
        if (!running && polling) {
          clearInterval(polling);
          polling = undefined;
        }
        tab.setBadge(running ? "…" : null);
        const changed = page + JSON.stringify(snapshot) !== drawn;
        if (editing || !forced && (!changed || busyHere())) {
          pendingDraw ||= changed;
          updatePaceButton();
        } else
          render();
      } catch (error) {
        notify(error instanceof Error ? error.message : String(error), "error");
      } finally {
        refreshing = null;
        if (again && !destroyed) {
          const f = againForced;
          again = false;
          againForced = false;
          refresh(f);
        }
      }
    })();
    return refreshing;
  }
  teardown.push(tab.onActivate(() => void refresh()), ctx.events.on("CHAT_CHANGED", () => {
    editing = false;
    refresh(true);
  }), ctx.events.on("CHAT_SWITCHED", () => {
    editing = false;
    refresh(true).then(refreshStories);
  }));
  const wake = () => {
    if (!destroyed && document.visibilityState !== "hidden")
      refresh(true);
  };
  const win = typeof window === "undefined" ? null : window;
  const targets = [[document, "visibilitychange"], ...win ? [[win, "pageshow"], [win, "online"], [win, "focus"]] : []];
  for (const [target, name] of targets) {
    target.addEventListener(name, wake);
    teardown.push(() => target.removeEventListener(name, wake));
  }
  let lastTick = Date.now();
  const ticker = setInterval(() => {
    const gap = Date.now() - lastTick;
    lastTick = Date.now();
    if (gap > 5000)
      wake();
    for (const node of app.querySelectorAll("[data-gm-since]"))
      node.textContent = elapsed(Number(node.dataset.gmSince));
  }, 1000);
  teardown.push(() => clearInterval(ticker));
  render();
  ctx.ready();
  refresh(true).then(refreshStories);
  return () => {
    if (destroyed)
      return;
    destroyed = true;
    if (polling)
      clearInterval(polling);
    rpc.destroy();
    for (const fn of teardown.reverse())
      fn();
    app.remove();
    tab.destroy();
  };
}
export {
  PACE_LABELS,
  createRpc,
  nextPace,
  setup
};
