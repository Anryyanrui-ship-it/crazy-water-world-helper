const toast = document.querySelector('.toast');
let toastTimer;
let currentState = null;
let selectedUid = null;
let currentTaskFilter = 'all';
let detailView = 'building';

window.addEventListener('error', (event) => {
  const message = (event.error && event.error.message) || event.message || '页面脚本加载失败';
  if (toast) showToast(`页面错误：${message}`, true);
});
window.addEventListener('unhandledrejection', (event) => {
  const message = (event.reason && event.reason.message) || '请求处理失败';
  if (toast) showToast(`操作失败：${message}`, true);
});

function showToast(message, error = false) {
  toast.querySelector('b').textContent = message;
  toast.querySelector('span').textContent = error ? '!' : '✓';
  toast.classList.toggle('error', error);
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

async function api(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  let response;
  try {
    response = await fetch(path, {
      cache: 'no-store', credentials: 'same-origin', signal: controller.signal, ...options,
    });
  } catch (error) {
    throw new Error(error.name === 'AbortError' ? '接口响应超时，请检查挂机服务状态' : '接口连接失败，请刷新后重试');
  } finally {
    clearTimeout(timer);
  }
  if (response.status === 401 || response.status === 403) {
    throw new Error('登录状态已失效，请重新登录');
  }
  const data = await response.json().catch(() => { throw new Error('接口返回格式异常'); });
  if (!response.ok || data.ok === false) throw new Error(data.msg || data.err || '操作失败');
  return data;
}

function setBusy(button, busy, label) {
  if (!button) return;
  if (busy) {
    button.dataset.originalLabel = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span>↻</span>${label}`;
  } else {
    button.disabled = false;
    button.innerHTML = button.dataset.originalLabel || button.innerHTML;
  }
}

const addAccountModal = document.querySelector('#addAccountModal');
const accountLoginStatus = document.querySelector('#accountLoginStatus');
const officialLoginButton = document.querySelector('#officialLoginButton');

function openAddAccount() {
  addAccountModal.hidden = false;
  accountLoginStatus.textContent = '';
}

function closeAddAccount() {
  addAccountModal.hidden = true;
}

async function channelLogin(path, body) {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.msg || '账号登录失败');
  return data;
}

async function loginOfficialAccount() {
  setBusy(officialLoginButton, true, '登录中');
  accountLoginStatus.textContent = '正在登录官方游戏账号，请稍候...';
  try {
    const data = await channelLogin('/api/channel/app/login', { username: document.querySelector('#officialAccountInput').value.trim(), password: document.querySelector('#officialPasswordInput').value });
    accountLoginStatus.textContent = `登录成功：${data.account?.nickname || data.account?.uid || '账号已添加'}`;
    await refreshState('账号已添加');
    setTimeout(closeAddAccount, 600);
  } catch (error) {
    accountLoginStatus.textContent = error.message;
  }
  setBusy(officialLoginButton, false);
}

function firstAccount() {
  return (currentState && currentState.accounts && currentState.accounts[0]) || null;
}

function accountTask(account) {
  const main = account.mainTask || {};
  if (main.name || main.title) return main.name || main.title;
  const hiddenTasks = new Set(['一键领邮件', '领取战报']);
  const enabled = Object.entries(account.tasks || {}).find(([name, value]) => value && !hiddenTasks.has(name));
  return (enabled && enabled[0]) || '等待任务';
}

function accountLevel(account) {
  const player = (account && account.player) || {};
  const level = player['等级'] ?? player.level ?? player.lv ?? player.levelId;
  return (level === undefined || level === null || level === '') ? null : level;
}

function levelTag(account) {
  const level = accountLevel(account);
  return level === null ? '' : `<span class="level-tag">Lv.${escapeHtml(level)}</span>`;
}

function credBadge(account) {
  const state = account && account.credState;
  if (state === 'invalid') return { cls: 'bad', text: account.credNote || '登录凭证已失效，需要重新抓包或登录' };
  if (state === 'stale') return { cls: 'warn', text: account.credNote || '凭证较旧，建议重新同步' };
  return null;
}

async function syncAccount(uid, button) {
  setBusy(button, true, '同步中');
  try {
    const data = await api(`/api/resync?uid=${encodeURIComponent(uid)}`);
    showToast(data.msg || '已触发同步');
    await refreshState('账号信息同步中');
  } catch (error) { showToast(error.message, true); }
  setBusy(button, false);
}

async function syncAllAccounts(button) {
  setBusy(button, true, '同步中');
  try {
    const data = await api('/api/resync?uid=all');
    showToast(data.msg || '已触发同步');
    await refreshState('账号信息同步中');
  } catch (error) { showToast(error.message, true); }
  setBusy(button, false);
}

async function deleteAccount(uid, button) {
  const account = ((currentState && currentState.accounts) || []).find((item) => item.uid === uid);
  const name = (account && (account.nickname || account.uid)) || uid;
  if (!window.confirm(`确定删除账号「${name}」吗？删除后该账号的登录凭证与配置一并清除，需要重新导入才能恢复。`)) return;
  setBusy(button, true, '删除中');
  try {
    await api(`/api/delete?uid=${encodeURIComponent(uid)}`);
    showToast(`已删除账号：${name}`);
    const cfg = document.querySelector('#configModal');
    if (cfg) cfg.hidden = true;
    if (selectedUid === uid) selectedUid = '';
    await refreshState('账号已删除');
  } catch (error) { showToast(error.message, true); setBusy(button, false); }
}

function renderState(state) {
  currentState = state;
  document.body.classList.remove('api-loading');
  document.body.classList.add('api-connected');
  const accounts = state.accounts || [];
  selectedUid = selectedUid && accounts.some((item) => item.uid === selectedUid)
    ? selectedUid : (accounts[0] && accounts[0].uid);
  const selectedAccount = accounts.find((item) => item.uid === selectedUid);
  updateUserLabel(state.user);
  const adminNav = document.querySelector('[data-admin-only]');
  if (adminNav) adminNav.hidden = !state.isAdmin;
  if (selectedAccount) updateSelectedAccountLabel(selectedAccount);

  const online = accounts.filter((item) => item.online).length;
  const running = accounts.filter((item) => item.enabled && !item.paused).length;
  const completed = accounts.reduce((sum, item) => sum + Number(item.dailyTaskDone || 0), 0);
  let runningFactories = 0;
  let claimableFactories = 0;
  accounts.forEach((item) => {
    (Array.isArray(item.buildings) ? item.buildings : []).filter((building) => /厂|工厂|farm|factory/i.test(String(factoryValue(building, ['name', 'title', 'type'], '')))).forEach((building) => {
      const slots = Array.isArray(building.slots) ? building.slots : [];
      slots.forEach((slot) => {
        if (factorySlotClaimable(slot)) claimableFactories += 1;
        else if (factorySlotOccupied(slot)) runningFactories += 1;
      });
    });
  });
  const cards = document.querySelectorAll('.stat-card strong');
  if (cards[0]) cards[0].innerHTML = `${online} <small>/ ${accounts.length}</small>`;
  if (cards[1]) cards[1].innerHTML = `${running} <small>个</small>`;
  if (cards[2]) cards[2].innerHTML = `${runningFactories} <small>个位置</small>`;
  if (cards[3]) cards[3].innerHTML = `${completed.toLocaleString()} <small>项</small>`;
  const trends = document.querySelectorAll('.stat-card .stat-trend');
  if (trends[0]) trends[0].textContent = `实时在线 · ${new Date().toLocaleTimeString('zh-CN')}`;
  if (trends[1]) trends[1].textContent = `已启用 ${running} / ${accounts.length}`;
  if (trends[2]) trends[2].textContent = `可领取 ${claimableFactories} 个位置`;
  if (trends[3]) trends[3].textContent = '当前自然日累计';

  const workspace = document.querySelector('.workspace-switch small');
  if (workspace) workspace.textContent = `账号组 · ${accounts.length} 个账号`;
  const accountCount = document.querySelector('#accounts .panel-header p');
  if (accountCount) accountCount.textContent = `最近同步：${new Date().toLocaleTimeString('zh-CN')} · 自动刷新中`;
  const navCount = document.querySelector('.nav-item[href="#accounts"] .nav-count');
  if (navCount) navCount.textContent = accounts.length;
  const footerSync = document.querySelector('#footerSync');
  if (footerSync) footerSync.textContent = `最后同步 ${new Date().toLocaleTimeString('zh-CN')}`;
  const sidebarNote = document.querySelector('#sidebarFootNote');
  if (sidebarNote) sidebarNote.textContent = `在线 ${online} / ${accounts.length} 个账号`;
  renderAllAccounts(accounts);
  renderAccountSwitchList(accounts);

  const accountTable = document.querySelector('.account-table');
  const tableHead = accountTable && accountTable.querySelector('.table-head');
  if (accountTable && tableHead) {
    accountTable.querySelectorAll('.account-row').forEach((row) => row.remove());
    const rowsHtml = accounts.slice(0, 5).map((account) => {
    const name = account.nickname || account.uid || '未命名账号';
    const initial = name.slice(0, 1);
    const main = account.mainTask || {};
    const taskName = main.desc || main.title || main.name || accountTask(account) || '暂无主线任务';
    const current = Number(main.progress || 0);
    const target = Number(main.target || 0);
    const progress = target ? Math.min(100, Math.round(current * 100 / target)) : 0;
    const online = Boolean(account.online);
    return `<div class="account-row${account.uid === selectedUid ? ' selected' : ''}" data-uid="${escapeHtml(account.uid)}"><div class="account-cell"><span class="account-avatar large">${escapeHtml(initial)}</span><span><b>${escapeHtml(name)}</b>${levelTag(account)}<small>主线：${escapeHtml(taskName)}</small></span></div><span class="status ${online ? 'online' : 'offline'}"><i></i>${online ? '在线' : '离线'}</span><span class="task-progress${online ? '' : ' muted'}"><small><em style="width:${progress}%"></em>${target ? `${current}/${target} · ${progress}%` : '等待任务进度'}</small></span><span class="last-active">${online ? '刚刚' : '暂离'}<br /><small>${online ? '账号运行中' : '等待重连'}</small></span><span class="row-arrow">›</span></div>`;
    }).join('') || '<div class="account-empty-state">暂无游戏账号，点击上方“添加账号”开始</div>';
    tableHead.insertAdjacentHTML('afterend', rowsHtml);
  }
  const viewAll = document.querySelector('#viewAllAccounts');
  if (viewAll) {
    viewAll.textContent = accounts.length ? `查看全部 ${accounts.length} 个账号 →` : '暂无游戏账号';
    viewAll.disabled = !accounts.length;
  }
  renderSelectedAccount();
}

function renderSelectedAccount() {
  const account = (currentState && currentState.accounts && currentState.accounts.find((item) => item.uid === selectedUid)) || firstAccount();
  if (!account) {
    const resourceList = document.querySelector('.factory-panel .resource-list');
    const factoryChart = document.querySelector('.factory-panel .factory-chart');
    const factoryCaption = document.querySelector('.factory-panel .panel-header p');
    const logList = document.querySelector('.log-panel .log-list');
    const logCaption = document.querySelector('.log-panel .panel-header p');
    const taskCaption = document.querySelector('.task-panel .panel-header p');
    const progress = document.querySelector('#progressDetails');
    const resident = document.querySelector('#residentDetails');
    const buildings = document.querySelector('#buildingDetails');
    if (factoryCaption) factoryCaption.textContent = '暂无游戏账号';
    if (factoryChart) factoryChart.innerHTML = '<div class="resource-empty">暂无游戏账号，添加账号后显示工厂数据</div>';
    if (resourceList) resourceList.innerHTML = '<div class="resource-empty">暂无游戏账号，添加账号后显示资源数据</div>';
    if (logCaption) logCaption.innerHTML = '<span class="live-dot"></span> 暂无账号数据';
    if (logList) logList.innerHTML = '<div><time>--:--:--</time><span class="log-dot gray"></span><p>暂无游戏账号，添加账号后显示实时日志</p></div>';
    if (taskCaption) taskCaption.textContent = '暂无游戏账号';
    if (progress) progress.innerHTML = '<p class="detail-empty">暂无游戏账号，添加账号后显示主线进度</p>';
    if (resident) resident.innerHTML = '<p class="detail-empty">暂无游戏账号，添加账号后显示居民需求</p>';
    if (buildings) buildings.innerHTML = '<p class="detail-empty">暂无游戏账号，添加账号后显示建筑数据</p>';
    return;
  }
  renderResourceOverview(account);
  const taskPanel = document.querySelector('.task-panel');
  const taskCaption = taskPanel && taskPanel.querySelector('.panel-header p');
  if (taskCaption) taskCaption.textContent = `当前账号 · ${account.nickname || account.uid}`;
  const taskList = taskPanel && taskPanel.querySelector('.task-list');
  if (taskList) {
    const mainTask = account.mainTask || {};
    const eventTasks = (account.events || []).filter((event) => {
      const text = typeof event === 'string' ? event : `${event.name || ''} ${event.text || ''} ${event.msg || ''}`;
      return /进行|运行|施工|生产|等待|重连/.test(text);
    }).map((event) => [typeof event === 'string' ? event : (event.name || event.text || event.msg || '实时任务'), event]);
    const running = mainTask.name || mainTask.title ? [[mainTask.name || mainTask.title, mainTask]] : eventTasks;
    const completed = Object.entries(account.taskStat || {}).filter(([, stat]) => Number((stat && stat.ok) || 0) > 0);
    const source = currentTaskFilter === 'done' ? completed.map(([name, stat]) => [name, stat]) : currentTaskFilter === 'running' ? running : [...running, ...completed];
    const tabCounts = [running.length + completed.length, running.length, completed.length];
    document.querySelectorAll('.filter-tabs button').forEach((tabButton, tabIndex) => { const badge = tabButton.querySelector('b'); if (badge) badge.textContent = tabCounts[tabIndex] || 0; });
    const taskNavCount = document.querySelector('.nav-item[href="#tasks"] .nav-count');
    if (taskNavCount) taskNavCount.textContent = running.length;
    taskList.innerHTML = source.length ? source.slice(0, 12).map(([name, stat]) => {
      const done = currentTaskFilter === 'done';
      return `<div class="task-row"><span class="task-status ${done ? 'done' : 'working'}">${done ? '✓' : '●'}</span><span class="task-detail"><b>${name}</b><small>${done ? `已完成 ${stat.ok || 0} 次` : '按当前账号配置运行中'}</small></span><span class="task-time">${done ? '已完成' : '运行中'}<small>${done ? '历史任务记录' : '自动执行'}</small></span></div>`;
    }).join('') : `<div class="task-row"><span class="task-status done">✓</span><span class="task-detail"><b>${currentTaskFilter === 'done' ? '暂无已完成任务' : currentTaskFilter === 'running' ? '暂无进行中任务' : '暂无任务记录'}</b><small>当前账号没有可显示的任务</small></span><span class="task-time">--</span></div>`;
  }
  const logList = document.querySelector('.log-panel .log-list');
  if (logList) {
    const events = [...(account.events || []), ...(account.taskLog || [])];
    logList.innerHTML = events.slice(-5).reverse().map((event) => {
      const text = typeof event === 'string' ? event : (event.text || event.msg || event.name || '账号状态更新');
      const time = typeof event === 'object' && event.time ? new Date(event.time * 1000).toLocaleTimeString('zh-CN') : '--:--:--';
      return `<div><time>${time}</time><span class="log-dot blue"></span><p>${text}</p></div>`;
    }).join('') || '<div><time>--:--:--</time><span class="log-dot gray"></span><p>当前账号暂无实时日志</p></div>';
  }
  renderFactory(account);
  renderAccountDetails(account);
}

function renderResourceOverview(account) {
  const list = document.querySelector('#resourceOverviewList');
  const sub = document.querySelector('#resourceOverviewSub');
  if (!list) return;
  const resources = Array.isArray(account.resBars) ? account.resBars : [];
  if (sub) sub.textContent = `${account.nickname || account.uid} · ${resources.length} 项资源`;
  const renderResource = (item) => {
    const count = Number(item.count || 0);
    const rawCap = item.cap ?? item.max;
    const cap = Number(rawCap);
    const hasCap = Number.isFinite(cap) && cap > 0;
    const percent = cap > 0 ? Math.min(100, Math.round(count * 100 / cap)) : 0;
    const full = hasCap && count >= cap;
    return `<div class="resource-overview-item${hasCap ? ' has-cap' : ' no-cap'}${full ? ' full' : ''}"><div><b>${escapeHtml(item.name || '资源')}</b><strong>${count}${hasCap ? ` <small>/ ${cap}</small>` : ''}</strong></div>${hasCap ? `<em><i style="width:${percent}%"></i></em>${full ? '<span class="resource-full">已满</span>' : ''}` : '<span class="resource-unlimited">容量未同步</span>'}</div>`;
  };
  const capped = resources.filter((item) => {
    const cap = Number(item.cap ?? item.max);
    return Number.isFinite(cap) && cap > 0;
  });
  const uncapped = resources.filter((item) => !capped.includes(item));
  const groups = [];
  if (capped.length) groups.push(`<div class="resource-group"><div class="resource-group-title"><b>容量资源</b><span>已检测到存储上限</span></div><div class="resource-group-list">${capped.map(renderResource).join('')}</div></div>`);
  if (uncapped.length) groups.push(`<div class="resource-group resource-group-plain"><div class="resource-group-title"><b>其他资源</b><span>容量数据暂未同步</span></div><div class="resource-group-list">${uncapped.map(renderResource).join('')}</div></div>`);
  list.innerHTML = groups.join('') || '<div class="resource-empty">当前账号暂无资源数据，等待账号同步</div>';
}

function escapeHtml(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const BUILD_LEVEL_HINT = { '1': 1 };
function buildLevelOf(item) {
  const explicit = factoryValue(item, ['level', 'lv', 'grade'], '');
  if (explicit !== '' && explicit !== null && explicit !== undefined && explicit !== '--') return explicit;
  const m = String((item && item.name) || '').match(/^(\d+)/);
  return m ? m[1] : '--';
}
function buildStateOf(item) {
  const slots = item && Array.isArray(item.slots) ? item.slots : [];
  if (slots.some((slot) => factorySlotClaimable(slot))) return '可领取';
  if (Number((item && item.left) || 0) > 0) return '施工中';
  if (slots.some((slot) => factorySlotOccupied(slot))) return '生产中';
  return '空闲';
}
function fmtDuration(seconds) {
  const total = Math.round(Number(seconds) || 0);
  if (total <= 0) return '';
  if (total < 60) return `${total}秒`;
  const minutes = Math.round(total / 60);
  if (minutes < 60) return `${minutes}分钟`;
  return `${Math.floor(minutes / 60)}小时${minutes % 60 ? `${minutes % 60}分钟` : ''}`;
}
function buildMetaOf(item) {
  const remain = Number((item && item.left) || 0);
  const total = Number((item && item.needSec) || 0);
  const state = buildStateOf(item);
  if (remain <= 0) return state;
  return `${state} · 剩余 ${fmtDuration(remain)}${total > 0 ? ` / 共 ${fmtDuration(total)}` : ''}`;
}

function renderAccountDetails(account) {
  const main = account.mainTask || {};
  const player = account.player || {};
  const progress = document.querySelector('#progressDetails');
  const resident = document.querySelector('#residentDetails');
  const buildings = document.querySelector('#buildingDetails');
  const sub = document.querySelector('#progressDetailsSub');
  if (sub) sub.textContent = `${account.nickname || account.uid} · UID ${account.uid}`;
  if (progress) {
    const taskId = main.taskId || main.id || '--';
    const current = Number(main.progress || 0);
    const target = Number(main.target || 0);
    const percent = target ? Math.min(100, Math.round(current * 100 / target)) : 0;
    const stage = player['已通关关卡'] || account.stage || '--';
    progress.innerHTML = `<div class="detail-highlight"><span>主线 #${escapeHtml(taskId)}</span><b>${escapeHtml(main.desc || main.title || main.name || '暂无主线任务')}</b><small>${escapeHtml(main.type || '主线任务')} · ${target ? `${current}/${target}` : '等待任务进度'}</small><em><i style="width:${percent}%"></i></em></div><div class="detail-stat-row"><span>已通关关卡 <b>${escapeHtml(stage)}</b></span><span>挑战关卡 <b>${escapeHtml(account.stageTry || (Number(stage) + 1))}</b></span><span>战力 <b>${escapeHtml(player['战力'] || '--')}</b></span><span>自动闯关 <b>${account.tasks && account.tasks['闯关'] ? '已开启' : '未开启'}</b></span><span>挑战次数 <b>${escapeHtml(account.stageTries || 0)}</b></span><span>失败次数 <b>${escapeHtml(account.stageFails || 0)}</b></span></div>${account.stageReason ? `<p class="detail-note">失败原因：${escapeHtml(account.stageReason)}</p>` : ''}${account.stageNote ? `<p class="detail-note">${escapeHtml(account.stageNote)}</p>` : ''}`;
  }
  if (resident) {
    const week = account.weekOrder || [];
    const orders = account.worker_orders || [];
    let source = week;
    if (!source.length) {
      source = [];
      orders.forEach((order) => (order.items || []).forEach((item) => source.push({ name: item.name, need: item.need, have: item.have, workerId: order.workerId })));
    }
    resident.innerHTML = source.length ? `<div class="resident-list">${source.map((item) => { const have = Number(item.have || 0); const need = Number(item.need || 0); return `<div class="resident-item ${have < need ? 'missing' : ''}"><b>居民 ${escapeHtml(item.workerId || '')}</b><span>${escapeHtml(item.name || '需求物品')}</span><strong>${have}/${need}</strong></div>`; }).join('')}</div>` : '<p class="detail-empty">还没收到居民需求数据，等待账号同步</p>';
  }
  if (buildings) {
    const list = account.buildings || [];
    buildings.innerHTML = list.length ? `<div class="building-list">${list.slice(0, 80).map((item) => `<div class="building-item"><b>${escapeHtml(item.name || '建筑')}</b><span>等级 ${escapeHtml(buildLevelOf(item))}</span><small>${escapeHtml(buildMetaOf(item))}</small></div>`).join('')}</div>` : '<p class="detail-empty">还没收到建筑数据，等待账号同步</p>';
  }
}

function setPageView(view) {
  const factory = view === 'factory';
  const task = view === 'task';
  const resource = view === 'resource';
  document.body.classList.toggle('factory-view', factory);
  document.body.classList.toggle('task-view', task);
  document.body.classList.toggle('resource-view', resource);
  document.querySelectorAll('.nav-item[data-view]').forEach((item) => item.classList.toggle('active', item.dataset.view === view));
  const accountDetails = document.querySelector('#accountDetails');
  const factoryWorkspace = document.querySelector('#factoryWorkspace');
  const taskWorkspace = document.querySelector('#taskWorkspace');
  const resourceWorkspace = document.querySelector('#resourceWorkspace');
  if (factoryWorkspace) factoryWorkspace.hidden = !factory;
  if (taskWorkspace) taskWorkspace.hidden = !task;
  if (resourceWorkspace) resourceWorkspace.hidden = !resource;
  if (accountDetails) accountDetails.hidden = !factory || detailView !== 'building';
  if (factory) renderDetailView();
}

function renderDetailView() {
  const accountDetails = document.querySelector('#accountDetails');
  const factoryList = document.querySelector('#factoryWorkspaceList');
  const summary = document.querySelector('#factoryWorkspaceSummary');
  const factoryMode = detailView === 'factory';
  if (accountDetails) accountDetails.hidden = detailView !== 'building';
  if (factoryList) factoryList.closest('.panel-card').querySelector('.factory-summary-strip').hidden = !factoryMode;
  if (factoryMode) {
    if (accountDetails) accountDetails.hidden = true;
  } else {
    if (accountDetails) accountDetails.hidden = false;
    if (factoryList) factoryList.innerHTML = '<p class="config-loading">请切换到“工厂”查看生产位置</p>';
    if (summary) summary.hidden = true;
  }
}

function eventText(event) {
  if (typeof event === 'string') return event;
  return (event && event.text) || (event && event.msg) || (event && event.name) || (event && event.event) || '账号状态更新';
}

function eventTime(event) {
  const value = typeof event === 'object' ? (event.time || event.ts || event.wall) : null;
  return value ? new Date(Number(value) * 1000).toLocaleString('zh-CN') : '时间未知';
}

function openFullLog() {
  const account = (currentState && currentState.accounts && currentState.accounts.find((item) => item.uid === selectedUid)) || firstAccount();
  if (!account) { showToast('当前没有可查看的账号', true); return; }
  document.querySelector('#logModalSub').textContent = `${account.nickname || account.uid} · ${account.uid}`;
  const events = [...(account.events || []), ...(account.taskLog || [])].slice(-200).reverse();
  document.querySelector('#fullLogList').innerHTML = events.map((event) => `<div class="full-log-item"><time>${eventTime(event)}</time><p>${eventText(event)}</p></div>`).join('') || '<p class="config-loading">当前账号暂无完整日志</p>';
  document.querySelector('#logModal').hidden = false;
}

function renderFactory(account) {
  const panel = document.querySelector('.factory-panel');
  if (!panel) return;
  const buildings = Array.isArray(account.buildings) ? account.buildings : [];
  const factoryBuildings = buildings.filter((item) => /厂|工厂/.test(item.name || ''));
  let running = 0;
  let claimable = 0;
  let totalSlots = 0;
  factoryBuildings.forEach((building) => {
    const slots = Array.isArray(building.slots) ? building.slots : [];
    if (!slots.length) {
      const state = String(building.state || building.status || '');
      if (/领取|完成|满仓|claim|done/i.test(state)) claimable += 1;
      else if (/生产|加工|工作|running|working/i.test(state)) running += 1;
      totalSlots += 1;
      return;
    }
    slots.forEach((slot) => {
      totalSlots += 1;
      if (factorySlotClaimable(slot)) claimable += 1;
      else if (factorySlotOccupied(slot)) running += 1;
    });
  });
  const idle = Math.max(0, totalSlots - running - claimable);
  const total = running + claimable + idle;
  const legend = panel.querySelectorAll('.factory-legend b');
  if (legend[0]) legend[0].textContent = running;
  if (legend[1]) legend[1].textContent = claimable;
  if (legend[2]) legend[2].textContent = idle;
  const donut = panel.querySelector('.donut span');
  if (donut) donut.innerHTML = `${running}<small>生产中</small>`;
  const caption = panel.querySelector('.panel-header p');
  if (caption) caption.textContent = `当前账号 · ${account.nickname || account.uid} · ${factoryBuildings.length} 间工厂`;
  const resources = account.resBars || [];
  const resourceList = panel.querySelector('.resource-list');
  if (resourceList) {
    resourceList.innerHTML = resources.slice(0, 4).map((item) => {
      const count = Number(item.count || 0);
      const cap = Number(item.cap || item.max || 0);
      const percent = cap > 0 ? Math.min(100, Math.round(count * 100 / cap)) : 0;
      return `<div><span>${item.name || '资源'}</span><strong>${count}${cap ? ` <small>/ ${cap}</small>` : ''}</strong><em><i style="width:${percent}%"></i></em></div>`;
    }).join('') || '<div class="resource-empty">暂无资源数据，等待账号同步</div>';
  }
  renderFactoryWorkspace(account);
}

function renderFactoryWorkspace(account) {
  const list = document.querySelector('#factoryWorkspaceList');
  const summary = document.querySelector('#factoryWorkspaceSummary');
  const caption = document.querySelector('#factoryWorkspaceSub');
  if (!list) return;
  const buildings = Array.isArray(account.buildings) ? account.buildings : [];
  const factories = buildings.filter((item) => /厂|工厂|farm|factory/i.test(String(factoryValue(item, ['name', 'title', 'type'], '建筑'))));
  let running = 0;
  let claimable = 0;
  list.innerHTML = factories.map((factory, index) => {
    const slots = Array.isArray(factory.slots) ? factory.slots : [];
    const sixSlots = Array.from({ length: 6 }, (_, slotIndex) => slots[slotIndex] || {});
    const slotHtml = sixSlots.map((slot, slotIndex) => {
      const product = factorySlotProduct(slot);
      const quantity = factoryValue(slot, ['quantity', 'count', 'num'], '');
      const claimableSlot = factorySlotClaimable(slot);
      const state = factoryValue(slot, ['state', 'status'], claimableSlot ? '已完成，可领取' : product === '空闲' ? '等待生产' : '生产中');
      const occupied = product !== '空闲';
      if (claimableSlot) claimable += 1;
      else if (occupied) running += 1;
      return `<div class="production-slot ${occupied ? 'occupied' : 'empty'}"><span class="slot-number">位置 ${slotIndex + 1}</span><b>${product}${quantity ? ` × ${quantity}` : ''}</b><small>${state}</small><em>${factorySlotEnd(slot) === 1 ? '已完成' : factorySlotEnd(slot) ? factorySlotEnd(slot) : (occupied ? '进行中' : '可安排生产')}</em></div>`;
    }).join('');
    return `<article class="factory-card"><div class="factory-card-head"><div><span class="factory-number">${index + 1}</span><h3>${factoryValue(factory, ['name', 'title', 'type'], `工厂 ${index + 1}`)}</h3><p>等级 ${factoryValue(factory, ['level', 'lv', 'grade'], '') || buildLevelOf(factory)} · ${buildMetaOf(factory)}</p></div><span class="factory-state">6 个生产位置</span></div><div class="production-slots">${slotHtml}</div></article>`;
  }).join('') || '<p class="config-loading">当前账号暂无工厂数据，请点击刷新工厂</p>';
  if (caption) caption.textContent = `${account.nickname || account.uid} · ${factories.length} 间工厂 · 每厂 6 个生产位置`;
  if (summary) summary.innerHTML = `<span>工厂总数 <b>${factories.length}</b></span><span>生产位置 <b>${factories.length * 6}</b></span><span>生产中 <b>${running}</b></span><span>可领取 <b>${claimable}</b></span>`;
}

function factoryValue(item, keys, fallback = '') {
  for (const key of keys) {
    if (item && item[key] !== undefined && item[key] !== null && item[key] !== '') return item[key];
  }
  return fallback;
}

function factorySlotProduct(slot) {
  const product = factoryValue(slot, ['product', 'item', 'name', 'output', '2'], '');
  return product === '' || product === '?' || product === null ? '空闲' : String(product);
}

function factorySlotEnd(slot) {
  return factoryValue(slot, ['finishAt', 'finish_time', 'endTime', 'remain', '3'], '');
}

function factorySlotOccupied(slot) {
  return factorySlotProduct(slot) !== '空闲';
}

function factorySlotClaimable(slot) {
  const state = String(factoryValue(slot, ['state', 'status'], ''));
  const end = factorySlotEnd(slot);
  return Boolean(slot && (slot.claimable || slot.canCollect)) || /领取|完成|满仓|claim|done/i.test(state) || Number(end) === 1;
}

function openFactoryDetails() {
  const account = (currentState && currentState.accounts && currentState.accounts.find((item) => item.uid === selectedUid)) || firstAccount();
  if (!account) { showToast('当前没有可查看的账号', true); return; }
  const modal = document.querySelector('#factoryModal');
  const list = document.querySelector('#factoryDetailList');
  const sub = document.querySelector('#factoryModalSub');
  const buildings = Array.isArray(account.buildings) ? account.buildings : [];
  const factories = buildings.filter((item) => /厂|工厂|farm|factory/i.test(String(factoryValue(item, ['name', 'title', 'type'], '建筑'))));
  if (sub) sub.textContent = `${account.nickname || account.uid} · ${factories.length} 个工厂 · 数据来自当前账号`;
  if (list) {
    list.innerHTML = factories.map((item, index) => {
      const slots = Array.isArray(item.slots) ? item.slots : [];
      const state = factoryValue(item, ['state', 'status', 'stage'], '空闲');
      const level = factoryValue(item, ['level', 'lv', 'grade'], '--');
       const product = factoryValue(item, ['product', 'item', 'output', 'produce'], '暂无生产');
      const quantity = factoryValue(item, ['quantity', 'count', 'num'], '');
      const finish = factoryValue(item, ['finishAt', 'finish_time', 'endTime', 'remain'], '');
       const slotText = slots.map((slot) => `${factorySlotProduct(slot)} ${factoryValue(slot, ['quantity', 'count', 'num'], '')}`.trim()).join('、');
      return `<div class="factory-detail-row"><div class="factory-detail-title"><span class="factory-number">${index + 1}</span><b>${factoryValue(item, ['name', 'title', 'type'], `工厂 ${index + 1}`)}</b><span class="factory-state">${state}</span></div><div class="factory-detail-meta"><span>等级 ${level}</span><span>产出 ${product}${quantity ? ` × ${quantity}` : ''}</span><span>${finish ? `完成：${finish}` : (slotText || '暂无队列')}</span></div></div>`;
    }).join('') || '<p class="config-loading">当前账号暂无工厂明细，请先同步账号数据</p>';
  }
  if (modal) modal.hidden = false;
}

async function selectAccount(uid, closeDirectory = false) {
  selectedUid = uid;
  const taskCaption = document.querySelector('.task-panel .panel-header p');
  if (taskCaption) taskCaption.textContent = '正在加载账号实时任务...';
  const local = currentState && currentState.accounts && currentState.accounts.find((item) => item.uid === uid);
  if (local) {
    document.querySelectorAll('.account-row').forEach((row) => row.classList.toggle('selected', row.dataset.uid === uid));
    renderSelectedAccount();
  }
  try {
    const detail = await api(`/api/account?uid=${encodeURIComponent(uid)}`);
    if (currentState) {
      const index = currentState.accounts.findIndex((item) => item.uid === uid);
      if (index >= 0) currentState.accounts[index] = { ...currentState.accounts[index], ...detail };
    }
     renderAllAccounts((currentState && currentState.accounts) || []);
     renderAccountSwitchList((currentState && currentState.accounts) || []);
     const selected = currentState && currentState.accounts.find((item) => item.uid === uid);
     if (selected) updateSelectedAccountLabel(selected);
     renderSelectedAccount();
    showToast(`已加载 ${detail.nickname || uid} 的实时数据`);
  } catch (error) {
    showToast(error.message, true);
  }
  if (closeDirectory) accountModal.hidden = true;
}

function renderAllAccounts(accounts) {
  const list = document.querySelector('#allAccountList');
  if (!list) return;
  list.innerHTML = accounts.map((account) => {
    const active = account.uid === selectedUid;
    const statusName = account.online ? '在线' : account.enabled ? '连接中' : '暂停';
    const statusClass = account.online ? 'online' : account.enabled ? 'paused' : 'offline';
    const initial = (account.nickname || account.uid || '?').slice(0, 1);
    const cred = credBadge(account);
    return `<div class="all-account-item${active ? ' selected' : ''}" data-uid="${encodeURIComponent(account.uid)}">
      <div class="all-account-main"><span class="account-avatar">${initial}</span><span><b>${account.nickname || account.uid}</b>${levelTag(account)}${cred ? `<span class="cred-flag ${cred.cls}">${escapeHtml(cred.text)}</span>` : ''}</span></div>
      <span class="status ${statusClass}"><i></i>${statusName}</span>
      <div class="all-account-actions"><button class="account-sync${cred ? ' attention' : ''}" data-account-sync="${encodeURIComponent(account.uid)}">同步信息</button><button class="account-config" data-account-config="${encodeURIComponent(account.uid)}">配置</button><button class="account-toggle" data-account-toggle="${encodeURIComponent(account.uid)}">${account.enabled ? '暂停挂机' : '启动挂机'}</button><button class="account-delete" data-account-delete="${encodeURIComponent(account.uid)}">删除</button></div>
    </div>`;
  }).join('') || '<p class="empty-state">暂无账号数据</p>';
}

function updateSelectedAccountLabel(account) {
  const name = account.nickname || account.uid || '未命名账号';
  const initial = name.slice(0, 1);
  const workspaceName = document.querySelector('#workspaceName');
  const workspaceAvatar = document.querySelector('#workspaceAvatar');
  if (workspaceName) workspaceName.textContent = name;
  if (workspaceAvatar) workspaceAvatar.textContent = initial;
}

function updateUserLabel(username) {
  const name = username || '当前用户';
  const initial = name.slice(0, 1);
  const workspaceName = document.querySelector('#workspaceName');
  const workspaceAvatar = document.querySelector('#workspaceAvatar');
  const topUserName = document.querySelector('#topUserName');
  const topUserAvatar = document.querySelector('#topUserAvatar');
  if (workspaceName) workspaceName.textContent = name;
  if (workspaceAvatar) workspaceAvatar.textContent = initial;
  if (topUserName) topUserName.textContent = name;
  if (topUserAvatar) topUserAvatar.textContent = initial;
}

function renderAccountSwitchList(accounts) {
  const list = document.querySelector('#accountSwitchList');
  if (!list) return;
  list.innerHTML = accounts.map((account) => {
    const name = account.nickname || account.uid || '未命名账号';
    const active = account.uid === selectedUid;
    const state = account.online ? '在线' : account.enabled ? '连接中' : '暂停';
    const lvl = accountLevel(account);
    return `<button class="account-switch-item${active ? ' selected' : ''}" type="button" data-switch-uid="${encodeURIComponent(account.uid)}"><span class="account-avatar">${escapeHtml(name.slice(0, 1))}</span><span><b>${escapeHtml(name)}</b><small>${lvl === null ? '' : `Lv.${escapeHtml(lvl)} · `}${state}</small></span>${active ? '<i>✓</i>' : ''}</button>`;
  }).join('') || '<p class="account-switch-empty">暂无账号</p>';
}

const configTasks = [
  ['基础领奖', ['领主线任务奖励', '完成居民订单', '领订单奖励']],
  ['采集', ['钓鱼', '捡漂浮物']],
  ['建筑与生产', ['收取建筑产出', '建筑升级', '完成建筑升级', '收工厂成品', '工厂生产', '农田播种', '农田收获']],
  ['主线闯关', ['闯关', '自动挂机升级']],
  ['英雄', ['一键委任', '自动升级', '自动升星', '技能升级', '技能进阶', '专武升级', '专武升星', '装备强化', '徽章强化', '自动看技能视频', '免费招募', '自动招募', '碎片集齐招募', '招募积分奖励']],
  // 日常/成长/邮箱/漫剧：任务面板里那几项一看视频或一点就能领的奖励。
  ['任务与奖励', ['漫剧', '日常任务奖励', '成长任务奖励', 'VIP免费礼包', '每日赠礼', '闯关达标', '限购日礼包', '限购周礼包', '月卡领取', '赛季卡领取']],
  // 联盟 / 世界 / 贸易 / 藏品：以前藏在后端、面板没入口的几个开关补上。
  ['联盟与世界', ['联盟互助', '公会信息', '世界占领', '资源地占领', '世界海盗', '舰队维修', '贸易交货', '漂流货船', '情报-击退海盗', '情报-收集资源', '情报-探查敌城', '情报-其它事件', '情报-路易斯的行踪', '情报-救援难民']],
  ['副本与活动', ['竞技场挑战', '竞技场扫荡', '试炼副本', '积分赛', '远征副本', '建筑自动工作']],
  // 海兽（宠物培育室）：培育/投喂默认开，升星/升级默认关（烧材料）。
  ['海兽（宠物）', ['海兽培育', '海兽投喂', '海兽升星', '海兽升级']],
  ['其他', ['英雄预览', '满仓自动消耗', '徽章穿戴', '装备穿戴', '藏品升级', '藏品升星']],
];

function renderConfig(account) {
  const content = document.querySelector('#configContent');
  const tasks = account.tasks || {};
  const filters = account.heroQualityFilter || [];
  const heroes = account.heroes || {};
  const heroWatch = account.heroWatch || [];
  const qualityCn = account.qualityCn || { RED: '红', ORANGE: '橙', PURPLE: '紫', BLUE: '蓝', GREEN: '绿' };
  const qualityOrder = account.qualityOrder || ['RED', 'ORANGE', 'PURPLE', 'BLUE', 'GREEN'];
  const qualityColors = account.qualityColors || {};
  const qualityOf = account.heroQuality || {};
  const heroDisplay = account.heroDisplay || {};
  const safeColor = (value, fallback) => /^#[0-9a-f]{3,8}$/i.test(String(value || '')) ? value : fallback;
  const heroColor = (name) => qualityColors[qualityOf[name]] || { text: '#667586', swatch: '#b8c1cc', background: '#f7f9fb', border: '#dbe3ec' };
  const heroEntries = Object.keys(heroes).sort((a, b) => {
    const rank = (name) => { const index = qualityOrder.indexOf(qualityOf[name]); return index < 0 ? qualityOrder.length : index; };
    return rank(a) - rank(b) || Number((heroes[b] || {}).level || 0) - Number((heroes[a] || {}).level || 0);
  });
  const recruitWays = account.recruitWays || { 1: '免费', 2: '单抽', 3: '十连' };
  document.querySelector('#configModalSub').textContent = `${account.nickname || account.uid} · UID ${account.uid}`;
  const cred = credBadge(account);
  const credText = cred ? (cred.cls === 'bad' ? '登录凭证已失效' : '登录凭证较旧，建议同步') : '登录凭证正常';
  const credDetail = (cred && cred.text) || (account.frameAgeHours ? `已使用 ${account.frameAgeHours} 小时` : '点击同步后用最新登录凭证重新登录');
  content.innerHTML = `<div class="config-section"><h3>账号运行</h3><div class="config-grid"><label class="config-toggle"><span>挂机开关<small>控制该账号是否运行</small></span><input type="checkbox" data-config-run ${account.enabled ? 'checked' : ''}><i></i></label><label class="config-field"><span>区服</span><select data-config-zone><option value="0">默认区服</option><option value="2001011315">s2区</option><option value="2001012104">新区</option></select></label></div></div>
     <div class="config-section"><h3>同步信息</h3><div class="sync-row"><div><b class="cred-flag ${cred ? cred.cls : 'ok'}">${escapeHtml(credText)}</b><small>${escapeHtml(credDetail)}</small></div><button type="button" class="account-sync" data-config-sync="${encodeURIComponent(account.uid)}">同步信息</button></div></div>
     ${configTasks.map(([group, names]) => `<div class="config-section"><h3>${group}</h3><div class="config-grid">${names.filter((name) => !['一键领邮件', '领取战报'].includes(name) && Object.prototype.hasOwnProperty.call(tasks, name)).map((name) => `<label class="config-toggle"><span>${name}<small>按当前账号单独保存</small></span><input type="checkbox" data-config-task="${encodeURIComponent(name)}" ${tasks[name] ? 'checked' : ''}><i></i></label>`).join('')}</div></div>`).join('')}
     <div class="config-section hero-strategy-section"><h3>英雄策略</h3><div class="hero-strategy-block"><b>按品级筛选</b><small>留空表示不限品级，选中后只处理对应品级英雄</small><div class="hero-quality-chips">${qualityOrder.map((quality) => `<label class="hero-quality-chip quality-${quality.toLowerCase()} ${filters.includes(quality) ? 'selected' : ''}"><input type="checkbox" data-config-quality-chip="${quality}" ${filters.includes(quality) ? 'checked' : ''}><span>${qualityCn[quality] || quality}</span><i>${Object.values(qualityOf).filter((item) => item === quality).length}</i></label>`).join('')}</div></div><div class="hero-strategy-block"><b>指定英雄</b><small>留空表示对全部英雄生效，可与品级筛选叠加</small>${heroEntries.length ? `<div class="hero-watch-list">${heroEntries.map((name) => { const color = heroColor(name); const selected = heroWatch.includes(name); return `<label class="hero-watch-chip${selected ? ' selected' : ''}" style="--hero-text:${safeColor(color.text, '#667586')};--hero-swatch:${safeColor(color.swatch, '#b8c1cc')};--hero-bg:${safeColor(color.background, '#f7f9fb')};--hero-border:${safeColor(color.border, '#dbe3ec')}"><input type="checkbox" data-config-watch-name="${escapeHtml(encodeURIComponent(name))}" ${selected ? 'checked' : ''}><span>${escapeHtml(heroDisplay[name] || name)}</span>${heroes[name] && heroes[name].star ? `<i>★${escapeHtml(heroes[name].star)}</i>` : ''}</label>`; }).join('')}</div><div class="hero-strategy-actions"><span data-config-watch-count>${heroWatch.length ? `已指定 ${heroWatch.length} 个英雄` : '当前对全部英雄生效'}</span><button type="button" class="text-button" data-config-watch-clear>清空指定英雄</button></div>` : '<p class="config-empty">还没有同步到英雄列表，登录后等待数据同步</p>'}</div><div class="hero-strategy-block"><b>委任与装备状态</b><div class="hero-sync-status"><span>委任槽位 <strong>${(account.appointSlots || []).length ? account.appointSlots.join('、') : '未同步'}</strong></span><span>装备 <strong>${account.equipCount || (account.equipUids || []).length || '未同步'}</strong></span><span>徽章 <strong>${account.badgeCount || (account.badgeUids || []).length || '未同步'}</strong></span></div></div><div class="config-grid"><label class="config-field"><span>招募档位</span><select data-config-recruit>${Object.entries(recruitWays).map(([value, name]) => `<option value="${value}" ${String(account.recruitWay || 1) === String(value) ? 'selected' : ''}>${name}${String(value) === '1' ? '' : ' · 消耗资源'}</option>`).join('')}</select><small>只有免费档不消耗招募券或钻石</small></label><label class="config-field"><span>舰队维修阈值</span><input type="number" min="0" max="100000" step="100" data-config-repair value="${Number.isFinite(Number(account.repairThreshold)) ? Number(account.repairThreshold) : 1600}"><small>在家待命舰队耐久低于此值才送修（默认 1600）。0 = 有伤就修</small></label><label class="config-field"><span>情报最低战力</span><input type="number" min="0" max="100000000" step="1000" data-config-radarpower value="${Number.isFinite(Number(account.radarMinPower)) ? Number(account.radarMinPower) : 0}"><small>「联盟情报」战斗类事件要求的最低舰队战力（0 = 不限）。打输过的会自动抬高，下次换更强的舰队</small></label></div></div>
     <div class="config-section"><h3>账号管理</h3><div class="sync-row"><div><b>删除账号</b><small>删除后该账号的登录凭证与配置一并清除，需要重新导入才能恢复</small></div><button type="button" class="account-delete" data-config-delete="${encodeURIComponent(account.uid)}">删除账号</button></div></div>`;
  const zone = content.querySelector('[data-config-zone]');
  if (zone) zone.value = String(account.worldId || 0);
}

async function openConfig(uid) {
  const modal = document.querySelector('#configModal');
  modal.hidden = false;
  const content = document.querySelector('#configContent');
  content.innerHTML = '<p class="config-loading">正在读取账号配置...</p>';
  try {
    const account = await api(`/api/account?uid=${encodeURIComponent(uid)}`);
    renderConfig(account);
     const runInput = content.querySelector('[data-config-run]');
     if (runInput) runInput.addEventListener('change', async (event) => {
      try { await api(`/api/set?uid=${encodeURIComponent(uid)}&on=${event.target.checked ? 1 : 0}`); await refreshState('账号运行配置已保存'); } catch (error) { event.target.checked = !event.target.checked; showToast(error.message, true); }
    });
     const zoneInput = content.querySelector('[data-config-zone]');
     if (zoneInput) zoneInput.addEventListener('change', async (event) => {
      try { await api(`/api/zone?uid=${encodeURIComponent(uid)}&world=${event.target.value}`); showToast('区服配置已保存'); } catch (error) { showToast(error.message, true); }
    });
    content.querySelectorAll('[data-config-task]').forEach((input) => input.addEventListener('change', async (event) => {
      const name = decodeURIComponent(event.target.dataset.configTask);
      try { await api(`/api/task?uid=${encodeURIComponent(uid)}&name=${encodeURIComponent(name)}&on=${event.target.checked ? 1 : 0}`); showToast(`${name} 已${event.target.checked ? '开启' : '关闭'}`); } catch (error) { event.target.checked = !event.target.checked; showToast(error.message, true); }
    }));
      content.querySelectorAll('[data-config-quality-chip]').forEach((input) => input.addEventListener('change', async () => {
       const q = [...content.querySelectorAll('[data-config-quality-chip]:checked')].map((item) => item.dataset.configQualityChip).join(',');
       try { await api(`/api/heroquality?uid=${encodeURIComponent(uid)}&setFilter=1&q=${encodeURIComponent(q)}`); input.closest('.hero-quality-chip').classList.toggle('selected', input.checked); showToast('英雄品级筛选已保存'); } catch (error) { input.checked = !input.checked; showToast(error.message, true); }
     }));
      const watchInputs = [...content.querySelectorAll('[data-config-watch-name]')];
      if (watchInputs.length) watchInputs.forEach((input) => input.addEventListener('change', async () => {
       const selected = watchInputs.filter((item) => item.checked).map((item) => decodeURIComponent(item.dataset.configWatchName));
       try { await api(`/api/herowatch?uid=${encodeURIComponent(uid)}&clear=1`); await Promise.all(selected.map((name) => api(`/api/herowatch?uid=${encodeURIComponent(uid)}&name=${encodeURIComponent(name)}&on=1`))); input.closest('.hero-watch-chip').classList.toggle('selected', input.checked); const count = content.querySelector('[data-config-watch-count]'); if (count) count.textContent = selected.length ? `已指定 ${selected.length} 个英雄` : '当前对全部英雄生效'; showToast('指定英雄已保存'); } catch (error) { input.checked = !input.checked; showToast(error.message, true); }
      }));
      const clearWatch = content.querySelector('[data-config-watch-clear]');
      if (clearWatch && watchInputs.length) clearWatch.addEventListener('click', async () => {
       try { await api(`/api/herowatch?uid=${encodeURIComponent(uid)}&clear=1`); watchInputs.forEach((input) => { input.checked = false; input.closest('.hero-watch-chip').classList.remove('selected'); }); const count = content.querySelector('[data-config-watch-count]'); if (count) count.textContent = '当前对全部英雄生效'; showToast('已恢复全部英雄'); } catch (error) { showToast(error.message, true); }
      });
     const recruitInput = content.querySelector('[data-config-recruit]');
     if (recruitInput) recruitInput.addEventListener('change', async (event) => {
      try { await api(`/api/recruitway?uid=${encodeURIComponent(uid)}&way=${event.target.value}`); showToast('招募档位已保存'); } catch (error) { showToast(error.message, true); }
    });
    const repairInput = content.querySelector('[data-config-repair]');
    if (repairInput) repairInput.addEventListener('change', async (event) => {
      const v = Math.max(0, Math.min(100000, Math.floor(Number(event.target.value) || 0)));
      event.target.value = v;
      try { const r = await api(`/api/repairthreshold?uid=${encodeURIComponent(uid)}&threshold=${v}`); showToast('维修阈值已保存：' + (r && r.repairThreshold != null ? r.repairThreshold : v)); } catch (error) { showToast(error.message, true); }
    });
    const radarPowerInput = content.querySelector('[data-config-radarpower]');
    if (radarPowerInput) radarPowerInput.addEventListener('change', async (event) => {
      const v = Math.max(0, Math.min(100000000, Math.floor(Number(event.target.value) || 0)));
      event.target.value = v;
      try { const r = await api(`/api/radarminpower?uid=${encodeURIComponent(uid)}&power=${v}`); showToast(v ? ('情报最低战力已保存：' + (r && r.radarMinPower != null ? r.radarMinPower : v)) : '情报最低战力已设为不限'); } catch (error) { showToast(error.message, true); }
    });
    const syncBtn = content.querySelector('[data-config-sync]');
    if (syncBtn) syncBtn.addEventListener('click', async (event) => {
      event.preventDefault();
      setBusy(syncBtn, true, '同步中');
      try {
        const data = await api(`/api/resync?uid=${encodeURIComponent(uid)}`);
        showToast(data.msg || '已触发同步');
        await refreshState('账号信息同步中');
      } catch (error) { showToast(error.message, true); }
      setBusy(syncBtn, false);
    });
    const delBtn = content.querySelector('[data-config-delete]');
    if (delBtn) delBtn.addEventListener('click', async (event) => {
      event.preventDefault();
      await deleteAccount(uid, delBtn);
    });
  } catch (error) { content.innerHTML = `<p class="config-error">${error.message}</p>`; }
}

async function refreshState(message = '数据已刷新') {
  const state = await api('/api/state');
  renderState(state);
  showToast(message);
  return state;
}

async function setTask(name, message) {
  const account = (currentState && currentState.accounts && currentState.accounts.find((item) => item.uid === selectedUid)) || firstAccount();
  if (!account) throw new Error('当前没有可操作的账号');
  await api(`/api/task?uid=${encodeURIComponent(account.uid)}&name=${encodeURIComponent(name)}&on=1`);
  await refreshState(message);
}

document.querySelector('#refreshButton').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  setBusy(button, true, '刷新中');
  try { await refreshState(); } catch (error) { showToast(error.message, true); }
  setBusy(button, false);
});

