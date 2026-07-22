/** Short human label for an activity row: prompt > title > caller fallback. */
export function activityLabel(spec: Record<string, unknown>, fallback: string): string {
  const prompt = spec.prompt;
  if (typeof prompt === 'string' && prompt.trim()) return prompt.trim();
  const title = spec.title;
  if (typeof title === 'string' && title.trim()) return title.trim();
  return fallback;
}
