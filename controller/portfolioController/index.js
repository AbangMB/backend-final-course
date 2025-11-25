const { runQuery } = require("../../utils");

module.exports = {
  getPortfolios: async (req, res) => {
    try {
      const portfolios = await runQuery(
        `SELECT p.id,
                p.title,
                p.slug,
                p.cover_url,
                p.published_at,
                u.name AS author_name
         FROM portfolios p
         JOIN users u ON u.id = p.user_id
         WHERE p.published_at IS NOT NULL
         ORDER BY p.published_at DESC`
      );

      return res.status(200).json({
        success: true,
        data: portfolios,
      });
    } catch (err) {
      console.error("getPortfolios error:", err);
      return res.status(500).json({
        success: false,
        message: "Server Error.",
      });
    }
  },

  getPortfolioDetail: async (req, res) => {
    try {
      const { slug } = req.params;

      if (!slug) {
        return res.status(400).json({
          success: false,
          message: "Slug wajib diisi.",
        });
      }

      const rows = await runQuery(
        `SELECT p.id,
                p.title,
                p.slug,
                p.cover_url,
                p.description_md,
                p.published_at,
                u.name AS author_name
         FROM portfolios p
         JOIN users u ON u.id = p.user_id
         WHERE p.slug = ? AND p.published_at IS NOT NULL
         LIMIT 1`,
        [slug]
      );

      if (!rows.length) {
        return res.status(404).json({
          success: false,
          message: "Portfolio tidak ditemukan.",
        });
      }

      return res.status(200).json({
        success: true,
        data: rows[0],
      });
    } catch (err) {
      console.error("getPortfolioDetail error:", err);
      return res.status(500).json({
        success: false,
        message: "Server Error.",
      });
    }
  },
};