// Helper compartilhado para falar com a API do Vercel.
// O token NUNCA fica no código — vem da variável de ambiente VERCEL_TOKEN.

const API = 'https://api.vercel.com';

function getConfig() {
  const token = process.env.VERCEL_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID || '';
  if (!token) {
    const err = new Error(
      'VERCEL_TOKEN não configurado. Adicione o token nas variáveis de ambiente do projeto no Vercel.'
    );
    err.statusCode = 500;
    err.code = 'NO_TOKEN';
    throw err;
  }
  return { token, teamId };
}

async function vercelFetch(path, cfg) {
  const url = new URL(API + path);
  if (cfg.teamId && !url.searchParams.has('teamId')) {
    url.searchParams.set('teamId', cfg.teamId);
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

function sendError(res, e) {
  const status = e.statusCode || 500;
  res.status(status).json({
    error: e.message || 'Erro interno',
    code: e.code || undefined,
    details: e.details || undefined,
  });
}

module.exports = { API, getConfig, vercelFetch, sendError };
