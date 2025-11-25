const router = require("express").Router();
const ratingController = require("../../controller/ratingController");
const authMiddleware = require("../../middleware/authMiddleware");

router.post("/", authMiddleware, ratingController.createRating);
router.get("/:courseId", ratingController.getCourseRatings);

module.exports = router;