document.querySelector('#runAllButton').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  setBusy(button, true, '启动中');
  try {
    const state = currentState || await api('/api/state');
    await Promise.all((state.accounts || []).map((account) =>
      api(`/api/set?uid=${encodeURIComponent(account.uid)}&on=1`)));
    await refreshState('已启动全部账号');
  } catch (error) { showToast(error.message, true); }
  setBusy(button, false);
});

const quickActions = document.querySelectorAll('.quick-action');
  if (quickActions[0]) quickActions[0].addEventListener('click', async (event) => {
  const button = event.currentTarget;
  setBusy(button, true, '同步中');
  try { await refreshState('账号状态已同步'); } catch (error) { showToast(error.message, true); }
  setBusy(button, false);
});
 if (quickActions[1]) quickActions[1].addEventListener('click', async (event) => {
  const button = event.currentTarget;
  setBusy(button, true, '领取中');
  try { await setTask('收工厂成品', '已开启收取工厂成品任务'); } catch (error) { showToast(error.message, true); }
  setBusy(button, false);
});
 if (quickActions[2]) quickActions[2].addEventListener('click', async (event) => {
  const button = event.currentTarget;
  setBusy(button, true, '检查中');
  try { await refreshState('任务队列已刷新'); } catch (error) { showToast(error.message, true); }
  setBusy(button, false);
});
 if (quickActions[3]) quickActions[3].addEventListener('click', async (event) => {
  const button = event.currentTarget;
  setBusy(button, true, '重连中');
  try {
     const account = (currentState && currentState.accounts && currentState.accounts.find((item) => item.uid === selectedUid)) || firstAccount();
    if (!account) throw new Error('当前没有可重连的账号');
    await api(`/api/set?uid=${encodeURIComponent(account.uid)}&on=1`);
    await refreshState(`${account.nickname || account.uid} 正在重连`);
  } catch (error) { showToast(error.message, true); }
  setBusy(button, false);
});

