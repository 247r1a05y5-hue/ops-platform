import { NextRequest, NextResponse } from 'next/server';
import { connectDB, Sequence, EmailTemplate } from '@/lib/db';
import { requireAuth, csrfCheck } from '@/lib/require-auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET /api/sequences — list all sequences
export async function GET(req: NextRequest) {
  const { error } = await requireAuth(req, ['Admin', 'Manager', 'User', 'MR']);
  if (error) return error;

  try {
    await connectDB();
    const sequences = await Sequence.find().sort({ createdAt: -1 });
    return NextResponse.json({ success: true, sequences }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0, must-revalidate',
      }
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, {
      status: 500,
      headers: {
        'Cache-Control': 'no-store, max-age=0, must-revalidate',
      }
    });
  }
}

// POST /api/sequences — create a sequence
export async function POST(req: NextRequest) {
  const csrfError = csrfCheck(req);
  if (csrfError) return csrfError;

  const { error } = await requireAuth(req, ['Admin', 'Manager', 'User', 'MR']);
  if (error) return error;

  try {
    await connectDB();
    const { name, steps } = await req.json();

    if (!name || !Array.isArray(steps) || steps.length === 0) {
      return NextResponse.json({ success: false, error: 'name and steps[] are required.' }, { status: 400 });
    }

    // Validate each step
    for (const [i, step] of steps.entries()) {
      if (typeof step.stepNumber !== 'number') {
        return NextResponse.json({ success: false, error: `Step ${i + 1}: stepNumber must be a number.` }, { status: 400 });
      }
      if (typeof step.delayDays !== 'number' || step.delayDays < 0) {
        return NextResponse.json({ success: false, error: `Step ${i + 1}: delayDays must be >= 0.` }, { status: 400 });
      }
      if (!step.subject || !step.body) {
        return NextResponse.json({ success: false, error: `Step ${i + 1}: subject and body are required.` }, { status: 400 });
      }
    }

    const sequence = await Sequence.create({ name, steps });
    return NextResponse.json({ success: true, sequence });
  } catch (err: any) {
    const msg = err.code === 11000 ? `Sequence name "${err.keyValue?.name}" already exists.` : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: err.code === 11000 ? 409 : 500 });
  }
}

// DELETE /api/sequences?id= — delete a sequence
export async function DELETE(req: NextRequest) {
  const csrfError = csrfCheck(req);
  if (csrfError) return csrfError;

  const { error } = await requireAuth(req, ['Admin', 'Manager', 'User', 'MR']);
  if (error) return error;

  try {
    await connectDB();
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: 'id is required.' }, { status: 400 });

    await Sequence.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
