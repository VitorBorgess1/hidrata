// ===================== Estado =====================
const KEY = 'hidrata';
const CACHE = 'hidrata-v2';
const PADRAO = {
  meta: 2000, inicio: 7, fim: 22, tolerancia: 0.2, intervaloMin: 60,
  copos: [200, 300, 500, 750],
  dia: null, total: 0, registros: [], historico: {}, ultimoAviso: 0, onboarded: false
};
const $ = id => document.getElementById(id);
const hoje = (d = new Date()) => d.toLocaleDateString('sv'); // YYYY-MM-DD local

let s = carregar();

function carregar() {
  let x = {};
  try { x = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch {}
  x = { ...PADRAO, ...x };
  x.historico ||= {};
  return virarDia(x);
}
function virarDia(x) {
  if (x.dia !== hoje()) {
    if (x.dia) x.historico[x.dia] = { total: x.total, meta: x.meta };
    x.dia = hoje(); x.total = 0; x.registros = [];
  }
  return x;
}
async function salvar() {
  s.historico[s.dia] = { total: s.total, meta: s.meta };
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
  // Espelha no Cache API para o Service Worker ler em background
  try { (await caches.open(CACHE)).put('/__state', new Response(JSON.stringify(s))); } catch {}
}

// ===================== Cálculos =====================
const horaDec = (d = new Date()) => d.getHours() + d.getMinutes() / 60;
const fmtHora = h => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
const fmtMl = ml => ml >= 1000 ? `${(ml / 1000).toFixed(ml % 1000 ? 2 : 0).replace('.', ',')} L` : `${ml} ml`;

function ritmo() {
  const h = horaDec();
  const frac = Math.min(1, Math.max(0, (h - s.inicio) / (s.fim - s.inicio)));
  const esperado = Math.round(s.meta * frac);
  const atraso = esperado - s.total;
  const ativo = h >= s.inicio && h <= s.fim;
  return { frac, esperado, atraso, ativo, atrasado: s.total < s.meta && ativo && atraso >= s.meta * s.tolerancia };
}

function sequencia() {
  let n = 0; const d = new Date();
  if (s.total >= s.meta) n++;
  for (;;) {
    d.setDate(d.getDate() - 1);
    const r = s.historico[hoje(d)];
    if (r && r.total >= r.meta) n++; else break;
  }
  return n;
}

// ===================== Render =====================
const CIRC = 2 * Math.PI * 100;
let ultimoValor = 0;

function render() {
  s = virarDia(s);
  const pct = Math.min(1, s.total / s.meta);
  const r = ritmo();

  const h = new Date().getHours();
  $('saudacao').textContent = h < 5 ? 'Boa madrugada' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';

  $('agua').style.height = (pct * 100) + '%';
  $('anelProg').style.strokeDashoffset = CIRC * (1 - pct);
  $('anelRitmo').style.strokeDasharray = `${CIRC * r.frac} ${CIRC}`;
  $('orbe').classList.toggle('completo', pct >= 1);
  animarNumero(ultimoValor, s.total); ultimoValor = s.total;
  $('deMeta').textContent = `de ${fmtMl(s.meta)} · ${Math.round(pct * 100)}%`;

  const chip = $('status');
  chip.className = 'chip';
  let txt;
  if (s.total >= s.meta) { txt = 'Meta batida! 🎉'; chip.classList.add('ok'); }
  else if (!r.ativo && horaDec() < s.inicio) txt = `Seu dia começa às ${fmtHora(s.inicio)}`;
  else if (!r.ativo) txt = `Dia encerrado · faltaram ${fmtMl(s.meta - s.total)}`;
  else if (r.atrasado) { txt = `${fmtMl(r.atraso)} atrás do ritmo`; chip.classList.add('atras'); }
  else if (r.atraso > 0) txt = 'No ritmo — continue assim';
  else { txt = `Adiantado ${fmtMl(-r.atraso)}`; chip.classList.add('ok'); }
  $('statusTxt').textContent = txt;

  $('stFalta').textContent = s.total >= s.meta ? '—' : fmtMl(s.meta - s.total);
  const horasRest = Math.max(0, s.fim - horaDec());
  $('stRitmo').textContent = s.total >= s.meta || horasRest <= 0 ? '—' : `${Math.ceil((s.meta - s.total) / Math.max(horasRest, 0.5) / 10) * 10} ml/h`;
  const seq = sequencia();
  $('stStreak').textContent = `${seq} ${seq === 1 ? 'dia' : 'dias'}${seq >= 3 ? ' 🔥' : ''}`;

  renderCopos(); renderSemana(); renderHistorico();
  $('pontoNotif').classList.toggle('on', !('Notification' in window) || Notification.permission !== 'granted');
}

function animarNumero(de, para) {
  const el = $('valor'), t0 = performance.now(), dur = 600;
  const passo = t => {
    const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    el.textContent = Math.round(de + (para - de) * e);
    if (k < 1) requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
}

const iconeCopo = ml => {
  const nivel = Math.min(1, ml / 750);
  const y = 26 - 18 * nivel;
  return `<svg viewBox="0 0 32 32"><path d="M7 4h18l-2.2 23a2 2 0 0 1-2 1.8h-9.6a2 2 0 0 1-2-1.8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" opacity=".7"/><path d="M${8 + (26 - y) * 0.02} ${y}h${16 - (26 - y) * 0.04}l-1.4 ${27 - y}a1 1 0 0 1-1 .8h-9.2a1 1 0 0 1-1-.8z" fill="url(#gc)"/><defs><linearGradient id="gc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5ad1ff"/><stop offset="1" stop-color="#1677ff"/></linearGradient></defs></svg>`;
};
function renderCopos() {
  const el = $('rapidos'), chave = s.copos.join();
  if (el.dataset.k === chave) return;
  el.dataset.k = chave;
  el.innerHTML = s.copos.map(ml => `<button class="copo" data-ml="${ml}">${iconeCopo(ml)}<span>${fmtMl(ml)}</span></button>`).join('');
}

function renderSemana() {
  const dias = [], nomes = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const k = hoje(d), r = k === s.dia ? { total: s.total, meta: s.meta } : s.historico[k];
    dias.push({ nome: nomes[d.getDay()], total: r?.total || 0, meta: r?.meta || s.meta, hoje: i === 0 });
  }
  const max = Math.max(s.meta, ...dias.map(d => d.total));
  $('barras').innerHTML = dias.map(d =>
    `<div class="barra ${d.hoje ? 'hoje' : ''} ${d.total >= d.meta ? 'bateu' : ''}"><div class="barra-col"><i style="height:${(d.total / max) * 100}%"></i></div><span>${d.nome}</span></div>`).join('');
  const comDados = dias.filter(d => d.total > 0);
  $('mediaSemana').textContent = comDados.length ? `média ${fmtMl(Math.round(comDados.reduce((a, d) => a + d.total, 0) / comDados.length))}` : '';
}

function renderHistorico() {
  $('qtdRegistros').textContent = s.registros.length ? `${s.registros.length} ${s.registros.length === 1 ? 'registro' : 'registros'}` : '';
  $('historico').innerHTML = s.registros.length
    ? s.registros.map((x, i) => [x, i]).reverse().map(([x, i]) =>
        `<li><span class="ic">💧</span><span class="ml">${fmtMl(x.ml)}</span><span class="hr">${x.hora}</span><button class="del" data-del="${i}" aria-label="Remover">×</button></li>`).join('')
    : '<li class="vazio">Nenhum registro ainda. Bora começar? 💧</li>';
}

// ===================== Ações =====================
const vibrar = p => { try { navigator.vibrate?.(p); } catch {} };

function adicionar(ml) {
  ml = Math.round(+ml);
  if (!ml || ml <= 0 || ml > 5000) return;
  const antes = s.total;
  s.total += ml;
  s.registros.push({ ml, hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) });
  vibrar(20);
  $('orbe').classList.remove('pulso'); void $('orbe').offsetWidth; $('orbe').classList.add('pulso');
  salvar(); render();
  if (antes < s.meta && s.total >= s.meta) { confete(); vibrar([30, 60, 30]); }
  toast(`+${fmtMl(ml)} adicionado`, () => removerRegistro(s.registros.length - 1));
}
function removerRegistro(i) {
  const r = s.registros[i]; if (!r) return;
  s.total = Math.max(0, s.total - r.ml); s.registros.splice(i, 1);
  salvar(); render();
}

