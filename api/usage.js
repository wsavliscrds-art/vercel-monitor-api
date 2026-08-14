const { getConfig, listScopes, fetchDeployments, sendError } = require('../lib/vercel');

// Consumo por projeto no período: minutos de build, nº de deploys, taxa de erro,
// última atividade — e sinaliza quais projetos precisam de atenção.
//
// Observação: a API pessoal da Vercel não expõe banda/edge-requests por projeto.
// Usamos minutos de build + atividade de deploy como proxy real de consumo.
module.exports = async (req, res) => {
  try {
    const cfg = getConfig();
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 90);
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    const scopes = req.query.scope === 'all'
      ? await listScopes(cfg)
      : [{ teamId: cfg.teamId || null, name: cfg.teamId ? 'Team' : 'Pessoal' }];

    const perScope = await Promise.all(
      scopes.map((s) => fetchDeployments(cfg, s.teamId, 300).catch(() => []))
    );
    const deps = perScope.flat().filter((d) => (d.created || d.createdAt || 0) >= since);

    const map = {};
    for (const d of deps) {
      const name = d.name || 'desconhecido';
      const st = (d.readyState || d.state || '').toUpperCase();
      const buildMs = d.ready && d.buildingAt && d.ready > d.buildingAt ? d.ready - d.buildingAt : 0;
      const t = d.created || d.createdAt || 0;
      const p = map[name] || (map[name] = { name, deploys: 0, ready: 0, errors: 0, buildMs: 0, last: 0 });
      p.deploys++;
      if (st === 'READY') p.ready++;
      if (st === 'ERROR') p.errors++;
      p.buildMs += buildMs;
      if (t > p.last) p.last = t;
    }

    const projects = Object.values(map).map((p) => ({
      name: p.name,
      deploys: p.deploys,
      ready: p.ready,
      errors: p.errors,
      errorRate: p.deploys ? Math.round((p.errors / p.deploys) * 100) : 0,
      buildMinutes: Math.round((p.buildMs / 60000) * 10) / 10,
      avgBuildSeconds: p.deploys ? Math.round(p.buildMs / p.deploys / 1000) : 0,
      lastDeploy: p.last || null,
    }));

    const maxBuild = Math.max(1, ...projects.map((p) => p.buildMinutes));
    for (const p of projects) {
      p.buildShare = Math.round((p.buildMinutes / maxBuild) * 100);
      p.reasons = [];
      if (p.deploys >= 3 && p.errorRate >= 30) p.reasons.push(`taxa de erro alta (${p.errorRate}%)`);
      else if (p.errors >= 5) p.reasons.push(`${p.errors} deploys com erro`);
      if (p.avgBuildSeconds >= 180) p.reasons.push(`build lento (${p.avgBuildSeconds}s em média)`);
      p.attention = p.reasons.length > 0;
    }
    projects.sort((a, b) => b.buildMinutes - a.buildMinutes || b.deploys - a.deploys);
    if (projects.length) projects[0].topConsumer = true;

    const totalReady = projects.reduce((s, p) => s + p.ready, 0);
    const totalErrors = projects.reduce((s, p) => s + p.errors, 0);
    const finished = totalReady + totalErrors;

    // ---- Análise temporal (série diária) + percentis de build + DORA ----
    const DAY_MS = 24 * 60 * 60 * 1000;
    const startDay = new Date(since);
    startDay.setUTCHours(0, 0, 0, 0);
    const dayKey = (t) => new Date(t).toISOString().slice(0, 10);
    const bucket = {};
    const buildSamples = [];
    for (const d of deps) {
      const st = (d.readyState || d.state || '').toUpperCase();
      const t = d.created || d.createdAt || 0;
      const buildS = d.ready && d.buildingAt && d.ready > d.buildingAt
        ? (d.ready - d.buildingAt) / 1000 : null;
      const k = dayKey(t);
      const b = bucket[k] || (bucket[k] = { total: 0, ready: 0, error: 0, buildMs: 0, buildN: 0 });
      b.total++;
      if (st === 'READY') b.ready++;
      if (st === 'ERROR') b.error++;
      if (buildS != null) { b.buildMs += buildS; b.buildN++; buildSamples.push(buildS); }
    }
    const daily = [];
    for (let ts = startDay.getTime(); ts <= Date.now(); ts += DAY_MS) {
      const k = dayKey(ts);
      const b = bucket[k] || { total: 0, ready: 0, error: 0, buildMs: 0, buildN: 0 };
      const dt = new Date(ts);
      daily.push({
        date: k,
        label: `${String(dt.getUTCDate()).padStart(2, '0')}/${String(dt.getUTCMonth() + 1).padStart(2, '0')}`,
        total: b.total,
        ready: b.ready,
        error: b.error,
        avgBuildSeconds: b.buildN ? Math.round(b.buildMs / b.buildN) : 0,
      });
    }

    buildSamples.sort((a, b) => a - b);
    const pct = (p) => (buildSamples.length
      ? Math.round(buildSamples[Math.min(buildSamples.length - 1, Math.floor((p / 100) * buildSamples.length))])
      : 0);
    const build = {
      p50: pct(50),
      p95: pct(95),
      p99: pct(99),
      avg: buildSamples.length ? Math.round(buildSamples.reduce((s, v) => s + v, 0) / buildSamples.length) : 0,
      slowest: buildSamples.length ? Math.round(buildSamples[buildSamples.length - 1]) : 0,
    };
    const dora = {
      deploysPerDay: Math.round((deps.length / days) * 10) / 10,
      changeFailureRate: finished ? Math.round((totalErrors / finished) * 100) : 0,
    };

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    res.status(200).json({
      days,
      scopes: scopes.map((s) => s.name),
      totals: {
        projects: projects.length,
        deploys: deps.length,
        buildMinutes: Math.round(projects.reduce((s, p) => s + p.buildMinutes, 0) * 10) / 10,
        errors: totalErrors,
        successRate: finished ? Math.round((totalReady / finished) * 100) : 0,
        attention: projects.filter((p) => p.attention).length,
      },
      daily,
      build,
      dora,
      projects,
    });
  } catch (e) {
    sendError(res, e);
  }
};
