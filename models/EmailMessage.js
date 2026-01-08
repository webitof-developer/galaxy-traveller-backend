const mongoose = require("mongoose");

const EmailMessageSchema = new mongoose.Schema(
  {
    otp: {
      subject: { type: String, default: "Your OTP Code" },
      body: {
        type: String,
        default:
          "Hello {{name}}, your OTP is {{otp}}. This code is valid for 10 minutes.",
      },
    },
    attachment: {
      subject: { type: String, default: "Your Requested File" },
      body: {
        type: String,
        default:
          "Hi {{name}}, please find your requested file attached. Thanks for connecting!",
      },
    },
    status: {
      subject: { type: String, default: "Update on Your Content" },
      body: {
        type: String,
        default:
          "Hi {{name}}, your content titled '{{title}}' is now live! View it here: {{url}}.",
      },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("EmailMessage", EmailMessageSchema);
