import { motion } from 'framer-motion';
import type { ScenePageElementSpec } from '../../specs.js';
import { SCENE_PAGE_BACKGROUND } from './sceneTheme.js';
import { SceneBrowserBar } from './SceneBrowserBar.js';
import { ScenePageElement } from './ScenePageElement.js';

/** The page in a browser window; the target element pops every time it changes. */
export function BrowserFrame({
  elements,
  targetId,
  targetText,
  url,
}: {
  elements: ScenePageElementSpec[];
  targetId: string;
  targetText: string;
  url: string;
}) {
  return (
    <div
      className="rounded-xl overflow-hidden border border-black/10 shadow-[0_30px_80px_-30px_rgba(0,0,0,.9)]"
      style={{ background: SCENE_PAGE_BACKGROUND }}
      data-testid="live-type-browser"
    >
      <SceneBrowserBar url={url} />
      <div className="flex flex-col gap-4 p-7 min-h-[230px] max-sm:min-h-[150px] max-sm:p-5 short:min-h-[150px] short:p-5">
        {elements.map((element) =>
          element.id === targetId ? (
            <motion.div
              key={`${element.id}-${targetText.length}`}
              initial={{ scale: 1.04, filter: 'brightness(1.25)' }}
              animate={{ scale: 1, filter: 'brightness(1)' }}
              transition={{ type: 'spring', stiffness: 400, damping: 18 }}
              style={{ transformOrigin: 'left center' }}
              data-testid="live-type-target"
            >
              <ScenePageElement element={element} text={targetText} />
            </motion.div>
          ) : (
            <div key={element.id}>
              <ScenePageElement element={element} />
            </div>
          ),
        )}
      </div>
    </div>
  );
}
