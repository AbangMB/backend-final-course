const { runQuery } = require("../../utils");

module.exports = {
  createRating: async (req, res) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Sihlakan login terlebih dahulu untuk memberi rating.",
        });
      }

      const { course_id, stars, comment } = req.body;

      if (!course_id || !stars) {
        return res.status(400).json({
          success: false,
          message: "course_id dan stars wajib diisi.",
        });
      }

      const courseId = parseInt(course_id, 10);
      const starValue = parseInt(stars, 10);

      if (isNaN(courseId) || isNaN(starValue)) {
        return res.status(400).json({
          success: false,
          message: "course_id dan stars harus berupa angka.",
        });
      }

      if (starValue < 1 || starValue > 5) {
        return res.status(400).json({
          success: false,
          message: "Nilai bintang harus di antara 1 sampai 5.",
        });
      }

      const course = await runQuery(
        "SELECT id FROM courses WHERE id = ? AND status = 'published' LIMIT 1",
        [courseId]
      );

      if (!course.length) {
        return res.status(404).json({
          success: false,
          message: "Course tidak ditemukan atau belum dipublikasikan.",
        });
      }

      const ownership = await runQuery(
        "SELECT id FROM course_ownerships WHERE user_id = ? AND course_id = ? LIMIT 1",
        [userId, courseId]
      );

      if (!ownership.length) {
        return res.status(403).json({
          success: false,
          message: "Kamu belum memiliki course ini Tidak dapat memberi rating.",
        });
      }

      const existing = await runQuery(
        "SELECT id FROM course_ratings WHERE user_id = ? AND course_id = ? LIMIT 1",
        [userId, courseId]
      );

      let ratingId;
      let isUpdate = false;

      if (existing.length) {
        ratingId = existing[0].id;
        await runQuery(
          "UPDATE course_ratings SET stars = ?, comment = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?",
          [starValue, comment || null, ratingId]
        );
        isUpdate = true;
      } else {
        const insertResult = await runQuery(
          "INSERT INTO course_ratings (user_id, course_id, stars, comment, is_approved) VALUES (?, ?, ?, ?, 1)",
          [userId, courseId, starValue, comment || null]
        );
        ratingId = insertResult.insertId;
      }

      const [rating] = await runQuery(
        `SELECT cr.id, cr.user_id, cr.course_id, cr.stars, cr.comment, cr.is_approved, cr.created_at
         FROM course_ratings cr
         WHERE cr.id = ?`,
        [ratingId]
      );

      return res.status(isUpdate ? 200 : 201).json({
        success: true,
        message: isUpdate
          ? "Rating berhasil diperbarui."
          : "Rating berhasil disimpan.",
        data: rating,
      });
    } catch (err) {
      console.error("createRating error:", err);
      return res.status(500).json({
        success: false,
        message: "Server Error.",
      });
    }
  },

  getCourseRatings: async (req, res) => {
    try {
      const { courseId } = req.params;
      const id = parseInt(courseId, 10);

      if (isNaN(id)) {
        return res.status(400).json({
          success: false,
          message: "courseId harus berupa angka.",
        });
      }

      const ratings = await runQuery(
        `SELECT cr.id,
                cr.stars,
                cr.comment,
                cr.created_at,
                u.name AS user_name
         FROM course_ratings cr
         JOIN users u ON u.id = cr.user_id
         WHERE cr.course_id = ? AND cr.is_approved = 1
         ORDER BY cr.created_at DESC`,
        [id]
      );

      const [summary] = await runQuery(
        `SELECT COUNT(*) AS total_ratings,
                COALESCE(AVG(stars), 0) AS avg_stars
         FROM course_ratings
         WHERE course_id = ? AND is_approved = 1`,
        [id]
      );

      return res.status(200).json({
        success: true,
        data: {
          course_id: id,
          summary: {
            total_ratings: summary.total_ratings,
            avg_stars: Number(summary.avg_stars),
          },
          ratings,
        },
      });
    } catch (err) {
      console.error("getCourseRatings error:", err);
      return res.status(500).json({
        success: false,
        message: "Terjadi kesalahan server saat mengambil data rating.",
      });
    }
  },
};