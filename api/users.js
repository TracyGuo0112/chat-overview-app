const { queryUsers } = require("./_lib/queries");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const payload = await queryUsers(req.query || {});
    res.status(200).json(payload);
  } catch (err) {
    const statusCode = Number(err?.statusCode || 500);
    console.error("[users] query failed", err);
    res.status(statusCode).json({ error: "users_query_failed", message: err.message });
  }
};
