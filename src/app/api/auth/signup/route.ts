import { NextRequest, NextResponse } from 'next/server';
import { connectDB, User } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import bcrypt from 'bcryptjs';

export async function POST(req: NextRequest) {
  try {
    const { email, password, name, role } = await req.json();

    // 1. Validate Role
    // Public signup supports all system roles
    const SIGNUP_ALLOWED_ROLES = ['Admin', 'Manager', 'Staff', 'User', 'Employee', 'MR'];
    if (!role || !SIGNUP_ALLOWED_ROLES.includes(role)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid role. Allowed: Admin, Manager, Staff, Employee, MR, User.',
        },
        { status: 403 }
      );
    }

    await connectDB();

    // 2. Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return NextResponse.json({ success: false, error: 'User already exists.' }, { status: 400 });
    }

    // 3. Hash Password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Find or create Main Workspace
    const { Workspace } = await import('@/lib/db');
    let mainWs = await Workspace.findOne({ slug: 'ops-main' });
    if (!mainWs) {
      mainWs = await Workspace.create({ name: 'Main Workspace', slug: 'ops-main' });
    }

    // 4. Create User
    const user = await User.create({
      email,
      password: hashedPassword,
      name,
      role,
      firstLogin: true,
      workspaceId: mainWs._id
    });

    // Send immediate welcome email to user
    await sendEmail({
      event: 'welcome',
      to: user.email,
      vars: { name: user.name, role: user.role }
    }).catch(console.error);

    // Notify Admin of new registration
    await sendEmail({
      event: 'admin_user_signup',
      to: process.env.ADMIN_EMAIL || "admin@ops.com", 
      vars: { name: user.name, email: user.email, role: user.role }
    }).catch(console.error);

    // 5. Log Registration Activity
    try {
      const { logActivity } = await import('@/lib/activity');
      await logActivity({
        userId: user._id,
        actionType: 'registration',
        module: 'Authentication',
        description: `New user registered as ${user.role}`,
        req
      });
    } catch (err) {
      console.error('Failed to log registration activity', err);
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Account created successfully. Please login.' 
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
