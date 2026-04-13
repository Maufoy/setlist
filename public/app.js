let categorias = [];
let bloqueados = [];
let selectedEquipamentos = new Set();
let equipe = [];
let registros = [];
let perfilData = {};
let selectedStatus = 'em-producao';

document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupForm();
  setupBloqueados();
  setupPerfil();
  setupRegistroModal();
  loadEquipamentos();
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('data').value = today;
  document.getElementById('alug-data').value = today;
});

// ── Navigation ────────────────────────────────────────────────
function setupNavigation() {
  const desktops = document.querySelectorAll('.nav-btn-desktop');
  const mobiles = document.querySelectorAll('.nav-btn-mobile');
  
  function setView(view) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + view).classList.add('active');

    desktops.forEach(b => {
      if(b.dataset.view === view) {
        b.className = 'nav-btn-desktop text-[#ffde03] transition-colors px-3 py-1 rounded-xl uppercase font-bold tracking-tighter';
      } else {
        b.className = 'nav-btn-desktop text-[#1a1c1c] hover:bg-zinc-200/50 transition-colors px-3 py-1 rounded-xl uppercase font-bold tracking-tighter';
      }
    });

    mobiles.forEach(b => {
      if(b.dataset.view === view) {
        b.className = 'nav-btn-mobile flex flex-col items-center justify-center bg-yellow-400 text-stone-900 rounded-xl px-4 py-2 shadow-sm transition-all outline-none';
        b.querySelector('span:first-child').style.fontVariationSettings = "'FILL' 1";
        b.classList.remove('opacity-60');
      } else {
        b.className = 'nav-btn-mobile flex flex-col items-center justify-center text-stone-500 dark:text-zinc-400 opacity-60 hover:opacity-100 transition-opacity px-4 py-2 outline-none';
        b.querySelector('span:first-child').style.fontVariationSettings = "'FILL' 0";
      }
    });

    if (view === 'historico') loadRegistros();
    if (view === 'bloqueados') loadBloqueados();
    if (view === 'perfil') loadPerfil();
  }

  desktops.forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.view)));
  mobiles.forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.view)));

  // Avatar no header leva direto pro perfil
  document.getElementById('avatar-btn').addEventListener('click', () => setView('perfil'));
}

// ── Equipamentos ──────────────────────────────────────────────
async function loadEquipamentos() {
  try {
    const [catRes, blqRes, regRes] = await Promise.all([
      fetch('/api/equipamentos'),
      fetch('/api/bloqueados'),
      fetch('/api/registros')
    ]);
    categorias = await catRes.json();
    bloqueados = await blqRes.json();
    registros = await regRes.json();
    renderEquipamentos(categorias, '');
    populateBloqueadosSelect();
  } catch {
    document.getElementById('equipamentos-lista').innerHTML =
      '<p class="text-center text-error font-label py-10">Erro ao carregar equipamentos</p>';
  }
}

function lockedSet() {
  return new Set(bloqueados.map(a => a.equipamento));
}

// Equipamentos bloqueados por pautas em produção
function prodLockedMap() {
  const map = new Map(); // equipamento -> registro
  registros.forEach(r => {
    if (r.status === 'em-producao') {
      r.equipamentos.forEach(eq => {
        if (!map.has(eq)) map.set(eq, r);
      });
    }
  });
  return map;
}

function statusLabel(status) {
  return { 'pre-producao': 'Pré-Produção', 'em-producao': 'Em Produção', 'finalizado': 'Finalizado' }[status] || 'Em Produção';
}

function statusConfig(status) {
  return {
    'pre-producao': { icon: 'schedule', activeBg: 'bg-surface-container-high', activeText: 'text-on-surface', activeBorder: 'border-outline-variant' },
    'em-producao':  { icon: 'fiber_manual_record', activeBg: 'bg-primary-container', activeText: 'text-on-primary-container', activeBorder: 'border-primary-container' },
    'finalizado':   { icon: 'check_circle', activeBg: 'bg-tertiary-container/40', activeText: 'text-tertiary', activeBorder: 'border-tertiary' }
  }[status] || {};
}