document.addEventListener('click', e => {
  const copo = e.target.closest('[data-ml]'); if (copo) return adicionar(copo.dataset.ml);
  const del = e.target.closest('[data-del]');
  if (del) { const r = s.registros[del.dataset.del]; removerRegistro(+del.dataset.del); toast(`${fmtMl(r.ml)} removido`, () => adicionar(r.ml)); }
});

// ---- Toast com desfazer ----
let tTimer, tAcao;
function toast(msg, desfazer) {
  $('toastTxt').textContent = msg; tAcao = desfazer;
  $('toastAcao').style.display = desfazer ? '' : 'none';
  $('toast').classList.add('on'); clearTimeout(tTimer);
  tTimer = setTimeout(() => $('toast').classList.remove('on'), 3200);
}
$('toastAcao').onclick = () => { $('toast').classList.remove('on'); const f = tAcao; tAcao = null; f?.(); };

// ---- Folhas ----
function abrir(nome) { $('fundo' + nome).classList.add('on'); $('folha' + nome).classList.add('on'); }
function fechar(nome) { $('fundo' + nome).classList.remove('on'); $('folha' + nome).classList.remove('on'); }
['Outro', 'Cfg'].forEach(n => $('fundo' + n).onclick = () => fechar(n));

$('btnOutro').onclick = () => { $('inpOutro').value = ''; abrir('Outro'); setTimeout(() => $('inpOutro').focus(), 300); };
document.querySelectorAll('[data-aj]').forEach(b => b.onclick = () => { $('inpOutro').value = Math.max(0, (+$('inpOutro').value || 0) + +b.dataset.aj); });
$('confOutro').onclick = () => { adicionar($('inpOutro').value); fechar('Outro'); };
$('inpOutro').onkeydown = e => { if (e.key === 'Enter') $('confOutro').click(); };

