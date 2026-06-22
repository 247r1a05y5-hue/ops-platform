import { NextRequest, NextResponse } from 'next/server';
import { connectDB, User } from '@/lib/db';
import { requireAuth, csrfCheck } from '@/lib/require-auth';
import bcrypt from 'bcryptjs';

export const dynamic = 'force-dynamic';

// GET all users
export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth(req, ['Admin']);
  if (error) return error;

  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || '';
    const role = searchParams.get('role') || '';

    const filter: any = {};
    if (role) filter.role = role;
    if (search) {
      const escaped = search.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      filter.$or = [
        { name: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } },
      ];
    }

    const users = await User.find(filter)
      .select('_id name email role createdAt lastLogin suspended')
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ success: true, users });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// POST create user
export async function POST(req: NextRequest) {
  const csrfError = csrfCheck(req);
  if (csrfError) return csrfError;

  const { session, error } = await requireAuth(req, ['Admin']);
  if (error) return error;

  try {
    const { name, email, password, role, suspended } = await req.json();
    if (!name || !email || !password || !role) {
      return NextResponse.json({ success: false, error: 'All fields are required.' }, { status: 400 });
    }

    await connectDB();
    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return NextResponse.json({ success: false, error: 'User already exists.' }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      role,
      suspended: !!suspended,
      firstLogin: true
    });

    return NextResponse.json({
      success: true,
      message: 'User created successfully.',
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        suspended: user.suspended
      }
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// PUT update user
export async function PUT(req: NextRequest) {
  const csrfError = csrfCheck(req);
  if (csrfError) return csrfError;

  const { session, error } = await requireAuth(req, ['Admin']);
  if (error) return error;

  try {
    const { id, name, email, role, suspended, password } = await req.json();
    if (!id) {
      return NextResponse.json({ success: false, error: 'User ID is required.' }, { status: 400 });
    }

    await connectDB();
    const user = await User.findById(id);
    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found.' }, { status: 404 });
    }

    // Protect against deactivating the last active Admin
    if ((user.role === 'Admin' && role !== 'Admin') || (user.suspended === false && suspended === true)) {
      if (user.role === 'Admin') {
        const activeAdminsCount = await User.countDocuments({ role: 'Admin', suspended: false });
        if (activeAdminsCount <= 1) {
          return NextResponse.json({ success: false, error: 'Cannot downgrade or suspend the only active Admin account.' }, { status: 400 });
        }
      }
    }

    if (name !== undefined) user.name = name.trim();
    if (email !== undefined) user.email = email.toLowerCase().trim();
    if (role !== undefined) user.role = role;
    if (suspended !== undefined) user.suspended = !!suspended;
    if (password) {
      user.password = await bcrypt.hash(password, 12);
    }

    await user.save();

    return NextResponse.json({
      success: true,
      message: 'User updated successfully.',
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        suspended: user.suspended
      }
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// DELETE user
export async function DELETE(req: NextRequest) {
  const csrfError = csrfCheck(req);
  if (csrfError) return csrfError;

  const { session, error } = await requireAuth(req, ['Admin']);
  if (error) return error;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ success: false, error: 'User ID is required.' }, { status: 400 });
    }

    await connectDB();
    const user = await User.findById(id);
    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found.' }, { status: 404 });
    }

    if (user.role === 'Admin') {
      const activeAdminsCount = await User.countDocuments({ role: 'Admin', suspended: false });
      if (activeAdminsCount <= 1) {
        return NextResponse.json({ success: false, error: 'Cannot delete the only Admin account.' }, { status: 400 });
      }
    }

    await User.findByIdAndDelete(id);

    return NextResponse.json({ success: true, message: 'User deleted successfully.' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
