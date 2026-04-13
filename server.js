const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3001;

// Configuration for data persistence
const DATA_DIR = process.env.DATA_DIR || __dirname;

// Ensure DATA_DIR exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const EQUIPAMENTOS_FILE = path.join(DATA_DIR, 'equipamentos.txt');
const REGISTROS_FILE    = path.join(DATA_DIR, 'registros.json');
const BLOQUEADOS_FILE   = path.join(DATA_DIR, 'bloqueados.json');
const PERFIL_FILE       = path.join(DATA_DIR, 'perfil.json');

// Initialize files if they don't exist
const initializeFile = (filePath, content = '[]') => {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`Initialized file: ${filePath}`);
  }
};

initializeFile(REGISTROS_FILE, '[]');
initializeFile(BLOQUEADOS_FILE, '[]');
initializeFile(PERFIL_FILE, '{}');
if (!fs.existsSync(EQUIPAMENTOS_FILE)) {
  // If equipamentos.txt doesn't exist in DATA_DIR, try to copy it from root if root is different
  const rootEquipamentos = path.join(__dirname, 'equipamentos.txt');
  if (DATA_DIR !== __dirname && fs.existsSync(rootEquipamentos)) {
    fs.copyFileSync(rootEquipamentos, EQUIPAMENTOS_FILE);
  } else if (!fs.existsSync(EQUIPAMENTOS_FILE)) {
    fs.writeFileSync(EQUIPAMENTOS_FILE, '[GERAL]\nEquipamento Exemplo', 'utf-8');
  }
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function readJson(file, fallback = []) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const content = fs.readFileSync(file, 'utf-8');
    return content ? JSON.parse(content) : fallback;
  } catch (err) {
    console.error(`Erro ao ler arquivo ${file}:`, err.message);
    return fallback;
  }
}

function writeJson(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`ERRO CRÍTICO ao gravar arquivo ${file}:`, err.message);
    if (err.code === 'EACCES' || err.code === 'EPERM') {
      console.error(`DICA: O servidor não tem permissão para escrever em ${file}. Verifique o Host Path no Easypanel.`);
    }
  }
}

// Write test on startup
try {
  const testFile = path.join(DATA_DIR, '.write_test');
  fs.writeFileSync(testFile, 'ok');
  fs.unlinkSync(testFile);
  console.log(`Sucesso: Pasta de dados ${DATA_DIR} é gravável.`);
} catch (err) {
  console.error(`ERRO DE PERMISSÃO: Não foi possível escrever na pasta ${DATA_DIR}:`, err.message);
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
