const { getConfig, vercelFetch, sendError } = require('../lib/vercel');

// Visão geral agregada: usuário, totais e estados dos deployments.
module.exports = async (req, res) => {
  try {
    const cfg = getConfig();
    const [user, projects, deployments] = await Promise.all([
      vercelFetch('/v2/user', cfg).catch(() => null),
      vercelFetch('/v9/projects?limit=100', cfg),
      vercelFetch('/v6/deployments?limit=100', cfg),
    ]);

    const deps = deployments.deployments || [];
    const byState = {};
    let totalBuildMs = 0;
    let buildsCounted = 0;
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    let last24h = 0;
    let last7d = 0;

    for (const d of deps) {
      const st = d.readyState || d.state || 'UNKNOWN';
      byState[st] = (byState[st] || 0) + 1;
      if (d.ready && d.buildingAt && d.ready > d.buildingAt) {
        totalBuildMs += d.ready - d.buildingAt;
        buildsCounted++;
      }
      const t = d.created || d.createdAt;
      if (t) {
        if (now - t <= DAY) last24h++;
        if (now - t <= 7 * DAY) last7d++;
      }
    }

    res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30');
    res.status(200).json({
      user: user && user.user
        ? { username: user.user.username, email: user.user.email, name: user.user.name }
        : null,
      totals: {
        projects: (projects.projects || []).length,
        deployments: deps.length,
        deploymentsLast24h: last24h,
        deploymentsLast7d: last7d,
        avgBuildSeconds: buildsCounted ? Math.round(totalBuildMs / buildsCounted / 1000) : null,
      },
      deploymentStates: byState,
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    sendError(res, e);
  }
};