document.querySelectorAll('.account-row').forEach((row) => row.addEventListener('click', () => {
  selectAccount(row.dataset.uid);
}));
const accountTable = document.querySelector('.account-table');
if (accountTable) accountTable.addEventListener('click', (event) => {
  const row = event.target.closest('.account-row');
  if (row) selectAccount(row.dataset.uid);
});

const accountModal = document.querySelector('#accountModal');
const workspaceSwitch = document.querySelector('#workspaceSwitch');
const accountSwitchList = document.querySelector('#accountSwitchList');
if (workspaceSwitch && accountSwitchList) workspaceSwitch.addEventListener('click', () => {
  const expanded = workspaceSwitch.getAttribute('aria-expanded') === 'true';
  workspaceSwitch.setAttribute('aria-expanded', String(!expanded));
  accountSwitchList.hidden = expanded;
});
if (accountSwitchList) accountSwitchList.addEventListener('click', async (event) => {
  const item = event.target.closest('[data-switch-uid]');
  if (!item) return;
  await selectAccount(decodeURIComponent(item.dataset.switchUid));
  workspaceSwitch.setAttribute('aria-expanded', 'false');
  accountSwitchList.hidden = true;
});
const accountHeader = document.querySelector('#accounts .panel-header');
if (accountHeader && !document.querySelector('#currentConfigButton')) {
  const actions = document.createElement('div');
  actions.className = 'panel-header-actions';
  actions.innerHTML = '<button class="account-config header-config" id="syncAllButton">同步全部信息</button><button class="account-config header-config" id="currentConfigButton">当前账号配置</button>';
  accountHeader.appendChild(actions);
  actions.querySelector('#syncAllButton').addEventListener('click', async () => {
    await syncAllAccounts(actions.querySelector('#syncAllButton'));
  });
  actions.querySelector('#currentConfigButton').addEventListener('click', async () => {
     const account = (currentState && currentState.accounts && currentState.accounts.find((item) => item.uid === selectedUid)) || firstAccount();
    if (!account) { showToast('当前没有可配置的账号', true); return; }
    await openConfig(account.uid);
  });
}
const viewAllAccounts = document.querySelector('#viewAllAccounts');
const addAccountButton = document.querySelector('#addAccountButton');
const closeAddAccountModal = document.querySelector('#closeAddAccountModal');
if (addAccountButton) addAccountButton.addEventListener('click', openAddAccount);
if (closeAddAccountModal) closeAddAccountModal.addEventListener('click', closeAddAccount);
if (addAccountModal) addAccountModal.addEventListener('click', (event) => { if (event.target === addAccountModal) closeAddAccount(); });
if (officialLoginButton) officialLoginButton.addEventListener('click', loginOfficialAccount);
document.querySelectorAll('[data-login-tab]').forEach((tab) => tab.addEventListener('click', () => {
  const target = tab.dataset.loginTab;
  document.querySelectorAll('[data-login-tab]').forEach((item) => item.classList.toggle('active', item === tab));
  document.querySelectorAll('[data-login-pane]').forEach((pane) => {
    const active = pane.dataset.loginPane === target;
    pane.hidden = !active;
    pane.classList.toggle('active', active);
    pane.style.display = active ? 'grid' : 'none';
  });
  if (accountLoginStatus) accountLoginStatus.textContent = '';
}));
if (viewAllAccounts) viewAllAccounts.addEventListener('click', () => {
  if (!currentState?.accounts?.length) return;
  renderAllAccounts(currentState.accounts);
  accountModal.hidden = false;
});
const closeAccountModal = document.querySelector('#closeAccountModal');
if (closeAccountModal) closeAccountModal.addEventListener('click', () => { accountModal.hidden = true; });
if (accountModal) accountModal.addEventListener('click', async (event) => {
  if (event.target === accountModal) { accountModal.hidden = true; return; }
  const toggle = event.target.closest('[data-account-toggle]');
  const config = event.target.closest('[data-account-config]');
  const sync = event.target.closest('[data-account-sync]');
  const del = event.target.closest('[data-account-delete]');
  const item = event.target.closest('.all-account-item');
  if (!item) return;
  const uid = decodeURIComponent(item.dataset.uid || '');
  if (del) { event.stopPropagation(); await deleteAccount(uid, del); return; }
  if (sync) { event.stopPropagation(); await syncAccount(uid, sync); return; }
  if (config) { event.stopPropagation(); selectedUid = uid; await openConfig(uid); return; }
  if (toggle) {
    event.stopPropagation();
    const account = currentState && currentState.accounts && currentState.accounts.find((entry) => entry.uid === uid);
    if (!account) return;
    toggle.disabled = true;
    try {
      await api(`/api/set?uid=${encodeURIComponent(uid)}&on=${account.enabled ? 0 : 1}`);
      await refreshState(account.enabled ? '账号已暂停' : '账号已启动');
    } catch (error) { showToast(error.message, true); }
    toggle.disabled = false;
    return;
  }
  await selectAccount(uid, true);
});

