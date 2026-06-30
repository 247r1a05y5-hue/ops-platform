import { NextRequest, NextResponse } from 'next/server';
import { connectDB, User, Invitation } from '@/lib/db';
import { requireAuth, csrfCheck } from '@/lib/require-auth';
import { sendEmail } from '@/lib/email';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

// GET all team members (active users + pending invitations)
export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth(req, ['Admin', 'Manager']);
  if (error) return error;

  try {
    await connectDB();

    // Resolve the current user's workspaceId from the DB
    const currentUser = await User.findById(session.sub).select('workspaceId').lean() as any;
    const workspaceFilter = currentUser?.workspaceId ? { workspaceId: currentUser.workspaceId } : {};

    // Fetch active users in the same workspace (excluding passwords)
    const members = await User.find(workspaceFilter)
      .select('_id name email role status suspended createdAt lastLogin')
      .sort({ name: 1 })
      .lean();

    const { isUserOnline } = await import('@/lib/socket-server');
    const membersWithPresence = members.map((u: any) => {
      const online = isUserOnline(u._id.toString());
      return {
        ...u,
        status: online ? 'Online' : (u.status || 'Offline')
      };
    });

    // Fetch pending invitations in the same workspace
    const invitationFilter = currentUser?.workspaceId
      ? { workspaceId: currentUser.workspaceId, status: 'pending', expiresAt: { $gt: new Date() } }
      : { status: 'pending', expiresAt: { $gt: new Date() } };

    const invitations = await Invitation.find(invitationFilter)
      .select('_id email role status createdAt')
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ success: true, members: membersWithPresence, invitations });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// POST invite team member
export async function POST(req: NextRequest) {
  const csrfError = csrfCheck(req);
  if (csrfError) return csrfError;

  const { session, error } = await requireAuth(req, ['Admin', 'Manager']);
  if (error) return error;

  try {
    const { email, role } = await req.json();
    if (!email || !role) {
      return NextResponse.json({ success: false, error: 'Email and role are required.' }, { status: 400 });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanRole = role.trim();

    // Validate role permissions
    const ALLOWED_ROLES = ['Admin', 'Manager', 'Staff', 'User', 'Employee', 'MR'];
    if (!ALLOWED_ROLES.includes(cleanRole)) {
      return NextResponse.json({ success: false, error: 'Invalid role.' }, { status: 400 });
    }

    // A Manager cannot invite an Admin or Manager
    if (session.role === 'Manager' && (cleanRole === 'Admin' || cleanRole === 'Manager')) {
      return NextResponse.json({ success: false, error: 'Managers cannot invite Admins or other Managers.' }, { status: 403 });
    }

    await connectDB();

    // Resolve the inviter's workspaceId
    const inviter = await User.findById(session.sub).select('workspaceId').lean() as any;
    const workspaceId = inviter?.workspaceId;

    // Check if user already exists
    const existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser) {
      return NextResponse.json({ success: false, error: 'User is already a member of this platform.' }, { status: 400 });
    }

    // Generate token and expiry
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Create or update invitation
    await Invitation.findOneAndUpdate(
      { email: cleanEmail },
      {
        email: cleanEmail,
        role: cleanRole,
        token,
        expiresAt,
        workspaceId,
        invitedBy: session.sub,
        status: 'pending',
        createdAt: new Date()
      },
      { upsert: true, new: true }
    );

    // Send invitation email
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const inviteLink = `${appUrl}/login?invite=${token}&email=${encodeURIComponent(cleanEmail)}`;

    await sendEmail({
      event: 'team_invite',
      to: cleanEmail,
      vars: {
        role: cleanRole,
        invitedBy: session.name,
        inviteLink
      }
    });

    return NextResponse.json({ success: true, message: `Invitation sent to ${cleanEmail}.` });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// PUT modify role or status of team member
export async function PUT(req: NextRequest) {
  const csrfError = csrfCheck(req);
  if (csrfError) return csrfError;

  const { session, error } = await requireAuth(req, ['Admin', 'Manager']);
  if (error) return error;

  try {
    const { userId, role, status } = await req.json();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'userId is required.' }, { status: 400 });
    }

    await connectDB();
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return NextResponse.json({ success: false, error: 'User not found.' }, { status: 404 });
    }

    // Access control checks for Manager
    if (session.role === 'Manager') {
      if (targetUser.role === 'Admin' || targetUser.role === 'Manager') {
        return NextResponse.json({ success: false, error: 'Managers cannot modify Admin or Manager accounts.' }, { status: 403 });
      }
    }

    if (role !== undefined) {
      const cleanRole = role.trim();
      if (session.role === 'Manager' && (cleanRole === 'Admin' || cleanRole === 'Manager')) {
        return NextResponse.json({ success: false, error: 'Managers cannot upgrade members to Admin or Manager.' }, { status: 403 });
      }

      // Prevent downgrading the last Admin
      if (targetUser.role === 'Admin' && cleanRole !== 'Admin') {
        const activeAdminsCount = await User.countDocuments({ role: 'Admin', suspended: false });
        if (activeAdminsCount <= 1) {
          return NextResponse.json({ success: false, error: 'Cannot demote the only remaining Admin account.' }, { status: 400 });
        }
      }

      targetUser.role = cleanRole;
    }

    if (status !== undefined) {
      const cleanStatus = status.trim();
      const ALLOWED_STATUSES = ['Online', 'Away', 'Offline'];
      if (!ALLOWED_STATUSES.includes(cleanStatus)) {
        return NextResponse.json({ success: false, error: 'Invalid status value.' }, { status: 400 });
      }
      targetUser.status = cleanStatus;
    }

    await targetUser.save();

    return NextResponse.json({ success: true, message: 'User updated successfully.' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// PATCH modify role or status of team member
export async function PATCH(req: NextRequest) {
  return PUT(req);
}


// DELETE remove team member
export async function DELETE(req: NextRequest) {
  const csrfError = csrfCheck(req);
  if (csrfError) return csrfError;

  const { session, error } = await requireAuth(req, ['Admin', 'Manager']);
  if (error) return error;

  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ success: false, error: 'User ID is required.' }, { status: 400 });
    }

    await connectDB();
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return NextResponse.json({ success: false, error: 'User not found.' }, { status: 404 });
    }

    // Access control checks:
    // 1. Cannot delete yourself
    if (session.sub === userId) {
      return NextResponse.json({ success: false, error: 'Cannot remove yourself from workspace settings.' }, { status: 400 });
    }

    // 2. Manager cannot remove Admins or Managers
    if (session.role === 'Manager' && (targetUser.role === 'Admin' || targetUser.role === 'Manager')) {
      return NextResponse.json({ success: false, error: 'Managers cannot remove Admins or Managers.' }, { status: 403 });
    }

    // 3. Prevent deleting the last Admin
    if (targetUser.role === 'Admin') {
      const activeAdminsCount = await User.countDocuments({ role: 'Admin', suspended: false });
      if (activeAdminsCount <= 1) {
        return NextResponse.json({ success: false, error: 'Cannot demote or remove the last remaining Admin account.' }, { status: 400 });
      }
    }

    await User.findByIdAndDelete(userId);

    return NextResponse.json({ success: true, message: 'User removed from workspace successfully.' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
