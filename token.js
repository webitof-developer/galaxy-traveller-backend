const express = require("express");
const jwt = require("jsonwebtoken");
require("dotenv").config(); // Make sure JWT_SECRET is in your .env

const app = express();
app.use(express.json());

app.post("/dev/generate-token", (req, res) => {
  const { id, role } = req.body;

  if (!id || !role) {
    return res.status(400).json({ error: "id and role are required" });
  }

  const token = jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });

  res.json({ token });
});

const PORT = process.env.DEV_JWT_PORT || 4000;
app.listen(PORT, () => {
  console.log(`JWT dev server running on http://localhost:${PORT}`);
});