const closeConfigModal = document.querySelector('#closeConfigModal');
if (closeConfigModal) closeConfigModal.addEventListener('click', () => { document.querySelector('#configModal').hidden = true; });
const configModal = document.querySelector('#configModal');
if (configModal) configModal.addEventListener('click', (event) => { if (event.target.id === 'configModal') event.currentTarget.hidden = true; });
const fullLogButton = document.querySelector('.log-panel .view-all');
if (fullLogButton) fullLogButton.addEventListener('click', openFullLog);
const factoryDetailsButton = document.querySelector('#factoryDetailsButton');
if (factoryDetailsButton) factoryDetailsButton.addEventListener('click', openFactoryDetails);
const factoryWorkspaceRefresh = document.querySelector('#factoryWorkspaceRefresh');
if (factoryWorkspaceRefresh) factoryWorkspaceRefresh.addEventListener('click', async () => {
  try { await refreshState('工厂数据已刷新'); } catch (error) { showToast(error.message, true); }
});
const NAV_VIEWS = { '#overview': 'overview', '#accounts': 'overview', '#logs': 'overview', '#tasks': 'task', '#resources': 'resource', '#factoryWorkspace': 'factory' };
document.querySelectorAll('.nav-item').forEach((item) => item.addEventListener('click', (event) => {
  const href = item.getAttribute('href') || '';
  const view = NAV_VIEWS[href] || item.getAttribute('data-view');
  if (!view) return;
  event.preventDefault();
  setPageView(view);
  const target = href.startsWith('#') ? document.querySelector(href) : null;
  (target || document.querySelector('.main-content')).scrollIntoView({ behavior: 'smooth', block: 'start' });
}));
document.querySelectorAll('[data-detail-view]').forEach((tab) => tab.addEventListener('click', () => {
  detailView = tab.dataset.detailView;
  document.querySelectorAll('[data-detail-view]').forEach((item) => item.classList.toggle('active', item === tab));
  const account = (currentState && currentState.accounts && currentState.accounts.find((item) => item.uid === selectedUid)) || firstAccount();
  if (account) {
    if (detailView === 'factory') renderFactoryWorkspace(account);
    else renderAccountDetails(account);
  }
  renderDetailView();
}));
const closeLogModal = document.querySelector('#closeLogModal');
if (closeLogModal) closeLogModal.addEventListener('click', () => { document.querySelector('#logModal').hidden = true; });
const logModal = document.querySelector('#logModal');
if (logModal) logModal.addEventListener('click', (event) => { if (event.target.id === 'logModal') event.currentTarget.hidden = true; });
const closeFactoryModal = document.querySelector('#closeFactoryModal');
if (closeFactoryModal) closeFactoryModal.addEventListener('click', () => { document.querySelector('#factoryModal').hidden = true; });
const factoryModal = document.querySelector('#factoryModal');
if (factoryModal) factoryModal.addEventListener('click', (event) => { if (event.target.id === 'factoryModal') event.currentTarget.hidden = true; });

