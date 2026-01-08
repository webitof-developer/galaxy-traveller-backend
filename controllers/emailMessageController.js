const EmailMessage = require("../models/EmailMessage");

// Get or create default
exports.get = async (req, res) => {
  let messages = await EmailMessage.findOne();
  if (!messages) messages = await EmailMessage.create({});
  res.json(messages);
};

// Update all message templates
exports.update = async (req, res) => {
  const { otp, attachment, status } = req.body;
  const updated = await EmailMessage.findOneAndUpdate(
    {},
    { otp, attachment, status },
    { new: true, upsert: true }
  );
  res.json(updated);
};
