const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3001;

// Configuration for data persistence
const DATA_DIR = process.env.DATA_DIR || __dirname;

const USERS_FILE        = path.join(DATA_DIR, 'users.json');

// Initialize files if they don't exist
const initializeFile = (filePath, content = '[]') => {
  if (!fs.existsSync(filePath)) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`Initialized file: ${filePath}`);
  }
};

initializeFile(USERS_FILE, '[]');

// Helper to get user-specific directory and files
function getUserPath(userId, fileName) {
  const userDir = path.join(DATA_DIR, 'users', userId);
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
    // Initialize user files from templates if they don't exist
    const defaultEquip = path.join(__dirname, 'equipamentos.txt');
    if (fs.existsSync(defaultEquip)) {
      fs.copyFileSync(defaultEquip, path.join(userDir, 'equipamentos.txt'));
    }
  }
  const filePath = path.join(userDir, fileName);
  if (!fs.existsSync(filePath)) {
    const defaultContent = fileName.endsWith('.json') ? '[]' : '';
    fs.writeFileSync(filePath, defaultContent);
  }
  return filePath;
}

// Simple authentication middleware
function authenticate(req, res, next) {
  const userId = req.headers['user-id'];
  if (!userId) return res.status(401).json({ error: 'Não autenticado' });
  req.userId = userId;
  next();
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

// ── Authentication ───────────────────────────────────────────
app.post('/api/auth/register', (req, res) => {
  const { nome, email, password } = req.body;
  if (!nome || !email || !password) return res.status(400).json({ error: 'Dados incompletos' });

  const users = readJson(USERS_FILE);
  if (users.find(u => u.email === email)) return res.status(409).json({ error: 'Email já cadastrado' });

  const newUser = {
    id: crypto.randomUUID(),
    nome,
    email,
    password: crypto.createHash('sha256').update(password).digest('hex'),
    cargo: 'Membro',
    criadoEm: new Date().toISOString()
  };

  users.push(newUser);
  writeJson(USERS_FILE, users);

  // Initialize profile for the new user
  const userPerfilFile = getUserPath(newUser.id, 'perfil.json');
  writeJson(userPerfilFile, { nome: newUser.nome, email: newUser.email, id: newUser.id.slice(0,4), cargo: newUser.cargo });

  res.json({ id: newUser.id, nome: newUser.nome, email: newUser.email });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const users = readJson(USERS_FILE);
  const hash = crypto.createHash('sha256').update(password).digest('hex');
  const user = users.find(u => u.email === email && u.password === hash);

  if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });
  res.json({ id: user.id, nome: user.nome, email: user.email });
});

