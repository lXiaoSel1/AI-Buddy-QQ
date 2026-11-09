const ROUTE = '/api/ai-buddy/qq-connect';
// Approved designs F1-F3. Theme comes from the --buddy-* properties the Buddy host injects, language from
// data-buddy-lang (plugin-page-appearance.mjs); the fallbacks keep the page readable on its own.
const HIGH_USAGE = ['开着时，判断要不要说话、构思话题和回复都会用模型，即使最后没开口也可能有用量。请按需开启。', 'When on, deciding whether to speak, planning a topic and replying all use the model, even if she ends up saying nothing. Turn it on only where you want it.'];
const CSS = `
.qq{--q-bg:var(--buddy-bg,#f3f6fa);--q-card:var(--buddy-surface,#fff);--q-card2:var(--buddy-surface2,#eef2f7);--q-ink:var(--buddy-text,#1f2d3d);--q-mut:var(--buddy-muted,#617287);--q-line:var(--buddy-border,#d9e1ea);--q-acc:var(--buddy-accent,#3f6fd8);--q-on:var(--buddy-on-accent,#fff);--q-ok:var(--buddy-ok,#2f8a5b);--q-warn:var(--buddy-warn,#b7791f);--q-err:var(--buddy-err,#c2413b);
 box-sizing:border-box;height:100%;min-height:0;overflow-y:auto;scrollbar-gutter:stable;padding:24px clamp(16px,3vw,32px) 96px;background:var(--q-bg);color:var(--q-ink);font:14px/1.55 var(--buddy-f-ui,'Segoe UI','Microsoft YaHei',sans-serif)}
.qq *{box-sizing:border-box}.qq-wrap{display:grid;gap:16px;max-width:1080px;margin:0 auto}html[data-buddy-embedded] .qq-wrap{max-width:none}
.qq h1,.qq h2,.qq h3,.qq p{margin:0}.qq h1{font:700 22px/1.3 var(--buddy-f-head,inherit)}.qq h2{font-size:16px}.qq h3{font-size:14px}
.qq-mut{color:var(--q-mut)}.qq-cap{color:var(--q-mut);font-size:12px}.qq-num{font-variant-numeric:tabular-nums}
.qq-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.qq-between{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.qq-grow{flex:1;min-width:0}
.qq-head{display:flex;align-items:center;gap:14px}.qq-logo{display:grid;place-items:center;width:44px;height:44px;border-radius:12px;background:color-mix(in srgb,var(--q-acc) 16%,transparent);color:var(--q-acc);flex:none}
.qq-card{background:var(--q-card);border:1px solid var(--q-line);border-radius:var(--buddy-r-card,14px);padding:16px 18px;display:grid;align-content:start;gap:12px;min-width:0}
.qq button{font:inherit;cursor:pointer;min-height:34px;padding:0 14px;border-radius:var(--buddy-r-btn,9px);border:1px solid var(--q-line);background:var(--q-card);color:var(--q-ink);display:inline-flex;align-items:center;gap:6px}
.qq button:hover:not(:disabled){border-color:var(--q-acc);color:var(--q-acc)}.qq button:disabled{opacity:.5;cursor:not-allowed}
.qq button.pri{background:var(--q-acc);border-color:var(--q-acc);color:var(--q-on)}.qq button.pri:hover:not(:disabled){color:var(--q-on);filter:brightness(1.06)}
.qq button.ghost{background:transparent;border-color:transparent;color:var(--q-mut)}.qq button.danger{color:var(--q-err)}.qq button.sm{min-height:28px;padding:0 10px;font-size:13px}.qq button.icon{width:34px;padding:0;justify-content:center}
.qq :focus-visible{outline:2px solid var(--q-acc);outline-offset:2px}
.qq input,.qq select{font:inherit;color:var(--q-ink);background:var(--q-card2);border:1px solid var(--q-line);border-radius:8px;min-height:34px;padding:6px 10px;max-width:100%}
.qq input[aria-invalid=true]{border-color:var(--q-err)}
.qq-tabs{display:flex;gap:4px;border-bottom:1px solid var(--q-line)}.qq-tabs button{border:0;border-bottom:2px solid transparent;border-radius:0;background:none;color:var(--q-mut);min-height:40px}
.qq-tabs button[aria-selected=true]{color:var(--q-ink);border-bottom-color:var(--q-acc);font-weight:600}
.qq-tabrow{display:flex;align-items:stretch;min-width:0}.qq-tabrow>.qq-tabs,.qq-tabrow>.qq-steps{flex:1;min-width:0}.qq-tabrow>.qq-acts,.qq-tabrow.bare{display:none}
/* Inside AI Buddy's main window the host's bar names the page: no logo, title or subtitle, and the status pill and refresh sit at the end of the tab row. */
html[data-buddy-embedded] .qq-head{display:none}html[data-buddy-embedded] .qq-tabrow.bare{display:flex;justify-content:flex-end}
html[data-buddy-embedded] .qq-tabrow>.qq-acts{display:flex;flex:none;flex-wrap:nowrap;padding-left:12px}html[data-buddy-embedded] .qq-tabs+.qq-acts{border-bottom:1px solid var(--q-line)}html[data-buddy-embedded] .qq-tabrow>.qq-tabs{flex-wrap:wrap}
.qq-pill{display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 9px;border-radius:11px;font-size:12px;font-weight:600;white-space:nowrap;background:var(--q-card2);color:var(--q-mut)}
.qq-pill::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}
.qq-pill.ok{color:var(--q-ok);background:color-mix(in srgb,var(--q-ok) 13%,transparent)}.qq-pill.warn{color:var(--q-warn);background:color-mix(in srgb,var(--q-warn) 14%,transparent)}
.qq-pill.err{color:var(--q-err);background:color-mix(in srgb,var(--q-err) 12%,transparent)}.qq-pill.busy{color:var(--q-acc);background:color-mix(in srgb,var(--q-acc) 13%,transparent)}
.qq-alert{display:flex;gap:10px;align-items:flex-start;padding:10px 14px;border-radius:10px;border:1px solid color-mix(in srgb,var(--q-warn) 40%,transparent);background:color-mix(in srgb,var(--q-warn) 10%,transparent)}
.qq-alert.err{border-color:color-mix(in srgb,var(--q-err) 40%,transparent);background:color-mix(in srgb,var(--q-err) 9%,transparent)}.qq-alert.info{border-color:var(--q-line);background:var(--q-card2)}
.qq-empty{display:grid;justify-items:center;gap:8px;padding:36px 18px;text-align:center}.qq-empty p{max-width:48ch}
.qq-face{position:relative;overflow:hidden;display:inline-grid;place-items:center;width:30px;height:30px;border-radius:50%;background:color-mix(in srgb,var(--q-acc) 18%,var(--q-card));color:var(--q-acc);font-size:13px;font-weight:700;flex:none}
.qq-portrait{position:relative;overflow:hidden;display:grid;place-items:center;width:100%;height:104px;color:var(--q-mut);font-size:32px;flex:none}.qq-portrait>b{font-weight:500}.qq-portrait>i{position:absolute;inset:0;background-size:contain;background-position:center bottom;background-repeat:no-repeat}.qq-portrait.status{width:92px;height:120px;margin:-6px 0 -18px}.qq-op-picks{grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}.qq .qq-op-picks button.qq-op-pick{position:relative;height:132px;min-height:132px;padding:6px 4px;gap:2px;background:var(--q-card2);border-color:transparent;overflow:hidden}.qq-op-pick>b{font-size:12px;line-height:14px}.qq-op-check{position:absolute;top:5px;right:5px;color:var(--q-acc)}
.qq-face.lg{width:56px;height:56px;font-size:22px}.qq-face.grp{border-radius:9px}.qq-face>b{font-weight:inherit}.qq-face>i{position:absolute;inset:0;background-size:cover;background-position:center;background-repeat:no-repeat}
.qq-st{display:inline-flex;align-items:center;gap:3px;vertical-align:middle}.qq-st.ok{color:var(--q-ok)}.qq-st.warn{color:var(--q-warn)}.qq-st.err{color:var(--q-err)}.qq-st.busy{color:var(--q-acc)}
.qq-badge{min-width:18px;padding:0 6px;border-radius:9px;background:var(--q-card2);font-size:11px;line-height:18px;text-align:center}
.qq-steps{display:flex;gap:6px;padding:0;margin:0;list-style:none;flex-wrap:wrap}.qq-steps li{display:flex;align-items:center;gap:8px;padding:6px 12px 6px 6px;border-radius:18px;background:var(--q-card2);color:var(--q-mut);font-size:13px}
.qq-steps li span{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--q-card);font-size:12px;font-weight:700}.qq-steps li.cur{color:var(--q-ink);font-weight:600;box-shadow:inset 0 0 0 1px var(--q-acc)}
.qq-steps li.cur span{background:var(--q-acc);color:var(--q-on)}.qq-steps li.done span{background:color-mix(in srgb,var(--q-ok) 18%,transparent);color:var(--q-ok)}
.qq-picks{display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:10px}
.qq button.qq-pick{flex-direction:column;justify-content:center;gap:8px;min-height:104px;padding:12px;border-radius:12px}.qq button.qq-pick[aria-pressed=true]{border-color:var(--q-acc);background:color-mix(in srgb,var(--q-acc) 10%,var(--q-card));color:var(--q-ink);box-shadow:0 0 0 1px var(--q-acc)}
.qq-bar{position:sticky;bottom:12px;display:flex;align-items:center;gap:10px;padding:10px 16px;border-radius:12px;background:var(--q-card);border:1px solid var(--q-acc);box-shadow:0 10px 30px -12px color-mix(in srgb,var(--q-ink) 40%,transparent);flex-wrap:wrap}
.qq-srow{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 0;border-top:1px solid var(--q-line)}.qq-srow:first-of-type{border-top:0}.qq-srow>div:first-child{display:grid;gap:2px;min-width:0}.qq-srow>:last-child{flex:none}
.qq-seg{display:inline-flex;padding:3px;gap:2px;border-radius:10px;background:var(--q-card2);border:1px solid var(--q-line)}.qq-seg button{border:0;background:none;min-height:28px;color:var(--q-mut)}
.qq-seg button[aria-checked=true]{background:var(--q-card);color:var(--q-ink);box-shadow:0 1px 3px color-mix(in srgb,var(--q-ink) 16%,transparent);font-weight:600}
.qq button.qq-switch{position:relative;width:40px;min-width:40px;height:22px;min-height:22px;flex:none;padding:0;border-radius:11px;background:var(--q-card2);border:1px solid var(--q-line)}
.qq-switch::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--q-mut);transition:transform .16s}
.qq button.qq-switch[aria-checked=true]{background:var(--q-acc);border-color:var(--q-acc)}.qq-switch[aria-checked=true]::after{transform:translateX(18px);background:var(--q-on)}
.qq-grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px;align-items:start}
.qq-list{display:grid;max-height:340px;overflow:auto;border:1px solid var(--q-line);border-radius:10px}
.qq-person{display:flex;align-items:center;gap:10px;padding:8px 12px;border-top:1px solid var(--q-line);cursor:pointer}.qq-person:first-child{border-top:0}.qq-person input{width:16px;height:16px;min-height:0;accent-color:var(--q-acc)}
.qq-group{display:grid;gap:4px;padding:12px;border:1px solid var(--q-line);border-radius:12px}
.qq-status{padding:12px 18px;display:grid;grid-template-columns:auto minmax(0,1fr);gap:16px;align-items:center;overflow:visible}
.qq-chats{display:grid;grid-template-columns:250px minmax(0,1fr) 300px;gap:14px;align-items:start}
.qq-convs{display:grid;gap:4px;align-content:start}.qq button.qq-conv{width:100%;min-width:0;overflow:hidden;justify-content:flex-start;gap:10px;min-height:56px;padding:8px 10px;text-align:left;border-color:transparent;background:transparent}
.qq button.qq-conv[aria-current=true]{background:var(--q-card);border-color:var(--q-line)}.qq-conv .qq-trunc{display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.qq-thread{display:grid;gap:12px;max-height:560px;overflow:auto;padding:4px 2px}
.qq-msg{display:flex;gap:8px;align-items:flex-end;max-width:84%}.qq-msg.out{margin-left:auto;flex-direction:row-reverse}
.qq-bub{padding:8px 12px;border-radius:14px;background:var(--q-card2);white-space:pre-wrap;overflow-wrap:anywhere}.qq-msg.out .qq-bub{background:color-mix(in srgb,var(--q-acc) 16%,var(--q-card))}
.qq-meta{margin-top:3px;font-size:11px;color:var(--q-mut)}.qq-msg.out .qq-meta{text-align:right}
.qq-cmd{display:grid;gap:2px;padding:8px 10px;border-radius:8px;background:var(--q-card2)}.qq code{font:12px/1.5 ui-monospace,Consolas,monospace;word-break:break-all}
.qq details>summary{cursor:pointer;color:var(--q-mut);font-size:12px}
.qq-scrim{position:fixed;inset:0;z-index:50;display:grid;place-items:center;padding:16px;background:color-mix(in srgb,var(--q-ink) 40%,transparent)}
.qq-dlg{width:min(620px,100%);max-height:calc(100vh - 32px);overflow:auto;display:grid;gap:14px;padding:20px 22px;border-radius:var(--buddy-r-dlg,16px);background:var(--q-card);box-shadow:0 30px 80px -30px color-mix(in srgb,var(--q-ink) 60%,transparent)}
.qq-menu{position:relative}.qq-menu-list{position:absolute;right:0;top:calc(100% + 6px);z-index:20;display:grid;min-width:180px;padding:6px;border-radius:10px;background:var(--q-card);border:1px solid var(--q-line);box-shadow:0 14px 32px -14px color-mix(in srgb,var(--q-ink) 45%,transparent)}
.qq-menu-list button{border:0;justify-content:flex-start}
.qq-spin{width:14px;height:14px;border-radius:50%;border:2px solid color-mix(in srgb,var(--q-acc) 30%,transparent);border-top-color:var(--q-acc);animation:qq-spin .8s linear infinite;flex:none}
@keyframes qq-spin{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){.qq-spin{animation-duration:2.4s}.qq-switch::after{transition:none}}
@media (max-width:900px){.qq-chats{grid-template-columns:1fr}}@media (max-width:720px){.qq-op-picks{grid-template-columns:repeat(3,minmax(0,1fr))}}
`;
const ICON = {chat: 'M4 5h16v11H9l-5 4z', refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6', qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 18h2', x: 'M6 6l12 12M18 6L6 18', more: 'M5 12h.01M12 12h.01M19 12h.01', pause: 'M7 5h4v14H7zM13 5h4v14h-4z', play: 'M8 5v14l11-7z', check: 'M5 12l5 5 9-10', users: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20c0-3 3-5 6-5s6 2 6 5M16 5a3 3 0 0 1 0 6M18 15c2 .5 4 2 4 5', shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18', search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4', clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2', idcard: 'M3 5h18v14H3zM8.5 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM5.5 16c.6-1.8 1.8-2.6 3-2.6s2.4.8 3 2.6M14 9.5h4M14 13h3'};
// Character pictures come from the host as --buddy-face-<id> on :root (contract C-1); other ids, contacts and groups,
// and a missing variable, show the first letter.
const FACE_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const initial = name => Array.from(String(name || '?'))[0];
const MESSAGES = {QQ_MEMORY_ORIGINAL_CONTEXT_INVALID:["原发送身份或绑定已变化，请核对后再补记。", "The original send identity or binding has changed. Review it before retrying memory."],QQ_MEMORY_PROOF_INVALID:["成功发送证据校验失败，请核对。", "The successful-send proof could not be verified. Review this item."],QQ_MEMORY_PROOF_MISSING:["缺少宿主成功发送证据，无法补记。", "Host proof of a successful send is missing. Memory cannot be retried."],QQ_MEMORY_PROOF_CONFLICT:["同一发送的补记证据发生冲突，请核对。", "Conflicting memory proof was found for this send. Review this item."],QQ_MEMORY_LEGACY_PROOF_INCOMPLETE:["旧发送缺少完整宿主证据，请核对。", "The older send lacks complete host evidence. Review this item."],QQ_MEMORY_APPEND_UNCONFIRMED:["记忆尚未获得确认，请稍后查看补记状态。", "Memory has not been confirmed yet. Check its status shortly."],QQ_MEMORY_APPEND_FAILED:["补记暂时失败，请稍后查看补记状态。", "Memory could not be recorded yet. Check its status shortly."],QQ_MEMORY_REQUEST_REQUIRED:["请选择要补记的发送。", "Select the send whose memory should be retried."],QQ_MEMORY_RECOVERY_UNAVAILABLE:["请更新宿主后补记。", "Update the host before retrying memory."],QQ_RECONNECT_OPERATOR_CHANGED: ['接管角色或人生已经变了。请确认角色，再连接。', 'The character or life has changed. Confirm the character, then connect.'], QQ_DISCONNECT_BEFORE_ACCOUNT_CHANGE: ['更换账号前请先断开连接。', 'Disconnect before changing the account.'], QQ_CONNECTION_REQUIRED: ['先选一个已登录的 QQ 账号。', 'Choose a signed-in QQ account first.'], QQ_OPERATOR_REQUIRED: ['先选接管的角色。', 'Choose who answers first.'], QQ_USAGE_ACK_REQUIRED: HIGH_USAGE, QQ_SETUP_SELECTION_REQUIRED: ['请选择已连接的账号和角色。', 'Choose a connected account and a character.'], QQ_CONNECTION_ACCOUNT_MISMATCH: ['请选择当前已登录的账号连接。', 'Choose the account that is signed in now.'], SOCIAL_ONBOARDING_UNAVAILABLE: ['请更新 AI 酱后再用扫码连接。', 'Update AI Buddy to connect by QR.'], SOCIAL_ACCOUNT_REQUIRED: ['先扫码连接一个 QQ 账号。', 'Connect a QQ account by QR first.'], SOCIAL_ACCOUNT_CHANGED: ['QQ 账号刚刚变了，请刷新。', 'The QQ account just changed. Refresh.'], QQ_CONNECTION_REVOKED: ['设置期间账号或角色变了，请刷新后再试。', 'The account or character changed meanwhile. Refresh and try again.'], QQ_MANAGEMENT_ACCOUNT_MISMATCH: ['现在登录的 QQ 账号和设置里的不一样，请重新设置。', 'The signed-in QQ account differs from the one set up. Set up again.']};
const SENT = {sent: ['已发送', 'Sent', 'ok', 'check'], unknown: ['结果未知，等待核对', 'Unknown, checking', 'warn', 'clock'], failed: ['发送失败', 'Failed', 'err', 'x'], pending: ['正在发送', 'Sending', 'busy', 'clock'], sending: ['正在发送', 'Sending', 'busy', 'clock'], cancelled: ['已取消', 'Cancelled', 'muted', 'x']};
const idOk = value => /^[1-9]\d{0,19}$/.test(value);
const langOf = () => {const value = typeof document !== 'undefined' ? document.documentElement.dataset.buddyLang : null;return value ? (value === 'en' ? 'en' : 'zh-CN') : (typeof navigator !== 'undefined' && navigator.language?.startsWith('en') ? 'en' : 'zh-CN');};

