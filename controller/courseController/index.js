const { runQuery } = require("../../utils");

module.exports = {
  // ======================================================
  // PUBLIC ENDPOINTS
  // ======================================================

  // GET /api/courses
  getCourses: async (req, res) => {
    const {
      page = 1,
      limit = 10,
      search = "",
      category_id,
      level,
      sort_by = "newest",
    } = req.query;

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;
    const offset = (pageNum - 1) * limitNum;

    try {
      let baseQuery = `
        FROM courses c
        LEFT JOIN course_ratings r 
          ON c.id = r.course_id AND r.is_approved = 1
        LEFT JOIN course_comments cm 
          ON c.id = cm.course_id
        WHERE c.status = 'published'
      `;

      const params = [];
      const countParams = [];

      if (search) {
        baseQuery += ` AND (c.title LIKE ? OR c.slug LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`);
        countParams.push(`%${search}%`, `%${search}%`);
      }

      if (category_id) {
        baseQuery += `
          AND c.id IN (
            SELECT course_id 
            FROM course_category_map 
            WHERE category_id = ?
          )
        `;
        params.push(category_id);
        countParams.push(category_id);
      }

      if (level) {
        baseQuery += ` AND c.level = ?`;
        params.push(level);
        countParams.push(level);
      }

      let orderBy = "c.created_at DESC";
      if (sort_by === "price-asc") orderBy = "c.price_int ASC";
      if (sort_by === "price-desc") orderBy = "c.price_int DESC";
      if (sort_by === "rating") orderBy = "avg_rating DESC";

      const listQuery = `
        SELECT
          c.id,
          c.title,
          c.slug,
          c.price_int,
          c.level,
          c.duration_min,
          c.thumbnail_url,
          c.status,
          c.created_at,
          COUNT(DISTINCT cm.id) AS total_comment,
          AVG(r.stars) AS avg_rating
        ${baseQuery}
        GROUP BY c.id
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?
      `;

      const listParams = [...params, limitNum, offset];
      const courses = await runQuery(listQuery, listParams);

      let countQuery = `
        SELECT COUNT(*) AS total
        FROM courses c
        WHERE c.status = 'published'
      `;

      if (search) {
        countQuery += ` AND (c.title LIKE ? OR c.slug LIKE ?)`;
      }
      if (category_id) {
        countQuery += `
          AND c.id IN (
            SELECT course_id 
            FROM course_category_map 
            WHERE category_id = ?
          )
        `;
      }
      if (level) {
        countQuery += ` AND c.level = ?`;
      }

      const countResult = await runQuery(countQuery, countParams);
      const total = countResult[0]?.total || 0;

      return res.status(200).json({
        success: true,
        message: "Daftar course berhasil diambil",
        data: {
          courses,
          pagination: {
            current_page: pageNum,
            total_pages: Math.ceil(total / limitNum),
            total_courses: total,
            limit: limitNum,
          },
        },
      });
    } catch (err) {
      console.error("getCourses error:", err);
      return res
        .status(500)
        .json({ success: false, message: "Terjadi kesalahan server" });
    }
  },

  // GET /api/courses/:id_or_slug
  getCourseDetail: async (req, res) => {
    const { id_or_slug } = req.params;

    try {
      const isNumeric = !isNaN(id_or_slug);
      const condition = isNumeric ? "c.id = ?" : "c.slug = ?";
      const conditionParam = id_or_slug;

      const detailQuery = `
        SELECT
          c.id,
          c.title,
          c.slug,
          c.price_int,
          c.level,
          c.duration_min,
          c.thumbnail_url,
          c.intro_video_url,
          c.description_md,
          c.status,
          c.created_by,
          c.created_at,
          u.name AS instructor_name,
          COALESCE(so.items_sold, 0) AS total_purchase,
          AVG(r.stars) AS avg_rating,
          COUNT(r.id) AS total_rating
        FROM courses c
        LEFT JOIN users u ON c.created_by = u.id
        LEFT JOIN view_course_sales so ON so.course_id = c.id
        LEFT JOIN course_ratings r 
          ON r.course_id = c.id AND r.is_approved = 1
        WHERE ${condition} AND c.status = 'published'
        GROUP BY c.id
        LIMIT 1
      `;

      const detailRows = await runQuery(detailQuery, [conditionParam]);

      if (!detailRows.length) {
        return res
          .status(404)
          .json({ success: false, message: "Course tidak ditemukan" });
      }

      const course = detailRows[0];

      // sections
      const sectionsQuery = `
        SELECT
          s.id,
          s.title,
          s.sort,
          (
            SELECT COUNT(*) 
            FROM course_lessons l 
            WHERE l.section_id = s.id
          ) AS total_lesson
        FROM course_sections s
        WHERE s.course_id = ?
        ORDER BY s.sort ASC, s.id ASC
      `;
      const sections = await runQuery(sectionsQuery, [course.id]);

      // lessons
      const lessonsQuery = `
        SELECT
          l.id,
          l.section_id,
          l.title,
          l.video_url,
          l.duration_min,
          l.sort,
          l.is_preview
        FROM course_lessons l
        WHERE l.section_id IN (
          SELECT id FROM course_sections WHERE course_id = ?
        )
        ORDER BY l.section_id ASC, l.sort ASC, l.id ASC
      `;
      const lessons = await runQuery(lessonsQuery, [course.id]);

      const sectionsWithLessons = sections.map((sec) => ({
        ...sec,
        lessons: lessons.filter((l) => l.section_id === sec.id),
      }));

      // related
      const relatedQuery = `
        SELECT 
          c2.id,
          c2.title,
          c2.slug,
          c2.price_int,
          c2.thumbnail_url,
          AVG(r2.stars) AS avg_rating
        FROM course_related cr
        JOIN courses c2 ON cr.related_id = c2.id
        LEFT JOIN course_ratings r2 
          ON r2.course_id = c2.id AND r2.is_approved = 1
        WHERE cr.course_id = ? AND c2.status = 'published'
        GROUP BY c2.id
        ORDER BY c2.created_at DESC
        LIMIT 6
      `;
      const relatedCourses = await runQuery(relatedQuery, [course.id]);

      // isOwned
      let isOwned = false;
      if (req.user?.id) {
        const ownRows = await runQuery(
          "SELECT id FROM course_ownerships WHERE user_id = ? AND course_id = ? LIMIT 1",
          [req.user.id, course.id]
        );
        isOwned = ownRows.length > 0;
      }

      return res.status(200).json({
        success: true,
        message: "Detail course berhasil diambil",
        data: {
          ...course,
          isOwned,
          sections: sectionsWithLessons,
          relatedCourses,
        },
      });
    } catch (err) {
      console.error("getCourseDetail error:", err);
      return res
        .status(500)
        .json({ success: false, message: "Terjadi kesalahan server" });
    }
  },

  // GET /api/courses/:course_id/ratings
  getCourseRatings: async (req, res) => {
    const { course_id } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;
    const offset = (pageNum - 1) * limitNum;

    try {
      const ratingsQuery = `
        SELECT
          r.id,
          r.stars,
          r.comment,
          r.created_at,
          u.id AS user_id,
          u.name AS username,
          p.avatar_url
        FROM course_ratings r
        JOIN users u ON r.user_id = u.id
        LEFT JOIN profiles p ON p.user_id = u.id
        WHERE r.course_id = ? AND r.is_approved = 1
        ORDER BY r.created_at DESC, r.id DESC
        LIMIT ? OFFSET ?
      `;
      const ratings = await runQuery(ratingsQuery, [
        course_id,
        limitNum,
        offset,
      ]);

      const statQuery = `
        SELECT
          COUNT(*) AS total,
          AVG(stars) AS avg_rating,
          SUM(CASE WHEN stars = 5 THEN 1 ELSE 0 END) AS count5,
          SUM(CASE WHEN stars = 4 THEN 1 ELSE 0 END) AS count4,
          SUM(CASE WHEN stars = 3 THEN 1 ELSE 0 END) AS count3,
          SUM(CASE WHEN stars = 2 THEN 1 ELSE 0 END) AS count2,
          SUM(CASE WHEN stars = 1 THEN 1 ELSE 0 END) AS count1
        FROM course_ratings
        WHERE course_id = ? AND is_approved = 1
      `;
      const statRows = await runQuery(statQuery, [course_id]);
      const stats = statRows[0] || {};

      return res.status(200).json({
        success: true,
        message: "Rating course berhasil diambil",
        data: {
          ratings,
          stats,
          pagination: {
            current_page: pageNum,
            total: stats.total || 0,
            limit: limitNum,
          },
        },
      });
    } catch (err) {
      console.error("getCourseRatings error:", err);
      return res
        .status(500)
        .json({ success: false, message: "Terjadi kesalahan server" });
    }
  },

  // GET /api/courses/:course_id/comments
  getCourseComments: async (req, res) => {
    const { course_id } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;
    const offset = (pageNum - 1) * limitNum;

    try {
      const commentsQuery = `
        SELECT
          c.id,
          c.comment,
          c.created_at,
          u.id AS user_id,
          u.name AS username,
          p.avatar_url
        FROM course_comments c
        JOIN users u ON c.user_id = u.id
        LEFT JOIN profiles p ON p.user_id = u.id
        WHERE c.course_id = ? AND c.is_approved = 1
        ORDER BY c.created_at DESC, c.id DESC
        LIMIT ? OFFSET ?
      `;

      const comments = await runQuery(commentsQuery, [
        course_id,
        limitNum,
        offset,
      ]);

      const countQuery = `
        SELECT COUNT(*) AS total
        FROM course_comments
        WHERE course_id = ? AND is_approved = 1
      `;
      const countRows = await runQuery(countQuery, [course_id]);
      const total = countRows[0]?.total || 0;

      return res.status(200).json({
        success: true,
        message: "Komentar course berhasil diambil",
        data: {
          comments,
          pagination: {
            current_page: pageNum,
            total,
            limit: limitNum,
          },
        },
      });
    } catch (err) {
      console.error("getCourseComments error:", err);
      return res
        .status(500)
        .json({ success: false, message: "Terjadi kesalahan server" });
    }
  },

  // POST /api/courses/:course_id/view
  addCourseView: async (req, res) => {
    const { course_id } = req.params;
    const user_id = req.user?.id || null;

    try {
      await runQuery(
        "INSERT INTO course_views (course_id, user_id, viewed_at) VALUES (?, ?, NOW())",
        [course_id, user_id]
      );

      return res.status(201).json({
        success: true,
        message: "View berhasil dicatat",
      });
    } catch (err) {
      console.error("addCourseView error:", err);
      return res
        .status(500)
        .json({ success: false, message: "Terjadi kesalahan server" });
    }
  },

  // ======================================================
  // ADMIN ENDPOINTS (BUTUH ADMIN)
  // ======================================================

  // POST /api/courses
  createCourse: async (req, res) => {
    if (req.user?.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Hanya admin yang dapat membuat course",
      });
    }

    const {
      title,
      slug,
      price_int,
      level,
      duration_min,
      description_md,
      thumbnail_url,
      intro_video_url,
      categories = [],
    } = req.body;

    if (!title || !slug || price_int == null) {
      return res.status(400).json({
        success: false,
        message: "Title, slug, dan price_int wajib diisi",
      });
    }

    try {
      const slugCheck = await runQuery(
        "SELECT id FROM courses WHERE slug = ?",
        [slug]
      );
      if (slugCheck.length) {
        return res.status(409).json({
          success: false,
          message: "Slug sudah digunakan",
        });
      }

      await runQuery("START TRANSACTION");

      try {
        const insertCourse = await runQuery(
          `
          INSERT INTO courses
            (title, slug, price_int, level, duration_min, thumbnail_url, intro_video_url, description_md, status, created_by, created_at)
          VALUES
            (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, NOW())
        `,
          [
            title,
            slug,
            price_int,
            level || null,
            duration_min || 0,
            thumbnail_url || null,
            intro_video_url || null,
            description_md || null,
            req.user.id,
          ]
        );

        const course_id = insertCourse.insertId;

        if (Array.isArray(categories) && categories.length > 0) {
          for (const category_id of categories) {
            await runQuery(
              "INSERT INTO course_category_map (course_id, category_id) VALUES (?, ?)",
              [course_id, category_id]
            );
          }
        }

        await runQuery("COMMIT");

        return res.status(201).json({
          success: true,
          message: "Course berhasil dibuat",
          data: {
            id: course_id,
            title,
            slug,
            status: "draft",
          },
        });
      } catch (txErr) {
        await runQuery("ROLLBACK");
        throw txErr;
      }
    } catch (err) {
      console.error("createCourse error:", err);
      return res
        .status(500)
        .json({ success: false, message: "Terjadi kesalahan server" });
    }
  },

  // PATCH /api/courses/:course_id
  updateCourse: async (req, res) => {
    if (req.user?.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Hanya admin yang dapat mengupdate course",
      });
    }

    const { course_id } = req.params;
    const {
      title,
      slug,
      price_int,
      level,
      duration_min,
      description_md,
      thumbnail_url,
      intro_video_url,
      status,
    } = req.body;

    try {
      const courseRows = await runQuery(
        "SELECT id FROM courses WHERE id = ?",
        [course_id]
      );
      if (!courseRows.length) {
        return res.status(404).json({
          success: false,
          message: "Course tidak ditemukan",
        });
      }

      if (slug) {
        const slugCheck = await runQuery(
          "SELECT id FROM courses WHERE slug = ? AND id != ?",
          [slug, course_id]
        );
        if (slugCheck.length) {
          return res.status(409).json({
            success: false,
            message: "Slug sudah digunakan",
          });
        }
      }

      const fields = [];
      const params = [];

      if (title !== undefined) {
        fields.push("title = ?");
        params.push(title);
      }
      if (slug !== undefined) {
        fields.push("slug = ?");
        params.push(slug);
      }
      if (price_int !== undefined) {
        fields.push("price_int = ?");
        params.push(price_int);
      }
      if (level !== undefined) {
        fields.push("level = ?");
        params.push(level);
      }
      if (duration_min !== undefined) {
        fields.push("duration_min = ?");
        params.push(duration_min);
      }
      if (description_md !== undefined) {
        fields.push("description_md = ?");
        params.push(description_md);
      }
      if (thumbnail_url !== undefined) {
        fields.push("thumbnail_url = ?");
        params.push(thumbnail_url);
      }
      if (intro_video_url !== undefined) {
        fields.push("intro_video_url = ?");
        params.push(intro_video_url);
      }
      if (status !== undefined) {
        fields.push("status = ?");
        params.push(status);
      }

      if (fields.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Tidak ada field yang diubah",
        });
      }

      params.push(course_id);

      await runQuery(
        `UPDATE courses SET ${fields.join(", ")} WHERE id = ?`,
        params
      );

      return res.status(200).json({
        success: true,
        message: "Course berhasil diupdate",
      });
    } catch (err) {
      console.error("updateCourse error:", err);
      return res
        .status(500)
        .json({ success: false, message: "Terjadi kesalahan server" });
    }
  },

  // DELETE /api/courses/:course_id
  deleteCourse: async (req, res) => {
    if (req.user?.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Hanya admin yang dapat menghapus course",
      });
    }

    const { course_id } = req.params;

    try {
      const courseRows = await runQuery(
        "SELECT id FROM courses WHERE id = ?",
        [course_id]
      );
      if (!courseRows.length) {
        return res.status(404).json({
          success: false,
          message: "Course tidak ditemukan",
        });
      }

      await runQuery("DELETE FROM courses WHERE id = ?", [course_id]);

      return res.status(200).json({
        success: true,
        message: "Course berhasil dihapus",
      });
    } catch (err) {
      console.error("deleteCourse error:", err);
      return res
        .status(500)
        .json({ success: false, message: "Terjadi kesalahan server" });
    }
  },

  // POST /api/courses/:course_id/sections
  addCourseSection: async (req, res) => {
    if (req.user?.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Hanya admin yang dapat menambah section",
      });
    }

    const { course_id } = req.params;
    const { title, sort } = req.body;

    if (!title) {
      return res.status(400).json({
        success: false,
        message: "Title section wajib diisi",
      });
    }

    try {
      const courseRows = await runQuery(
        "SELECT id FROM courses WHERE id = ?",
        [course_id]
      );
      if (!courseRows.length) {
        return res.status(404).json({
          success: false,
          message: "Course tidak ditemukan",
        });
      }

      const result = await runQuery(
        "INSERT INTO course_sections (course_id, title, sort) VALUES (?, ?, ?)",
        [course_id, title, sort || 0]
      );

      return res.status(201).json({
        success: true,
        message: "Section berhasil ditambahkan",
        data: {
          id: result.insertId,
          title,
          sort: sort || 0,
        },
      });
    } catch (err) {
      console.error("addCourseSection error:", err);
      return res
        .status(500)
        .json({ success: false, message: "Terjadi kesalahan server" });
    }
  },

  // PATCH /api/courses/sections/:section_id
  updateCourseSection: async (req, res) => {
    if (req.user?.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Hanya admin yang dapat mengupdate section",
      });
    }

    const { section_id } = req.params;
    const { title, sort } = req.body;

    try {
      const sectionRows = await runQuery(
        "SELECT id FROM course_sections WHERE id = ?",
        [section_id]
      );
      if (!sectionRows.length) {
        return res.status(404).json({
          success: false,
          message: "Section tidak ditemukan",
        });
      }

      const fields = [];
      const params = [];

      if (title !== undefined) {
        fields.push("title = ?");
        params.push(title);
      }
      if (sort !== undefined) {
        fields.push("sort = ?");
        params.push(sort);
      }

      if (fields.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Tidak ada field yang diubah",
        });
      }

      params.push(section_id);

      await runQuery(
        `UPDATE course_sections SET ${fields.join(", ")} WHERE id = ?`,
        params
      );

      return res.status(200).json({
        success: true,
        message: "Section berhasil diupdate",
      });
    } catch (err) {
      console.error("updateCourseSection error:", err);
      return res
        .status(500)
        .json({ success: false, message: "Terjadi kesalahan server" });
    }
  },

  // DELETE /api/courses/sections/:section_id
  deleteCourseSection: async (req, res) => {
    if (req.user?.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Hanya admin yang dapat menghapus section",
      });
    }

    const { section_id } = req.params;

    try {
      const sectionRows = await runQuery(
        "SELECT id FROM course_sections WHERE id = ?",
        [section_id]
      );
      if (!sectionRows.length) {
        return res.status(404).json({
          success: false,
          message: "Section tidak ditemukan",
        });
      }

      await runQuery("DELETE FROM course_sections WHERE id = ?", [section_id]);

      return res.status(200).json({
        success: true,
        message: "Section berhasil dihapus",
      });
    } catch (err) {
      console.error("deleteCourseSection error:", err);
      return res
        .status(500)
        .json({ success: false, message: "Terjadi kesalahan server" });
    }
  },

  // POST /api/courses/lessons
  addCourseLesson: async (req, res) => {
    if (req.user?.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Hanya admin yang dapat menambah lesson",
      });
    }

    const { section_id, title, video_url, duration_min, sort, is_preview } =
      req.body;

    if (!section_id || !title) {
      return res.status(400).json({
        success: false,
        message: "section_id dan title wajib diisi",
      });
    }

    try {
      const sectionRows = await runQuery(
        "SELECT id FROM course_sections WHERE id = ?",
        [section_id]
      );
      if (!sectionRows.length) {
        return res.status(404).json({
          success: false,
          message: "Section tidak ditemukan",
        });
      }

      const result = await runQuery(
        `
        INSERT INTO course_lessons
          (section_id, title, video_url, duration_min, sort, is_preview)
        VALUES
          (?, ?, ?, ?, ?, ?)
      `,
        [
          section_id,
          title,
          video_url || null,
          duration_min || 0,
          sort || 0,
          is_preview ? 1 : 0,
        ]
      );

      return res.status(201).json({
        success: true,
        message: "Lesson berhasil ditambahkan",
        data: {
          id: result.insertId,
          title,
        },
      });
    } catch (err) {
      console.error("addCourseLesson error:", err);
      return res
        .status(500)
        .json({ success: false, message: "Terjadi kesalahan server" });
    }
  },

  // PATCH /api/courses/lessons/:lesson_id
  updateCourseLesson: async (req, res) => {
    if (req.user?.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Hanya admin yang dapat mengupdate lesson",
      });
    }

    const { lesson_id } = req.params;
    const { title, video_url, duration_min, sort, is_preview } = req.body;

    try {
      const lessonRows = await runQuery(
        "SELECT id FROM course_lessons WHERE id = ?",
        [lesson_id]
      );
      if (!lessonRows.length) {
        return res.status(404).json({
          success: false,
          message: "Lesson tidak ditemukan",
        });
      }

      const fields = [];
      const params = [];

      if (title !== undefined) {
        fields.push("title = ?");
        params.push(title);
      }
      if (video_url !== undefined) {
        fields.push("video_url = ?");
        params.push(video_url);
      }
      if (duration_min !== undefined) {
        fields.push("duration_min = ?");
        params.push(duration_min);
      }
      if (sort !== undefined) {
        fields.push("sort = ?");
        params.push(sort);
      }
      if (is_preview !== undefined) {
        fields.push("is_preview = ?");
        params.push(is_preview ? 1 : 0);
      }

      if (fields.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Tidak ada field yang diubah",
        });
      }

      params.push(lesson_id);

      await runQuery(
        `UPDATE course_lessons SET ${fields.join(", ")} WHERE id = ?`,
        params
      );

      return res.status(200).json({
        success: true,
        message: "Lesson berhasil diupdate",
      });
    } catch (err) {
      console.error("updateCourseLesson error:", err);
      return res
        .status(500)
        .json({ success: false, message: "Terjadi kesalahan server" });
    }
  },

  // DELETE /api/courses/lessons/:lesson_id
  deleteCourseLesson: async (req, res) => {
    if (req.user?.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Hanya admin yang dapat menghapus lesson",
      });
    }

    const { lesson_id } = req.params;

    try {
      const lessonRows = await runQuery(
        "SELECT id FROM course_lessons WHERE id = ?",
        [lesson_id]
      );
      if (!lessonRows.length) {
        return res.status(404).json({
          success: false,
          message: "Lesson tidak ditemukan",
        });
      }

      await runQuery("DELETE FROM course_lessons WHERE id = ?", [lesson_id]);

      return res.status(200).json({
        success: true,
        message: "Lesson berhasil dihapus",
      });
    } catch (err) {
      console.error("deleteCourseLesson error:", err);
      return res
        .status(500)
        .json({ success: false, message: "Terjadi kesalahan server" });
    }
  },

  // PATCH /api/courses/:course_id/ratings/:rating_id/approve
  approveRating: async (req, res) => {
    if (req.user?.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Hanya admin yang dapat approve rating",
      });
    }

    const { course_id, rating_id } = req.params;
    const { is_approved } = req.body;

    try {
      const ratingRows = await runQuery(
        "SELECT id FROM course_ratings WHERE id = ? AND course_id = ?",
        [rating_id, course_id]
      );
      if (!ratingRows.length) {
        return res.status(404).json({
          success: false,
          message: "Rating tidak ditemukan",
        });
      }

      await runQuery(
        "UPDATE course_ratings SET is_approved = ? WHERE id = ?",
        [is_approved ? 1 : 0, rating_id]
      );

      return res.status(200).json({
        success: true,
        message: `Rating berhasil di-${is_approved ? "approve" : "reject"}`,
      });
    } catch (err) {
      console.error("approveRating error:", err);
      return res
        .status(500)
        .json({ success: false, message: "Terjadi kesalahan server" });
    }
  },
};
