
require('dotenv').config();
const mongoose = require('mongoose');
const Tour = require('../models/Tour');

async function checkDb() {
  try {
    if (!process.env.MONGO_URI) {
      console.error('No MONGO_URI found in env');
      return;
    }
    console.log('Connecting to DB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected.');

    const total = await Tour.countDocuments({});
    console.log('Total Tours in DB:', total);

    const published = await Tour.countDocuments({ status: 'published' });
    console.log('Published Tours:', published);

    const sample = await Tour.findOne({ status: 'published' }).select('title status details').lean();
    console.log('Sample Published Tour:', sample);

    process.exit(0);
  } catch (err) {
    console.error('DB Error:', err);
    process.exit(1);
  }
}

checkDb();
