const { runQuery } = require("../../utils");

// Helper untuk dapat cart aktif user / buat baru
const getActiveCartId = async (userId) => {
  const cart = await runQuery(
    `SELECT id FROM course_carts WHERE user_id = ? AND status = 'active' LIMIT 1`,
    [userId]
  );

  if (cart.length) return cart[0].id;

  const created = await runQuery(
    `INSERT INTO course_carts (user_id, status) VALUES (?, 'active')`,
    [userId]
  );

  return created.insertId;
};

module.exports = {
  // ✅ GET CART
  getCart: async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

      const cartId = await getActiveCartId(userId);

      const items = await runQuery(
        `SELECT 
          cci.course_id,
          c.title,
          c.thumbnail_url,
          c.price_int,
          cci.created_at
        FROM course_cart_items cci
        JOIN courses c ON c.id = cci.course_id
        WHERE cci.cart_id = ?`,
        [cartId]
      );

      const total = items.reduce((sum, item) => sum + item.price_int, 0);

      return res.status(200).json({
        success: true,
        message: "Cart berhasil diambil",
        data: { cart_id: cartId, items, total }
      });
    } catch (err) {
      console.error("getCart error:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  },

  // ✅ ADD TO CART
  addToCart: async (req, res) => {
    try {
      const userId = req.user?.id;
      const { course_id } = req.body;

      if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
      if (!course_id) return res.status(400).json({ success: false, message: "course_id wajib diisi" });

      const cartId = await getActiveCartId(userId);

      // Cek apakah user sudah punya course
      const owned = await runQuery(
        `SELECT id FROM course_ownerships WHERE user_id = ? AND course_id = ?`,
        [userId, course_id]
      );
      if (owned.length) {
        return res.status(400).json({ success: false, message: "Course ini sudah kamu punya" });
      }

      // Cek apakah course sudah ada di cart
      const exist = await runQuery(
        `SELECT id FROM course_cart_items WHERE cart_id = ? AND course_id = ?`,
        [cartId, course_id]
      );
      if (exist.length) {
        return res.status(400).json({ success: false, message: "Course sudah ada di cart" });
      }

      // Ambil harga course
      const priceData = await runQuery(`SELECT price_int FROM courses WHERE id = ?`, [course_id]);
      if (!priceData.length) {
        return res.status(404).json({ success: false, message: "Course tidak ditemukan" });
      }

      await runQuery(
        `INSERT INTO course_cart_items (cart_id, course_id, price_int) VALUES (?, ?, ?)`,
        [cartId, course_id, priceData[0].price_int]
      );

      return res.status(201).json({
        success: true,
        message: "Course ditambahkan ke cart"
      });
    } catch (err) {
      console.error("addToCart error:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  },

  // ✅ REMOVE FROM CART
  removeFromCart: async (req, res) => {
    try {
      const userId = req.user?.id;
      const { course_id } = req.params;

      if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

      const cartId = await getActiveCartId(userId);

      await runQuery(
        `DELETE FROM course_cart_items WHERE cart_id = ? AND course_id = ?`,
        [cartId, course_id]
      );

      return res.status(200).json({
        success: true,
        message: "Course dihapus dari cart"
      });
    } catch (err) {
      console.error("removeFromCart error:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  },

  // ✅ CLEAR CART
  clearCart: async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

      const cartId = await getActiveCartId(userId);

      await runQuery(`DELETE FROM course_cart_items WHERE cart_id = ?`, [cartId]);

      return res.status(200).json({
        success: true,
        message: "Cart dikosongkan"
      });
    } catch (err) {
      console.error("clearCart error:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  },

  // ✅ COUNT CART ITEMS
  getCartCount: async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

      const cartId = await getActiveCartId(userId);

      const count = await runQuery(
        `SELECT COUNT(*) AS count FROM course_cart_items WHERE cart_id = ?`,
        [cartId]
      );

      return res.status(200).json({
        success: true,
        count: count[0].count
      });
    } catch (err) {
      console.error("getCartCount error:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
};
