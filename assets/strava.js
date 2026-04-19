(function () {
  'use strict';

  var CLIENT_ID     = '227275';
  var CLIENT_SECRET = 'e2a6b829dc791ee21008646a7b66b62acf808eb9';
  var REDIRECT_URI  = 'https://fzudemx.github.io/byu-plan/';
  var TOKEN_URL     = 'https://www.strava.com/oauth/token';
  var API_BASE      = 'https://www.strava.com/api/v3';

  var K = {
    access    : 'byu-strava-access',
    refresh   : 'byu-strava-refresh',
    expires   : 'byu-strava-expires',
    activities: 'byu-strava-activities',
    cacheAt   : 'byu-strava-cache-at',
  };

  /* ── token helpers ───────────────────────────────────────────── */

  function saveTokens(d) {
    localStorage.setItem(K.access,  d.access_token);
    localStorage.setItem(K.refresh, d.refresh_token);
    localStorage.setItem(K.expires, String(d.expires_at));
  }

  function isConnected() {
    return !!(localStorage.getItem(K.access) && localStorage.getItem(K.refresh));
  }

  async function validToken() {
    var access  = localStorage.getItem(K.access);
    var refresh = localStorage.getItem(K.refresh);
    var expires = parseInt(localStorage.getItem(K.expires) || '0');
    if (!access || !refresh) return null;
    if (Date.now() / 1000 < expires - 300) return access;  // still valid
    try {
      var r = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
                               refresh_token: refresh, grant_type: 'refresh_token' }),
      });
      var d = await r.json();
      if (d.access_token) { saveTokens(d); return d.access_token; }
    } catch (e) {}
    return null;
  }

  /* ── activities ──────────────────────────────────────────────── */

  async function fetchActivities(token) {
    var cacheAt = parseInt(localStorage.getItem(K.cacheAt) || '0');
    if (Date.now() - cacheAt < 30 * 60 * 1000) {
      var cached = localStorage.getItem(K.activities);
      if (cached) return JSON.parse(cached);
    }
    try {
      var r = await fetch(API_BASE + '/athlete/activities?per_page=50&page=1',
                          { headers: { Authorization: 'Bearer ' + token } });
      var list = await r.json();
      if (Array.isArray(list)) {
        localStorage.setItem(K.activities, JSON.stringify(list));
        localStorage.setItem(K.cacheAt, String(Date.now()));
        return list;
      }
    } catch (e) {}
    return [];
  }

  function getRuns() {
    var raw = localStorage.getItem(K.activities);
    if (!raw) return [];
    return JSON.parse(raw).filter(function (a) {
      return a.type === 'Run' || a.sport_type === 'Run';
    });
  }

  /* ── formatting ──────────────────────────────────────────────── */

  function paceStr(a) {
    if (!a.average_speed || a.average_speed < 0.5) return null;
    var sec = 1000 / a.average_speed;
    var m = Math.floor(sec / 60);
    var s = Math.round(sec % 60);
    if (s === 60) { m += 1; s = 0; }
    return m + ':' + String(s).padStart(2, '0');
  }

  function paceFloat(a) {
    if (!a.average_speed || a.average_speed < 0.5) return null;
    return (1000 / a.average_speed) / 60;
  }

  function fmtDate(str) {
    var d = new Date(str);
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  }

  /* ── profile auto-update from recent Strava runs ─────────────── */

  async function updateProfile() {
    var runs = getRuns().slice(0, 10);
    if (!runs.length) return;
    var paces = runs.slice(0, 3).map(paceFloat).filter(Boolean);
    if (!paces.length) return;
    var avg = paces.reduce(function (a, b) { return a + b; }, 0) / paces.length;
    var maxHRs = runs.map(function (a) { return a.max_heartrate; }).filter(Boolean);
    var maxHR = maxHRs.length ? Math.max.apply(null, maxHRs) : null;
    var pid = localStorage.getItem('byu-v5-active-profile-id');
    if (!pid) return;
    var raw = localStorage.getItem('byu-v5-' + pid + '-profile');
    if (!raw) return;
    try {
      var prof = JSON.parse(raw);
      prof.recentPace = Math.round(avg * 100) / 100;
      if (maxHR && !prof.hrMax) prof.hrMax = maxHR;
      localStorage.setItem('byu-v5-' + pid + '-profile', JSON.stringify(prof));
    } catch (e) {}
  }

  /* ── React input fill ────────────────────────────────────────── */

  function fillInput(el, val) {
    var proto = el.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    var setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, val);
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /* ── workout modal detection & injection ─────────────────────── */

  var lastModal = null;

  function findModalContent() {
    var divs = document.querySelectorAll('div');
    for (var i = 0; i < divs.length; i++) {
      var el = divs[i];
      if (el.childNodes.length === 1 &&
          el.firstChild.nodeType === 3 &&
          el.firstChild.nodeValue === 'EINHEIT ABSCHLIESSEN') {
        return el.parentElement;   // the bottom-sheet content div
      }
    }
    return null;
  }

  function injectStravaSection(modal) {
    if (!modal) return;
    if (modal.querySelector('#strava-inject')) return;

    var kmInput = modal.querySelector('input[placeholder="8.4"]');
    if (!kmInput) return;  // not a run session

    var runs = getRuns().slice(0, 30);
    if (!runs.length) return;

    /* Find the grid container (parent of km input column → grid wrapper) */
    var gridWrapper = kmInput.closest('div[style*="grid"]') ||
                      kmInput.parentElement.parentElement;

    var section = document.createElement('div');
    section.id = 'strava-inject';
    section.style.cssText = 'margin-bottom:12px;font-family:"JetBrains Mono",monospace;';

    var lbl = document.createElement('div');
    lbl.style.cssText = 'font-size:9px;color:#7c6aaa;letter-spacing:2px;margin-bottom:6px;';
    lbl.textContent = 'STRAVA ACTIVITY';

    var toggleBtn = document.createElement('button');
    toggleBtn.style.cssText = [
      'width:100%;padding:9px 12px;display:flex;align-items:center;justify-content:space-between;',
      'background:rgba(252,82,0,.08);border:1px solid rgba(252,82,0,.35);border-radius:8px;',
      'color:#fc5200;cursor:pointer;font-family:inherit;font-size:10px;letter-spacing:.5px;',
      'transition:border-color .2s;'
    ].join('');
    toggleBtn.innerHTML = '<span>&#128760; Activity aus Strava importieren</span><span>&#9660;</span>';

    var list = document.createElement('div');
    list.style.cssText = [
      'display:none;max-height:220px;overflow-y:auto;',
      'background:#0d0b1f;border:1px solid rgba(252,82,0,.25);',
      'border-radius:8px;margin-top:4px;',
    ].join('');

    runs.forEach(function (act) {
      var km   = (act.distance / 1000).toFixed(1);
      var pace = paceStr(act);
      var date = fmtDate(act.start_date_local || act.start_date);
      var hr   = act.average_heartrate ? Math.round(act.average_heartrate) : null;

      var item = document.createElement('div');
      item.style.cssText = [
        'padding:8px 12px;cursor:pointer;',
        'border-bottom:1px solid rgba(252,82,0,.1);',
        'transition:background .15s;',
      ].join('');
      item.innerHTML =
        '<div style="color:#f0ecff;font-size:10px;margin-bottom:2px;font-weight:600;">' +
          escHtml(act.name) +
        '</div>' +
        '<div style="color:#a99bc8;font-size:9px;">' +
          date + ' · ' + km + ' km' +
          (pace ? ' · ' + pace + '/km' : '') +
          (hr ? ' · &#8960; ' + hr + ' bpm' : '') +
        '</div>';

      item.addEventListener('mouseenter', function () {
        item.style.background = 'rgba(252,82,0,.1)';
      });
      item.addEventListener('mouseleave', function () {
        item.style.background = 'transparent';
      });

      item.addEventListener('click', function () {
        var kmEl   = modal.querySelector('input[placeholder="8.4"]');
        var paceEl = modal.querySelector('input[placeholder="6:15"]');
        var hrEl   = modal.querySelector('input[placeholder="148"]');

        if (kmEl)           fillInput(kmEl,   km);
        if (paceEl && pace) fillInput(paceEl, pace);
        if (hrEl && hr)     fillInput(hrEl,   String(hr));

        toggleBtn.innerHTML =
          '<span>&#10003; ' + escHtml(act.name) + ' (' + date + ')</span>' +
          '<span style="font-size:9px;opacity:.6;">ändern</span>';
        toggleBtn.style.borderColor = 'rgba(252,82,0,.8)';
        list.style.display = 'none';
      });

      list.appendChild(item);
    });

    toggleBtn.addEventListener('click', function () {
      list.style.display = list.style.display === 'none' ? 'block' : 'none';
    });

    section.appendChild(lbl);
    section.appendChild(toggleBtn);
    section.appendChild(list);

    gridWrapper.parentElement.insertBefore(section, gridWrapper);
  }

  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /* ── MutationObserver ────────────────────────────────────────── */

  function watchDOM() {
    var observer = new MutationObserver(function () {
      requestAnimationFrame(function () {
        var modal = findModalContent();
        if (modal && modal !== lastModal) {
          lastModal = modal;
          setTimeout(function () { injectStravaSection(modal); }, 60);
        } else if (!modal) {
          lastModal = null;
        }
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  /* ── floating Strava button ──────────────────────────────────── */

  var floatBtn;

  function setFloatBtn(text, connected) {
    if (!floatBtn) return;
    floatBtn.textContent = text;
    floatBtn.style.color       = connected ? '#fc5200' : '#7c6aaa';
    floatBtn.style.borderColor = connected
      ? 'rgba(252,82,0,.35)' : 'rgba(124,106,170,.3)';
  }

  function createFloatBtn() {
    var btn = document.createElement('button');
    btn.id = 'strava-float';
    btn.style.cssText = [
      'position:fixed;bottom:20px;right:20px;z-index:9000;',
      'padding:8px 14px;border-radius:20px;border:1px solid rgba(124,106,170,.3);',
      'background:rgba(13,11,31,.9);backdrop-filter:blur(12px);',
      'color:#7c6aaa;font-family:"JetBrains Mono",monospace;font-size:10px;',
      'cursor:pointer;letter-spacing:1px;',
      'box-shadow:0 4px 20px rgba(0,0,0,.4);transition:all .2s;',
    ].join('');

    btn.addEventListener('click', async function () {
      if (isConnected()) {
        setFloatBtn('⏳ Aktualisiere…', true);
        localStorage.removeItem(K.cacheAt);
        var tok = await validToken();
        if (tok) {
          await fetchActivities(tok);
          await updateProfile();
          setFloatBtn('🟠 Strava ✓', true);
          setTimeout(function () { setFloatBtn('🟠 Strava', true); }, 2000);
        } else {
          setFloatBtn('⚠️ Token abgelaufen', false);
        }
      } else {
        var state = 'strava_' + Math.random().toString(36).substr(2, 9);
        sessionStorage.setItem('strava_state', state);
        var url = 'https://www.strava.com/oauth/authorize' +
          '?client_id='     + CLIENT_ID +
          '&redirect_uri='  + encodeURIComponent(REDIRECT_URI) +
          '&response_type=code' +
          '&scope=activity:read_all' +
          '&state='         + state;
        location.href = url;
      }
    });

    document.body.appendChild(btn);
    floatBtn = btn;
  }

  /* ── OAuth callback ──────────────────────────────────────────── */

  async function handleCallback(code, state) {
    var expected = sessionStorage.getItem('strava_state');
    if (expected && expected !== state) return;  // CSRF check
    sessionStorage.removeItem('strava_state');
    history.replaceState({}, '', location.pathname);

    setFloatBtn('⏳ Verbinde…', false);
    try {
      var r = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          code: code,
          grant_type: 'authorization_code',
        }),
      });
      var d = await r.json();
      if (d.access_token) {
        saveTokens(d);
        await fetchActivities(d.access_token);
        await updateProfile();
        setFloatBtn('🟠 Strava', true);
        watchDOM();
      } else {
        setFloatBtn('⚠️ Fehler', false);
        console.error('Strava auth error:', d);
      }
    } catch (e) {
      setFloatBtn('⚠️ Netzwerkfehler', false);
    }
  }

  /* ── init ────────────────────────────────────────────────────── */

  async function init() {
    createFloatBtn();

    var params = new URLSearchParams(location.search);
    var code   = params.get('code');
    var state  = params.get('state');

    if (code && state && state.startsWith('strava_')) {
      await handleCallback(code, state);
      return;
    }

    if (isConnected()) {
      setFloatBtn('🟠 Strava', true);
      validToken().then(function (tok) {
        if (tok) {
          fetchActivities(tok);
          updateProfile();
        }
      });
      watchDOM();
    } else {
      setFloatBtn('🔗 Strava verbinden', false);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
