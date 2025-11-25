const router = require("express").Router();
const portfolioController = require("../../controller/portfolioController");

router.get("/", portfolioController.getPortfolios);
router.get("/:slug", portfolioController.getPortfolioDetail);

module.exports = router;