function renderStatusBtns(containerId, currentStatus, onChangeFn) {
  const statuses = ['pre-producao', 'em-producao', 'finalizado'];
  document.getElementById(containerId).innerHTML = statuses.map(s => {
    const cfg = statusConfig(s);
    const isActive = s === currentStatus;
    const cls = isActive
      ? `${cfg.activeBg} ${cfg.activeText} border-2 ${cfg.activeBorder}`
      : 'bg-surface-container-low text-outline border-2 border-transparent hover:border-outline-variant/50';
    return `<button type="button" onclick="${onChangeFn}('${s}')"
      class="flex-1 py-2 px-1 rounded-xl font-label text-[9px] font-black uppercase tracking-tighter transition-all outline-none flex items-center justify-center gap-1 ${cls}">
      <span class="material-symbols-outlined text-[12px]" style="font-variation-settings:'FILL' ${isActive ? 1 : 0};">${cfg.icon}</span>
      ${s === 'pre-producao' ? 'PRÉ-PROD.' : s === 'em-producao' ? 'EM PROD.' : 'FINALIZADO'}
    </button>`;
  }).join('');
}

function renderEquipamentos(cats, query) {
  const container = document.getElementById('equipamentos-lista');
  const q = (query || '').toLowerCase();
  const locked = lockedSet();
  const prodLocked = prodLockedMap();

  const filtered = cats.map(cat => ({
    ...cat,
    itens: q ? cat.itens.filter(eq => eq.toLowerCase().includes(q)) : cat.itens
  })).filter(cat => cat.itens.length > 0);

  if (!filtered.length) {
    container.innerHTML = '<p class="text-center text-outline font-label py-10">Nenhum equipamento encontrado.</p>';
    return;
  }

  container.innerHTML = filtered.map(cat => {
    let icon = 'inventory_2';
    if(cat.categoria.toLowerCase().includes('camera') || cat.categoria.toLowerCase().includes('câmera')) icon = 'videocam';
    else if(cat.categoria.toLowerCase().includes('lente')) icon = 'lens';

    const itemsHtml = cat.itens.map(eq => {
      const isLocked = locked.has(eq);
      const isProdLocked = prodLocked.has(eq);
      const isSelected = selectedEquipamentos.has(eq);

      if (isLocked) {
        const rental = bloqueados.find(a => a.equipamento === eq);
        return `
        <div class="flex items-center justify-between p-4 bg-surface-container-highest/40 rounded-xl opacity-60">
          <div class="flex items-center gap-4">
            <span class="material-symbols-outlined text-outline">lock</span>
            <div class="flex flex-col">
              <span class="font-bold text-sm text-outline" style="text-decoration: line-through">${esc(eq)}</span>
              <span class="text-[10px] text-error uppercase tracking-tighter font-bold">${esc(rental.tipo)} — ${esc(rental.cliente)}</span>
            </div>
          </div>
        </div>`;
      }

      if (isProdLocked) {
        const reg = prodLocked.get(eq);
        return `
        <div class="flex items-center justify-between p-4 bg-primary-container/10 rounded-xl border border-primary-container/30">
          <div class="flex items-center gap-4">
            <span class="material-symbols-outlined text-primary" style="font-variation-settings:'FILL' 1;">fiber_manual_record</span>
            <div class="flex flex-col">
              <span class="font-bold text-sm text-outline" style="text-decoration: line-through">${esc(eq)}</span>
              <span class="text-[10px] text-primary uppercase tracking-tighter font-bold">EM PRODUÇÃO — ${esc(reg.cliente)}</span>
            </div>
          </div>
          <span class="font-label text-[8px] font-black uppercase tracking-wider text-primary bg-primary-container px-2 py-0.5 rounded-full">INDISPONÍVEL</span>
        </div>`;
      }

      return `
      <label class="group relative flex items-center justify-between p-4 bg-surface-container-low rounded-xl cursor-pointer hover:bg-surface-container-highest transition-colors equip-label-box" data-val="${esc(eq)}">
        <div class="flex items-center gap-4">
          <input type="checkbox" value="${esc(eq)}" class="w-5 h-5 rounded border-outline-variant text-primary focus:ring-primary-container checkbox-eq" ${isSelected ? 'checked' : ''}/>
          <div class="flex flex-col">
            <span class="font-bold text-sm text-on-surface">${esc(eq)}</span>
            <span class="text-[10px] text-outline uppercase tracking-tighter font-medium">${esc(cat.categoria)}</span>
          </div>
        </div>
        <span class="material-symbols-outlined text-primary opacity-0 group-has-[:checked]:opacity-100 transition-opacity" style="font-variation-settings: 'FILL' 1;">check_circle</span>
      </label>`;
    }).join('');

    return `
    <div>
      <div class="flex items-center gap-2 mb-4 mt-6">
        <span class="material-symbols-outlined text-primary">${icon}</span>
        <h4 class="font-headline text-sm font-extrabold uppercase tracking-widest text-outline">${esc(cat.categoria)}</h4>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        ${itemsHtml}
      </div>
    </div>`;
  }).join('');

  container.querySelectorAll('.checkbox-eq').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) selectedEquipamentos.add(cb.value);
      else selectedEquipamentos.delete(cb.value);
    });
  });
}

