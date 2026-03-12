const { queryOverview } = require("./_lib/queries");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const payload = await queryOverview(req.query || {});
    res.status(200).json(payload);
  } catch (err) {
    console.error("[overview] query failed", err);
    res.status(500).json({ error: "overview_query_failed", message: err.message });
  }
};
