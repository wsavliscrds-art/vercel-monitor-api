// Helper compartilhado para falar com a API do Vercel.
// O token NUNCA fica no código — vem da variável de ambiente VERCEL_TOKEN.

const API = 'https://api.vercel.com';

function getConfig() {
  // Aceita os dois nomes de variável para evitar confusão na configuração.
  const token = process.env.VERCEL_TOKEN || process.env.VERCEL_API_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID || '';
  if (!token) {
    const err = new Error(
      'VERCEL_TOKEN (ou VERCEL_API_TOKEN) não configurado. Adicione o token nas variáveis de ambiente do projeto no Vercel.'
    );
    err.statusCode = 500;
    err.code = 'NO_TOKEN';
    throw err;
  }
  return { token, teamId };
}

// teamIdOverride: undefined = usa o padrão do cfg; null/'' = força scope pessoal;
// string = usa aquele time.
async function vercelFetch(path, cfg, teamIdOverride) {
  const url = new URL(API + path);
  const teamId = teamIdOverride !== undefined ? teamIdOverride : cfg.teamId;
  if (teamId && !url.searchParams.has('teamId')) {
    url.searchParams.set('teamId', teamId);
  }
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${cfg.token}` },
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg = (data && data.error && data.error.message) || `Vercel API respondeu ${res.status}`;
    const err = new Error(msg);
    err.statusCode = res.status;
    err.details = data && data.error ? data.error : data;
    throw err;
  }
  return data;
}

// Descobre todos os scopes acessíveis pelo token: conta pessoal + todos os Teams.
// Se VERCEL_TEAM_ID estiver definido, restringe só àquele time.
async function listScopes(cfg) {
  if (cfg.teamId) {
    return [{ teamId: cfg.teamId, name: 'Team' }];
  }
  const scopes = [{ teamId: null, name: 'Pessoal' }];
  try {
    const data = await vercelFetch('/v2/teams?limit=100', cfg, null);
    for (const t of data.teams || []) {
      scopes.push({ teamId: t.id, name: t.name || t.slug || t.id });
    }
  } catch {
    // Token sem permissão para listar teams — segue apenas com a conta pessoal.
  }
  return scopes;
}

function sendError(res, e) {
  const status = e.statusCode || 500;
  res.status(status).json({
    error: e.message || 'Erro interno',
    code: e.code || undefined,
    details: e.details || undefined,
  });
}

module.exports = { API, getConfig, vercelFetch, listScopes, sendError };
