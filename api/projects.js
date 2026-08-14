const { getConfig, vercelFetch, listScopes, sendError } = require('../lib/vercel');

// Lista todos os projetos de TODOS os scopes (pessoal + todos os times).
module.exports = async (req, res) => {
  try {
    const cfg = getConfig();
    // Padrão: apenas os seus projetos (conta pessoal). ?scope=all inclui os times.
    const scopes = req.query.scope === 'all'
      ? await listScopes(cfg)
      : [{ teamId: cfg.teamId || null, name: cfg.teamId ? 'Team' : 'Pessoal' }];

    const perScope = await Promise.all(
      scopes.map((s) =>
        vercelFetch('/v9/projects?limit=100', cfg, s.teamId)
          .then((d) => (d.projects || []).map((p) => ({ ...p, __scope: s.name })))
          .catch(() => [])
      )
    );

    const projects = perScope.flat().map((p) => {
      const latest = p.latestDeployments && p.latestDeployments[0];
      return {
        id: p.id,
        name: p.name,
        scope: p.__scope,
        framework: p.framework || null,
        createdAt: p.createdAt || null,
        updatedAt: p.updatedAt || null,
        latestDeployment: latest
          ? {
              state: latest.readyState || latest.state || 'UNKNOWN',
              url: latest.url || (latest.alias && latest.alias[0]) || null,
              createdAt: latest.createdAt || latest.created || null,
              target: latest.target || null,
            }
          : null,
      };
    });

    res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30');
    res.status(200).json({
      count: projects.length,
      scopes: scopes.map((s) => s.name),
      projects,
    });
  } catch (e) {
    sendError(res, e);
  }
};
