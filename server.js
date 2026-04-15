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

app.post('/api/perfil/avatar', authenticate, (req, res) => {
  try {
    const { image } = req.body; // Expecting base64 string
    if (!image) return res.status(400).json({ error: 'Nenhuma imagem enviada' });

    // Extract base64 data
    const matches = image.match(/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) return res.status(400).json({ error: 'Formato de imagem inválido' });
    
    const buffer = Buffer.from(matches[2], 'base64');
    const filePath = getUserPath(req.userId, 'avatar.jpg');
    
    fs.writeFileSync(filePath, buffer);
    res.json({ ok: true, url: `/api/perfil/avatar/${req.userId}?t=${Date.now()}` });
  } catch (e) {
    console.error('Erro ao salvar avatar:', e);
    res.status(500).json({ error: 'Erro ao processar imagem' });
  }
});

app.get('/api/perfil/avatar/:userId', (req, res) => {
  const userId = req.params.userId;
  const filePath = path.join(DATA_DIR, 'users', userId, 'avatar.jpg');
  
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    // Default neutral avatar
    res.redirect('https://ui-avatars.com/api/?name=User&background=777&color=fff');
  }
});

// ── Public View (Phase 5) ────────────────────────────────────
app.get('/view/:userId/:recordId', (req, res) => {
  try {
    const { userId, recordId } = req.params;
    const file = getUserPath(userId, 'registros.json');
    const registros = readJson(file);
    const item = registros.find(r => r.id === recordId);

    if (!item) {
      return res.status(404).send(`
        <html>
          <head><title>Não encontrado - Set List</title><meta name="viewport" content="width=device-width, initial-scale=1"></head>
          <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f4f4f4;">
            <div style="text-align: center; padding: 2rem; background: white; border-radius: 1rem; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              <h1>Produção não encontrada</h1>
              <p>O link pode ter expirado ou estar incorreto.</p>
            </div>
          </body>
        </html>
      `);
    }

    const formatDate = (d) => new Date(d).toLocaleDateString('pt-BR', { dateStyle: 'long' });

    res.send(`
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Set List - ${item.cliente}</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Inter:wght@400;500;600;700&display=swap">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" />
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { font-family: 'Inter', sans-serif; background-color: #fcfcfc; color: #1a1c1c; }
    .font-headline { font-family: 'Space Grotesk', sans-serif; }
    .status-badge { padding: 4px 12px; border-radius: 99px; text-transform: uppercase; font-size: 10px; font-weight: 800; letter-spacing: 0.1em; }
    .pre-producao { background: #e0f2fe; color: #0369a1; }
    .em-producao { background: #fef9c3; color: #854d0e; }
    .finalizado { background: #dcfce7; color: #15803d; }
  </style>
</head>
<body class="p-6 md:p-12">
  <div class="max-w-2xl mx-auto bg-white rounded-[2rem] shadow-[0_32px_64px_rgba(0,0,0,0.06)] border border-stone-100 overflow-hidden">
    <header class="bg-stone-50 p-8 md:p-12 border-b border-stone-100">
      <div class="flex items-center gap-3 mb-8">
        <span class="material-symbols-outlined text-yellow-600 text-3xl">camera</span>
        <h1 class="font-headline tracking-tighter font-bold text-2xl uppercase">SET LIST</h1>
      </div>
      
      <div class="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <span class="status-badge ${item.status || 'pre-producao'} mb-3 inline-block">
            ${(item.status || 'PRE-PRODUCAO').replace('-', ' ')}
          </span>
          <h2 class="font-headline text-4xl font-bold tracking-tight text-stone-900 uppercase">${item.cliente}</h2>
          <div class="flex items-center gap-2 text-stone-500 mt-2 font-medium">
            <span class="material-symbols-outlined text-sm">calendar_today</span>
            <span>${formatDate(item.data)}</span>
          </div>
        </div>
      </div>
    </header>

    <div class="p-8 md:p-12 space-y-10">
      <!-- Equipe -->
      <section>
        <div class="flex items-center gap-2 mb-4">
          <span class="material-symbols-outlined text-stone-400 text-lg">group</span>
          <h3 class="font-black text-xs uppercase tracking-[0.2em] text-stone-400">EQUIPE TÉCNICA</h3>
        </div>
        <div class="flex flex-wrap gap-2">
          ${item.equipe.map(m => `
            <span class="bg-stone-100 px-4 py-2 rounded-xl text-sm font-bold text-stone-700">${m}</span>
          `).join('')}
        </div>
      </section>

      <!-- Equipamentos -->
      <section>
        <div class="flex items-center gap-2 mb-4">
          <span class="material-symbols-outlined text-stone-400 text-lg">inventory_2</span>
          <h3 class="font-black text-xs uppercase tracking-[0.2em] text-stone-400">EQUIPAMENTOS</h3>
        </div>
        <div class="grid grid-cols-1 gap-2">
          ${item.equipamentos.map(e => `
            <div class="flex items-center gap-3 bg-stone-50/50 p-4 rounded-xl border border-stone-100/50">
              <span class="material-symbols-outlined text-stone-300 text-lg">label</span>
              <span class="font-medium text-stone-800">${e}</span>
            </div>
          `).join('')}
        </div>
      </section>

      ${item.observacoes ? `
      <section>
        <div class="flex items-center gap-2 mb-4">
          <span class="material-symbols-outlined text-stone-400 text-lg">notes</span>
          <h3 class="font-black text-xs uppercase tracking-[0.2em] text-stone-400">OBSERVAÇÕES</h3>
        </div>
        <p class="text-stone-600 bg-stone-50 p-6 rounded-2xl italic leading-relaxed border-l-4 border-yellow-500/20">${item.observacoes}</p>
      </section>
      ` : ''}
    </div>

    <footer class="bg-stone-900 p-8 text-center">
      <p class="text-stone-500 text-[10px] font-bold uppercase tracking-widest">&copy; 2026 SET LIST • PIXEL.CO</p>
    </footer>
  </div>
</body>
</html>
    `);
  } catch (e) {
    res.status(500).send('Erro interno');
  }
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
