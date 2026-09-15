import React from 'react';
import { Composition } from 'remotion';
import { Video } from './Video.jsx';

// A single dynamic composition. Real dimensions/duration/props are supplied at
// render time via selectComposition's calculateMetadata + inputProps, so one
// composition can produce any aspect ratio / length the scene doc requests.
const DEFAULT_DOC = {
  width: 1080,
  height: 1920,
  fps: 30,
  durationInFrames: 150,
  theme: { palette: 'midnight', font: 'Inter' },
  scenes: [
    { template: 'TitleIntro', durationInFrames: 90, props: { title: 'Script → Video', subtitle: 'Powered by Remotion', eyebrow: 'Preview' } },
    { template: 'TextReveal', durationInFrames: 60, props: { lines: ['Edit the scene JSON', 'to change everything'], revealBy: 'line' } },
  ],
};

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="ScriptVideo"
        component={Video}
        durationInFrames={DEFAULT_DOC.durationInFrames}
        fps={DEFAULT_DOC.fps}
        width={DEFAULT_DOC.width}
        height={DEFAULT_DOC.height}
        defaultProps={{ doc: DEFAULT_DOC }}
        calculateMetadata={({ props }) => {
          const doc = (props && props.doc) || DEFAULT_DOC;
          const total = Array.isArray(doc.scenes)
            ? doc.scenes.reduce((a, s) => a + Math.max(1, Math.round(s.durationInFrames || 90)), 0)
            : DEFAULT_DOC.durationInFrames;
          return {
            durationInFrames: Math.max(1, total || DEFAULT_DOC.durationInFrames),
            fps: doc.fps || 30,
            width: doc.width || 1080,
            height: doc.height || 1920,
          };
        }}
      />
    </>
  );
};
