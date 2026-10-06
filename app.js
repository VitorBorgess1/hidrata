const KEY = 'hidrata';
const PADRAO = { meta: 2000, inicio: 7, fim: 22, tolerancia: 0.2, intervaloMin: 60, dia: null, total: 0, registros: [], ultimoAviso: 0 };
const $ = id => document.getElementById(id);
const hojeISO = () => new Date().toLocaleDateString('sv');

let s = { ...PADRAO, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
if (s.dia !== hojeISO()) { s.dia = hojeISO(); s.total = 0; s.registros = []; }

// ---- Cálculo do ritmo: quanto eu "deveria" ter bebido até agora ----
// Distribui a meta linearmente entre a hora que acorda e a hora que dorme.
function ritmo(agora = new Date()) {
  const h = agora.getHours() + agora.getMinutes() / 60;
  const frac = Math.min(1, Math.max(0, (h - s.inicio) / (s.fim - s.inicio)));
  const esperado = Math.round(s.meta * frac);
  const atraso = esperado - s.total;
  const atrasado = s.total < s.meta && h >= s.inicio && h <= s.fim && atraso >= s.meta * s.tolerancia;
  return { esperado, atraso, atrasado };
}

async function salvar() {
  localStorage.setItem(KEY, JSON.stringify(s));
  // espelha estado no Cache API para o Service Worker ler em background
  const c = await caches.open('hidrata-v1');
  await c.put('/__state', new Response(JSON.stringify(s)));
}

function render() {
  const pct = Math.min(100, Math.round((s.total / s.meta) * 100));
  $('nivel').style.height = pct + '%';
  $('pct').textContent = pct + '%';
  $('resumo').textContent = `${s.total} / ${s.meta} ml`;
  const r = ritmo(), st = $('status');
  st.className = 'status' + (r.atrasado ? ' atras' : '');
  st.textContent = s.total >= s.meta ? '🎉 Meta batida!'
    : r.atrasado ? `⚠️ ${r.atraso} ml atrás do ritmo (esperado ${r.esperado} ml até agora)`
    : r.atraso > 0 ? `No ritmo — faltam ${r.atraso} ml pra acompanhar` : `✅ Adiantado ${-r.atraso} ml`;
  $('historico').innerHTML = s.registros.slice().reverse().map((x, i) =>
    `<li>${x.hora} — ${x.ml} ml <button data-del="${s.registros.length - 1 - i}">✕</button></li>`).join('') || '<li>Nada ainda hoje</li>';
}

function adicionar(ml) {
  if (!ml || ml <= 0) return;
  s.total += ml;
  s.registros.push({ ml, hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) });
  navigator.vibrate?.(30);
  salvar(); render();
}

document.querySelectorAll('[data-ml]').forEach(b => b.onclick = () => adicionar(+b.dataset.ml));
$('btnAdd').onclick = () => { adicionar(+$('custom').value); $('custom').value = ''; };
$('historico').onclick = e => {
  const i = e.target.dataset.del; if (i === undefined) return;
  s.total -= s.registros[i].ml; s.registros.splice(i, 1); salvar(); render();
};

// ---- Configurações ----
$('btnCfg').onclick = () => {
  $('cMeta').value = s.meta; $('cInicio').value = s.inicio; $('cFim').value = s.fim;
  $('cTol').value = Math.round(s.tolerancia * 100); $('cInt').value = s.intervaloMin;
  $('cfg').showModal();
};
$('btnSalvar').onclick = () => {
  s.meta = +$('cMeta').value || 2000; s.inicio = +$('cInicio').value; s.fim = +$('cFim').value || 22;
  s.tolerancia = (+$('cTol').value || 20) / 100; s.intervaloMin = +$('cInt').value || 60;
  salvar(); render();
};

// ---- Notificações ----
let reg;
async function ativarNotificacoes() {
  if (!('Notification' in window)) return alert('Este navegador não suporta notificações. No iPhone, instale o app na Tela de Início primeiro.');
  const p = await Notification.requestPermission();
  if (p !== 'granted') return;
  // Background (Chrome Android, PWA instalado): o navegador decide a frequência real (~mín. 12h por padrão, mais com uso)
  try {
    if ('periodicSync' in reg) await reg.periodicSync.register('lembrete-agua', { minInterval: 30 * 60 * 1000 });
  } catch {}
  reg.showNotification('Lembretes ativados 💧', { body: 'Vou avisar se você ficar atrás da meta.', icon: '/icons/icon-192.png' });
  $('btnNotif').textContent = '🔔';
}
$('btnNotif').onclick = ativarNotificacoes;

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').then(r => { reg = r; salvar(); });
}
if ('Notification' in window && Notification.permission !== 'granted') $('btnNotif').textContent = '🔕';

// Com o app aberto/em segundo plano: checa a cada 5 min e pede ao SW pra avaliar
setInterval(() => {
  if (s.dia !== hojeISO()) { s.dia = hojeISO(); s.total = 0; s.registros = []; salvar(); }
  render();
  navigator.serviceWorker?.controller?.postMessage('checar');
}, 5 * 60 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

render();