// ── Equipamentos ─────────────────────────────────────────────
app.get('/api/equipamentos', authenticate, (req, res) => {
  try {
    const file = getUserPath(req.userId, 'equipamentos.txt');
    const content = fs.readFileSync(file, 'utf-8');
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

app.post('/api/equipamentos', authenticate, (req, res) => {
  try {
    const data = req.body;
    if (!Array.isArray(data)) return res.status(400).json({ error: 'Formato inválido' });

    let content = "# Lista de equipamentos - Set List\n";
    content += "# Editado via interface em " + new Date().toLocaleString('pt-BR') + "\n\n";

    data.forEach(cat => {
      if (!cat.categoria || !Array.isArray(cat.itens)) return;
      content += `[${cat.categoria.trim()}]\n`;
      cat.itens.forEach(item => {
        if (item && item.trim()) content += `${item.trim()}\n`;
      });
      content += "\n";
    });

    const file = getUserPath(req.userId, 'equipamentos.txt');
    fs.writeFileSync(file, content, 'utf-8');
    res.json({ ok: true });
  } catch (e) {
    console.error('Erro ao salvar equipamentos:', e);
    res.status(500).json({ error: 'Erro ao salvar equipamentos.txt' });
  }
});

// ── Bloqueados ─────────────────────────────────────────────────
app.get('/api/bloqueados', authenticate, (req, res) => {
  const file = getUserPath(req.userId, 'bloqueados.json');
  res.json(readJson(file));
});

app.post('/api/bloqueados', authenticate, (req, res) => {
  const { equipamento, cliente, tipo, dataInicio, observacao } = req.body;
  if (!equipamento || !tipo || !dataInicio) {
    return res.status(400).json({ error: 'Campos obrigatórios ausentes' });
  }
  const file = getUserPath(req.userId, 'bloqueados.json');
  const bloqueados = readJson(file);
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
  writeJson(file, bloqueados);
  res.json(novo);
});

app.delete('/api/bloqueados/:id', authenticate, (req, res) => {
  try {
    const file = getUserPath(req.userId, 'bloqueados.json');
    let bloqueados = readJson(file);
    bloqueados = bloqueados.filter(a => a.id !== req.params.id);
    writeJson(file, bloqueados);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Erro ao remover bloqueio' });
  }
});

// ── Registros ─────────────────────────────────────────────────
app.get('/api/registros', authenticate, (req, res) => {
  const file = getUserPath(req.userId, 'registros.json');
  res.json(readJson(file));
});

app.post('/api/registros', authenticate, (req, res) => {
  const { data, cliente, equipe, equipamentos, status, observacoes } = req.body;
  if (!data || !cliente || !equipe || !equipamentos) {
    return res.status(400).json({ error: 'Campos obrigatórios ausentes' });
  }
  const file = getUserPath(req.userId, 'registros.json');
  const registros = readJson(file);
  const novo = {
    id: crypto.randomUUID(),
    data,
    cliente,
    equipe,
    equipamentos,
    status: status || 'em-producao',
    observacoes: observacoes || '',
    criadoEm: new Date().toISOString()
  };
  registros.unshift(novo);
  writeJson(file, registros);
  res.json(novo);
});

app.delete('/api/registros/:id', authenticate, (req, res) => {
  try {
    const file = getUserPath(req.userId, 'registros.json');
    let registros = readJson(file);
    registros = registros.filter(r => r.id !== req.params.id);
    writeJson(file, registros);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Erro ao excluir registro' });
  }
});

app.patch('/api/registros/:id', authenticate, (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['pre-producao', 'em-producao', 'finalizado'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Status inválido' });
    const file = getUserPath(req.userId, 'registros.json');
    let registros = readJson(file);
    const idx = registros.findIndex(r => r.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Não encontrado' });
    registros[idx].status = status;
    writeJson(file, registros);
    res.json(registros[idx]);
  } catch {
    res.status(500).json({ error: 'Erro ao atualizar status' });
  }
});

// ── Perfil ────────────────────────────────────────────────────
app.get('/api/perfil', authenticate, (req, res) => {
  const file = getUserPath(req.userId, 'perfil.json');
  let p = readJson(file, null);
  if (!p || Object.keys(p).length === 0) {
    // Should have been initialized in register, but fallback here
    p = { nome: 'Usuário', email: '', id: req.userId.slice(0,4), cargo: 'Membro' };
    writeJson(file, p);
  }
  res.json(p);
});

app.post('/api/perfil', authenticate, (req, res) => {
  const { nome, email } = req.body;
  if (!nome || !email) return res.status(400).json({ error: 'Campos ausentes' });
  const file = getUserPath(req.userId, 'perfil.json');
  let p = readJson(file, null);
  p.nome = nome;
  p.email = email;
  writeJson(file, p);
  res.json(p);
});

// Health check endpoint for Easypanel/Monitoring
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\nSet List rodando em http://0.0.0.0:${PORT}\n`);
});

// Signal handling for graceful shutdown and debugging
process.on('SIGTERM', () => {
  console.log('Sinal SIGTERM recebido. Encerrando servidor...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Sinal SIGINT recebido. Encerrando servidor...');
  process.exit(0);
});
