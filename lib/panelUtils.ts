import { Panel } from '@/hooks/useUVEditorState';

export const getLogoOverlayPath = (panel: Panel, variant: 'black' | 'white'): string | null => {
  const panelName = panel.name.toUpperCase().replace(' ', '-');
  const colorSuffix = variant === 'black' ? 'BLK' : 'WHITE';

  // Map panel names to overlay filenames
  const overlayMap: { [key: string]: string | null } = {
    'RIGHT': `RIGHT-LOGO-${colorSuffix}.png`,
    'LEFT': `LEFT-LOGO-${colorSuffix}.png`,
    'BACK': `BACK-LOGO-${colorSuffix}.png`,
    'LID': `LID-LOGO-${colorSuffix}.png`,
    'TOP-FRONT': null, // No overlay for TOP FRONT
    'FRONT': null // No overlay for FRONT
  };

  const filename = overlayMap[panelName];
  return filename ? `/logo-overlays/${filename}` : null;
};

export const getPanelMaskPath = (panel: Panel): string | null => {
  const panelName = panel.name.toUpperCase();

  // Map panel names to mask filenames
  const maskMap: { [key: string]: string | null } = {
    'RIGHT': 'RIGHT-mask.png',
    'LEFT': 'LEFT-mask.png',
    'BACK': 'BACK-mask.png',
    'LID': 'LID-mask.png',
    'TOP FRONT': 'TOP FRONT-mask.png',
    'FRONT': 'FRONT-mask.png'
  };

  const filename = maskMap[panelName];
  return filename ? `/panel-masks/${filename}` : null;
};

export const getCutlineGuidePath = (panelName: string): string | null => {
  const guideMap: { [key: string]: string } = {
    'RIGHT': '/Cutline Guides/RIGHT-GUIDE.png',
    'LEFT': '/Cutline Guides/LEFT-GUIDE.png',
    'BACK': '/Cutline Guides/BACK-GUIDE.png',
    'TOP FRONT': '/Cutline Guides/TOP-FRONT-GUIDE.png',
    'FRONT': '/Cutline Guides/FRONT-GUIDE.png',
    'LID': '/Cutline Guides/LID-GUIDE.png',
  };
  return guideMap[panelName] || null;
};