// ── Bloqueados ───────────────────────────────────────────
function setupBloqueados() {
  document.getElementById('btn-novo-bloqueio').addEventListener('click', () => {
    document.getElementById('modal-bloqueio').classList.add('active');
  });
  document.getElementById('close-modal-bloqueio').addEventListener('click', () => {
    document.getElementById('modal-bloqueio').classList.remove('active');
  });
  document.getElementById('salvar-aluguel').addEventListener('click', saveBloqueio);
}

function populateBloqueadosSelect() {
  const sel = document.getElementById('alug-equipamento');
  const locked = lockedSet();
  const current = sel.value;

  sel.innerHTML = '<option value="">Selecione o equipamento...</option>';
  categorias.forEach(cat => {
    const available = cat.itens.filter(eq => !locked.has(eq));
    if (!available.length) return;
    const grp = document.createElement('optgroup');
    grp.label = cat.categoria;
    available.forEach(eq => {
      const opt = document.createElement('option');
      opt.value = eq;
      opt.textContent = eq;
      grp.appendChild(opt);
    });
    sel.appendChild(grp);
  });
  if (current && !locked.has(current)) sel.value = current;
}

async function loadBloqueados() {
  try {
    const res = await fetch('/api/bloqueados');
    bloqueados = await res.json();
    renderBloqueados();
  } catch {
    showToast('Erro ao carregar bloqueados', 'error');
  }
}

function createBloqueadoCard(a, iconColorClass, iconName) {
  return `
  <div class="group glint-effect bg-surface-container-lowest p-5 rounded-3xl shadow-[0_10px_30px_rgba(0,0,0,0.02)] transition-all duration-300 hover:translate-y-[-4px] relative">
    <div class="flex items-center justify-between gap-4">
      <div class="flex flex-col flex-grow">
        <h4 class="font-headline font-bold text-lg text-on-surface leading-tight">${esc(a.equipamento)}</h4>
        <div class="flex items-center gap-2 mt-1">
          <span class="material-symbols-outlined text-[14px] ${iconColorClass}">${iconName}</span>
          <span class="font-label text-[10px] uppercase font-semibold text-outline">
            ${a.cliente ? 'Resp: ' + esc(a.cliente) : 'Bloqueio: ' + formatDate(a.dataInicio)}
          </span>
        </div>
        ${a.observacao ? `<p class="font-label text-xs mt-2 text-outline-variant">${esc(a.observacao)}</p>` : ''}
      </div>
      <button class="material-symbols-outlined text-outline hover:${iconColorClass} transition-colors p-2" onclick="removerBloqueio('${a.id}')" title="Remover Bloqueio">
        lock_open
      </button>
    </div>
  </div>`;
}