export function createQqPage(React) {
  const h = React.createElement;
  const Icon = (name, size = 16) => h('svg', {width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true}, h('path', {d: ICON[name]}));
  const Spin = () => h('span', {className: 'qq-spin', 'aria-hidden': true});
  const Pill = (label, tone = 'muted') => h('span', {className: 'qq-pill ' + tone}, label);
  const Face = (id, name, cls = '') => h('span', {className: 'qq-face ' + cls, 'aria-hidden': true}, h('b', null, initial(name)), FACE_ID.test(id ?? '') && h('i', {style: {backgroundImage: 'var(--buddy-face-' + id + ',none)'}}));
  const Portrait = (id, name, cls = '') => h('span', {className: 'qq-portrait' + (cls ? ' ' + cls : ''), 'aria-hidden': true}, h('b', null, initial(name)), FACE_ID.test(id ?? '') && h('i', {style: {backgroundImage: 'var(--buddy-portrait-' + id + ',none)'}}));
  const GroupFace = () => h('span', {className: 'qq-face grp', 'aria-hidden': true}, Icon('users', 15));
  const Seg = ({label, value, options, onChange, disabled}) => h('div', {className: 'qq-seg', role: 'radiogroup', 'aria-label': label}, ...options.map(([v, text]) => h('button', {key: String(v), type: 'button', role: 'radio', 'aria-checked': v === value, disabled, onClick: () => v !== value && onChange(v)}, text)));
  const Switch = ({label, checked, onChange, disabled}) => h('button', {type: 'button', role: 'switch', className: 'qq-switch', 'aria-checked': !!checked, 'aria-label': label, disabled, onClick: () => onChange(!checked)});
  function Dialog({title, onClose, children, footer}) {
    const ref = React.useRef(null);
    React.useEffect(() => {const back = document.activeElement;ref.current?.querySelector('button.pri,input,button')?.focus();const key = e => {if (e.key === 'Escape') {e.preventDefault();onClose();}};document.addEventListener('keydown', key);return () => {document.removeEventListener('keydown', key);back?.focus?.();};}, []);
    return h('div', {className: 'qq-scrim', onMouseDown: e => {if (e.target === e.currentTarget) onClose();}}, h('div', {ref, className: 'qq-dlg', role: 'dialog', 'aria-modal': true, 'aria-label': title}, h('div', {className: 'qq-between'}, h('h2', null, title), h('button', {type: 'button', className: 'icon ghost', 'aria-label': '×', onClick: onClose}, Icon('x'))), children, footer && h('div', {className: 'qq-row', style: {justifyContent: 'flex-end'}}, footer)));
  }
  // No account connected (2.0.1 backends refused the read with SOCIAL_ACCOUNT_REQUIRED): nothing is set up yet.
  const NO_ACCOUNT = () => ({enabled: false, connected: false, operator: null, settings: {enabled: false, connectionRef: '', accountId: '', contacts: [], groups: [], proactiveContacts: false, updatePolicy: 'manual', replyStyle: 'inherit', conversationReplyStyles: {}}, startup: {autoResume: false}, accountRequired: true});
  return function QqPage() {
    const [lang, setLang] = React.useState(langOf), T = (zh, en) => lang === 'en' ? en : zh;
    const [ready, setReady] = React.useState(null), [readyError, setReadyError] = React.useState(null), [state, setState] = React.useState(null), [draft, setDraft] = React.useState(null), [readError, setReadError] = React.useState(null);
    const [choices, setChoices] = React.useState({characters: [], connections: []}), [history, setHistory] = React.useState(null), [directory, setDirectory] = React.useState(null), [dirError, setDirError] = React.useState(null), [chatCount, setChatCount] = React.useState(0);
    const [view, setView] = React.useState('account'), [setup, setSetup] = React.useState(null), [error, setError] = React.useState(null), [busy, setBusy] = React.useState(false);
    const [query, setQuery] = React.useState(''), [newContact, setNewContact] = React.useState(''), [newGroup, setNewGroup] = React.useState(''), [conversation, setConversation] = React.useState(''), [dialog, setDialog] = React.useState(null), [menu, setMenu] = React.useState(false);
    const mounted = React.useRef(true), styleDialogVersion = React.useRef(0), account = React.useRef(null), accountEpoch = React.useRef(0), refreshRequest = React.useRef(0), directoryRequest = React.useRef(0), readyRequest = React.useRef(0), historyRequest = React.useRef(0), historyFlight = React.useRef(null), latest = React.useRef({}), saved = React.useRef(null), dirTried = React.useRef(null);
    React.useEffect(() => {if (document.getElementById('qq-style')) return;const el = document.createElement('style');el.id = 'qq-style';el.textContent = CSS;document.head.append(el);}, []);
    React.useEffect(() => {const on = () => setLang(langOf());window.addEventListener('ai-buddy:appearance', on);return () => window.removeEventListener('ai-buddy:appearance', on);}, []);
    // C-4: after a QR login or an account removal the host tells every open plugin page; read status and accounts again.
    React.useEffect(() => {const on = () => {invalidateReads();setState(null);latest.current.refresh?.();};window.addEventListener('ai-buddy:social-accounts-changed', on);return () => window.removeEventListener('ai-buddy:social-accounts-changed', on);}, []);
    async function request(action, payload = {}, signal) {
      const response = await fetch(ROUTE, {method: 'POST', credentials: 'same-origin', headers: {'content-type': 'application/json'}, body: JSON.stringify({action, payload}), signal});
      const value = await response.json();
      if (!response.ok || value.error) throw Object.assign(new Error(value.error?.message || '操作未完成。'), {code: value.error?.code});
      return value;
    }
    // The server answers every refusal with one generic sentence; the page words it from the code and keeps the code
    // in the technical details.
    const fail = e => {if (mounted.current) setError({text: MESSAGES[e?.code] ? T(...MESSAGES[e.code]) : T('这一步没有完成。', 'That did not go through.'), detail: e?.code ?? e?.message});};
    const readFail = e => {if (mounted.current) setReadError({detail: e?.code ?? e?.message ?? 'read-failed'});};
    const currentRead = epoch => mounted.current && epoch === accountEpoch.current;
    function invalidateReads() {historyFlight.current = null;accountEpoch.current++;refreshRequest.current++;directoryRequest.current++;historyRequest.current++;readyRequest.current++;}
    function clearAccount() {styleDialogVersion.current++;saved.current = null;dirTried.current = null;setHistory(null);setConversation('');setDirectory(null);setDirError(null);setDraft(null);setSetup(null);setDialog(null);setMenu(false);setQuery('');setNewContact('');setNewGroup('');setChatCount(0);setError(null);setBusy(false);}
    function accountKey(current, values) {const list = values.connections ?? [], ref = current.settings?.connectionRef ?? '', id = current.settings?.accountId ?? '', selected = list.find(row => row.ref === ref) ?? list.find(row => row.accountId === id) ?? (list.length === 1 ? list[0] : null);return JSON.stringify(selected ? [selected.ref, selected.accountId] : [ref, id]);}
    async function refresh() {
      const requestNumber = ++refreshRequest.current, started = accountEpoch.current;let current, values;
      try {[current, values] = await Promise.all([request('status'), request('choices.get')]);}
      catch (e) {if (e?.code !== 'SOCIAL_ACCOUNT_REQUIRED') throw e;current = NO_ACCOUNT();values = {characters: [], connections: []};}
      if (!currentRead(started) || requestNumber !== refreshRequest.current) return;
      const key = accountKey(current, values), changed = account.current !== null && account.current !== key, before = changed ? null : saved.current;
      if (changed) {invalidateReads();clearAccount();}account.current = key;saved.current = current.settings;
      const epoch = accountEpoch.current, settled = refreshRequest.current;
      setReadError(null);setState(current);setDraft(old => !changed && old && before && JSON.stringify(old) !== JSON.stringify(before) ? old : structuredClone(current.settings));setChoices(values);
      if (current.settings.connectionRef && (latest.current.view === 'chats' || latest.current.hasHistory)) await loadHistory(changed ? '' : latest.current.conversation, settled);
      else if (current.settings.connectionRef) request('history.list', {limit: 1}).then(value => {if (currentRead(epoch) && settled === refreshRequest.current) setChatCount(value.conversations?.length ?? 0);}).catch(() => {});
    }
    const reload = () => {const epoch = accountEpoch.current;return refresh().catch(e => {if (currentRead(epoch)) readFail(e);});};
    const check = () => {
      mounted.current = true;setReadyError(null);setReady(null);const abort = new AbortController(), epoch = accountEpoch.current, requestNumber = ++readyRequest.current;
      fetch(ROUTE + '?action=readiness', {credentials: 'same-origin', signal: abort.signal}).then(response => response.json()).then(value => {if (!currentRead(epoch) || requestNumber !== readyRequest.current) return;setReady(value);if (value.mode === 'runtime') return reload();}).catch(value => {if (currentRead(epoch) && requestNumber === readyRequest.current && value.name !== 'AbortError') setReadyError({detail: String(value?.message ?? value)});});
      return () => {mounted.current = false;invalidateReads();abort.abort();};
    };
    React.useEffect(check, []);
    latest.current = {view, conversation, hasHistory: history !== null, refresh: () => ready?.mode === 'runtime' ? reload() : check()};
    async function act(action, payload) {
      const epoch = accountEpoch.current;setBusy(true);setError(null);try {const value = await request(action, payload);if (!currentRead(epoch)) return null;if (action !== 'onboarding.open') await reload();return currentRead(epoch) ? value || true : null;} catch (value) {if (currentRead(epoch)) fail(value);return null;} finally {if (currentRead(epoch)) setBusy(false);}
    }
    async function toggleResume(on) {
      const epoch = accountEpoch.current;setBusy(true);setError(null);
      try {await request('startup.update', {autoResume: on});if (currentRead(epoch)) await reload();}
      catch (e) {if (!currentRead(epoch)) return;if (on && e?.code === 'SOCIAL_SETUP_DENIED') setError({text: T('这个版本的 AI 酱还不能在这里打开，请用「更多 › 重新设置…」。', 'This AI Buddy version cannot switch it on here yet. Use More › Set up again….'), detail: e.code});else fail(e);}
      finally {if (currentRead(epoch)) setBusy(false);}
    }
    // Names are scoped to the account the request started for, including late directory replies.
    async function loadContacts(quiet = false) {
      const epoch = accountEpoch.current, requestNumber = ++directoryRequest.current, ref = setup?.connectionRef ?? state?.settings?.connectionRef;
      if (!quiet) {setBusy(true);setError(null);}
      try {const value = await request('onboarding.contacts');if (currentRead(epoch) && requestNumber === directoryRequest.current && (!ref || value.accountRef === ref)) {setDirectory(value);setDirError(null);}}
      catch (value) {if (!currentRead(epoch) || requestNumber !== directoryRequest.current) return;if (quiet) setDirError(value?.code ?? value?.message ?? 'contacts');else fail(value);}
      finally {if (!quiet && currentRead(epoch) && requestNumber === directoryRequest.current) setBusy(false);}
    }
    async function loadHistory(conversationId = conversation, refreshed = null) {
      const requestNumber = ++historyRequest.current, epoch = accountEpoch.current, flight = {epoch, requestNumber};historyFlight.current = flight;
      const valid = () => currentRead(epoch) && requestNumber === historyRequest.current && (refreshed === null || refreshed === refreshRequest.current);
      try {
        let value = await request('history.list', {limit: 50, ...(conversationId ? {conversationId} : {})});if (!valid()) return;
        if (!conversationId && value.conversations.length) {conversationId = value.conversations[0].conversationId;value = await request('history.list', {limit: 50, conversationId});if (!valid()) return;}
        const overview = await request('history.list', {limit: 200});
        if (valid()) {setConversation(conversationId);setHistory({...value, conversations: overview.conversations, overview});setChatCount(overview.conversations.length);}
      } catch (e) {if (valid()) fail(e);} finally {if (historyFlight.current === flight) historyFlight.current = null;}
    }
    React.useEffect(() => {if (view === 'chats' && state && !history && !historyFlight.current) void loadHistory('');}, [view, state]);
    const dirAccount = setup?.connectionRef ?? state?.settings?.connectionRef;
    React.useEffect(() => {if (!dirAccount || directory?.accountRef === dirAccount || dirTried.current === dirAccount || !(setup ? setup.step === 2 : ['allow', 'chats'].includes(view))) return;dirTried.current = dirAccount;void loadContacts(true);}, [dirAccount, directory, view, setup?.step]);
    React.useEffect(() => {if (!menu) return;const away = e => {if (!e.target.closest?.('.qq-menu')) setMenu(false);}, key = e => {if (e.key === 'Escape') setMenu(false);};document.addEventListener('mousedown', away);document.addEventListener('keydown', key);return () => {document.removeEventListener('mousedown', away);document.removeEventListener('keydown', key);};}, [menu]);

    const nameOfContact = id => directory?.contacts?.find(v => v.id === id)?.label;
    const nameOfGroup = id => directory?.groups?.find(v => v.id === id)?.label;
    const conversationName = c => c.conversationType === 'group' ? nameOfGroup(c.peerId) ?? T('群 ', 'Group ') + c.peerId : nameOfContact(c.peerId) ?? 'QQ ' + c.peerId;
    const time = value => {const d = new Date(typeof value === 'number' ? value : Date.parse(value));if (Number.isNaN(d.getTime())) return '';const today = new Date().toDateString() === d.toDateString();return new Intl.DateTimeFormat(lang, today ? {hour: '2-digit', minute: '2-digit', hourCycle: 'h23'} : {month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).format(d);};
    const details = detail => detail && h('details', null, h('summary', null, T('技术详情', 'Technical details')), h('code', null, detail));
    const actions = () => state && h('div', {className: 'qq-row qq-acts'}, !(state.settings.enabled && state.settings.connectionRef && state.operator) && !state.connected ? Pill(T('还没设置好', 'Not set up yet')) : state.connected ? Pill(T('运行中', 'Running'), 'ok') : state.settings.enabled ? Pill(T('未连接', 'Not connected'), 'warn') : Pill(T('已暂停', 'Paused')), h('button', {type: 'button', className: 'icon', 'aria-label': T('刷新', 'Refresh'), title: T('刷新', 'Refresh'), disabled: busy, onClick: reload}, Icon('refresh')));
    const header = h('header', {className: 'qq-head'}, h('span', {className: 'qq-logo'}, Icon('chat', 24)), h('div', {className: 'qq-grow'}, h('h1', null, T('QQ连接', 'QQ Connect')), h('p', {className: 'qq-mut'}, T('选一个 QQ 账号和接管角色，只在允许名单里聊天。AI 酱最小化时继续，真正退出后停止。', 'Pick a QQ account and who answers; she chats only with the people you allow. Keeps going while AI Buddy is minimized, stops when it quits.'))), actions());
    const errorBar = error && h('div', {className: 'qq-alert err', role: 'alert'}, h('div', {className: 'qq-grow'}, h('b', null, error.text), details(error.detail)), h('button', {type: 'button', className: 'sm ghost', onClick: () => setError(null)}, T('知道了', 'Dismiss')));
    const safe = T('不会连接 QQ，也不会发消息。可以重试，或稍后再打开。', 'Nothing connects to QQ or sends messages. Retry or come back later.');
    // Reading failures are the yellow card of E1 with the code in a technical-details fold; failed actions stay red.
    const notice = (title, text, retry, detail) => h('div', {className: 'qq-card'}, h('div', {className: 'qq-alert', role: 'alert'}, h('div', {className: 'qq-grow'}, h('b', null, title), h('p', null, text), details(detail))), h('div', {className: 'qq-row'}, h('button', {type: 'button', className: 'pri', onClick: retry}, Icon('refresh'), T('重试', 'Retry'))));
    const readBar = state && readError && h('div', {className: 'qq-alert', role: 'alert'}, h('div', {className: 'qq-grow'}, h('b', null, T('暂时读不到最新状态', 'The latest status could not be read')), details(readError.detail)), h('button', {type: 'button', className: 'sm', onClick: reload}, Icon('refresh', 14), T('重试', 'Retry')));
    // The tab row (or the setup steps) carries a second copy of the actions. CSS shows exactly one of the two (the
    // header's in its own window, this one under html[data-buddy-embedded]), so the page follows the attribute live.
    const tabRow = tabs => {const acts = actions();return (tabs || acts) && h('div', {className: tabs ? 'qq-tabrow' : 'qq-tabrow bare'}, tabs, acts);};
    const shell = (tabs, ...children) => h('main', {className: 'qq'}, h('div', {className: 'qq-wrap'}, header, errorBar, readBar, tabRow(tabs), ...children));

    if (readyError) return shell(null, notice(T('暂时读不到插件状态', 'Plugin status is unavailable'), safe, check, readyError.detail));
    if (!ready) return shell(null, h('div', {className: 'qq-card'}, h('div', {className: 'qq-empty', role: 'status'}, Spin(), h('p', {className: 'qq-mut'}, T('正在读取插件状态…', 'Reading plugin status…')))));
    if (ready.mode !== 'runtime') return shell(null, h('div', {className: 'qq-card'}, h('div', {className: 'qq-empty', role: 'status'}, Spin(), h('h2', null, T('正在等 AI 酱连上', 'Waiting for AI Buddy')), h('p', {className: 'qq-mut'}, T('AI 酱还没提供这个插件需要的社交服务。现在不会连接 QQ，也不会发消息。安装、账号登录和允许自动对话是分别设置的。', 'AI Buddy has not provided the social service this plugin needs. Nothing connects to QQ or sends messages. Installing, signing in and allowing chats are set separately.')), h('button', {type: 'button', onClick: check}, Icon('refresh'), T('重新检查', 'Check again')), (ready.blockers ?? []).length > 0 && details(ready.blockers.join(' · ')))));
    if (!state || !draft) return shell(null, readError ? notice(T('暂时读不到插件状态', 'Plugin status is unavailable'), safe, reload, readError.detail) : h('div', {className: 'qq-card'}, h('div', {className: 'qq-empty', role: 'status'}, Spin(), h('p', {className: 'qq-mut'}, T('正在读取设置…', 'Reading settings…')))));

    // C-2: a character id is never shown. Names come from the character list; a stored name that equals the id
    // (2.0.1 bindings) does not count, and the last resort is a neutral word.
    const characterName = id => choices.characters.find(v => v.id === id)?.label || null;
    const pickName = id => characterName(id) ?? T('未命名角色', 'Unnamed character');
    const operatorName = () => characterName(state.operator?.characterId) ?? (state.operator?.displayName && state.operator.displayName !== state.operator.characterId ? state.operator.displayName : T('当前角色', 'current character'));
    const accountRow = choices.connections.find(v => v.ref === state.settings.connectionRef);
    const characterPicker = (value, onPick) => h('div', {className: 'qq-picks qq-op-picks', role: 'group', 'aria-label': T('接管角色', 'Character')}, ...choices.characters.map(c => h('button', {key: c.id, type: 'button', className: 'qq-pick qq-op-pick', 'aria-pressed': value === c.id, onClick: () => onPick(c.id)}, Portrait(c.id, pickName(c.id)), h('b', null, pickName(c.id)), value === c.id && h('span', {className: 'qq-op-check'}, Icon('check', 12)))), !choices.characters.length && h('p', {className: 'qq-cap'}, T('AI 酱还没提供可选角色。', 'AI Buddy has not offered any characters yet.')));

    // F2 · allow-list editor, used both in setup and in its own tab
    function allowList(list, setList, withProactive = true) {
      const contacts = directory?.accountRef === dirAccount ? directory.contacts : null;
      const groupsDir = directory?.accountRef === dirAccount ? directory.groups : null;
      const q = query.trim().toLowerCase(), shown = (contacts ?? []).filter(c => !q || c.label.toLowerCase().includes(q) || c.id.includes(q));
      const extra = list.contacts.filter(id => !(contacts ?? []).some(c => c.id === id));
      const toggleContact = (id, on) => setList({...list, contacts: on ? [...new Set([...list.contacts, id])] : list.contacts.filter(x => x !== id)});
      const addGroup = id => setList({...list, groups: [...list.groups.filter(g => g.id !== id), {id, naturalParticipation: false, quietOpener: false, highUsageAcknowledged: false}]});
      const groupPatch = (id, patch) => setList({...list, groups: list.groups.map(g => g.id === id ? {...g, ...patch} : g)});
      const contactBad = newContact !== '' && !idOk(newContact), groupBad = newGroup !== '' && !idOk(newGroup), groupKnown = !groupBad && list.groups.some(g => g.id === newGroup);
      const reply = list.proactiveContacts ? T('也会主动私聊', 'May message first') : T('只回复', 'Replies only');
      return h(React.Fragment, null,
        h('p', {className: 'qq-cap'}, T('默认谁都不选。群里默认只在被 @ 或被引用回复时说话。', 'Nobody is selected by default. In groups she speaks only when @-mentioned or quoted.')),
        h('div', {className: 'qq-grid2'},
          h('section', {className: 'qq-card', 'aria-label': T('联系人', 'Contacts')}, h('div', {className: 'qq-between'}, h('h2', null, T('联系人', 'Contacts')), Pill(T('已选 {n}', '{n} selected').replace('{n}', list.contacts.length), list.contacts.length ? 'busy' : 'muted')),
            contacts ? h(React.Fragment, null, h('label', {className: 'qq-row'}, Icon('search'), h('input', {className: 'qq-grow', type: 'search', 'aria-label': T('搜索名字或 QQ 号', 'Search name or QQ number'), placeholder: T('搜索名字或 QQ 号', 'Search name or QQ number'), value: query, onChange: e => setQuery(e.target.value)})),
              h('div', {className: 'qq-list'}, ...shown.map(c => {const on = list.contacts.includes(c.id);return h('label', {key: c.id, className: 'qq-person'}, h('input', {type: 'checkbox', checked: on, onChange: e => toggleContact(c.id, e.target.checked)}), Face(null, c.label), h('span', {className: 'qq-grow'}, h('b', null, c.label), h('div', {className: 'qq-cap qq-num'}, c.id)), on && h('span', {className: 'qq-cap'}, reply));}), !shown.length && h('p', {className: 'qq-cap', style: {padding: 12}}, T('没有匹配的联系人。', 'No matching contacts.'))))
              : h(React.Fragment, null, h('div', {className: 'qq-row'}, h('button', {type: 'button', disabled: busy || !dirAccount, onClick: () => loadContacts()}, Icon('users', 14), T('从通讯录选择', 'Choose from contacts')), h('span', {className: 'qq-cap'}, dirError ? T('通讯录暂时读不到，可以再试一次，或按 QQ 号添加。', 'Contacts could not be read. Try again, or add by QQ number.') : T('读取这个账号的联系人和群，只用来挑选。', 'Reads this account’s contacts and groups, only for picking.'))), details(dirError)),
            extra.length > 0 && h('div', {className: 'qq-row'}, ...extra.map(id => h('span', {key: id, className: 'qq-pill busy'}, 'QQ ' + id, h('button', {type: 'button', className: 'icon ghost sm', style: {width: 22, minHeight: 22}, 'aria-label': T('移除 {id}', 'Remove {id}').replace('{id}', id), onClick: () => toggleContact(id, false)}, Icon('x', 12))))),
            h('div', {className: 'qq-row'}, h('input', {className: 'qq-grow', inputMode: 'numeric', 'aria-label': T('按 QQ 号添加', 'Add by QQ number'), placeholder: T('按 QQ 号添加', 'Add by QQ number'), value: newContact, 'aria-invalid': contactBad, onChange: e => setNewContact(e.target.value.trim())}), h('button', {type: 'button', className: 'sm', disabled: !newContact || contactBad, onClick: () => {toggleContact(newContact, true);setNewContact('');}}, T('添加', 'Add'))),
            contactBad && h('span', {className: 'qq-cap', style: {color: 'var(--q-err)'}}, T('QQ 号只能是数字', 'QQ numbers are digits only')),
            withProactive && h('div', {className: 'qq-srow'}, h('div', null, h('b', null, T('允许主动给这些联系人发私聊', 'May message these contacts first')), h('span', {className: 'qq-cap'}, T('默认关闭', 'Off by default'))), h(Switch, {label: T('允许主动给这些联系人发私聊', 'May message these contacts first'), checked: list.proactiveContacts, onChange: v => setList({...list, proactiveContacts: v})}))),
          h('section', {className: 'qq-card', 'aria-label': T('群', 'Groups')}, h('div', {className: 'qq-between'}, h('h2', null, T('群', 'Groups')), Pill(String(list.groups.length), list.groups.length ? 'busy' : 'muted')),
            ...list.groups.map(g => h('div', {key: g.id, className: 'qq-group'}, h('div', {className: 'qq-row'}, GroupFace(), h('div', {className: 'qq-grow'}, h('b', null, nameOfGroup(g.id) ?? T('群 ', 'Group ') + g.id), h('div', {className: 'qq-cap qq-num'}, T('群号 ', 'Group ') + g.id)), h('button', {type: 'button', className: 'icon ghost', 'aria-label': T('移除这个群', 'Remove this group'), onClick: () => setList({...list, groups: list.groups.filter(x => x.id !== g.id)})}, Icon('x'))),
              h('div', {className: 'qq-srow'}, h('div', null, h('b', null, T('什么时候说话', 'When she speaks'))), h(Seg, {label: T('什么时候说话', 'When she speaks'), value: g.naturalParticipation, options: [[false, T('被 @ 或引用才回复', 'Only when @ or quoted')], [true, T('自然参与已有话题', 'Join ongoing topics')]], onChange: v => groupPatch(g.id, {naturalParticipation: v})})),
              h('div', {className: 'qq-srow'}, h('div', null, h('b', null, T('安静时主动开话题', 'Start topics when quiet'))), h(Switch, {label: T('安静时主动开话题', 'Start topics when quiet'), checked: g.quietOpener, onChange: v => v ? setDialog({kind: 'usage', groupId: g.id, apply: () => groupPatch(g.id, {quietOpener: true, highUsageAcknowledged: true})}) : groupPatch(g.id, {quietOpener: false})})),
              g.quietOpener && h('div', {className: 'qq-alert'}, h('span', null, T(...HIGH_USAGE))))),
            !list.groups.length && h('p', {className: 'qq-cap'}, T('还没有允许的群。', 'No groups allowed yet.')),
            groupsDir && groupsDir.filter(g => !list.groups.some(x => x.id === g.id)).length > 0 && h('details', null, h('summary', null, T('从通讯录添加群', 'Add a group from contacts')), h('div', {className: 'qq-list'}, ...groupsDir.filter(g => !list.groups.some(x => x.id === g.id)).map(g => h('div', {key: g.id, className: 'qq-person'}, GroupFace(), h('span', {className: 'qq-grow'}, h('b', null, g.label), h('div', {className: 'qq-cap qq-num'}, g.id)), h('button', {type: 'button', className: 'sm', onClick: () => addGroup(g.id)}, T('添加', 'Add')))))),
            h('div', {className: 'qq-row'}, h('input', {className: 'qq-grow', inputMode: 'numeric', 'aria-label': T('新增允许群的群号', 'Group number to allow'), placeholder: T('群号', 'Group number'), value: newGroup, 'aria-invalid': groupBad, onChange: e => setNewGroup(e.target.value.trim())}), h('button', {type: 'button', className: 'sm', disabled: !newGroup || groupBad || groupKnown, onClick: () => {addGroup(newGroup);setNewGroup('');}}, T('添加群', 'Add group'))),
            groupBad && h('span', {className: 'qq-cap', style: {color: 'var(--q-err)'}}, T('群号只能是数字', 'Group numbers are digits only')),
            groupKnown && h('span', {className: 'qq-cap'}, T('这个群已经在名单里。', 'This group is already on the list.')))));
    }
    const usageDialog = dialog?.kind === 'usage' && h(Dialog, {title: T('安静时主动开话题', 'Start topics when quiet'), onClose: () => setDialog(null), footer: [h('button', {key: 'c', type: 'button', className: 'ghost', onClick: () => setDialog(null)}, T('先不开', 'Not now')), h('button', {key: 'o', type: 'button', className: 'pri', onClick: () => {dialog.apply();setDialog(null);}}, T('我知道，开启', 'I understand, turn it on'))]}, h('p', null, T(...HIGH_USAGE)), h('p', {className: 'qq-cap'}, T('保存允许名单后才生效。', 'Takes effect after you save the allow-list.')));

    // F1 · first-time setup in four steps (also what a page with no QQ account opens on)
    const configured = !!(state.settings.enabled && state.settings.connectionRef && state.operator);
    if (!configured || setup) {
      const s = setup ?? {step: 0, connectionRef: state.settings.connectionRef || (choices.connections.length === 1 ? choices.connections[0].ref : ''), characterId: state.operator?.characterId ?? '', list: {contacts: [...state.settings.contacts], groups: structuredClone(state.settings.groups), proactiveContacts: false}, autoResume: state.startup?.autoResume === true};
      const go = patch => setSetup({...s, ...patch}), labels = [T('账号', 'Account'), T('接管角色', 'Character'), T('允许范围', 'Allow-list'), T('启用', 'Enable')];
      const account = choices.connections.find(v => v.ref === s.connectionRef);
      const body = [
        h('section', {className: 'qq-card', key: 0}, h('h2', null, T('用哪个 QQ 账号？', 'Which QQ account?')),
          choices.connections.length ? h('div', {className: 'qq-picks'}, ...choices.connections.map(c => h('button', {key: c.ref, type: 'button', className: 'qq-pick', 'aria-pressed': s.connectionRef === c.ref, onClick: () => {go({connectionRef: c.ref, list: {contacts: [], groups: [], proactiveContacts: false}});setDirectory(null);}}, Face(null, c.label, 'lg'), h('b', null, c.label), h('span', {className: 'qq-cap qq-num'}, c.accountId))))
            : h('div', {className: 'qq-empty'}, Icon('qr', 28), h('p', {className: 'qq-mut'}, T('还没有已登录的 QQ 账号。点「扫码连接」，AI 酱会准备组件并显示二维码。', 'No QQ account is signed in yet. Press Connect by QR; AI Buddy prepares the component and shows a code.')), state.storedAccountData && h('p', {className: 'qq-cap'}, T('之前账号的聊天记录都还在，连回同一个账号后会显示。', 'Chats from an earlier account are kept and show again when you connect that account.'))),
          h('div', {className: 'qq-row'}, h('button', {type: 'button', className: choices.connections.length ? '' : 'pri', disabled: busy, onClick: () => act('onboarding.open')}, Icon('qr', 14), T('扫码连接', 'Connect by QR')), h('button', {type: 'button', className: 'ghost', disabled: busy, onClick: reload}, Icon('refresh', 14), T('刷新账号', 'Refresh accounts')))),
        h('section', {className: 'qq-card', key: 1}, h('div', {className: 'qq-between'}, h('h2', null, T('谁来接管这个 QQ？', 'Who answers on this QQ?')), account && h('span', {className: 'qq-cap'}, T('账号：', 'Account: ') + account.label)), characterPicker(s.characterId, id => go({characterId: id})),
          h('p', {className: 'qq-cap'}, T('QQ 里的接管者和 AI 酱当前的角色是分开的，人生和身份也分开。换人后，她会在每个会话的下一次回复里自我介绍。', 'The QQ character is separate from the app’s current one, with its own life and persona. After a change she introduces herself in each chat’s next reply.')),
          h('div', {className: 'qq-srow'}, h('div', null, h('b', null, T('AI 酱启动时自动恢复这个账号和角色', 'Resume this account and character when AI Buddy starts'))), h(Switch, {label: T('AI 酱启动时自动恢复这个账号和角色', 'Resume this account and character when AI Buddy starts'), checked: s.autoResume, onChange: v => go({autoResume: v})}))),
        h('div', {key: 2, style: {display: 'grid', gap: 14}}, allowList(s.list, list => go({list}), false)),
        h('section', {className: 'qq-card', key: 3}, h('h2', null, T('确认后启用', 'Confirm and enable')),
          ...[[T('账号', 'Account'), account?.label ?? '—'], [T('接管角色', 'Character'), s.characterId ? pickName(s.characterId) : '—'], [T('允许范围', 'Allow-list'), T('{c} 位联系人 · {g} 个群', '{c} contacts · {g} groups').replace('{c}', s.list.contacts.length).replace('{g}', s.list.groups.length)], [T('启动时自动恢复', 'Resume on start'), s.autoResume ? T('开', 'On') : T('关', 'Off')]].map(([k, v]) => h('div', {key: k, className: 'qq-srow'}, h('div', null, h('span', {className: 'qq-cap'}, k), h('b', null, v)))),
          h('div', {className: 'qq-alert info'}, h('span', null, T('第一次连接和每次重连后只处理新消息，不会补回或回复离线期间的消息。主动私聊默认关闭，启用后可以在允许名单里打开。', 'After the first connection and every reconnect, only new messages are handled; nothing from the offline period is answered. Messaging first stays off; you can turn it on in the allow-list afterwards.')))),
      ];
      const canNext = [!!s.connectionRef, !!s.characterId, true, !!s.connectionRef && !!s.characterId][s.step];
      const next = async () => {if (s.step < 3) return go({step: s.step + 1});if (await act('setup.finish', {connectionRef: s.connectionRef, characterId: s.characterId, contacts: s.list.contacts, groups: s.list.groups, autoResume: s.autoResume})) {setSetup(null);setView('account');}};
      return shell(h('ol', {className: 'qq-steps', 'aria-label': T('设置步骤', 'Setup steps')}, ...labels.map((label, i) => h('li', {key: i, className: i < s.step ? 'done' : i === s.step ? 'cur' : '', 'aria-current': i === s.step ? 'step' : undefined}, h('span', null, i < s.step ? Icon('check', 12) : i + 1), label))), body[s.step], usageDialog,
        h('div', {className: 'qq-bar'}, h('span', {className: 'qq-cap qq-grow'}, T('第 {n} 步，共 4 步 · 全部设好前不会回复任何消息', 'Step {n} of 4 · nothing is answered until setup is done').replace('{n}', s.step + 1)),
          configured && h('button', {type: 'button', className: 'ghost', onClick: () => setSetup(null)}, T('取消', 'Cancel')),
          s.step > 0 && h('button', {type: 'button', className: 'ghost', onClick: () => go({step: s.step - 1})}, T('上一步', 'Back')),
          h('button', {type: 'button', className: 'pri', disabled: busy || !canNext, onClick: next}, [T('下一步：接管角色', 'Next: character'), T('下一步：允许范围', 'Next: allow-list'), T('下一步：确认', 'Next: confirm'), T('确认并启用', 'Confirm and enable')][s.step])));
    }

    const styleName = value => ({inherit: T('继承', 'Inherit'), brief: T('简短', 'Brief'), natural: T('自然', 'Natural'), detailed: T('详细', 'Detailed')})[value] ?? T('全局默认', 'Global default');
    const openReplyStyle = (target = 'default') => {styleDialogVersion.current++;setDialog({kind: 'reply-style', target, replyStyle: state.settings.replyStyle ?? 'inherit', conversationReplyStyles: {...state.settings.conversationReplyStyles}});};
    const closeReplyStyle = () => {styleDialogVersion.current++;setDialog(null);};
    const styleTargets = [...new Map([...state.settings.contacts.map(id => ['private:' + id, (nameOfContact(id) ?? 'QQ ' + id)]), ...state.settings.groups.map(g => ['group:' + g.id, nameOfGroup(g.id) ?? T('群 ', 'Group ') + g.id]), ...(history?.conversations ?? []).map(c => [c.conversationId, conversationName(c)])].map(row => [row[0], row])).values()];
    const styleValue = dialog?.target === 'default' ? dialog?.replyStyle : dialog?.conversationReplyStyles?.[dialog?.target] ?? 'inherit';
    const effectiveStyle = dialog?.target !== 'default' && styleValue !== 'inherit' ? styleValue : dialog?.replyStyle !== 'inherit' ? dialog?.replyStyle : choices.globalReplyStyle;
    const stylePanel = h('section', {className: 'qq-card', 'aria-label': T('QQ 回复风格', 'QQ reply style')}, h('div', {className: 'qq-between'}, h('div', null, h('h2', null, T('回复风格', 'Reply style')), h('p', {className: 'qq-cap'}, (state.settings.replyStyle ?? 'inherit') === 'inherit' ? T('继承全局默认', 'Inherit global default') + (choices.globalReplyStyle ? ' · ' + styleName(choices.globalReplyStyle) : '') : styleName(state.settings.replyStyle))), h('button', {type: 'button', disabled: busy, onClick: () => openReplyStyle()}, T('回复风格…', 'Reply style…'))));

    // F1 · status after setup
    const contacts = state.settings.contacts.length, groups = state.settings.groups.length, opName = operatorName();
    const checked = state.connected && state.checkedAt ? ' · ' + T('上次检查 {t} 通过', 'checked {t}, OK').replace('{t}', time(state.checkedAt)) : '';
    const transportCode=state.transportError?.code??state.transportError,reconnecting=['waiting','reconnecting'].includes(state.reconnect?.phase);
    const connectionLabel=reconnecting?T('正在重新连接（第 {n} 次）','Reconnecting (attempt {n})').replace('{n}',Math.max(1,state.reconnect.attempt+(state.reconnect.phase==='waiting'?1:0))):T('连接断开了','Connection disconnected');
    const accountView = h(React.Fragment, null, stylePanel,
      h('section', {className: 'qq-card qq-status', 'aria-label': T('接管状态', 'Who is answering')}, Portrait(state.operator.characterId, opName, 'status'),
        h('div', {style: {display: 'grid', gap: 8, minWidth: 0}}, h('div', {className: 'qq-row'}, h('h2', null, T('{name} 正在接管「{account}」', '{name} is answering on “{account}”').replace('{name}', opName).replace('{account}', accountRow?.label ?? state.settings.accountId)), state.connected ? Pill(T('运行中', 'Running'), 'ok') : state.settings.enabled ? Pill(T('未连接', 'Not connected'), 'warn') : Pill(T('已暂停', 'Paused'))),
          h('span', {className: 'qq-cap qq-num'}, state.settings.accountId + ' · ' + T('允许 {c} 位联系人和 {g} 个群', '{c} contacts and {g} groups allowed').replace('{c}', contacts).replace('{g}', groups) + checked),
          (state.transportError||reconnecting) && h('div', {className: 'qq-alert'}, h('div', {className: 'qq-grow'}, h('span', null, transportCode==='QQ_CLOCK_SKEW'?T('电脑时间不准，可能收不到消息。','The computer clock may be incorrect; messages may not arrive.'):state.connected?T('运行中','Running'):connectionLabel), state.transportError&&details(typeof state.transportError==='object'?JSON.stringify(state.transportError):String(state.transportError)))),
          h('div', {className: 'qq-row'}, h('button', {type: 'button', className: 'sm', disabled: busy, onClick: () => setDialog({kind: 'operator', characterId: state.operator.characterId})}, T('换一位角色…', 'Change character…')),
            state.settings.enabled ? h('button', {type: 'button', className: 'sm ghost', disabled: busy, onClick: () => act('settings.update', {settings: {...state.settings, enabled: false}})}, Icon('pause', 14), T('暂停自动回复', 'Pause replies'))
              : h('button', {type: 'button', className: 'sm pri', disabled: busy, onClick: async () => {if (await act('settings.update', {settings: {...state.settings, enabled: true}})) await act('connect');}}, Icon('play', 14), T('恢复自动回复', 'Resume replies')),
            state.settings.enabled && !state.connected && h('button', {type: 'button', className: 'sm pri', disabled: busy||reconnecting, onClick: () => act('connect')}, T('重新连接', 'Reconnect')),
            h('div', {className: 'qq-menu'}, h('button', {type: 'button', className: 'icon', 'aria-label': T('更多', 'More'), 'aria-expanded': menu, onClick: () => setMenu(!menu)}, Icon('more')), menu && h('div', {className: 'qq-menu-list', role: 'menu'},
              h('button', {type: 'button', role: 'menuitem', onClick: () => {setMenu(false);setSetup({step: 0, connectionRef: state.settings.connectionRef, characterId: state.operator.characterId, list: {contacts: [...state.settings.contacts], groups: structuredClone(state.settings.groups), proactiveContacts: false}, autoResume: state.startup?.autoResume === true});}}, T('重新设置…', 'Set up again…')),
              h('button', {type: 'button', role: 'menuitem', className: 'danger', disabled: !state.connected, onClick: () => {setMenu(false);setDialog({kind: 'disconnect'});}}, T('断开连接…', 'Disconnect…'))))))),
      h('section', {className: 'qq-card', 'aria-label': T('账号', 'Account')},
        h('div', {className: 'qq-srow'}, h('div', null, h('b', null, T('AI 酱启动时自动恢复', 'Resume when AI Buddy starts')), h('span', {className: 'qq-cap'}, T('恢复这个账号和接管角色', 'This account and character'))), h(Switch, {label: T('AI 酱启动时自动恢复', 'Resume when AI Buddy starts'), checked: state.startup?.autoResume === true, disabled: busy, onChange: toggleResume})),
        h('div', {className: 'qq-srow'}, h('div', null, h('b', null, T('账号', 'Account')), h('span', {className: 'qq-cap'}, T('在扩展中心的「账号连接」里管理', 'Managed under Extensions › Accounts'))), h('span', {className: 'qq-num'}, (accountRow?.label ?? '—') + ' · ' + state.settings.accountId))),
      h('div', {className: 'qq-alert info'}, h('span', null, T('第一次连接和每次重连后只处理新消息，不会补回或回复离线期间的消息。语音消息暂不支持。', 'After the first connection and every reconnect, only new messages are handled; nothing from the offline period is answered. Voice messages are not supported yet.'))));

    // F3 · chats and the trusted owner's commands
    const picked = history?.conversations.find(c => c.conversationId === conversation);
    const thread = history ? [...history.messages.map(m => ({kind: 'in', at: m.received_at ?? Date.parse(m.event?.occurredAt), key: m.message_key, text: m.event?.plainText || T('图片或附件', 'Image or attachment'), sender: m.sender_id})), ...history.outbox.map(o => ({kind: 'out', at: o.created_at, key: o.request_id, text: o.display_text_value ?? o.text_value, status: o.status, memoryState:o.memoryState,memoryRetryAvailable:o.memoryRetryAvailable, sources: (o.sourceGroups ?? []).reduce((n, g) => n + g.sources.length, 0), groups: o.sourceGroups}))].sort((a, b) => a.at - b.at) : [];
    const lastText = id => {const o = history?.overview; if (!o) return '';const rows = [...o.messages.filter(m => m.conversation_id === id).map(m => [m.received_at, m.event?.plainText]), ...o.outbox.filter(m => m.conversation_id === id).map(m => [m.created_at, opName + '：' + (m.display_text_value ?? m.text_value)])].sort((a, b) => b[0] - a[0]);return rows[0]?.[1] ?? '';};
    const sent = status => {const row = SENT[status];return row && h('span', {className: 'qq-st ' + row[2]}, Icon(row[3], 11), T(row[0], row[1]));};
    const chatsView = h('div', {className: 'qq-chats'},
      h('nav', {className: 'qq-convs', 'aria-label': T('会话', 'Conversations')}, !history ? h('div', {className: 'qq-row'}, Spin(), h('span', {className: 'qq-cap'}, T('正在读取会话…', 'Reading chats…'))) : !history.conversations.length ? h('p', {className: 'qq-cap'}, T('还没有会话。允许名单里的人发来消息后会出现在这里。', 'No chats yet. Messages from people you allow show up here.')) : null,
        ...(history?.conversations ?? []).map(c => h('button', {key: c.conversationId, type: 'button', className: 'qq-conv', 'aria-current': c.conversationId === conversation, onClick: () => loadHistory(c.conversationId)}, c.conversationType === 'group' ? GroupFace() : Face(null, conversationName(c)), h('span', {className: 'qq-grow'}, h('span', {className: 'qq-between'}, h('b', null, conversationName(c)), h('span', {className: 'qq-cap'}, time(c.lastActivity))), h('span', {className: 'qq-cap qq-trunc'}, lastText(c.conversationId))))),
        !directory && history?.conversations.length > 0 && h('button', {type: 'button', className: 'sm ghost', disabled: busy, onClick: () => loadContacts()}, T('显示联系人和群的名字', 'Show contact and group names'))),
      h('section', {className: 'qq-card', 'aria-label': T('聊天记录', 'Chat history')}, picked ? h(React.Fragment, null, h('div', {className: 'qq-between'}, h('h2', null, conversationName(picked)), h('button', {type: 'button', className: 'sm', disabled: busy, onClick: () => openReplyStyle(picked.conversationId)}, T('会话回复风格…', 'Chat reply style…')), h('span', {className: 'qq-cap'}, picked.conversationType === 'group' ? T('群聊 · 发送成功不代表有人看到', 'Group · “sent” does not mean seen') : T('私聊 · 发送成功不代表对方已读', 'Private · “sent” does not mean read'))),
          h('div', {className: 'qq-thread'}, ...thread.map(m => h('div', {key: m.key, className: 'qq-msg ' + m.kind}, m.kind === 'in' ? Face(null, picked.conversationType === 'group' ? nameOfContact(m.sender) ?? String(m.sender ?? '?') : conversationName(picked)) : Face(state.operator.characterId, opName),
            h('div', {style: {minWidth: 0}}, h('div', {className: 'qq-bub'}, m.text), h('div', {className: 'qq-meta'}, time(m.at), m.kind === 'out' && SENT[m.status] && h(React.Fragment, null, ' · ', sent(m.status)), m.kind === 'out' && m.status === 'sent' && h(React.Fragment,null,' · ',h('span',{className:'qq-st '+(m.memoryState==='committed'?'ok':'warn')},m.memoryState==='committed'?T('已记忆','Remembered'):m.memoryState==='pending'?T('待补记','Memory pending'):T('需要核对','Needs review')),m.memoryRetryAvailable&&h('button',{type:'button',className:'sm ghost',disabled:busy,onClick:async()=>{if(await act('memory.retry',{requestId:m.key}))await loadHistory(conversation);}},T('仅重试补记','Retry memory only'))), m.kind === 'in' && picked.conversationType === 'group' ? ' · ' + (nameOfContact(m.sender) ?? 'QQ ' + m.sender) : ''),
              m.sources > 0 && h('details', null, h('summary', null, Icon('globe', 12), ' ', T('这条回复用了联网搜索 · 来源 {n}', 'This reply used web search · Sources: {n}').replace('{n}', m.sources)), h('ol', null, ...(m.groups ?? []).flatMap(g => g.sources).map((src, i) => h('li', {key: i}, h('a', {href: src.url, target: '_blank', rel: 'noopener noreferrer'}, src.title || src.url), (src.snippet || src.excerpt) && h('p', {className: 'qq-cap'}, src.snippet || src.excerpt))))))))),
          h('p', {className: 'qq-cap', style: {textAlign: 'center'}}, T('这里只读。回复由 {name} 在 QQ 里发出；结果未知的发送会保留，等待核对。', 'Read-only here. {name} replies inside QQ; sends with an unknown result are kept for checking.').replace('{name}', opName)))
        : h('div', {className: 'qq-empty'}, Icon('chat', 28), h('p', {className: 'qq-mut'}, T('选一个会话查看。', 'Pick a chat to read.')))),
      h('section', {className: 'qq-card', 'aria-label': T('可信主人的工作指令', 'Trusted-owner work commands')}, h('div', {className: 'qq-row', style: {flexWrap: 'nowrap', alignItems: 'flex-start'}}, Icon('shield'), h('h2', {style: {minWidth: 0}}, T('可信主人的工作指令', 'Trusted-owner work commands'))),
        h('p', {className: 'qq-cap'}, T('只有绑定验证过的主人在私聊里能用，任何群聊都不能下工作任务；执行前仍要批准计划。工作由「工作与协作」插件处理。', 'Only the verified owner, in private chat; no group can create work, and plans still need approval. Work is handled by the Work plugin.')),
        ...[['/工作 任务内容', T('新建工作', 'New task')], ['/计划 任务ID', T('看计划', 'See plan')], ['/批准 任务ID 计划版本', T('批准指定版本', 'Approve a version')], ['/取消 任务ID 计划版本', T('取消', 'Cancel')]].map(([k, d]) => h('div', {key: k, className: 'qq-cmd'}, h('code', null, k), h('span', {className: 'qq-cap'}, d)))));

    const listDraft = {contacts: draft.contacts, groups: draft.groups, proactiveContacts: draft.proactiveContacts};
    const listChanged = JSON.stringify(listDraft) !== JSON.stringify({contacts: state.settings.contacts, groups: state.settings.groups, proactiveContacts: state.settings.proactiveContacts});
    const allowView = h(React.Fragment, null, stylePanel, allowList(listDraft, list => setDraft({...draft, ...list})),
      listChanged && h('div', {className: 'qq-bar', role: 'status'}, h('span', {className: 'qq-grow'}, T('允许名单有改动', 'Allow-list changed')), h('button', {type: 'button', className: 'ghost', disabled: busy, onClick: () => setDraft(structuredClone(state.settings))}, T('放弃', 'Discard')), h('button', {type: 'button', className: 'pri', disabled: busy, onClick: () => act('settings.update', {settings: {...state.settings, ...listDraft}})}, T('保存允许名单', 'Save allow-list'))));
    const count = history?.conversations.length ?? chatCount;
    const tabs = [['account', T('账号与接管者', 'Account'), 'idcard', 0], ['allow', T('允许的联系人与群', 'Allow-list'), 'users', 0], ['chats', T('聊天与工作', 'Chats & work'), 'chat', count]];
    return shell(
      h('nav', {className: 'qq-tabs', role: 'tablist', 'aria-label': T('QQ连接页面', 'QQ Connect pages')}, ...tabs.map(([id, label, icon, n]) => h('button', {key: id, type: 'button', role: 'tab', 'aria-selected': view === id, onClick: () => setView(id)}, Icon(icon, 15), label, n > 0 && h('span', {className: 'qq-badge'}, n)))),
      view === 'account' && accountView, view === 'allow' && allowView, view === 'chats' && chatsView, usageDialog,
      dialog?.kind === 'reply-style' && h(Dialog, {title: T('QQ 回复风格', 'QQ reply style'), onClose: closeReplyStyle, footer: [h('button', {key: 'c', type: 'button', className: 'ghost', onClick: closeReplyStyle}, T('取消', 'Cancel')), h('button', {key: 's', type: 'button', className: 'pri', disabled: busy, onClick: async () => {const version = styleDialogVersion.current;if (await act('settings.update', {settings: {...state.settings, replyStyle: dialog.replyStyle, conversationReplyStyles: dialog.conversationReplyStyles}})) {if (version === styleDialogVersion.current) closeReplyStyle();}}}, T('保存回复风格', 'Save reply style'))]},
        h('label', {className: 'qq-field'}, T('回复风格范围', 'Reply style scope'), h('select', {'aria-label': T('回复风格范围', 'Reply style scope'), value: dialog.target, disabled: busy, onChange: e => setDialog({...dialog, target: e.target.value})}, h('option', {value: 'default'}, T('QQ 默认', 'QQ default')), ...styleTargets.map(([id, label]) => h('option', {key: id, value: id}, label)))),
        h('label', {className: 'qq-field'}, T('回复风格', 'Reply style'), h('select', {'aria-label': T('回复风格', 'Reply style'), value: styleValue, disabled: busy, onChange: e => {const value = e.target.value;if (dialog.target === 'default') setDialog({...dialog, replyStyle: value});else {const styles = {...dialog.conversationReplyStyles};if (value === 'inherit') delete styles[dialog.target];else styles[dialog.target] = value;setDialog({...dialog, conversationReplyStyles: styles});}}}, ...['inherit', 'brief', 'natural', 'detailed'].map(mode => h('option', {key: mode, value: mode}, mode === 'inherit' ? dialog.target === 'default' ? T('继承全局默认', 'Inherit global default') : T('继承 QQ 默认', 'Inherit QQ default') : styleName(mode))))),
        h('p', {className: 'qq-cap', role: 'status'}, T('当前有效风格：', 'Effective style: ') + styleName(effectiveStyle)), h('p', {className: 'qq-cap'}, T('会话设置优先于 QQ 默认；QQ 默认可继承全局。这里控制表达篇幅，保留角色口吻，不改变允许名单。', 'A chat override takes priority over the QQ default, which can inherit the global setting. This guides length while keeping the character’s voice and the existing allow-list.'))),
      dialog?.kind === 'operator' && h(Dialog, {title: T('换一位角色', 'Change character'), onClose: () => setDialog(null), footer: [h('button', {key: 'c', type: 'button', className: 'ghost', onClick: () => setDialog(null)}, T('取消', 'Cancel')), h('button', {key: 'o', type: 'button', className: 'pri', disabled: busy || !dialog.characterId || dialog.characterId === state.operator.characterId, onClick: async () => {if (await act('operator.select', {characterId: dialog.characterId})) setDialog(null);}}, T('交给这位角色', 'Hand over'))]},
        characterPicker(dialog.characterId, id => setDialog({...dialog, characterId: id})), h('p', {className: 'qq-cap'}, T('换人后，她会在每个允许会话的下一次回复里自我介绍。', 'After the change, she introduces herself in each allowed chat’s next reply.'))),
      dialog?.kind === 'disconnect' && h(Dialog, {title: T('断开 QQ 连接？', 'Disconnect QQ?'), onClose: () => setDialog(null), footer: [h('button', {key: 'c', type: 'button', className: 'ghost', onClick: () => setDialog(null)}, T('取消', 'Cancel')), h('button', {key: 'd', type: 'button', className: 'pri', disabled: busy, onClick: async () => {if (await act('disconnect')) setDialog(null);}}, T('断开', 'Disconnect'))]},
        h('p', null, T('断开后不再收发消息。重新连接后只处理新消息，不会补回断开期间的内容。', 'Nothing is received or sent while disconnected. After reconnecting, only new messages are handled; nothing from the gap is answered.'))));
  };
}

// AI Buddy can show this page inside its main window, where QQ and Bilibili share one DSH page that opens on DSH's
// own panel. Only plugin code may switch panels, so the host names a plugin (data-buddy-open-plugin on <html>, then
// "ai-buddy:open-plugin-page") and waits for that plugin to answer with data-buddy-panel once its panel is selected.
const PLUGIN_ID = '@ai-buddy/qq-connect', PANEL_KEY = 'qq-connect';
function bindBuddyPanel(ctx) {
  const view = globalThis.window, root = () => globalThis.document?.documentElement;
  const select = () => {const data = root()?.dataset;try {ctx.layout.selectPanel(PANEL_KEY);if (data) data.buddyPanel = PLUGIN_ID;} catch {if (data?.buddyPanel === PLUGIN_ID) delete data.buddyPanel;}};
  const listener = event => {if (event?.detail?.pluginId === PLUGIN_ID) select();};
  view?.addEventListener?.('ai-buddy:open-plugin-page', listener);
  if (root()?.dataset?.buddyOpenPlugin === PLUGIN_ID) select();
  return () => view?.removeEventListener?.('ai-buddy:open-plugin-page', listener);
}

if (typeof window !== 'undefined' && window.__ModuleLoader__) window.__ModuleLoader__.load({id: PLUGIN_ID, factory: require => {
  const React = require('react'), Page = createQqPage(React);
  return {name: 'ai-buddy-qq-connect-client', inject: ['slots', 'layout'], apply(ctx) {
    ctx.slots.inject('main', () => {const dispose = ctx.slots.register({name: 'main', key: PANEL_KEY}, Page), unbind = bindBuddyPanel(ctx);return () => {unbind();dispose?.();};});
    ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({name: 'sidebar.panellist', id: 'qq-connect', label: 'QQ连接', order: 42}, () => React.createElement('span', null, 'QQ')));
  }};
}});
