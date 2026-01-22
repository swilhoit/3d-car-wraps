import { Panel } from '@/hooks/useUVEditorState';

// Logo overlays not available for Waymo panels
export const getLogoOverlayPath = (panel: Panel, variant: 'black' | 'white'): string | null => {
  // Waymo panels don't have logo overlays
  return null;
};

// Panel masks not available for Waymo panels
export const getPanelMaskPath = (panel: Panel): string | null => {
  // Waymo panels don't have masks
  return null;
};

// Cutline guides not available for Waymo panels
export const getCutlineGuidePath = (panelName: string): string | null => {
  // Waymo panels don't have cutline guides
  return null;
};