function renderBloqueados() {
  const reparoList = bloqueados.filter(b => b.tipo === 'reparo');
  const perdidosList = bloqueados.filter(b => b.tipo === 'perdido');
  const alugadosList = bloqueados.filter(b => b.tipo === 'alugado');

  document.getElementById('count-reparo').textContent = reparoList.length;
  document.getElementById('lista-reparo').innerHTML = reparoList.length ?
    reparoList.map(a => createBloqueadoCard(a, 'text-primary', 'build')).join('') :
    '<p class="text-sm font-label text-outline p-4 text-center">Nenhum em reparo.</p>';

  document.getElementById('count-perdidos').textContent = perdidosList.length;
  document.getElementById('lista-perdidos').innerHTML = perdidosList.length ?
    perdidosList.map(a => createBloqueadoCard(a, 'text-error', 'report')).join('') :
    '<p class="text-sm font-label text-outline p-4 text-center">Nenhum perdido.</p>';

  document.getElementById('count-alugados').textContent = alugadosList.length;
  document.getElementById('lista-alugados').innerHTML = alugadosList.length ?
    alugadosList.map(a => createBloqueadoCard(a, 'text-tertiary', 'person')).join('') :
    '<p class="text-sm font-label text-outline p-4 text-center">Nenhum alugado no momento.</p>';
}

async function saveBloqueio() {
  const equipamento = document.getElementById('alug-equipamento').value;
  const cliente     = document.getElementById('alug-cliente').value.trim();
  const tipo        = document.getElementById('alug-tipo').value;
  const dataInicio  = document.getElementById('alug-data').value;
  const observacao  = document.getElementById('alug-obs').value.trim();

  if (!equipamento || !dataInicio) { showToast('Faltam dados obrigatórios', 'error'); return; }

  try {
    const res = await fetch('/api/bloqueados', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ equipamento, cliente, tipo, dataInicio, observacao })
    });
    if (res.ok) {
      const novo = await res.json();
      bloqueados.push(novo);
      renderBloqueados();
      populateBloqueadosSelect();
      renderEquipamentos(categorias, document.getElementById('busca-equipamento').value);
      document.getElementById('modal-bloqueio').classList.remove('active');
      document.getElementById('alug-equipamento').value = '';
      document.getElementById('alug-cliente').value = '';
      document.getElementById('alug-obs').value = '';
      showToast('Bloqueio registrado!');
    } else {
      const err = await res.json();
      showToast(err.error || 'Erro ao registrar', 'error');
    }
  } catch {
    showToast('Erro de conexao', 'error');
  }
}

window.removerBloqueio = async function(id) {
  if (!confirm('Confirmar remoção de bloqueio deste equipamento?')) return;
  try {
    const res = await fetch('/api/bloqueados/' + id, { method: 'DELETE' });
    if (res.ok) {
      bloqueados = bloqueados.filter(a => a.id !== id);
      renderBloqueados();
      populateBloqueadosSelect();
      renderEquipamentos(categorias, document.getElementById('busca-equipamento').value);
      showToast('Bloqueio removido!');
    }
  } catch {
    showToast('Erro ao remover', 'error');
  }
};

