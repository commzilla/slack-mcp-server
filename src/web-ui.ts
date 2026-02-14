export function getHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Slack MCP Admin</title>
<style>
  :root {
    --bg: #1a1b1e; --bg2: #25262b; --bg3: #2c2e33;
    --fg: #c1c2c5; --fg2: #909296; --fg3: #5c5f66;
    --accent: #4c6ef5; --accent2: #364fc7;
    --red: #fa5252; --green: #51cf66; --yellow: #fcc419; --orange: #ff922b;
    --border: #373a40; --radius: 6px;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--fg); min-height: 100vh; }

  /* Header */
  .header { display: flex; justify-content: space-between; align-items: center; padding: 12px 24px; background: var(--bg2); border-bottom: 1px solid var(--border); }
  .header h1 { font-size: 18px; font-weight: 600; }
  .header h1 span { color: var(--accent); }
  .profile-select { background: var(--bg3); color: var(--fg); border: 1px solid var(--border); padding: 6px 12px; border-radius: var(--radius); font-size: 14px; }

  /* Tabs */
  .tabs { display: flex; gap: 2px; padding: 0 24px; background: var(--bg2); border-bottom: 1px solid var(--border); }
  .tab-btn { background: none; border: none; color: var(--fg2); padding: 10px 16px; font-size: 14px; cursor: pointer; border-bottom: 2px solid transparent; transition: all .15s; }
  .tab-btn:hover { color: var(--fg); background: var(--bg3); }
  .tab-btn.active { color: var(--accent); border-bottom-color: var(--accent); }
  .tab-btn .badge { background: var(--red); color: #fff; font-size: 11px; padding: 1px 6px; border-radius: 10px; margin-left: 6px; }

  /* Content */
  .content { padding: 24px; max-width: 1200px; margin: 0 auto; }
  .tab-content { display: none; }
  .tab-content.active { display: block; }

  /* Cards & Tables */
  .card { background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; margin-bottom: 16px; }
  .card h3 { font-size: 14px; font-weight: 600; margin-bottom: 12px; color: var(--fg); }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 8px 12px; color: var(--fg2); font-weight: 500; border-bottom: 1px solid var(--border); }
  td { padding: 8px 12px; border-bottom: 1px solid var(--border); }
  tr:hover { background: var(--bg3); }

  /* Badges */
  .badge-high { background: var(--red); color: #fff; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
  .badge-normal { background: var(--accent); color: #fff; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
  .badge-low { background: var(--fg3); color: #fff; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }

  /* Forms */
  input, select, textarea { background: var(--bg3); color: var(--fg); border: 1px solid var(--border); padding: 8px 12px; border-radius: var(--radius); font-size: 13px; font-family: inherit; }
  input:focus, select:focus, textarea:focus { outline: none; border-color: var(--accent); }
  textarea { resize: vertical; min-height: 60px; }

  /* Buttons */
  .btn { background: var(--accent); color: #fff; border: none; padding: 8px 16px; border-radius: var(--radius); font-size: 13px; cursor: pointer; font-family: inherit; transition: background .15s; }
  .btn:hover { background: var(--accent2); }
  .btn-sm { padding: 4px 10px; font-size: 12px; }
  .btn-danger { background: var(--red); }
  .btn-danger:hover { background: #e03131; }
  .btn-ghost { background: transparent; color: var(--fg2); border: 1px solid var(--border); }
  .btn-ghost:hover { background: var(--bg3); color: var(--fg); }

  /* Messages */
  .msg-list { max-height: 600px; overflow-y: auto; }
  .msg { padding: 8px 0; border-bottom: 1px solid var(--border); }
  .msg:last-child { border-bottom: none; }
  .msg-header { display: flex; gap: 8px; align-items: baseline; margin-bottom: 4px; }
  .msg-user { font-weight: 600; font-size: 13px; color: var(--accent); }
  .msg-ts { font-size: 11px; color: var(--fg3); }
  .msg-text { font-size: 13px; line-height: 1.5; font-family: 'SF Mono', 'Menlo', monospace; white-space: pre-wrap; word-break: break-word; }
  .msg-thread { font-size: 12px; color: var(--accent); cursor: pointer; margin-top: 4px; }
  .msg-thread:hover { text-decoration: underline; }
  .msg-flag { background: var(--orange); color: #000; font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 3px; }

  /* Toolbar */
  .toolbar { display: flex; gap: 8px; align-items: center; margin-bottom: 16px; flex-wrap: wrap; }
  .toolbar label { font-size: 12px; color: var(--fg2); }

  /* Loading & Empty */
  .loading { text-align: center; padding: 40px; color: var(--fg2); }
  .empty { text-align: center; padding: 40px; color: var(--fg3); }

  /* Style card */
  .style-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .style-item { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border); }
  .style-label { font-size: 13px; color: var(--fg2); }
  .style-value { font-size: 13px; font-weight: 600; }
  .tag { display: inline-block; background: var(--bg3); color: var(--fg); padding: 2px 8px; border-radius: 10px; font-size: 12px; margin: 2px; }

  /* Channel list */
  .ch-search { width: 100%; margin-bottom: 12px; }
  .ch-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--border); }
  .ch-item:hover { background: var(--bg3); }
  .ch-name { font-size: 13px; }
  .ch-members { font-size: 12px; color: var(--fg3); }
  .ch-watched { color: var(--green); font-size: 12px; }

  /* Add channel modal */
  .modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 100; align-items: center; justify-content: center; }
  .modal-overlay.show { display: flex; }
  .modal { background: var(--bg2); border: 1px solid var(--border); border-radius: 8px; padding: 24px; width: 400px; max-width: 90vw; }
  .modal h3 { margin-bottom: 16px; }
  .modal .form-group { margin-bottom: 12px; }
  .modal .form-group label { display: block; font-size: 12px; color: var(--fg2); margin-bottom: 4px; }
  .modal .form-group input, .modal .form-group select { width: 100%; }
  .modal-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }

  /* Responsive */
  @media (max-width: 768px) {
    .style-grid { grid-template-columns: 1fr; }
    .content { padding: 12px; }
  }
</style>
</head>
<body>
  <div class="header">
    <h1><span>Slack</span> MCP Admin</h1>
    <select class="profile-select" id="profileSelect" onchange="onProfileChange()"></select>
  </div>

  <div class="tabs">
    <button class="tab-btn active" data-tab="pending" onclick="showTab('pending')">Pending <span class="badge" id="pendingBadge" style="display:none">0</span></button>
    <button class="tab-btn" data-tab="channels" onclick="showTab('channels')">Channels</button>
    <button class="tab-btn" data-tab="messages" onclick="showTab('messages')">Messages</button>
    <button class="tab-btn" data-tab="search" onclick="showTab('search')">Search</button>
    <button class="tab-btn" data-tab="style" onclick="showTab('style')">Style</button>
  </div>

  <div class="content">
    <!-- PENDING TAB -->
    <div class="tab-content active" id="tab-pending">
      <div class="toolbar">
        <button class="btn btn-sm" onclick="loadPending()">Refresh</button>
        <span style="font-size:12px;color:var(--fg3)" id="pendingRefreshTime"></span>
      </div>
      <div class="card">
        <div id="pendingContent"><div class="loading">Loading pending replies...</div></div>
      </div>
    </div>

    <!-- CHANNELS TAB -->
    <div class="tab-content" id="tab-channels">
      <div class="card">
        <h3>Watched Channels</h3>
        <div id="watchedContent"><div class="loading">Loading...</div></div>
      </div>
      <div class="card">
        <h3>All Channels</h3>
        <input type="text" class="ch-search" id="channelSearch" placeholder="Filter channels..." oninput="filterChannels()">
        <div id="allChannelsContent" style="max-height:400px;overflow-y:auto"><div class="loading">Loading...</div></div>
      </div>
    </div>

    <!-- MESSAGES TAB -->
    <div class="tab-content" id="tab-messages">
      <div class="toolbar">
        <select id="msgChannel" style="min-width:200px"><option value="">Select channel...</option></select>
        <input type="number" id="msgLimit" value="30" style="width:60px" placeholder="Limit">
        <button class="btn btn-sm" onclick="loadMessages()">Load</button>
      </div>
      <div class="card">
        <div class="msg-list" id="messagesContent"><div class="empty">Select a channel and click Load</div></div>
      </div>
      <div class="card" id="threadPanel" style="display:none">
        <h3>Thread <button class="btn btn-sm btn-ghost" onclick="closeThread()" style="float:right">Close</button></h3>
        <div class="msg-list" id="threadContent"></div>
      </div>
    </div>

    <!-- SEARCH TAB -->
    <div class="tab-content" id="tab-search">
      <div class="toolbar">
        <input type="text" id="searchQuery" placeholder="from:@user in:#channel has:link ..." style="flex:1;min-width:200px">
        <input type="number" id="searchLimit" value="20" style="width:60px">
        <button class="btn btn-sm" onclick="doSearch()">Search</button>
      </div>
      <div class="card">
        <div id="searchContent"><div class="empty">Enter a query and click Search</div></div>
      </div>
    </div>

    <!-- STYLE TAB -->
    <div class="tab-content" id="tab-style">
      <div class="toolbar">
        <button class="btn btn-sm" onclick="loadStyle(false)">Load Style</button>
        <button class="btn btn-sm btn-ghost" onclick="loadStyle(true)">Refresh (re-analyze)</button>
      </div>
      <div class="card">
        <div id="styleContent"><div class="empty">Click "Load Style" to see your writing profile</div></div>
      </div>
    </div>
  </div>

  <!-- ADD CHANNEL MODAL -->
  <div class="modal-overlay" id="addModal">
    <div class="modal">
      <h3>Watch Channel</h3>
      <div class="form-group">
        <label>Channel</label>
        <input type="text" id="addChName" readonly>
      </div>
      <div class="form-group">
        <label>Priority</label>
        <select id="addChPriority">
          <option value="normal">Normal</option>
          <option value="high">High</option>
          <option value="low">Low</option>
        </select>
      </div>
      <div class="form-group">
        <label>Description (optional)</label>
        <input type="text" id="addChDesc" placeholder="What is this channel about?">
      </div>
      <input type="hidden" id="addChId">
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn" onclick="addWatchedChannel()">Add</button>
      </div>
    </div>
  </div>

<script>
let currentProfile = '';
let allChannels = [];
let watchedIds = new Set();
let pendingInterval = null;

// ─── API Helper ───
async function api(path, opts = {}) {
  try {
    const res = await fetch(path, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...opts.headers },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    return await res.json();
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ─── Init ───
async function init() {
  const res = await api('/api/profiles');
  if (res.ok && res.data) {
    const sel = document.getElementById('profileSelect');
    sel.innerHTML = res.data.map(p =>
      '<option value="' + p.id + '"' + (p.is_primary ? ' selected' : '') + '>' + p.display_name + (p.is_primary ? ' (Primary)' : '') + '</option>'
    ).join('');
    currentProfile = sel.value;
  }
  loadPending();
  pendingInterval = setInterval(loadPending, 30000);
}

function onProfileChange() {
  currentProfile = document.getElementById('profileSelect').value;
  loadPending();
}

// ─── Tab Switching ───
function showTab(name) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  document.querySelector('[data-tab="' + name + '"]').classList.add('active');
  if (name === 'channels') { loadWatched(); loadAllChannels(); }
  if (name === 'messages') { loadChannelSelector(); }
}

// ─── Pending Replies ───
async function loadPending() {
  const res = await api('/api/pending?profile=' + currentProfile + '&limit=50');
  const el = document.getElementById('pendingContent');
  const badge = document.getElementById('pendingBadge');
  const time = document.getElementById('pendingRefreshTime');
  time.textContent = 'Updated ' + new Date().toLocaleTimeString();

  if (!res.ok || !res.data || res.data.length === 0) {
    el.innerHTML = '<div class="empty">No pending replies. All caught up!</div>';
    badge.style.display = 'none';
    return;
  }

  badge.textContent = res.data.length;
  badge.style.display = 'inline';

  el.innerHTML = '<table><thead><tr><th>Priority</th><th>Channel</th><th>User</th><th>Message</th><th>Age</th></tr></thead><tbody>' +
    res.data.map(m => {
      const prio = m.channel_priority || 'normal';
      const age = relativeTime(m.ts);
      const text = (m.text || '').substring(0, 80) + ((m.text || '').length > 80 ? '...' : '');
      return '<tr style="cursor:pointer" onclick="viewPendingMsg(\\'' + m.channel_id + '\\',\\'' + (m.thread_ts || m.ts) + '\\')">' +
        '<td><span class="badge-' + prio + '">' + prio.toUpperCase() + '</span></td>' +
        '<td>#' + (m.channel_name || m.channel_id) + '</td>' +
        '<td>' + (m.username || m.user_id) + '</td>' +
        '<td style="font-family:monospace;font-size:12px">' + escHtml(text) + '</td>' +
        '<td style="color:var(--fg3);font-size:12px">' + age + '</td></tr>';
    }).join('') + '</tbody></table>';
}

function viewPendingMsg(channelId, threadTs) {
  showTab('messages');
  const sel = document.getElementById('msgChannel');
  sel.value = channelId;
  loadMessages();
}

// ─── Watched Channels ───
async function loadWatched() {
  const res = await api('/api/channels/watched?profile=' + currentProfile);
  const el = document.getElementById('watchedContent');
  watchedIds = new Set();

  if (!res.ok || !res.data || res.data.length === 0) {
    el.innerHTML = '<div class="empty">No watched channels. Add channels from the list below.</div>';
    return;
  }

  res.data.forEach(ch => watchedIds.add(ch.channel_id));

  el.innerHTML = '<table><thead><tr><th>Channel</th><th>Priority</th><th>Description</th><th></th></tr></thead><tbody>' +
    res.data.map(ch =>
      '<tr><td>#' + escHtml(ch.channel_name) + '</td>' +
      '<td><span class="badge-' + ch.priority + '">' + ch.priority.toUpperCase() + '</span></td>' +
      '<td style="color:var(--fg2);font-size:12px">' + escHtml(ch.description || '') + '</td>' +
      '<td><button class="btn btn-sm btn-danger" onclick="removeWatched(\\'' + ch.channel_id + '\\',\\'' + escHtml(ch.channel_name) + '\\')">Remove</button></td></tr>'
    ).join('') + '</tbody></table>';
}

async function removeWatched(channelId, channelName) {
  if (!confirm('Remove #' + channelName + ' from watched channels?')) return;
  await api('/api/channels/watched', { method: 'DELETE', body: { profile: currentProfile, channel: channelId } });
  loadWatched();
  loadAllChannels();
}

// ─── All Channels ───
async function loadAllChannels() {
  const res = await api('/api/channels?profile=' + currentProfile + '&limit=500');
  const el = document.getElementById('allChannelsContent');

  if (!res.ok || !res.data || res.data.length === 0) {
    el.innerHTML = '<div class="empty">No channels found.</div>';
    return;
  }

  allChannels = res.data;
  renderChannels();
}

function renderChannels() {
  const filter = (document.getElementById('channelSearch').value || '').toLowerCase();
  const filtered = allChannels.filter(ch => ch.name.toLowerCase().includes(filter));
  const el = document.getElementById('allChannelsContent');

  el.innerHTML = filtered.map(ch => {
    const isWatched = watchedIds.has(ch.id);
    return '<div class="ch-item">' +
      '<div><span class="ch-name">#' + escHtml(ch.name) + '</span> <span class="ch-members">' + ch.num_members + ' members</span>' +
      (isWatched ? ' <span class="ch-watched">watching</span>' : '') + '</div>' +
      (isWatched ? '' : '<button class="btn btn-sm" onclick="showAddModal(\\'' + ch.id + '\\',\\'' + escHtml(ch.name) + '\\')">Watch</button>') +
      '</div>';
  }).join('');
}

function filterChannels() { renderChannels(); }

// ─── Add Channel Modal ───
function showAddModal(id, name) {
  document.getElementById('addChId').value = id;
  document.getElementById('addChName').value = '#' + name;
  document.getElementById('addChPriority').value = 'normal';
  document.getElementById('addChDesc').value = '';
  document.getElementById('addModal').classList.add('show');
}

function closeModal() { document.getElementById('addModal').classList.remove('show'); }

async function addWatchedChannel() {
  const channelId = document.getElementById('addChId').value;
  const priority = document.getElementById('addChPriority').value;
  const description = document.getElementById('addChDesc').value;
  await api('/api/channels/watched', {
    method: 'POST',
    body: { profile: currentProfile, channel: channelId, priority, description }
  });
  closeModal();
  loadWatched();
  loadAllChannels();
}

// ─── Messages ───
async function loadChannelSelector() {
  const res = await api('/api/channels?profile=' + currentProfile + '&limit=500');
  const sel = document.getElementById('msgChannel');
  const current = sel.value;
  sel.innerHTML = '<option value="">Select channel...</option>';
  if (res.ok && res.data) {
    sel.innerHTML += res.data.map(ch =>
      '<option value="' + ch.id + '"' + (ch.id === current ? ' selected' : '') + '>#' + escHtml(ch.name) + '</option>'
    ).join('');
  }
}

async function loadMessages() {
  const channel = document.getElementById('msgChannel').value;
  const limit = document.getElementById('msgLimit').value || 30;
  const el = document.getElementById('messagesContent');
  if (!channel) { el.innerHTML = '<div class="empty">Select a channel</div>'; return; }
  el.innerHTML = '<div class="loading">Loading messages...</div>';

  const res = await api('/api/messages?profile=' + currentProfile + '&channel=' + channel + '&limit=' + limit);
  if (!res.ok) { el.innerHTML = '<div class="empty">Error: ' + escHtml(res.error || 'Unknown') + '</div>'; return; }
  el.innerHTML = '<div style="white-space:pre-wrap;font-family:monospace;font-size:13px;line-height:1.6">' + escHtml(res.text || 'No messages') + '</div>';
}

async function loadThread(channel, threadTs) {
  const panel = document.getElementById('threadPanel');
  const el = document.getElementById('threadContent');
  panel.style.display = 'block';
  el.innerHTML = '<div class="loading">Loading thread...</div>';

  const res = await api('/api/thread?profile=' + currentProfile + '&channel=' + channel + '&thread_ts=' + threadTs);
  if (!res.ok) { el.innerHTML = '<div class="empty">Error loading thread</div>'; return; }
  el.innerHTML = '<div style="white-space:pre-wrap;font-family:monospace;font-size:13px;line-height:1.6">' + escHtml(res.text || 'No replies') + '</div>';
}

function closeThread() { document.getElementById('threadPanel').style.display = 'none'; }

// ─── Search ───
async function doSearch() {
  const query = document.getElementById('searchQuery').value;
  const limit = document.getElementById('searchLimit').value || 20;
  const el = document.getElementById('searchContent');
  if (!query) { el.innerHTML = '<div class="empty">Enter a search query</div>'; return; }
  el.innerHTML = '<div class="loading">Searching...</div>';

  const res = await api('/api/search?profile=' + currentProfile + '&query=' + encodeURIComponent(query) + '&limit=' + limit);
  if (!res.ok) { el.innerHTML = '<div class="empty">Error: ' + escHtml(res.error || 'Unknown') + '</div>'; return; }
  el.innerHTML = '<div style="white-space:pre-wrap;font-family:monospace;font-size:13px;line-height:1.6">' + escHtml(res.text || 'No results') + '</div>';
}

// ─── Style ───
async function loadStyle(refresh) {
  const el = document.getElementById('styleContent');
  el.innerHTML = '<div class="loading">' + (refresh ? 'Re-analyzing messages... (this may take a moment)' : 'Loading style profile...') + '</div>';

  const res = await api('/api/style?profile=' + currentProfile + '&refresh=' + (refresh ? 'true' : 'false'));
  if (!res.ok) { el.innerHTML = '<div class="empty">Error: ' + escHtml(res.error || 'Unknown') + '</div>'; return; }
  el.innerHTML = '<div style="white-space:pre-wrap;font-size:13px;line-height:1.7">' + escHtml(res.text || 'No style data') + '</div>';
}

// ─── Helpers ───
function escHtml(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function relativeTime(slackTs) {
  const ms = Date.now() - parseFloat(slackTs) * 1000;
  const min = Math.floor(ms / 60000);
  const hr = Math.floor(ms / 3600000);
  const day = Math.floor(ms / 86400000);
  if (min < 1) return 'just now';
  if (min < 60) return min + 'm ago';
  if (hr < 24) return hr + 'h ago';
  return day + 'd ago';
}

// Enter key handlers
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.id === 'searchQuery') doSearch();
});

// Start
init();
</script>
</body>
</html>`;
}
