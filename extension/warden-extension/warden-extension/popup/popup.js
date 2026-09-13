/**
 * popup/popup.js
 */

let settings;
const WARDEN_API = 'http://127.0.0.1:8000';

function getSessionId() {
  return new Promise((resolve) => {
    WardenBrowser.runtime.sendMessage({ type: 'WARDEN_SESSION_ID' }, (response) => resolve(response?.sessionId || ''));
  });
}

async function renderLedger() {
  try {
    const sessionId = await getSessionId();
    const response = await fetch(`${WARDEN_API}/ledger/summary?session_id=${encodeURIComponent(sessionId)}`);
    if (!response.ok) throw new Error('ledger unavailable');
    const summary = await response.json();
    document.getElementById('ledger-total').textContent = `${summary.total_events} moderation events`;
    const recent = (summary.recent_events || []).filter((event) => ['hidden', 'blurred', 'warned'].includes(event.action)).slice(0, 3);
    document.getElementById('ledger-recent').innerHTML = recent.map((event) =>
      `<div class="ledger-item"><button data-event-id="${event.event_id}">Show anyway</button><b>${event.source}</b><br>${event.trigger_detail?.value || 'No trigger detail'}</div>`
    ).join('');
    document.querySelectorAll('[data-event-id]').forEach((button) => {
      button.onclick = async () => {
        await fetch(`${WARDEN_API}/ledger/override`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event_id: button.dataset.eventId, session_id: sessionId }),
        });
        const tabs = await WardenBrowser.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]?.id) WardenBrowser.tabs.sendMessage(tabs[0].id, { type: 'WARDEN_SHOW_ANYWAY', eventId: button.dataset.eventId });
        renderLedger();
      };
    });
  } catch (_) {
    document.getElementById('ledger-total').textContent = 'Start the local backend to view the ledger.';
  }
}

async function render() {
  settings = await getSettings();

  document.getElementById('toggle-master').classList.toggle('on', settings.masterEnabled);
  document.getElementById('master-label').textContent = settings.masterEnabled ? 'Filtering is on' : 'Filtering is off';

  const lv = SENSITIVITY_LEVELS[settings.sensitivityLevel];
  document.getElementById('level-name').textContent = lv.name;
  document.getElementById('level-desc').textContent = lv.desc;
  drawGauge(document.getElementById('gauge'), settings.sensitivityLevel);
  renderDots();

  document.getElementById('count-instagram').textContent = settings.stats.byPlatform.instagram;
  document.getElementById('count-reddit').textContent = settings.stats.byPlatform.reddit;
  renderLedger();
}

function renderDots() {
  const wrap = document.getElementById('level-dots');
  wrap.innerHTML = '';
  SENSITIVITY_LEVELS.forEach((lv, i) => {
    const dot = document.createElement('button');
    dot.className = 'level-dot' + (i <= settings.sensitivityLevel ? ' filled' : '') + (i === settings.sensitivityLevel ? ' current' : '');
    dot.setAttribute('aria-label', lv.name);
    dot.onclick = async () => {
      settings = await updateSettings({ sensitivityLevel: i });
      render();
    };
    wrap.appendChild(dot);
  });
}

document.getElementById('toggle-master').onclick = async () => {
  settings = await updateSettings({ masterEnabled: !settings.masterEnabled });
  render();
};

document.getElementById('open-settings').onclick =
document.getElementById('open-settings-2').onclick = () => WardenBrowser.runtime.openOptionsPage();

onSettingsChanged(() => render());
render();
