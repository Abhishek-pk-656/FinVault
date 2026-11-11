import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Venzer Botanical Minimalist Palette
        obsidian: '#040A0A',
        obsidianCarbon: '#040A0A',
        softMint: '#DEEEDA',
        surface: '#DEEEDA',
        mossCeladon: '#C7E0BA',
        sagePistachio: '#C7E0BA',
        pistachio: '#C7E0BA',
        oliveLeaf: '#7AAA4A',
        botanicalGreen: '#7AAA4A',
        sageSlate: '#90A999',
        mutedSage: '#90A999',
        slateBase: '#38424C',
        charcoalSlate: '#38424C',
        alert: '#E06A55',
        alertImbalance: '#E06A55',
        imbalance: '#E06A55',
      },
      borderRadius: {
        '3xl': '24px', // 24px container radius
        'xl': '12px',  // 12px interactive control radius
      },
      transitionDuration: {
        '150': '150ms',
        '180': '180ms',
      },
      transitionTimingFunction: {
        'ease-out': 'cubic-bezier(0, 0, 0.2, 1)',
        'venzer-out': 'cubic-bezier(0, 0, 0.2, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