// ── Novo Registro Form ────────────────────────────────────────
function setupForm() {
  const addBtn = document.getElementById('add-membro');
  const membroInput = document.getElementById('membro-input');

  addBtn.addEventListener('click', addMembro);
  membroInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addMembro(); }
  });

  // Status buttons no formulário
  window._setFormStatus = function(s) {
    selectedStatus = s;
    renderStatusBtns('status-selector', selectedStatus, '_setFormStatus');
  };
  renderStatusBtns('status-selector', selectedStatus, '_setFormStatus');

  document.getElementById('busca-equipamento').addEventListener('input', e => {
    renderEquipamentos(categorias, e.target.value);
  });

  document.getElementById('limpar-form').addEventListener('click', clearForm);
  document.getElementById('salvar-registro').addEventListener('click', saveRegistro);

  document.getElementById('busca-historico').addEventListener('input', filterRegistros);
  document.getElementById('filtro-data').addEventListener('input', filterRegistros);
  document.getElementById('limpar-filtros').addEventListener('click', () => {
    document.getElementById('busca-historico').value = '';
    document.getElementById('filtro-data').value = '';
    renderRegistros(registros);
  });

  // Toggle Observações
  const btnAddObs = document.getElementById('btn-add-obs');
  const btnRemoveObs = document.getElementById('btn-remove-obs');
  const obsContainer = document.getElementById('obs-container');
  const obsTextarea = document.getElementById('observacoes');

  btnAddObs.addEventListener('click', () => {
    btnAddObs.classList.add('escondido');
    obsContainer.classList.remove('escondido');
    obsTextarea.focus();
  });

  btnRemoveObs.addEventListener('click', () => {
    btnAddObs.classList.remove('escondido');
    obsContainer.classList.add('escondido');
    obsTextarea.value = '';
  });
}

function addMembro() {
  const input = document.getElementById('membro-input');
  const nome = input.value.trim();
  if (!nome) return;
  if (equipe.includes(nome)) { showToast('Membro ja adicionado', 'error'); return; }
  equipe.push(nome);
  renderEquipe();
  input.value = '';
  input.focus();
}

function renderEquipe() {
  document.getElementById('equipe-lista').innerHTML = equipe.map((nome, i) =>
    `<div class="flex items-center gap-2 bg-surface-container-low py-1.5 pl-3 pr-3 rounded-full">
       <span class="text-xs font-bold">${esc(nome)}</span>
       <span class="material-symbols-outlined text-[14px] cursor-pointer text-outline hover:text-error transition-colors" onclick="removeMembro(${i})">close</span>
     </div>`
  ).join('');
}

window.removeMembro = function(i) {
  equipe.splice(i, 1);
  renderEquipe();
};

async function saveRegistro() {
  const data     = document.getElementById('data').value;
  const cliente  = document.getElementById('cliente').value.trim();
  const equipSel = Array.from(selectedEquipamentos);

  if (!data)            { showToast('Informe a data', 'error'); return; }
  if (!cliente)         { showToast('Informe o cliente/produção', 'error'); return; }
  if (!equipe.length)   { showToast('Adicione ao menos um membro', 'error'); return; }
  if (!equipSel.length) { showToast('Selecione ao menos um equipamento', 'error'); return; }

  try {
    const res = await fetch('/api/registros', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data,
        cliente,
        equipe: [...equipe],
        equipamentos: equipSel,
        status: selectedStatus,
        observacoes: document.getElementById('observacoes').value.trim()
      })
    });
    if (res.ok) {
      const novo = await res.json();
      registros.unshift(novo);
      renderEquipamentos(categorias, document.getElementById('busca-equipamento').value);
      showToast('Registro salvo com sucesso!');
      clearForm();
    } else { showToast('Erro ao salvar', 'error'); }
  } catch {
    showToast('Erro de conexao', 'error');
  }
}

function clearForm() {
  document.getElementById('data').value = new Date().toISOString().split('T')[0];
  document.getElementById('cliente').value = '';
  document.getElementById('membro-input').value = '';
  document.getElementById('busca-equipamento').value = '';
  equipe = [];
  selectedEquipamentos.clear();
  selectedStatus = 'em-producao';
  document.getElementById('observacoes').value = '';
  document.getElementById('btn-add-obs').classList.remove('escondido');
  document.getElementById('obs-container').classList.add('escondido');
  renderStatusBtns('status-selector', selectedStatus, '_setFormStatus');
  renderEquipe();
  renderEquipamentos(categorias, '');
}

