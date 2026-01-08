const Blog = require("./Blog");
const Booking = require("./Booking");
const Category = require("./Category");
const Destination = require("./Destination");
const Enquiry = require("./Enquire");
const Lead = require("./Lead");
const Month = require("./Month");
const Testimonial = require("./Testimonial");
const Tour = require("./Tour");

const DestinationList = require("./DestinationList");
const Features = require("./Features");
const Global = require("./Global");
const HeroSlide = require("./HeroSlide");
const Review = require("./Review");

// export all models in consistent structure
const models = {
  blog: {
    model: Blog,
    meta: {
      name: "Blog",
      key: "blog",
      collectionType: "collection",
      ui: { icon: "IconBook" },
      route: "/api/blog",
    },
  },
  booking: {
    model: Booking,
    meta: {
      name: "Booking",
      key: "booking",
      collectionType: "collection",
      ui: { icon: "IconCalendar" },
      route: "/api/booking",
    },
  },

  categories: {
    model: Category,
    meta: {
      name: "Category",
      key: "categories",
      collectionType: "collection",
      ui: { icon: "IconFolder" },
      route: "/api/categories",
    },
  },

  destinations: {
    model: Destination,
    meta: {
      name: "Destination",
      key: "destinations",
      collectionType: "collection",
      ui: { icon: "IconMap" },
      route: "/api/destinations",
    },
  },
  enquiries: {
    model: Enquiry,
    meta: {
      name: "Enquiries",
      key: "enquiries",
      collectionType: "collection",
      ui: { icon: "IconCalendarQuestion" },
      route: "/api/enquiry",
    },
  },

  lead: {
    model: Lead,
    meta: {
      name: "Lead",
      key: "lead",
      collectionType: "collection",
      ui: { icon: "IconHeadset" },
      route: "/api/lead",
    },
  },
  months: {
    model: Month,
    meta: {
      name: "Month",
      key: "months",
      collectionType: "collection",
      ui: { icon: "IconCalendar" },
      route: "/api/months",
    },
  },
  testimonial: {
    model: Testimonial,
    meta: {
      name: "Testimonial",
      key: "testimonial",
      collectionType: "collection",
      ui: { icon: "IconMessageDots" },
      route: "/api/testimonial",
    },
  },
  tour: {
    model: Tour,
    meta: {
      name: "Tour",
      key: "tour",
      collectionType: "collection",
      ui: { icon: "IconRoute" },
      route: "/api/tour",
    },
  },

  // --- Site Management (Admin only — dashboard) ---
  site_destinationslist: {
    model: DestinationList,
    meta: {
      name: "Destination List",
      key: "site_destinationslist",
      collectionType: "single",
      ui: { icon: "IconList" },
      route: "/api/site_destinationsList",
    },
  },
  site_global: {
    model: Global,
    meta: {
      name: "Global",
      key: "site_global",
      collectionType: "single",
      ui: { icon: "IconList" },
      route: "/api/site_global",
    },
  },
  site_features: {
    model: Features,
    meta: {
      name: "Features",
      key: "site_features",
      collectionType: "single",
      ui: { icon: "IconSparkles" },
      route: "/api/site_features",
    },
  },
  reviews: {
    model: Review,
    meta: {
      name: "Reviews",
      key: "review",
      collectionType: "single",
      ui: { icon: "IconMessageDots" },
      route: "/api/review",
    },
  },
  site_heroslides: {
    model: HeroSlide,
    meta: {
      name: "Hero Slides",
      key: "site_heroslides",
      collectionType: "single",
      ui: { icon: "IconSlideshow" },
      route: "/api/site_heroslides",
    },
  },
};

module.exports = {
  models,
};
