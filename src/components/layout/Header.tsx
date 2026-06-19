import { ArrowLeft } from 'lucide-react';
import { ProjectStatus } from '@/enums';
import { Button } from '@devfellowship/components';
import { Logo } from '@/components/branded';

interface HeaderProps {
  projectName: string;
  projectStatus: ProjectStatus;
  trackTitle?: string;
  onBack?: () => void;
}

// Brand: status = ALWAYS a colored dot + text label (never color-only, never emoji).
const statusConfig = {
  [ProjectStatus.OK]: {
    color: 'text-success',
    dot: 'bg-success',
    label: 'OK',
  },
  [ProjectStatus.WARNING]: {
    color: 'text-warning',
    dot: 'bg-warning',
    label: 'WARNING',
  },
  [ProjectStatus.BROKEN]: {
    color: 'text-destructive',
    dot: 'bg-destructive',
    label: 'BROKEN',
  },
};

export function Header({
  projectName,
  projectStatus,
  trackTitle,
  onBack,
}: HeaderProps) {
  const status = statusConfig[projectStatus];

  return (
    <header className="shrink-0 z-50 border-b border-border bg-background">
      <div className="flex items-center justify-between h-12 px-4">
        {/* Left section - Logo */}
        <div className="flex items-center gap-3">
          {onBack && (
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={onBack}
              className="h-8 w-8"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          
          <div className="flex items-center gap-2">
            <Logo size={22} />
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              by DevFellowship
            </span>
          </div>
        </div>

        {/* Center - Track Title */}
        {trackTitle && (
          <div className="absolute left-1/2 -translate-x-1/2">
            <span className="text-sm font-medium text-muted-foreground">{trackTitle}</span>
          </div>
        )}

        {/* Right section - Status */}
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border border-border font-mono text-[11px] uppercase tracking-wider ${status.color}`}>
            <span className={`w-2 h-2 rounded-full ${status.dot}`} />
            <span>{status.label}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
