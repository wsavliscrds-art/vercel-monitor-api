const { getConfig, vercelFetch, listScopes, sendError } = require('../lib/vercel');

// Lista os deployments mais recentes de TODOS os scopes (pessoal + todos os times).
module.exports = async (req, res) => {
  try {
    const cfg = getConfig();
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    // Padrão: apenas os seus projetos (conta pessoal). ?scope=all inclui os times.
    const scopes = req.query.scope === 'all'
      ? await listScopes(cfg)
      : [{ teamId: cfg.teamId || null, name: cfg.teamId ? 'Team' : 'Pessoal' }];

    // Busca em paralelo em cada scope; um scope que falhar não derruba os demais.
    const perScope = await Promise.all(
      scopes.map((s) =>
        vercelFetch(`/v6/deployments?limit=${limit}`, cfg, s.teamId)
          .then((d) => (d.deployments || []).map((x) => ({ ...x, __scope: s.name })))
          .catch(() => [])
      )
    );

    let all = perScope.flat();
    all.sort((a, b) => (b.created || b.createdAt || 0) - (a.created || a.createdAt || 0));
    all = all.slice(0, limit);

    const deployments = all.map((d) => {
      const created = d.created || d.createdAt || null;
      const buildMs = d.ready && d.buildingAt && d.ready > d.buildingAt ? d.ready - d.buildingAt : null;
      return {
        uid: d.uid,
        name: d.name,
        url: d.url,
        state: d.readyState || d.state || 'UNKNOWN',
        target: d.target || null,
        source: d.source || null,
        scope: d.__scope,
        created,
        buildSeconds: buildMs ? Math.round(buildMs / 1000) : null,
        creator: d.creator ? d.creator.username : null,
        branch: d.meta ? d.meta.githubCommitRef || d.meta.gitBranch || null : null,
        commitMessage: d.meta ? d.meta.githubCommitMessage || null : null,
      };
    });

    res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30');
    res.status(200).json({
      count: deployments.length,
      scopes: scopes.map((s) => s.name),
      deployments,
    });
  } catch (e) {
    sendError(res, e);
  }
};
