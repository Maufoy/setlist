const fs = require('fs');

if (fs.existsSync('alugados.json') && !fs.existsSync('bloqueados.json')) {
  try {
    let alugados = JSON.parse(fs.readFileSync('alugados.json'));
    // Map existing rented items to the new format with type "alugado"
    let bloqueados = alugados.map(a => ({
      ...a,
      tipo: 'alugado'
    }));
    fs.writeFileSync('bloqueados.json', JSON.stringify(bloqueados, null, 2));
    console.log('Migrated alugados.json to bloqueados.json');
  } catch(e) {
    console.error('Error migrating', e);
  }
}
