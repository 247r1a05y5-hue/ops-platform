import { NextRequest, NextResponse } from 'next/server';
import { connectDB, EmailTemplate } from '@/lib/db';
import { requireAuth, csrfCheck } from '@/lib/require-auth';

// GET all templates, auto-seeding if empty
export async function GET(req: NextRequest) {
  const { error } = await requireAuth(req);
  if (error) return error;

  try {
    await connectDB();
    let templates = await EmailTemplate.find().sort({ createdAt: -1 });

    // Seed defaults if empty
    if (templates.length === 0) {
      await EmailTemplate.create([
        {
          name: 'Introductory Pitch',
          subject: 'Exploring marketing growth opportunities for {{company}}',
          body: 'Hi {{name}},\n\nI’ve been following {{company}} and noticed your recent initiatives. We specialize in dynamic operations and campaign scalability.\n\nWould you be open to a brief conversation next Tuesday to see how we can assist?\n\nBest regards,\nMaya Thompson'
        },
        {
          name: 'Proposal Nudge',
          subject: 'Quick follow-up regarding proposal options',
          body: 'Hi {{name}},\n\nJust wanted to make sure you had a chance to look over the service levels proposal I forwarded.\n\nLet me know if any questions popped up or if we should customize any terms.\n\nBest,\nMaya'
        },
        {
          name: 'Contract MSA Finalization',
          subject: 'MSA and SLA agreements ready for signing',
          body: 'Hi {{name}},\n\nSuper excited to get started! I’ve uploaded the Master Service Agreement to your portal.\n\nPlease review and let me know if we are good to execute.\n\nTalk soon,\nMaya'
        }
      ]);
      // Re-fetch seeded templates
      templates = await EmailTemplate.find().sort({ createdAt: -1 });
    }

    return NextResponse.json({ success: true, templates });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST create a template
export async function POST(req: NextRequest) {
  const csrfError = csrfCheck(req);
  if (csrfError) return csrfError;

  const { error } = await requireAuth(req, ['Admin', 'Manager']);
  if (error) return error;

  try {
    await connectDB();
    const body = await req.json();
    const { name, subject, body: templateBody } = body;

    if (!name || !subject || !templateBody) {
      return NextResponse.json(
        { success: false, error: 'Name, Subject, and Body are required.' },
        { status: 400 }
      );
    }

    const existing = await EmailTemplate.findOne({ name });
    if (existing) {
      return NextResponse.json(
        { success: false, error: `A template with the name "${name}" already exists.` },
        { status: 409 }
      );
    }

    const template = await EmailTemplate.create({
      name,
      subject,
      body: templateBody
    });

    return NextResponse.json({ success: true, template }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
