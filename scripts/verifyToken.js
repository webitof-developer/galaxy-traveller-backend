require("dotenv").config();
const jwt = require("jsonwebtoken");

const token = process.argv[2];
if (!token) throw new Error("Pass token as arg");

const decoded = jwt.decode(token, { complete: true });
console.log("header:", decoded.header);
console.log("payload:", decoded.payload);

const verified = jwt.verify(token, process.env.JWT_SECRET, {
  algorithms: ["HS256"],
});
console.log("verified OK. sub:", verified.sub);
