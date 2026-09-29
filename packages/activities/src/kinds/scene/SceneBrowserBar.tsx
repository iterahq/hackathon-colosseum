/** The fake browser chrome above the page: three dots and the address. */
export function SceneBrowserBar({ url }: { url: string }) {
  return (
    <div className="h-8 flex items-center gap-1.5 px-3 bg-white/70 border-b border-black/5">
      <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
      <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
      <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
      <span className="ml-3 flex-1 truncate rounded-md bg-black/5 px-2 py-0.5 text-[11px] text-black/40 font-mono">
        {url}
      </span>
    </div>
  );
}
