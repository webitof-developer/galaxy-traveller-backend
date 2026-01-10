const HeroSlide = require("../models/HeroSlide");
const Destination = require("../models/Destination");

const Review = require("../models/Review");
const Blog = require("../models/Blog");
const Month = require("../models/Month");
const User = require("../models/User");
const Tour = require("../models/Tour");
const Feature = require("../models/Features");
const { ok, notFound, fail, asyncHandler } = require("../utils/respond");
const cache = require("../lib/cache/cache");

dotenv = require("dotenv");
dotenv.config();
const HOME_TTL = 300; // homepage aggregates: short list cache
const SEARCH_TTL = 180; // search responses: light caching

exports.getHomeData = async (req, res) => {
  try {
    const cacheKey = "home";

    const payload = await cache.getOrSet(cacheKey, HOME_TTL, async () => {
      // Fetch data in parallel
      const [heroSlides, features, reviews] = await Promise.all([
        HeroSlide.find({ status: "published" }).sort({ createdAt: -1 }).lean(),

        Feature.find({ status: "published" })
          .sort({ createdAt: -1 })
          .populate("blogs destinations tours")
          .lean(),
        Review.find({ status: "published" }).sort({ createdAt: -1 }).lean(),
      ]);

      // Flatten the data
      const heroSlidesData = heroSlides[0]?.heroSlide || [];
      const reviewData = reviews[0]?.group || [];

      return {
        hero: heroSlidesData,

        destinations: features[0]?.destinations || [],
        tours: features[0]?.tours || [],
        blogs: features[0]?.blogs || [],
        features,
        reviews: reviewData,
      };
    });

    // allow edge/CDN caching for the public home payload
    cache.setCacheHeaders(res, HOME_TTL);

    return ok(res, payload);
  } catch (err) {
    console.error("Error fetching home data:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch home data",
      error: err.message,
    });
  }
};

exports.searchHomeData = async (req, res) => {
  try {
    const query = req.params.query.trim().toLowerCase();
    const filter = (req.query.filter || "all").toLowerCase();

    const cacheKey = `home:search:${filter}:${query}`;
    const payload = await cache.getOrSet(cacheKey, SEARCH_TTL, async () => {
      let destinations = [],
        tours = [],
        blogs = [],
        creators = [],
        creatorBlogs = [],
        creatorTours = [];

      if (filter === "all" || filter === "destinations") {
        destinations = await Destination.find({
          title: { $regex: query, $options: "i" },
          status: "published",
        }).lean();
      }

      if (filter === "all" || filter === "tours") {
        tours = await Tour.find({
          title: { $regex: query, $options: "i" },
          status: "published",
        }).lean();
      }

      if (filter === "all" || filter === "blogs") {
        blogs = await Blog.find({
          title: { $regex: query, $options: "i" },
          status: "published",
        }).lean();
      }

      if (filter === "all" || filter === "creator") {
        creators = await User.find({
          name: { $regex: query, $options: "i" },
          status: "active",
          roleName: "creator",
        }).lean();
      }

      if (filter === "all" || filter === "creatorBlogs") {
        creatorBlogs = await Blog.find({
          title: { $regex: query, $options: "i" },
          status: "published",
        })
          .populate("createdBy", "roleName")
          .lean();

        creatorBlogs = creatorBlogs.filter(
          (b) => b.createdBy?.roleName === "creator"
        );
      }

      if (filter === "all" || filter === "creatorTours") {
        creatorTours = await Tour.find({
          title: { $regex: query, $options: "i" },
          status: "published",
        })
          .populate("createdBy", "roleName")
          .lean();

        creatorTours = creatorTours.filter(
          (t) => t.createdBy?.roleName === "creator"
        );
      }

      return {
        destinations,
        tours,
        blogs,
        creators,
        creatorBlogs,
        creatorTours,
      };
    });

    cache.setCacheHeaders(res, SEARCH_TTL);
    return ok(res, payload);
  } catch (err) {
    console.error("Error searching home data:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to search home data",
      error: err.message,
    });
  }
};

exports.getMainData = async (req, res) => {
  try {
    const today = new Date();

    const [blogs, upcomingTours, popularDestination, reviews] =
      await Promise.all([
        // 2 Blogs (with populated creator name)
        Blog.find({ status: "published" })
          .sort({ createdAt: -1 })
          .limit(4)
          .select("title heroImg createdBy slug")
          .populate("createdBy", "name")
          .lean(),

        // 🚀 Upcoming tours (start date in future)
        Tour.find({
          status: "published",
          "dateRange.startDate": { $gte: today },
        })
          .sort({ "dateRange.startDate": 1 }) // soonest first
          .limit(6)
          .select("title heroImg place dateRange createdBy slug details")
          .populate("createdBy", "name")
          .lean(),
        Destination.find({ status: "published" })
          .sort({ createdAt: -1 })
          .limit(6)
          .select("title description heroImg startingPrice slug createdBy")
          .populate("createdBy", "name")
          .lean(),

        // ⭐ Reviews (published)
        Review.find({ status: "published" })
          .sort({ createdAt: -1 })
          .limit(6)
          .lean(),
      ]);

    // If reviews are grouped under a single doc (like ReviewSchema { group: [] })
    const reviewsData =
      Array.isArray(reviews) && reviews.length && reviews[0].group
        ? reviews[0].group
        : reviews;

    return ok(res, {
      blogs,
      upcomingTours,
      popularDestination,
      reviews: reviewsData,
    });
  } catch (err) {
    console.error("Error fetching main data:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch main data",
      error: err.message,
    });
  }
};
