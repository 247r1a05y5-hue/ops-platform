import dns from 'dns';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (err) {
  console.warn('[MongoDB] dns.setServers failed:', err);
}

dotenv.config({ path: '.env.local' });

async function seedManager() {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    console.error('MONGODB_URI not found in .env.local');
    process.exit(1);
  }

  try {
    await mongoose.connect(MONGODB_URI);
  } catch (err) {
    console.error('[MongoDB] Connection failed:', err.message);
    throw err;
  }
  console.log('Connected to MongoDB');

  const UserSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: { type: String, required: true },
    role: { type: String, enum: ['Admin', 'Manager', 'Staff', 'User'], default: 'User' },
    firstLogin: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    lastLogin: Date
  });

  const User = mongoose.models.User || mongoose.model('User', UserSchema);

  const managerEmail = 'manager@ops.com';
  const existingManager = await User.findOne({ email: managerEmail });

  const hashedPassword = await bcrypt.hash('manager123', 12);

  if (existingManager) {
    console.log('Manager user already exists:', existingManager.email);
    existingManager.password = hashedPassword;
    existingManager.role = 'Manager';
    await existingManager.save();
    console.log('Password reset to: manager123');
  } else {
    await User.create({
      email: managerEmail,
      password: hashedPassword,
      name: 'System Manager',
      role: 'Manager',
      firstLogin: true
    });
    console.log('Created new Manager user:');
    console.log('Email:', managerEmail);
    console.log('Password: manager123');
  }

  process.exit(0);
}

seedManager();
