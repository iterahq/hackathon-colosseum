import type { ReactNode } from 'react';
import { AppTopBar } from '@/components/header/AppTopBar';
import '@/components/dashboard/dashboard.css';

const GRID = {
  backgroundColor: '#0A0908',
  backgroundImage: 'linear-gradient(#15130F 1px,transparent 1px),linear-gradient(90deg,#15130F 1px,transparent 1px)',
  backgroundSize: '26px 26px',
} as const;

/** Page chrome of the Courses area: the dashboard's grid background, its top bar and its content column. */
export function CoursesShell({ children }: { children: ReactNode }) {
  return (
    <div className="dash-root min-h-screen overflow-x-clip text-[#F4EDE2]" style={GRID}>
      <AppTopBar />
      <main className="mx-auto flex max-w-[1440px] flex-col gap-10 px-4 pb-14 pt-6 sm:px-8 xl:px-20 xl:pt-10">{children}</main>
    </div>
  );
}
