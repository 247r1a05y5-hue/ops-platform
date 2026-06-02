// Client-side activity logging utility.
// Does NOT read from localStorage — the server identifies the user from
// the HTTP-only session cookie automatically.

export const triggerActivityLog = async (
  actionType: string,
  description: string,
  metadata: Record<string, unknown> = {}
): Promise<void> => {
  try {
    await fetch('/api/activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // ensures cookie is sent
      body: JSON.stringify({ actionType, description, metadata }),
    });
  } catch (err) {
    console.error('Failed to log activity:', err);
  }
};
