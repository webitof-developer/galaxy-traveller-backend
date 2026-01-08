
require('dotenv').config();
const mongoose = require('mongoose');
const Tour = require('../models/Tour');

async function debug() {
  try {
    console.log('URI:', process.env.MONGO_URI ? 'Found' : 'Missing');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to DB');

    const allTours = await Tour.find({}, 'title status slug details.pricePerPerson').lean();
    console.log(`Total Tours Found: ${allTours.length}`);
    
    if (allTours.length > 0) {
      console.log('--- Tour Statuses ---');
      allTours.forEach(t => {
        console.log(`[${t._id}] Status: '${t.status}', Title: '${t.title}', Price: ${t.details?.pricePerPerson}`);
      });
    } else {
      console.log('Collection is empty.');
    }

    process.exit(0);
  } catch (e) {
    console.error('Error:', e);
    process.exit(1);
  }
}

debug();
