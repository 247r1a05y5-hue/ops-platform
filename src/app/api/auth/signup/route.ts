import { NextRequest, NextResponse } from 'next/server';
import { connectDB, User } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { csrfCheck } from '@/lib/require-auth';
import { checkRateLimit } from '@/lib/rate-limit';
import bcrypt from 'bcryptjs';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // CSRF check — prevent cross-origin form submissions
  const csrfError = csrfCheck(req);
  if (csrfError) return csrfError;

  // Rate limiting — prevent automated account creation spam (per IP)
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
  const rl = await checkRateLimit(`signup:ip:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: `Too many signup attempts. Try again in ${Math.ceil((rl.retryAfterSeconds ?? 300) / 60)} minute(s).` },
      { status: 429 }
    );
  }

  try {
    const { email, password, name, role, inviteToken } = await req.json();

    await connectDB();

    let targetRole = role;
    let targetWorkspaceId = null;
    let inviteDoc = null;

    if (inviteToken) {
      const { Invitation } = await import('@/lib/db');
      inviteDoc = await Invitation.findOne({
        token: inviteToken,
        status: 'pending',
        expiresAt: { $gt: new Date() }
      });
      if (!inviteDoc) {
        return NextResponse.json({ success: false, error: 'Invalid or expired invitation token.' }, { status: 400 });
      }
      targetRole = inviteDoc.role;
      targetWorkspaceId = inviteDoc.workspaceId;
    } else {
      // Validate Role — SECURITY FIX: public signup ONLY allows standard roles.
      // Admin and Manager roles require an admin-issued invitation — they cannot be self-assigned.
      const PUBLIC_ALLOWED_ROLES = ['User', 'Employee', 'Staff', 'MR'];
      if (!role || !PUBLIC_ALLOWED_ROLES.includes(role)) {
        return NextResponse.json(
          {
            success: false,
            error: 'Invalid role. Public registration only allows: User, Employee, Staff, MR. Admin and Manager roles require an invitation.',
          },
          { status: 403 }
        );
      }
    }

    // 2. Basic input validation
    const targetEmail = inviteToken ? inviteDoc.email : email;
    if (!targetEmail || !password || !name) {
      return NextResponse.json({ success: false, error: 'Name, email, and password are required.' }, { status: 400 });
    }
    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ success: false, error: 'Password must be at least 8 characters.' }, { status: 400 });
    }

    // 3. Check if user already exists
    const existingUser = await User.findOne({ email: targetEmail.toLowerCase().trim() });
    if (existingUser) {
      return NextResponse.json({ success: false, error: 'User already exists.' }, { status: 400 });
    }

    // 4. Hash Password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Find or create Workspace
    let workspaceId = targetWorkspaceId;
    if (!workspaceId) {
      const { Workspace } = await import('@/lib/db');
      let mainWs = await Workspace.findOne({ slug: 'ops-main' });
      if (!mainWs) {
        mainWs = await Workspace.create({ name: 'Main Workspace', slug: 'ops-main' });
      }
      workspaceId = mainWs._id;
    }

    // 5. Create User
    const user = await User.create({
      email: targetEmail.toLowerCase().trim(),
      password: hashedPassword,
      name: name.trim(),
      role: targetRole,
      firstLogin: true,
      workspaceId
    });

    if (inviteDoc) {
      inviteDoc.status = 'accepted';
      await inviteDoc.save();
    }

    // Send immediate welcome email to user
    await sendEmail({
      event: 'welcome',
      to: user.email,
      vars: { name: user.name, role: user.role }
    }).catch(console.error);

    // Notify Admin of new registration
    await sendEmail({
      event: 'admin_user_signup',
      to: process.env.ADMIN_EMAIL || 'admin@ops.com',
      vars: { name: user.name, email: user.email, role: user.role }
    }).catch(console.error);

    // 6. Trigger Zapier Webhook for additional automation (only if URL is configured)
    try {
      const webhookUrl = process.env.ZAPIER_WEBHOOK_URL;
      if (!webhookUrl) {
        console.warn('[signup] ZAPIER_WEBHOOK_URL is not set — skipping Zapier notification.');
      } else {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'new_user_signup',
            name: user.name.trim(),
            email: user.email.trim().toLowerCase(),
            role: user.role || 'User',
            signupTime: new Date().toISOString(),
            userId: user._id.toString()
          })
        });
        console.log('Zapier user signup webhook status:', response.status);
        if (!response.ok) {
          console.error('Zapier user signup webhook failed:', response.statusText);
        }
      }
    } catch (err) {
      console.error('Failed to trigger Zapier user signup webhook:', err);
    }

    // 7. Log Registration Activity
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
