const { queryOverview } = require("./_lib/queries");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const payload = await queryOverview(req.query || {});
    res.status(200).json(payload);
  } catch (err) {
    const statusCode = Number(err?.statusCode || 500);
    console.error("[overview] query failed", err);
    res.status(statusCode).json({ error: "overview_query_failed", message: err.message });
  }
};
