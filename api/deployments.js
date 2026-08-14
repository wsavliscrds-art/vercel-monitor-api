const { getConfig, vercelFetch, sendError } = require('../lib/vercel');

// Lista os deployments mais recentes (opcionalmente filtrando por projectId).
module.exports = async (req, res) => {
  try {
    const cfg = getConfig();
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
    const projectId = req.query.projectId;

    let path = `/v6/deployments?limit=${limit}`;
    if (projectId) path += `&projectId=${encodeURIComponent(projectId)}`;

    const data = await vercelFetch(path, cfg);
    const deployments = (data.deployments || []).map((d) => {
      const created = d.created || d.createdAt || null;
      const buildMs = d.ready && d.buildingAt && d.ready > d.buildingAt ? d.ready - d.buildingAt : null;
      return {
        uid: d.uid,
        name: d.name,
        url: d.url,
        state: d.readyState || d.state || 'UNKNOWN',
        target: d.target || null,
        source: d.source || null,
        created,
        buildSeconds: buildMs ? Math.round(buildMs / 1000) : null,
        creator: d.creator ? d.creator.username : null,
        branch: d.meta ? d.meta.githubCommitRef || d.meta.gitBranch || null : null,
        commitMessage: d.meta ? d.meta.githubCommitMessage || null : null,
      };
    });

    res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30');
    res.status(200).json({ count: deployments.length, deployments });
  } catch (e) {
    sendError(res, e);
  }
};