// ── Historico ─────────────────────────────────────────────────
async function loadRegistros() {
  document.getElementById('registros-lista').innerHTML = '<p class="text-center font-label text-outline py-10">Carregando...</p>';
  try {
    const res = await fetch('/api/registros');
    registros = await res.json();
    renderRegistros(registros);
  } catch {
    document.getElementById('registros-lista').innerHTML = '<p class="text-center font-label text-error py-10">Erro ao carregar registros.</p>';
  }
}

function renderRegistros(list) {
  const container = document.getElementById('registros-lista');
  if (!list.length) {
    container.innerHTML = '<p class="text-center font-label text-outline py-10">Nenhum registro encontrado.</p>';
    return;
  }
  
  // Agrupar por data
  const groups = {};
  list.forEach(r => {
    if(!groups[r.data]) groups[r.data] = [];
    groups[r.data].push(r);
  });

  const sortedDates = Object.keys(groups).sort((a,b) => b.localeCompare(a));

  let out = '<div class="absolute left-6 top-0 bottom-0 w-[2px] bg-surface-container-highest hidden md:block"></div>';

  sortedDates.forEach(date => {
    out += `
    <div class="space-y-4 mb-8 relative z-10">
      <div class="flex items-center gap-4 md:ml-2">
        <div class="w-8 h-8 rounded-full bg-primary-container flex items-center justify-center">
          <div class="w-2 h-2 rounded-full bg-primary"></div>
        </div>
        <h3 class="font-headline font-bold text-on-surface tracking-tighter uppercase text-lg">${formatDate(date)}</h3>
      </div>
      
      ${groups[date].map(r => {
        const st = r.status || 'em-producao';
        const stCfg = statusConfig(st);
        const borderColor = st === 'em-producao' ? 'border-primary-container' : st === 'finalizado' ? 'border-tertiary/40' : 'border-outline-variant';
        return `
        <div class="md:ml-14 bg-surface-container-lowest rounded-3xl p-6 shadow-sm border-l-4 ${borderColor} hover:shadow-md transition-all cursor-pointer group" onclick="openRegistroDetail('${r.id}')">
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div class="flex flex-col flex-grow min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <span class="font-label text-[10px] text-outline font-bold tracking-widest">PRODUÇÃO</span>
                <span class="flex items-center gap-1 ${stCfg.activeBg} ${stCfg.activeText} px-2 py-0.5 rounded-full font-label text-[8px] font-black uppercase tracking-tighter">
                  <span class="material-symbols-outlined text-[10px]" style="font-variation-settings:'FILL' 1;">${stCfg.icon}</span>
                  ${statusLabel(st)}
                </span>
              </div>
              <h4 class="font-headline text-xl font-bold tracking-tighter text-on-surface uppercase truncate">${esc(r.cliente)}</h4>
              <div class="flex items-center gap-2 mt-2">
                <span class="material-symbols-outlined text-outline text-sm">inventory_2</span>
                <p class="font-body text-sm font-medium text-on-surface-variant line-clamp-1">${esc(r.equipamentos.length > 3 ? r.equipamentos.slice(0,3).join(', ') + ' +' + (r.equipamentos.length-3) + ' mais' : r.equipamentos.join(', '))}</p>
              </div>
              <div class="mt-2 text-xs font-label text-outline uppercase font-semibold line-clamp-1">Equipe: ${esc(r.equipe.join(', '))}</div>
            </div>
            <div class="flex-shrink-0">
              <span class="material-symbols-outlined text-outline group-hover:text-primary transition-colors">chevron_right</span>
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>`;
  });

  container.innerHTML = out;
}

function filterRegistros() {
  const q    = document.getElementById('busca-historico').value.toLowerCase();
  const data = document.getElementById('filtro-data').value;
  renderRegistros(registros.filter(r =>
    (!q || r.cliente.toLowerCase().includes(q) ||
      r.equipe.some(m => m.toLowerCase().includes(q)) ||
      r.equipamentos.some(e => e.toLowerCase().includes(q))) &&
    (!data || r.data === data)
  ));
}

window.deleteRegistro = async function(id) {
  if (!confirm('Deseja realmente apagar este registro de uso do histórico?')) return;
  try {
    const res = await fetch('/api/registros/' + id, { method: 'DELETE' });
    if (res.ok) {
      registros = registros.filter(r => r.id !== id);
      filterRegistros();
      renderEquipamentos(categorias, document.getElementById('busca-equipamento').value);
      showToast('Registro apagado com sucesso');
    }
  } catch {
    showToast('Erro ao apagar', 'error');
  }
};

function formatDate(d) {
  if(!d) return '';
  const [y, m, dd] = d.split('T')[0].split('-');
  return `${dd}/${m}/${y}`;
}

function esc(str) {
  if(!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let toastTimer;
function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ── Modal Detalhes do Registro ────────────────────────────────
function setupRegistroModal() {
  const overlay = document.getElementById('modal-registro');

  document.getElementById('close-modal-registro').addEventListener('click', () => {
    overlay.classList.remove('active');
  });

  // Fechar clicando no fundo do overlay
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('active');
  });
}

window.openRegistroDetail = function(id) {
  const r = registros.find(x => x.id === id);
  if (!r) { showToast('Registro não encontrado', 'error'); return; }

  // Header
  document.getElementById('modal-reg-cliente').textContent = r.cliente;
  document.getElementById('modal-reg-data').textContent = formatDate(r.data);
  const countLabel = r.equipamentos.length + ' ' + (r.equipamentos.length === 1 ? 'item' : 'itens');
  document.getElementById('modal-reg-count').textContent = countLabel;
  const labelEl = document.getElementById('modal-reg-count-label');
  if (labelEl) labelEl.textContent = countLabel + ' registrados';

  // Equipe
  document.getElementById('modal-reg-equipe').innerHTML = r.equipe.length
    ? r.equipe.map(m => `
        <div class="flex items-center gap-2 bg-surface-container-low px-3 py-1.5 rounded-full">
          <span class="material-symbols-outlined text-primary text-[14px]">person</span>
          <span class="font-label text-xs font-bold text-on-surface">${esc(m)}</span>
        </div>`).join('')
    : '<span class="font-label text-xs text-outline">Nenhum membro registrado</span>';

  // Equipamentos agrupados por categoria
  const grouped = {};
  r.equipamentos.forEach(eq => {
    const cat = categorias.find(c => c.itens.includes(eq));
    const key = cat ? cat.categoria : 'Outros';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(eq);
  });

  function getCatIcon(name) {
    const n = name.toLowerCase();
    if (n.includes('camera') || n.includes('câmera')) return 'videocam';
    if (n.includes('lente')) return 'filter_center_focus';
    if (n.includes('audio') || n.includes('áudio') || n.includes('som')) return 'mic';
    if (n.includes('luz') || n.includes('ilum')) return 'light_mode';
    return 'inventory_2';
  }

  const equipHtml = Object.entries(grouped).map(([catName, itens]) => `
    <div class="mb-4">
      <div class="flex items-center gap-2 mb-2">
        <span class="material-symbols-outlined text-primary text-sm">${getCatIcon(catName)}</span>
        <span class="font-label text-[10px] text-outline font-bold tracking-widest uppercase">${esc(catName)}</span>
      </div>
      <div class="space-y-1">
        ${itens.map(eq => `
          <div class="flex items-center gap-3 bg-surface-container-low px-4 py-3 rounded-xl">
            <span class="material-symbols-outlined text-primary-container text-base" style="font-variation-settings: 'FILL' 1;">check_circle</span>
            <span class="font-body text-sm font-semibold text-on-surface">${esc(eq)}</span>
          </div>`).join('')}
      </div>
    </div>`).join('');

  document.getElementById('modal-reg-equipamentos').innerHTML = equipHtml ||
    '<span class="font-label text-xs text-outline">Nenhum equipamento registrado</span>';
    
  // Observações
  const obsContainer = document.getElementById('modal-reg-obs-container');
  const obsText = document.getElementById('modal-reg-obs');
  if (r.observacoes && r.observacoes.trim()) {
    obsContainer.classList.remove('escondido');
    obsText.textContent = r.observacoes;
  } else {
    obsContainer.classList.add('escondido');
  }

  // Status
  window._setModalStatus = function(s) { changeRegistroStatus(r.id, s); };
  renderStatusBtns('modal-status-btns', r.status || 'em-producao', '_setModalStatus');

  // Botão Excluir
  const deleteBtn = document.getElementById('modal-reg-delete');
  deleteBtn.onclick = () => {
    document.getElementById('modal-registro').classList.remove('active');
    deleteRegistro(r.id);
  };

  document.getElementById('modal-registro').classList.add('active');
};

window.changeRegistroStatus = async function(id, newStatus) {
  try {
    const res = await fetch('/api/registros/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    if (!res.ok) { showToast('Erro ao atualizar status', 'error'); return; }
    const updated = await res.json();
    // Atualiza array local
    const idx = registros.findIndex(r => r.id === id);
    if (idx !== -1) registros[idx] = updated;
    // Atualiza botões no modal
    renderStatusBtns('modal-status-btns', newStatus, '_setModalStatus');
    // Atualiza card no histórico se visível
    renderRegistros(registros.filter(r => {
      const q = document.getElementById('busca-historico').value.toLowerCase();
      const data = document.getElementById('filtro-data').value;
      return (!q || r.cliente.toLowerCase().includes(q) ||
        r.equipe.some(m => m.toLowerCase().includes(q)) ||
        r.equipamentos.some(e => e.toLowerCase().includes(q))) &&
        (!data || r.data === data);
    }));
    // Atualiza bloqueios visuais de equipamentos
    renderEquipamentos(categorias, document.getElementById('busca-equipamento').value);
    showToast('Status atualizado: ' + statusLabel(newStatus));
  } catch {
    showToast('Erro de conexão', 'error');
  }
};

// ── Perfil ────────────────────────────────────────────────────
function setupPerfil() {
  document.getElementById('btn-save-perfil').addEventListener('click', savePerfil);
  document.getElementById('btn-logout').addEventListener('click', () => {
    showToast('Sessão encerrada! Até logo 👋');
    setTimeout(() => window.location.reload(), 1800);
  });
}

async function loadPerfil() {
  try {
    const res = await fetch('/api/perfil');
    perfilData = await res.json();
    document.getElementById('perfil-nome-display').textContent = perfilData.nome || '';
    document.getElementById('perfil-cargo-display').textContent =
      `${perfilData.cargo || 'Membro'} #${perfilData.id || '0000'}`;
    document.getElementById('perfil-nome-input').value = perfilData.nome || '';
    document.getElementById('perfil-email-input').value = perfilData.email || '';
  } catch {
    showToast('Erro ao carregar perfil', 'error');
  }
}

async function savePerfil() {
  const nome  = document.getElementById('perfil-nome-input').value.trim();
  const email = document.getElementById('perfil-email-input').value.trim();
  if (!nome || !email) { showToast('Preencha nome e email', 'error'); return; }

  const btn = document.getElementById('btn-save-perfil');
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  try {
    const res = await fetch('/api/perfil', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, email })
    });
    if (res.ok) {
      perfilData = await res.json();
      document.getElementById('perfil-nome-display').textContent = perfilData.nome;
      showToast('Perfil atualizado com sucesso!');
    } else {
      showToast('Erro ao salvar perfil', 'error');
    }
  } catch {
    showToast('Erro de conexão', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Salvar Alterações';
  }
}