// ---- Configurações ----
let rasc;
const hhmm = h => fmtHora(h);
const dehhmm = v => { const [a, b] = v.split(':').map(Number); return a + b / 60; };
function pintarCfg() {
  $('vMeta').textContent = fmtMl(rasc.meta);
  $('vTol').textContent = Math.round(rasc.tolerancia * 100) + '%';
  $('vInt').textContent = rasc.intervaloMin >= 60 ? `${rasc.intervaloMin / 60}h`.replace('.', ',') : `${rasc.intervaloMin} min`;
}
$('btnCfg').onclick = () => {
  rasc = { meta: s.meta, tolerancia: s.tolerancia, intervaloMin: s.intervaloMin };
  $('cInicio').value = hhmm(s.inicio); $('cFim').value = hhmm(s.fim); $('cCopos').value = s.copos.join(', ');
  pintarCfg(); abrir('Cfg');
};
document.querySelectorAll('[data-p]').forEach(b => b.onclick = e => {
  e.preventDefault(); const d = +b.dataset.d; vibrar(8);
  if (b.dataset.p === 'meta') rasc.meta = Math.min(8000, Math.max(500, rasc.meta + d));
  if (b.dataset.p === 'tol') rasc.tolerancia = Math.min(.6, Math.max(.05, +(rasc.tolerancia + d / 100).toFixed(2)));
  if (b.dataset.p === 'int') rasc.intervaloMin = Math.min(240, Math.max(15, rasc.intervaloMin + d));
  pintarCfg();
});
$('calcMeta').onclick = () => {
  const p = parseFloat(prompt('Seu peso (kg):', '70')?.replace(',', '.'));
  if (p > 20 && p < 300) { rasc.meta = Math.round(p * 35 / 50) * 50; pintarCfg(); }
};
$('salvarCfg').onclick = () => {
  const ini = dehhmm($('cInicio').value || '07:00'), fim = dehhmm($('cFim').value || '22:00');
  if (fim <= ini) return toast('O horário de dormir precisa ser depois do de acordar');
  const copos = $('cCopos').value.split(/[,;\s]+/).map(Number).filter(n => n > 0 && n <= 3000).slice(0, 8);
  Object.assign(s, rasc, { inicio: ini, fim, copos: copos.length ? copos : PADRAO.copos });
  salvar(); render(); fechar('Cfg'); toast('Configurações salvas');
};
$('zerarDia').onclick = () => {
  const backup = { total: s.total, registros: [...s.registros] };
  s.total = 0; s.registros = []; salvar(); render(); fechar('Cfg');
  toast('Dia zerado', () => { Object.assign(s, backup); salvar(); render(); });
};

