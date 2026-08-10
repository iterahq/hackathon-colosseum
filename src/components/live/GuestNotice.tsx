/**
 * The dead-end screen of the guest surface: an invalid code, a build without
 * itera-api configured, a class that is already over. Deliberately plain — a
 * visitor who cannot get in should not be shown app chrome or a price tag.
 */
export function GuestNotice({
  testid,
  title,
  body,
}: {
  testid: string;
  title: string;
  body: string;
}) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div
        className="max-w-md w-full rounded-3xl border border-dashed border-border bg-card/50 p-10 text-center"
        data-testid={testid}
      >
        <p className="font-display text-lg text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground mt-2">{body}</p>
      </div>
    </div>
  );
}
