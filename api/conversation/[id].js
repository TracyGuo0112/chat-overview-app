const { queryConversationDetail } = require("../_lib/queries");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const conversationId = req.query.id;

  if (!conversationId) {
    return res.status(400).json({ error: "bad_request", message: "missing_conversation_id" });
  }

  try {
    const payload = await queryConversationDetail(conversationId);
    if (!payload) {
      return res.status(404).json({ error: "not_found", message: "conversation_not_found" });
    }
    res.status(200).json(payload);
  } catch (err) {
    console.error("[conversation] query failed", err);
    res.status(500).json({ error: "conversation_query_failed", message: err.message });
  }
};
