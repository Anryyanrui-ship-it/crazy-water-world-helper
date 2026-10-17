const content = document.querySelector('#factoryPageContent');
const accountSelect = document.querySelector('#accountSelect');
const toast = document.querySelector('.toast');
const sidebar = document.querySelector('.sidebar');
let accounts = [];
let account = null;
let tab = 'building';

function esc(value) {
  return String(value === undefined || value === null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function value(item, keys, fallback = '') {
  for (const key of keys) if (item && item[key] !== undefined && item[key] !== null && item[key] !== '') return item[key];
  return fallback;
}
function slotProduct(slot) {
  const product = value(slot, ['product', 'item', 'name', 'output', '2'], '');
  return product === '' || product === '?' || product === null ? '空闲' : String(product);
}
function slotClaimable(slot) {
  const state = String(value(slot, ['state', 'status'], ''));
  const end = value(slot, ['finishAt', 'finish_time', 'endTime', 'remain', '3'], '');
  return Boolean(slot && (slot.claimable || slot.canCollect)) || /领取|完成|满仓|claim|done/i.test(state) || Number(end) === 1;
}
function factoryKey(name) {
  const raw = String(name || '').replace(/^\d+/, '');
  const keys = Object.keys(account.fac_products || {});
  return keys.sort((a, b) => b.length - a.length).find((key) => raw.endsWith(key)) || raw;
}
function buildLevelOf(item) {
  const explicit = value(item, ['level', 'lv', 'grade'], '');
  if (explicit !== '' && explicit !== null && explicit !== undefined && explicit !== '--') return explicit;
  const m = String((item && item.name) || '').match(/^(\d+)/);
  return m ? m[1] : '--';
}
function fmtDuration(seconds) {
  const total = Math.round(Number(seconds) || 0);
  if (total <= 0) return '';
  if (total < 60) return `${total}秒`;
  const minutes = Math.round(total / 60);
  if (minutes < 60) return `${minutes}分钟`;
  return `${Math.floor(minutes / 60)}小时${minutes % 60 ? `${minutes % 60}分钟` : ''}`;
}
function buildStateOf(item) {
  const slots = item && Array.isArray(item.slots) ? item.slots : [];
  if (slots.some((slot) => slotClaimable(slot))) return '可领取';
  if (Number((item && item.left) || 0) > 0) return '施工中';
  if (slots.some((slot) => slotProduct(slot) !== '空闲')) return '生产中';
  return '空闲';
}
function buildMetaOf(item) {
  const remain = Number((item && item.left) || 0);
  const total = Number((item && item.needSec) || 0);
  const state = buildStateOf(item);
  if (remain <= 0) return state;
  return `${state} · 剩余 ${fmtDuration(remain)}${total > 0 ? ` / 共 ${fmtDuration(total)}` : ''}`;
}

function formatTime(seconds) {
  if (!seconds) return '';
  const minutes = Math.round(Number(seconds) / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}小时${minutes % 60 ? `${minutes % 60}分钟` : ''}` : `${minutes}分钟`;
}
function renderResidentPanel() {
  const panel = Array.from(document.querySelectorAll('.detail-card')).find((item) => item.querySelector('h2') && item.querySelector('h2').textContent.indexOf('居民需求') >= 0);
  if (!panel || !account) return;
  const week = Array.isArray(account.weekOrder) ? account.weekOrder : [];
  const orders = Array.isArray(account.worker_orders) ? account.worker_orders : [];
  const pending = orders.filter((item) => !item.done);
  const finished = orders.filter((item) => item.done);
  const today = account.order_today || {};
  const lackCount = week.filter((item) => Number(item.have || 0) < Number(item.need || 0)).length;
  const weekRows = week.map((item) => `<div class="resident-item ${Number(item.have || 0) < Number(item.need || 0) ? 'missing' : ''}"><b>需求</b><span>${esc(item.name || '物品')}</span><strong>${esc(item.have || 0)}/${esc(item.need || 0)}</strong></div>`).join('');
  const orderRows = pending.map((order) => `<div class="resident-order"><div class="resident-order-head"><b>居民 #${esc(order.workerId || order.index || '--')}</b><span>订单 ${esc(order.index || '--')}</span><strong>${order.ready ? '可交付' : `缺 ${Array.isArray(order.missing) ? order.missing.length : 0} 样`}</strong></div><div class="resident-list">${(order.items || []).map((item) => `<div class="resident-item ${Number(item.have || 0) < Number(item.need || 0) ? 'missing' : ''}"><b>需求</b><span>${esc(item.name || '物品')}</span><strong>${esc(item.have || 0)}/${esc(item.need || 0)}</strong></div>`).join('')}</div></div>`).join('');
  const latest = account.orderLast && Array.isArray(account.orderLast.items) ? `<p class="resident-note">最近完成 #${esc(account.orderLast.index || '--')}：${account.orderLast.items.map((item) => `${esc(item.name)} × ${esc(item.need)}`).join('、')}</p>` : '';
  const reward = account.orderReward ? `<p class="resident-note">最近获得：${account.orderReward.EXP != null ? `经验 ${Number(account.orderReward.EXP).toLocaleString()} ` : ''}${account.orderReward.GOLD != null ? `金币 ${Number(account.orderReward.GOLD).toLocaleString()}` : ''}</p>` : '';
  panel.innerHTML = `<h2>居民需求</h2><div class="resident-summary"><span>需求项 <b>${week.length}</b></span><span>待完成 <b>${pending.length}</b></span><span>已完成 <b>${finished.length}</b></span><span>今日完成 <b>${esc(today.done || 0)}/${esc(today.total || 0)}</b></span><span>自动完成 <b>${account.tasks && account.tasks['完成居民订单'] ? '已开启' : '未开启'}</b></span></div>${week.length ? `<div class="resident-block"><h3>居民需求清单 <small>${lackCount ? `缺 ${lackCount} 样` : '全部齐了'}</small></h3><div class="resident-list">${weekRows}</div></div>` : ''}${orderRows || '<p class="detail-empty">当前没有待完成居民订单</p>'}${finished.length ? `<p class="resident-note">已完成订单：${finished.map((item) => `#${esc(item.index || '--')}`).join('、')}</p>` : ''}${latest}${reward}`;
}
function notify(message, error = false) {
  toast.querySelector('b').textContent = message;
  toast.querySelector('span').textContent = error ? '!' : '✓';
  toast.classList.toggle('error', error);
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2600);
}
window.addEventListener('error', (event) => notify(`页面错误：${event.message || '脚本执行失败'}`, true));
window.addEventListener('unhandledrejection', (event) => notify(`切换失败：${event.reason && event.reason.message ? event.reason.message : '账号数据处理失败'}`, true));
async function api(path) {
  const response = await fetch(path, { cache: 'no-store', credentials: 'same-origin' });
  if (response.status === 401 || response.status === 403) { location.href = '/login'; throw new Error('登录状态已失效'); }
  const data = await response.json();
  if (!response.ok || data.ok === false) throw new Error(data.msg || data.err || '接口请求失败');
  return data;
}
function fmtClock(ts) {
  const n = Number(ts) || 0;
  if (n <= 0) return '';
  const d = new Date(n * 1000);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function speedupStrip() {
  const sp = (account && account.speedup) || {};
  const used = Number(sp.adUsedToday || 0);
  let adText, adCls;
  if (sp.adEnabled === false) { adText = '广告加速已关闭'; adCls = 'off'; }
  else if (sp.adAvailable === false) {
    const until = fmtClock(sp.adBlockedUntil);
    if (sp.adReason === 'cooldown') { adText = `广告加速冷却中${until ? `（约 ${until} 后重试）` : ''}`; adCls = 'warn'; }
    else { adText = '广告加速不可用（次数已用完/未开放）'; adCls = 'warn'; }
  } else { adText = '广告加速可用'; adCls = 'ok'; }
  const last = fmtClock(sp.adLastAt);
  const onceTarget = sp.onceTarget ? String(sp.onceTarget) : '';
  const adMeta = `今日广告加速 ${used} 次${last ? ` · 最近 ${last}` : ''}${onceTarget ? ` · 主线目标 ${onceTarget}` : ''}`;
  const tasks = (account && account.tasks) || {};
  const onceMsg = sp.onceMsg ? String(sp.onceMsg) : '';
  const onceCls = sp.onceState === 'ok' ? 'ok' : (sp.onceState ? 'warn' : '');
  const onceDisabled = (!onceTarget || sp.oncePending) ? ' disabled' : '';
  const onceLine = onceMsg ? `<small class="speedup-once-msg ${onceCls}">上次钻石加速：${esc(onceMsg)}</small>` : '';
  const gemNow = (sp.gems === 0 || sp.gems) ? Number(sp.gems) : null;
  const gemUsed = (sp.onceGemUsed === 0 || sp.onceGemUsed) ? Number(sp.onceGemUsed) : null;
  const gemParts = [];
  if (gemUsed !== null) gemParts.push(`上次消耗 ${gemUsed} 钻石`);
  if (gemNow !== null) gemParts.push(`剩余钻石 ${gemNow}`);
  const gemLine = gemParts.length ? `<small class="speedup-gems">${esc(gemParts.join(' · '))}</small>` : '';
  const btn = (name, label, on) => `<button type="button" class="speedup-toggle${on ? ' on' : ''}" data-speedup-task="${esc(name)}"><span class="dot"></span>${esc(label)}</button>`;
  return `<div class="speedup-strip"><span class="speedup-ad ${adCls}">${esc(adText)}</span><small>${esc(adMeta)}</small><span class="speedup-actions">${btn('建筑加速-加速器', '加速器加速', tasks['建筑加速-加速器'])}<button type="button" class="speedup-toggle speedup-once" data-speedup-once="1" title="只给当前主线建筑用钻石加速一次，不会自动连烧"${onceDisabled}>钻石加速主线</button></span></div>${onceLine}${gemLine}`;
}
function bindSpeedupControls() {
  content.querySelectorAll('[data-speedup-task]').forEach((button) => {
    button.addEventListener('click', async () => {
      const name = button.dataset.speedupTask;
      const on = !((account && account.tasks) || {})[name];
      button.disabled = true;
      try {
        await api(`/api/task?uid=${encodeURIComponent(account.uid)}&name=${encodeURIComponent(name)}&on=${on ? 1 : 0}`);
        account.tasks = account.tasks || {};
        account.tasks[name] = on;
        notify(`${name} 已${on ? '开启' : '关闭'}`);
        render();
      } catch (error) {
        notify(error.message, true);
        button.disabled = false;
      }
    });
  });
  const onceBtn = content.querySelector('[data-speedup-once]');
  if (onceBtn) onceBtn.addEventListener('click', async () => {
    const uid = account.uid;
    onceBtn.disabled = true;
    try {
      await api(`/api/speedup?uid=${encodeURIComponent(uid)}`);
      notify('已请求：钻石加速主线一次');
      const refreshAfterSpeedup = async () => {
        try {
          account = await api(`/api/account?uid=${encodeURIComponent(uid)}`);
          render();
        } catch (error) { /* 轮询失败就等用户手动刷新 */ }
      };
      // 服务端要过一会儿才回资源帧，多刷一次才能看到「这次花了多少钻石」。
      setTimeout(refreshAfterSpeedup, 2600);
      setTimeout(refreshAfterSpeedup, 6500);
    } catch (error) {
      notify(error.message, true);
      onceBtn.disabled = false;
    }
  });
}
function renderBuilding() {
  const player = account.player || {};
  const main = account.mainTask || {};
  const buildings = account.buildings || [];
  const week = account.weekOrder || [];
  content.innerHTML = `<div class="standalone-detail-grid"><article class="detail-card"><h2>主线与闯关</h2><div class="detail-highlight"><span>主线 #${esc(main.taskId || '--')}</span><b>${esc(main.desc || main.title || main.name || '暂无主线任务')}</b><small>${esc(main.type || '主线任务')} · 进度 ${esc(main.progress || 0)}${main.target ? ` / ${esc(main.target)}` : ''}</small></div>${speedupStrip()}<div class="detail-stat-row"><span>等级 <b>${esc(player['等级'] || '--')}</b></span><span>已通关关卡 <b>${esc(player['已通关关卡'] || account.stage || '--')}</b></span><span>挑战关卡 <b>${esc(account.stageTry || '--')}</b></span><span>战力 <b>${esc(player['战力'] || '--')}</b></span><span>自动闯关 <b>${account.tasks && account.tasks['闯关'] ? '已开启' : '未开启'}</b></span></div></article><article class="detail-card"><h2>居民需求</h2><div class="resident-list"></div></article><article class="detail-card standalone-wide"><h2>建筑与农田 <small>${buildings.length} 项</small></h2><div class="building-list">${buildings.map((item) => `<div class="building-item"><b>${esc(item.name || '建筑')}</b><span>等级 ${esc(buildLevelOf(item))}</span><small>${esc(buildMetaOf(item))}</small></div>`).join('') || '<p class="detail-empty">还没有收到建筑数据</p>'}</div></article></div>`;
  renderResidentPanel();
  bindSpeedupControls();
}
function renderFactory() {
  const buildings = account.buildings || [];
  const factories = buildings.filter((item) => /厂|工厂|farm|factory/i.test(String(value(item, ['name', 'title', 'type'], ''))));
  content.innerHTML = `<div class="factory-summary-strip"><span>工厂总数 <b>${factories.length}</b></span><span>生产位置 <b>${factories.length * 6}</b></span></div><div class="factory-grid">${factories.map((factory, index) => { const name = value(factory, ['name', 'title', 'type'], `工厂 ${index + 1}`); const level = Number(value(factory, ['level', 'lv', 'grade'], 0)) || 0; const slots = Array.isArray(factory.slots) ? factory.slots : []; const six = Array.from({ length: 6 }, (_, i) => slots[i] || {}); const key = factoryKey(name); const rawProducts = account.fac_products && account.fac_products[key]; const products = Array.isArray(rawProducts) ? rawProducts : []; const recipes = account.fac_recipes && account.fac_recipes[key] || {}; const inventory = {}; (Array.isArray(account.resBars) ? account.resBars : []).forEach((item) => { if (item && item.name) inventory[item.name] = Number(item.count || 0); }); const recipeRows = products.map((product) => { const recipe = recipes[product] || {}; const unlock = (account.fac_product_levels && account.fac_product_levels[key] && account.fac_product_levels[key][product]) || 0; const costs = Array.isArray(recipe.cost) ? recipe.cost : []; const enough = costs.every((entry) => Array.isArray(entry) && inventory[entry[0]] >= Number(entry[1])); return `<div class="recipe-row ${enough ? '' : 'recipe-missing'}"><b>${esc(product)}</b><span>等级 ${unlock || '--'}</span><span>${costs.length ? costs.map((entry) => `<em>${esc(entry[0])} × ${esc(entry[1])} <i>库存 ${esc(inventory[entry[0]] || 0)}</i></em>`).join('') : '无需材料'}</span><small>${formatTime(recipe.time)}</small></div>`; }).join(''); return `<article class="factory-card"><div class="factory-card-head"><div><span class="factory-number">${index + 1}</span><h3>${esc(name)}</h3><p>等级 ${esc(buildLevelOf(factory))} · ${esc(buildMetaOf(factory))}</p></div><span class="factory-state">6 个生产位置</span></div><div class="production-slots">${six.map((slot, slotIndex) => { const product = value(slot, ['2', 'product', 'item', 'name', 'output'], '空闲'); const end = value(slot, ['3', 'finishAt', 'finish_time', 'endTime', 'remain'], ''); const done = end === 1 || /完成|领取|done|claim/i.test(String(value(slot, ['state', 'status'], ''))); return `<div class="production-slot compact ${product === '空闲' ? 'empty' : 'occupied'}"><span class="slot-number">${slotIndex + 1}</span><b>${esc(product)}</b><small>${done ? '完成' : product === '空闲' ? '空闲' : '生产中'}</small></div>`; }).join('')}</div><div class="recipe-heading">可生产配方 <small>材料不足显示红色</small></div><div class="recipe-list">${recipeRows || '<p class="detail-empty">暂无配方数据</p>'}</div></article>`; }).join('') || '<p class="detail-empty">当前账号暂无工厂数据</p>'}</div>`;
}
function render() { if (!account) return; if (tab === 'factory') renderFactory(); else renderBuilding(); }
async function loadAccount(uid) {
  content.innerHTML = '<p class="config-loading">正在切换账号并读取工厂数据...</p>';
  account = await api(`/api/account?uid=${encodeURIComponent(uid)}`);
  if (!account || !account.uid) throw new Error('账号详情返回为空');
  render();
}
async function load() { const state = await api('/api/state'); const adminNav = document.querySelector('[data-admin-only]'); if (adminNav) adminNav.hidden = !state.isAdmin; accounts = state.accounts || []; accountSelect.innerHTML = accounts.map((item) => { const pl = value(item.player || {}, ['等级', 'level', 'lv', 'levelId'], ''); return `<option value="${esc(item.uid)}">${esc(item.nickname || item.uid)}${pl === '' ? '' : ` · Lv.${esc(pl)}`}</option>`; }).join(''); if (accounts[0]) await loadAccount(accounts[0].uid); }
accountSelect.addEventListener('change', () => loadAccount(accountSelect.value).catch((error) => notify(error.message, true)));
document.querySelectorAll('[data-page-tab]').forEach((button) => button.addEventListener('click', () => { tab = button.dataset.pageTab; document.querySelectorAll('[data-page-tab]').forEach((item) => item.classList.toggle('active', item === button)); render(); }));
document.querySelector('#refreshFactory').addEventListener('click', () => load().then(() => notify('工厂与建筑数据已刷新')).catch((error) => notify(error.message, true)));
document.querySelector('.mobile-menu').addEventListener('click', () => sidebar.classList.toggle('open'));
document.querySelectorAll('.sidebar a').forEach((link) => link.addEventListener('click', () => sidebar.classList.remove('open')));
load().catch((error) => { content.innerHTML = `<p class="config-error">${esc(error.message)}</p>`; });
