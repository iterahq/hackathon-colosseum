import type { Meta, StoryObj } from '@storybook/react';
import { LiveActivityStage } from '@/components/live/LiveActivityStage';
import type { Activity } from '@/types/content';
import scenarios from '../test/fixtures/sandbox-scenarios.json';

const c1 = (scenarios as Record<string, unknown>).c1 as Record<string, unknown>;
const activity: Activity = {
  id: 't-sandbox',
  lessonId: 'l',
  ordinal: 0,
  kind: 'sandbox_scenario',
  spec: c1,
  rubric: null,
};

/** The instructor stage `<main>` — same markup as InstructorClassPage, at a fixed
 *  tall height so the vertical balance (top-aligned vs centered) is visible. */
function Stage({ centered }: { centered: boolean }) {
  return (
    <div className="h-[820px] w-full bg-background flex flex-col border border-border">
      <div className="h-1 w-full bg-muted">
        <div className="h-full w-1/4 bg-clay" />
      </div>
      <div className="flex-1 flex min-h-0">
        <main
          className={`flex-1 overflow-y-auto px-4 md:px-8 pb-8 ${
            centered ? 'flex flex-col' : 'pt-14 md:pt-20'
          }`}
        >
          <div className={`max-w-2xl w-full mx-auto ${centered ? 'my-auto py-10' : ''}`}>
            <h1 className="font-display font-bold text-3xl md:text-4xl text-foreground">
              Aula piloto — o poder do contexto
            </h1>
            <LiveActivityStage activity={activity} readOnly testid="instructor-activity-stage" />
          </div>
        </main>
        <aside className="hidden lg:block w-[340px] shrink-0 border-l border-border bg-card" />
      </div>
    </div>
  );
}

const meta: Meta = {
  title: 'Design Playground/Instructor Stage Lab',
  parameters: { layout: 'fullscreen', controls: { disable: true } },
};
export default meta;

export const Atual: StoryObj = { render: () => <Stage centered={false} /> };
export const Centralizado: StoryObj = { render: () => <Stage centered /> };
