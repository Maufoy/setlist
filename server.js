const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

const EQUIPAMENTOS_FILE = path.join(__dirname, 'equipamentos.txt');
const REGISTROS_FILE    = path.join(__dirname, 'registros.json');
const BLOQUEADOS_FILE   = path.join(__dirname, 'bloqueados.json');
const PERFIL_FILE       = path.join(__dirname, 'perfil.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function readJson(file, fallback = []) {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); }
  catch { return fallback; }
}
function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ── Equipamentos ─────────────────────────────────────────────
app.get('/api/equipamentos', (req, res) => {
  try {
    const content = fs.readFileSync(EQUIPAMENTOS_FILE, 'utf-8');
    const categorias = [];
    let atual = null;

    for (const raw of content.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      if (line.startsWith('[') && line.endsWith(']')) {
        atual = { categoria: line.slice(1, -1), itens: [] };
        categorias.push(atual);
      } else if (atual) {
        atual.itens.push(line);
      }
    }

    res.json(categorias.filter(c => c.itens.length > 0));
  } catch (e) {
    res.status(500).json({ error: 'Erro ao ler equipamentos.txt' });
  }
});

// ── Bloqueados ─────────────────────────────────────────────────
app.get('/api/bloqueados', (req, res) => {
  res.json(readJson(BLOQUEADOS_FILE));
});

app.post('/api/bloqueados', (req, res) => {
  const { equipamento, cliente, tipo, dataInicio, observacao } = req.body;
  if (!equipamento || !tipo || !dataInicio) {
    return res.status(400).json({ error: 'Campos obrigatórios ausentes' });
  }
  const bloqueados = readJson(BLOQUEADOS_FILE);
  if (bloqueados.some(a => a.equipamento === equipamento)) {
    return res.status(409).json({ error: 'Equipamento já está bloqueado' });
  }
  const novo = {
    id: crypto.randomUUID(),
    equipamento,
    tipo, 
    cliente: cliente || '',
    dataInicio,
    observacao: observacao || '',
    criadoEm: new Date().toISOString()
  };
  bloqueados.push(novo);
  writeJson(BLOQUEADOS_FILE, bloqueados);
  res.json(novo);
});

app.delete('/api/bloqueados/:id', (req, res) => {
  try {
    let bloqueados = readJson(BLOQUEADOS_FILE);
    bloqueados = bloqueados.filter(a => a.id !== req.params.id);
    writeJson(BLOQUEADOS_FILE, bloqueados);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Erro ao remover bloqueio' });
  }
});

// ── Registros ─────────────────────────────────────────────────
app.get('/api/registros', (req, res) => {
  res.json(readJson(REGISTROS_FILE));
});

app.post('/api/registros', (req, res) => {
  const { data, cliente, equipe, equipamentos } = req.body;
  if (!data || !cliente || !equipe || !equipamentos) {
    return res.status(400).json({ error: 'Campos obrigatórios ausentes' });
  }
  const registros = readJson(REGISTROS_FILE);
  const novo = {
    id: crypto.randomUUID(),
    data,
    cliente,
    equipe,
    equipamentos,
    criadoEm: new Date().toISOString()
  };
  registros.unshift(novo);
  writeJson(REGISTROS_FILE, registros);
  res.json(novo);
});

app.delete('/api/registros/:id', (req, res) => {
  try {
    let registros = readJson(REGISTROS_FILE);
    registros = registros.filter(r => r.id !== req.params.id);
    writeJson(REGISTROS_FILE, registros);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Erro ao excluir registro' });
  }
});

app.patch('/api/registros/:id', (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['pre-producao', 'em-producao', 'finalizado'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Status inválido' });
    let registros = readJson(REGISTROS_FILE);
    const idx = registros.findIndex(r => r.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Não encontrado' });
    registros[idx].status = status;
    writeJson(REGISTROS_FILE, registros);
    res.json(registros[idx]);
  } catch {
    res.status(500).json({ error: 'Erro ao atualizar status' });
  }
});

// ── Perfil ────────────────────────────────────────────────────
app.get('/api/perfil', (req, res) => {
  let p = readJson(PERFIL_FILE, null);
  if (!p || Object.keys(p).length === 0) {
    p = { nome: 'Ricardo Silveira', email: 'r.silveira@darc-logistics.com', id: '4292', cargo: 'Operador Senior' };
    writeJson(PERFIL_FILE, p);
  }
  res.json(p);
});

app.post('/api/perfil', (req, res) => {
  const { nome, email } = req.body;
  if (!nome || !email) return res.status(400).json({ error: 'Campos ausentes' });
  let p = readJson(PERFIL_FILE, null);
  if (!p || Object.keys(p).length === 0) {
    p = { nome: 'Ricardo Silveira', email: 'r.silveira@darc-logistics.com', id: '4292', cargo: 'Operador Senior' };
  }
  p.nome = nome;
  p.email = email;
  writeJson(PERFIL_FILE, p);
  res.json(p);
});

app.listen(PORT, () => {
  console.log(`\nSet List rodando em http://localhost:${PORT}\n`);
});
