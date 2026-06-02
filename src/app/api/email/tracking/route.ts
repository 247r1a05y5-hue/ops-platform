import { NextRequest, NextResponse } from 'next/server';
import { connectDB, Lead, Notification } from '@/lib/db';

export async function GET(req: NextRequest) {
  let redirectUrl: string | null = null;
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const emailId = searchParams.get('id');
    const leadId = searchParams.get('leadId');
    const type = searchParams.get('type');
    redirectUrl = searchParams.get('redirect');

    if (leadId) {
      const lead = await Lead.findById(leadId);
      if (lead) {
        // Find the email in lead's emails array (we can look at index or match status/subject. Since it's a subdocument array, we can increment last email or match)
        const emailIndex = lead.emails.length - 1;
        if (emailIndex >= 0) {
          if (type === 'open') {
            lead.emails[emailIndex].opens += 1;
            lead.emails[emailIndex].status = 'opened';
            lead.history.push({
              event: `Email Opened: "${lead.emails[emailIndex].subject}"`,
              user: 'Lead',
              time: new Date()
            });

            // Trigger Notifications on lead action
            await Notification.create({
              userId: lead.assignedTo || null,
              title: 'Lead Email Opened',
              message: `${lead.name} (${lead.company}) opened your email: "${lead.emails[emailIndex].subject}"`,
              read: false
            });

          } else if (type === 'click') {
            lead.emails[emailIndex].clicks += 1;
            lead.emails[emailIndex].status = 'clicked';
            lead.history.push({
              event: `Email Link Clicked: "${lead.emails[emailIndex].subject}"`,
              user: 'Lead',
              time: new Date()
            });

            await Notification.create({
              userId: lead.assignedTo || null,
              title: 'Lead Email Link Clicked',
              message: `${lead.name} (${lead.company}) clicked a link in: "${lead.emails[emailIndex].subject}"`,
              read: false
            });
          }
        }
        await lead.save();
      }
    }

    if (type === 'open') {
      // Return transparent 1x1 pixel image
      const pixelBuffer = Buffer.from(
        'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
        'base64'
      );
      return new NextResponse(pixelBuffer, {
        headers: {
          'Content-Type': 'image/gif',
          'Content-Length': pixelBuffer.length.toString(),
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
        }
      });
    }

    if (type === 'click' && redirectUrl) {
      return NextResponse.redirect(decodeURIComponent(redirectUrl));
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Tracking failed:', error);
    // If click redirect fails, at least redirect to landing page
    if (redirectUrl) {
      return NextResponse.redirect(decodeURIComponent(redirectUrl));
    }
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
