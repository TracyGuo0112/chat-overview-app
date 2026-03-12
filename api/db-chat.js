const { runDbChatQuery } = require("./_lib/queries");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed", message: "use_POST" });
  }

  // Vercel 自动解析 application/json body，直接使用 req.body
  const message = req.body?.message || "";

  try {
    const payload = await runDbChatQuery(message);
    res.status(200).json(payload);
  } catch (err) {
    console.error("[db-chat] query failed", err);
    res.status(500).json({
      error: "db_chat_failed",
      answer: `查询失败：${err.message || "unknown_error"}`,
    });
  }
};