// ---- Onboarding ----
function sugestao() { const p = parseFloat($('obPeso').value.replace(',', '.')) || 70; return Math.round(p * 35 / 50) * 50; }
$('obPeso').oninput = () => $('obSugestao').textContent = `Meta sugerida: ${fmtMl(sugestao())}`;
$('obOk').onclick = () => { s.meta = sugestao(); fimOnboarding(); };
$('obPular').onclick = () => { s.meta = 2000; fimOnboarding(); };
function fimOnboarding() { s.onboarded = true; salvar(); $('onboarding').hidden = true; render(); }
if (!s.onboarded) $('onboarding').hidden = false;

// ===================== Notificações =====================
let reg;
async function ativarNotificacoes() {
  if (!('Notification' in window)) {
    return toast(/iPhone|iPad/.test(navigator.userAgent) ? 'Instale na Tela de Início para ativar' : 'Navegador sem suporte a notificações');
  }
  const p = await Notification.requestPermission();
  if (p !== 'granted') return toast('Permissão negada — ative nos ajustes do sistema');
  try { if ('periodicSync' in reg) await reg.periodicSync.register('lembrete-agua', { minInterval: 30 * 60 * 1000 }); } catch {}
  toast('Lembretes ativados 🔔'); render();
}
$('btnNotif').onclick = () => Notification?.permission === 'granted' ? toast('Lembretes já estão ativos 🔔') : ativarNotificacoes();
$('testeNotif').onclick = async () => {
  if (Notification?.permission !== 'granted') return ativarNotificacoes();
  reg?.showNotification('💧 Teste do Hidrata', { body: 'Se você está vendo isso, os lembretes funcionam.', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png' });
};

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').then(r => { reg = r; salvar(); });
}

// Checagem periódica (app aberto ou recém-minimizado)
setInterval(() => { render(); navigator.serviceWorker?.controller?.postMessage('checar'); }, 60 * 1000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { s = carregar(); render(); }
  else navigator.serviceWorker?.controller?.postMessage('checar');
});

// ===================== Confete =====================
function confete() {
  const c = $('confete'), ctx = c.getContext('2d');
  c.width = innerWidth * devicePixelRatio; c.height = innerHeight * devicePixelRatio; ctx.scale(devicePixelRatio, devicePixelRatio);
  const cores = ['#5ad1ff', '#1677ff', '#3ddc97', '#ffd166', '#ffffff'];
  const ps = Array.from({ length: 120 }, () => ({
    x: innerWidth / 2, y: innerHeight * .35, vx: (Math.random() - .5) * 12, vy: -Math.random() * 12 - 4,
    r: Math.random() * 6 + 3, c: cores[Math.random() * cores.length | 0], a: Math.random() * 6, va: (Math.random() - .5) * .3
  }));
  let f = 0;
  (function loop() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ps.forEach(p => { p.vy += .35; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.a += p.va;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); ctx.restore(); });
    if (++f < 150) requestAnimationFrame(loop); else ctx.clearRect(0, 0, innerWidth, innerHeight);
  })();
}

render();
