(function () {
  var SUPABASE_URL = 'https://nznqbsbjqwmliovndfre.supabase.co';
  var ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56bnFic2JqcXdtbGlvdm5kZnJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1MzAzNDQsImV4cCI6MjA5MjEwNjM0NH0.99LHl75Af1w0t7cqnFflRUS2gJOArQcK0ZcYHt9Q7wY';
  var PREFIX = 'byu-v5-';
  var SYNCED = 'sb_synced_v1';

  /* ── styles ── */
  var css = document.createElement('style');
  css.textContent = [
    '#sb-ov{position:fixed;inset:0;background:linear-gradient(135deg,#0f0c29 0%,#302b63 50%,#24243e 100%);display:flex;align-items:center;justify-content:center;z-index:99999;font-family:-apple-system,BlinkMacSystemFont,sans-serif}',
    '#sb-box{background:rgba(255,255,255,.07);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border:1px solid rgba(168,85,247,.25);border-radius:24px;padding:44px 36px;width:320px;text-align:center;color:#f0ecff;box-shadow:0 30px 80px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.1)}',
    '#sb-logo{font-size:36px;margin-bottom:8px}',
    '#sb-box h2{margin:0 0 4px;font-size:26px;font-weight:700;background:linear-gradient(90deg,#c084fc,#818cf8);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}',
    '#sb-box .sub{color:#a99bc8;font-size:14px;margin:0 0 28px}',
    '#sb-form{display:flex;flex-direction:column;gap:12px}',
    '#sb-form input{padding:13px 16px;border-radius:12px;border:1px solid rgba(168,85,247,.3);background:rgba(255,255,255,.05);color:#f0ecff;font-size:15px;outline:none;transition:border-color .2s;backdrop-filter:blur(8px)}',
    '#sb-form input:focus{border-color:#a855f7;background:rgba(168,85,247,.08)}',
    '#sb-form input::placeholder{color:#7c6aaa}',
    '.sb-btn{padding:14px;border-radius:12px;border:none;cursor:pointer;font-size:15px;font-weight:600;transition:all .2s}',
    '.sb-btn:hover{transform:translateY(-1px);box-shadow:0 8px 25px rgba(168,85,247,.4)}',
    '.sb-p{background:linear-gradient(135deg,#a855f7,#6366f1);color:#fff}',
    '.sb-s{background:rgba(255,255,255,.06);color:#c4b5fd;border:1px solid rgba(168,85,247,.25);margin-top:2px}',
    '#sb-msg{color:#a99bc8;font-size:14px;min-height:20px;margin-bottom:8px}',
    '#sb-err{color:#f87171;font-size:13px;min-height:18px;margin-top:4px}'
  ].join('');
  document.head.appendChild(css);

  /* ── overlay HTML ── */
  var ov = document.createElement('div');
  ov.id = 'sb-ov';
  ov.innerHTML = '<div id="sb-box">' +
    '<div id="sb-logo">&#127939;</div>' +
    '<h2>BYU Plan</h2><p class="sub">Dein persönlicher Trainingsplan</p>' +
    '<p id="sb-msg">Wird geladen\u2026</p>' +
    '<div id="sb-fw" style="display:none">' +
      '<form id="sb-form">' +
        '<input id="sb-email" type="email" placeholder="E-Mail-Adresse" autocomplete="email">' +
        '<input id="sb-pw" type="password" placeholder="Passwort" autocomplete="current-password">' +
        '<button type="submit" class="sb-btn sb-p">Einloggen</button>' +
        '<button type="button" class="sb-btn sb-s" id="sb-reg">Neu registrieren</button>' +
        '<p id="sb-err"></p>' +
      '</form>' +
    '</div>' +
  '</div>';
  document.body.appendChild(ov);

  function msg(t) { document.getElementById('sb-msg').textContent = t; }
  function err(t) { document.getElementById('sb-err').textContent = t; }
  function showForm() { msg(''); document.getElementById('sb-fw').style.display = 'block'; }
  function hideOv() { ov.remove(); }

  /* ── Supabase client ── */
  var sb = window.supabase.createClient(SUPABASE_URL, ANON_KEY);

  /* ── localStorage helpers ── */
  var _set = localStorage.setItem.bind(localStorage);

  function allData() {
    var d = {};
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) {
        try { d[k] = JSON.parse(localStorage.getItem(k)); } catch (e) { d[k] = localStorage.getItem(k); }
      }
    }
    return d;
  }

  function restore(data) {
    if (!data) return;
    Object.keys(data).forEach(function (k) {
      try { _set(k, JSON.stringify(data[k])); } catch (e) {}
    });
  }

  /* ── Supabase sync ── */
  var timer = null;

  async function doSync() {
    try {
      var res = await sb.auth.getUser();
      var user = res.data && res.data.user;
      if (!user) return;
      var d = allData();
      if (!Object.keys(d).length) return;
      var sel = await sb.from('byu_plans').select('id').eq('user_id', user.id).limit(1);
      var rows = sel.data || [];
      if (rows.length > 0) {
        await sb.from('byu_plans').update({ data: d, updated_at: new Date().toISOString() }).eq('id', rows[0].id);
      } else {
        await sb.from('byu_plans').insert({ user_id: user.id, data: d });
      }
    } catch (e) { /* silent */ }
  }

  function scheduleSync() {
    clearTimeout(timer);
    timer = setTimeout(doSync, 3000);
  }

  /* intercept writes from React app */
  localStorage.setItem = function (k, v) {
    _set(k, v);
    if (k && k.startsWith(PREFIX)) scheduleSync();
  };

  /* ── after auth: load cloud data → localStorage → reload ── */
  async function loadAndReload(userId) {
    try {
      var res = await sb.from('byu_plans').select('data').eq('user_id', userId)
        .order('updated_at', { ascending: false }).limit(1);
      var rows = res.data || [];
      if (rows.length > 0 && rows[0].data) restore(rows[0].data);
    } catch (e) {}
    sessionStorage.setItem(SYNCED, '1');
    location.reload();
  }

  /* ── init ── */
  async function init() {
    if (sessionStorage.getItem(SYNCED)) {
      hideOv();
      return;
    }
    try {
      var res = await sb.auth.getSession();
      var session = res.data && res.data.session;
      if (session) {
        msg('Daten werden geladen\u2026');
        await loadAndReload(session.user.id);
      } else {
        showForm();
      }
    } catch (e) {
      msg('Verbindungsfehler – bitte neu laden');
    }
  }

  /* login */
  document.getElementById('sb-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    err('');
    var email = document.getElementById('sb-email').value;
    var pw = document.getElementById('sb-pw').value;
    msg('Anmeldung läuft\u2026');
    try {
      var res = await sb.auth.signInWithPassword({ email: email, password: pw });
      if (res.error) { msg(''); err(res.error.message); return; }
      document.getElementById('sb-fw').style.display = 'none';
      msg('Daten werden geladen\u2026');
      await loadAndReload(res.data.user.id);
    } catch (e) { msg(''); err('Netzwerkfehler'); }
  });

  /* register */
  document.getElementById('sb-reg').addEventListener('click', async function () {
    err('');
    var email = document.getElementById('sb-email').value;
    var pw = document.getElementById('sb-pw').value;
    if (!email || !pw) { err('Bitte E-Mail und Passwort eingeben'); return; }
    msg('Konto wird erstellt\u2026');
    try {
      var res = await sb.auth.signUp({ email: email, password: pw });
      if (res.error) { msg(''); err(res.error.message); return; }
      if (res.data.session) {
        /* auto-confirmed (email confirmation disabled in Supabase) */
        document.getElementById('sb-fw').style.display = 'none';
        msg('Registriert \u2013 App wird gestartet\u2026');
        sessionStorage.setItem(SYNCED, '1');
        setTimeout(function () { location.reload(); }, 500);
      } else {
        /* email confirmation required */
        document.getElementById('sb-fw').style.display = 'none';
        msg('\u2709\ufe0f Best\u00e4tigungs-E-Mail verschickt. Bitte E-Mail \u00f6ffnen und danach hier einloggen.');
        setTimeout(function () { document.getElementById('sb-fw').style.display = 'block'; }, 4000);
      }
    } catch (e) { msg(''); err('Netzwerkfehler'); }
  });

  init();
})();
