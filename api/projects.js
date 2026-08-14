const { getConfig, vercelFetch, sendError } = require('../lib/vercel');

// Lista todos os projetos com o estado do deployment mais recente.
module.exports = async (req, res) => {
  try {
    const cfg = getConfig();
    const data = await vercelFetch('/v9/projects?limit=100', cfg);
    const projects = (data.projects || []).map((p) => {
      const latest = p.latestDeployments && p.latestDeployments[0];
      return {
        id: p.id,
        name: p.name,
        framework: p.framework || null,
        createdAt: p.createdAt || null,
        updatedAt: p.updatedAt || null,
        nodeVersion: p.nodeVersion || null,
        latestDeployment: latest
          ? {
              state: latest.readyState || latest.state || 'UNKNOWN',
              url: latest.url || latest.alias?.[0] || null,
              createdAt: latest.createdAt || latest.created || null,
              target: latest.target || null,
            }
          : null,
      };
    });

    res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30');
    res.status(200).json({ count: projects.length, projects });
  } catch (e) {
    sendError(res, e);
  }
};
