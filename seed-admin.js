import dns from 'dns';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

// Fix Atlas SRV DNS resolution properly for Node.js process (localhost + production)
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (err) {
  console.warn('[MongoDB] dns.setServers failed:', err);
}

dotenv.config({ path: '.env.local' });

async function seedAdmin() {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    console.error('MONGODB_URI not found');
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

  const adminEmail = 'admin@ops.com';
  const existingAdmin = await User.findOne({ role: 'Admin' });

  if (existingAdmin) {
    console.log('Admin user already exists:', existingAdmin.email);
    // Let's reset the password so the user can login
    const hashedPassword = await bcrypt.hash('admin123', 12);
    existingAdmin.password = hashedPassword;
    await existingAdmin.save();
    console.log('Password reset to: admin123');
  } else {
    const hashedPassword = await bcrypt.hash('admin123', 12);
    await User.create({
      email: adminEmail,
      password: hashedPassword,
      name: 'System Admin',
      role: 'Admin',
      firstLogin: true
    });
    console.log('Created new Admin user:');
    console.log('Email:', adminEmail);
    console.log('Password: admin123');
  }

  process.exit(0);
}

seedAdmin();
