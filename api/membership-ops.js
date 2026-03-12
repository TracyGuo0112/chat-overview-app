const { queryMembershipOps } = require("./_lib/queries");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const payload = await queryMembershipOps(req.query || {});
    res.status(200).json(payload);
  } catch (err) {
    const statusCode = Number(err?.statusCode || 500);
    console.error("[membership-ops] query failed", err);
    res.status(statusCode).json({
      error: "membership_ops_query_failed",
      message: err.message || "membership_ops_query_failed",
    });
  }
};
