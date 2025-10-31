const router = require("express").Router();
const cartController = require("../../controller/cartController");
const authMiddleware = require("../../middleware/authMiddleware");

router.get("/", authMiddleware, cartController.getCart);
router.get("/count", authMiddleware, cartController.getCartCount);
router.post("/add", authMiddleware, cartController.addToCart);
router.delete("/remove/:course_id", authMiddleware, cartController.removeFromCart);
router.delete("/clear", authMiddleware, cartController.clearCart);

module.exports = router;