document.querySelectorAll('.filter-tabs button').forEach((tab, index) => tab.addEventListener('click', () => {
  document.querySelectorAll('.filter-tabs button').forEach((item) => item.classList.remove('active'));
  tab.classList.add('active');
  currentTaskFilter = ['all', 'running', 'done'][index] || 'all';
  renderSelectedAccount();
  showToast(`已切换至${tab.textContent.replace(/\s*\d+\s*/, '')}`);
}));

const mobileMenu = document.querySelector('.mobile-menu');
const sidebar = document.querySelector('.sidebar');
if (mobileMenu) mobileMenu.addEventListener('click', () => sidebar.classList.toggle('open'));
document.querySelectorAll('.nav-item').forEach((item) => item.addEventListener('click', () => sidebar.classList.remove('open')));
document.addEventListener('click', (event) => {
  if (!sidebar || !sidebar.classList.contains('open')) return;
  if (sidebar.contains(event.target) || (mobileMenu && mobileMenu.contains(event.target))) return;
  sidebar.classList.remove('open');
});

const initialHashView = ({ '#tasks': 'task', '#resources': 'resource', '#factoryWorkspace': 'factory' })[window.location.hash] || 'overview';
setPageView(initialHashView);
const taskPanel = document.querySelector('.task-panel');
const taskWorkspace = document.querySelector('#taskWorkspace');
if (taskPanel && taskWorkspace) taskWorkspace.appendChild(taskPanel);
const resourceOverview = document.querySelector('#resourceOverview');
const resourceWorkspace = document.querySelector('#resourceWorkspace');
if (resourceOverview && resourceWorkspace) resourceWorkspace.appendChild(resourceOverview);
refreshState('已连接后端，数据加载完成').catch((error) => {
  document.body.classList.remove('api-loading');
  showToast(error.message, true);
});
