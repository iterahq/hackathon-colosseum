/** The key the sealed ids of a lesson are derived from. It never leaves the server. */
export function sealSecret(): string {
  const secret = Deno.env.get('LESSON_SEAL_SECRET') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!secret) throw new Error('No secret to seal lessons with');
  return `lesson-seal:${secret}`;
}
