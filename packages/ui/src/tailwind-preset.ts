import { TOKENS } from './tokens';

export interface TailwindConfigPreset {
  theme?: {
    extend?: Record<string, any>;
  };
  plugins?: any[];
}

/**
 * Venzer Botanical Minimalist Tailwind CSS Preset
 * Automatically extended by apps/web and packages/ui.
 */
const venzerPreset: TailwindConfigPreset = {
  theme: {
    extend: {
      colors: {
        obsidian: TOKENS.colors.obsidianCarbon,
        obsidianCarbon: TOKENS.colors.obsidianCarbon,
        softMint: TOKENS.colors.softMint,
        mossCeladon: TOKENS.colors.mossCeladon,
        sagePistachio: TOKENS.colors.mossCeladon,
        oliveLeaf: TOKENS.colors.oliveLeaf,
        botanicalGreen: TOKENS.colors.oliveLeaf,
        sageSlate: TOKENS.colors.sageSlate,
        mutedSage: TOKENS.colors.sageSlate,
        slateBase: TOKENS.colors.slateBase,
        charcoalSlate: TOKENS.colors.slateBase,
        alert: TOKENS.colors.alert,
        imbalance: TOKENS.colors.alert,
      },
      borderRadius: {
        '3xl': TOKENS.layout.containerRadius, // 24px container radius
        'xl': TOKENS.layout.controlRadius,     // 12px interactive control radius
      },
      transitionDuration: {
        '150': `${TOKENS.layout.transitionDurationMs}ms`,
        '180': '180ms',
      },
      transitionTimingFunction: {
        'venzer-out': TOKENS.layout.timingFunction,
      },
    },
  },
};

export default venzerPreset;
