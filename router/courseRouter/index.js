const router = require("express").Router();
const { courseController } = require("../../controller");
const authMiddleware = require("../../middleware/authMiddleware");

// GET /api/courses
router.get("/", courseController.getCourses);

// GET /api/courses/:id_or_slug
router.get("/:id_or_slug", courseController.getCourseDetail);

// GET /api/courses/:course_id/ratings
router.get("/:course_id/ratings", courseController.getCourseRatings);

// GET /api/courses/:course_id/comments
router.get("/:course_id/comments", courseController.getCourseComments);

// POST /api/courses/:course_id/view
router.post("/:course_id/view", courseController.addCourseView);

// ======================
// ADMIN ROUTES (WITH AUTH)
// ======================

// Semua route di bawah ini butuh login admin
// authMiddleware harus mengisi req.user.id dan req.user.role

// POST /api/courses
router.post(
  "/",
  authMiddleware,
  courseController.createCourse
);

// PATCH /api/courses/:course_id
router.patch(
  "/:course_id",
  authMiddleware,
  courseController.updateCourse
);

// DELETE /api/courses/:course_id
router.delete(
  "/:course_id",
  authMiddleware,
  courseController.deleteCourse
);

// POST /api/courses/:course_id/sections
router.post("/:course_id/sections", authMiddleware, courseController.addCourseSection);

// PATCH /api/courses/sections/:section_id
router.patch(
  "/sections/:section_id",
  authMiddleware,
  courseController.updateCourseSection
);

// DELETE /api/courses/sections/:section_id
router.delete(
  "/sections/:section_id",
  authMiddleware,
  courseController.deleteCourseSection
);

// POST /api/courses/lessons
router.post(
  "/lessons",
  authMiddleware,
  courseController.addCourseLesson
);

// PATCH /api/courses/lessons/:lesson_id
router.patch(
  "/lessons/:lesson_id",
  authMiddleware,
  courseController.updateCourseLesson
);

// DELETE /api/courses/lessons/:lesson_id
router.delete(
  "/lessons/:lesson_id",
  authMiddleware,
  courseController.deleteCourseLesson
);

// PATCH /api/courses/:course_id/ratings/:rating_id/approve
router.patch(
  "/:course_id/ratings/:rating_id/approve",
  authMiddleware,
  courseController.approveRating
);

module.exports = router;