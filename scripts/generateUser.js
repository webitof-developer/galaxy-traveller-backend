require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User'); // adjust path if needed

const MONGO_URI = process.env.MONGO_URI;

const seedUsers = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ MongoDB connected');

    // Remove existing users (optional for clean seed)
    // await User.deleteMany({});

    const user = [
      {
        name: 'Galaxy Admin',
        email: 'subhajit.galaxytravellers@gmail.com',
        role: 'admin',
      },
      {
        name: 'shaurya',
        email: 'shauryakumar.889966@gmail.com',
        role: 'admin',
      },
    ];

    for (let userData of user) {
      const user = new User(userData);
      await user.save();
      console.log(`✅ Created: ${user.name} (${user.role})`);
    }

    console.log('🚀 All users created.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error seeding users:', err);
    process.exit(1);
  }
};

seedUsers();
