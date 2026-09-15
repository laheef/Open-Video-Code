import React from 'react';
import { AbsoluteFill, Series, useVideoConfig } from 'remotion';
import { TEMPLATE_COMPONENTS } from './registry.js';

// Renders a full scene document as a sequence of template scenes.
export const Video = ({ doc }) => {
  const { durationInFrames } = useVideoConfig();
  const scenes = (doc && Array.isArray(doc.scenes) && doc.scenes.length)
    ? doc.scenes
    : [{ template: 'TitleIntro', durationInFrames, props: { title: 'No scenes' } }];
  const theme = (doc && doc.theme) || {};

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <Series>
        {scenes.map((scene, i) => {
          const Comp = TEMPLATE_COMPONENTS[scene.template] || TEMPLATE_COMPONENTS.TextReveal;
          const dur = Math.max(1, Math.round(scene.durationInFrames || 90));
          return (
            <Series.Sequence key={i} durationInFrames={dur}>
              <Comp {...(scene.props || {})} theme={theme} />
            </Series.Sequence>
          );
        })}
      </Series>
    </AbsoluteFill>
  );
};
