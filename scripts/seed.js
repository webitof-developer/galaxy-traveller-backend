// scripts/seedRolesUsersAndTokens.js
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const path = require('path');
const mongoose = require('mongoose');

// 🧩 Import Models
const Role = require(path.join(__dirname, '../models/Role'));
const User = require(path.join(__dirname, '../models/User'));
const SmtpSetting = require(path.join(__dirname, '../models/SmtpSetting')); // <-- add this line

// 🔒 Verify ENV
if (!process.env.MONGO_URI) {
  console.error('❌ MONGO_URI missing in .env');
  process.exit(1);
}

// 🔐 Permissions
const ADMIN_PERMISSIONS = {
  '*': { create: true, read: true, update: true, delete: true },
  users: { create: true, read: true, update: true, delete: true },
  roles: { create: true, read: true, update: true, delete: true },
};

const CLIENT_PERMISSIONS = {
  '*': { create: false, read: true, update: false, delete: false },
};
const STAFF_PERMISSIONS = {
  '*': { read: true, create: false, update: true, delete: false },
};
const MANAGER_PERMISSIONS = {
  '*': { create: true, read: true, update: true, delete: false },
};
const DEVELOPER_PERMISSIONS = {
  '*': { create: true, read: true, update: true, delete: true },
  users: { create: true, read: true, update: true, delete: true },
  roles: { create: true, read: true, update: true, delete: true },
};

// 👤 Users to seed
const USERS = [
  {
    name: 'Galaxy Admin',
    email: 'subhajit.galaxytravellers@gmail.com',
    roleName: 'admin',
  },
  {
    name: 'shaurya',
    email: 'shauryakumar.889966@gmail.com',
    roleName: 'admin',
  },
];

// 💌 Default SMTP Config (you can load from .env)
const DEFAULT_SMTP = {
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT || 587),
  username: process.env.SMTP_USER,
  password: process.env.SMTP_PASS,
  encryption: process.env.SMTP_ENCRYPTION || 'tls',
  fromName: process.env.SMTP_FROM_NAME,
  fromEmail: process.env.SMTP_FROM_EMAIL,
};

// 🚀 Seeder
(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, { autoIndex: true });
    console.log('✅ Connected to MongoDB');

    // 1️⃣ Seed roles
    const rolePayloads = [
      { name: 'admin', isSystem: true, permissions: ADMIN_PERMISSIONS },
      { name: 'staff', isSystem: true, permissions: STAFF_PERMISSIONS },
      { name: 'developer', isSystem: true, permissions: DEVELOPER_PERMISSIONS },
      { name: 'manager', isSystem: true, permissions: MANAGER_PERMISSIONS },
      { name: 'client', isSystem: true, permissions: CLIENT_PERMISSIONS },
    ];

    const roleDocs = {};
    for (const r of rolePayloads) {
      const doc = await Role.findOneAndUpdate(
        { name: r.name },
        { $set: r },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      roleDocs[r.name] = doc;
    }

    // 2️⃣ Seed users
    const usesRoleRef = !!User.schema.path('roleId');
    for (const u of USERS) {
      const roleDoc = roleDocs[u.roleName];
      let update;
      if (usesRoleRef) {
        update = {
          $setOnInsert: { name: u.name },
          $set: {
            email: u.email,
            roleId: roleDoc._id,
            roleName: roleDoc.name,
            status: 'active',
          },
        };
      } else {
        update = {
          $setOnInsert: { name: u.name },
          $set: { email: u.email, role: roleDoc.name, status: 'active' },
        };
      }

      const user = await User.findOneAndUpdate({ email: u.email }, update, {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      });
    }

    // 3️⃣ Seed SMTP settings
    const smtpDoc = await SmtpSetting.findOneAndUpdate(
      { fromEmail: DEFAULT_SMTP.fromEmail },
      { $set: DEFAULT_SMTP },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    console.log('🎉 Done seeding roles, users, SMTP, and printing tokens.');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    process.exit();
  }
})();
