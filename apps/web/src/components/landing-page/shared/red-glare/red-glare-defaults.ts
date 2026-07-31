/** Primary button blue (#345BCA) — normalized with blue at full intensity for the glow. */
const PRIMARY_BLUE: [number, number, number] = [52 / 202, 91 / 202, 1];

/** Dark void tint derived from the same hue as the primary button. */
const PRIMARY_BLUE_VOID: [number, number, number] = [
  3 / 255,
  5 / 255,
  16 / 255,
];

export const RED_GLARE_UNIFORMS = {
  u_aberration: { value: 0.2 },
  u_background: { value: [...PRIMARY_BLUE_VOID] },
  u_bloom: { value: 1.44 },
  u_cellSize: { value: 0.175 },
  u_color: { value: [...PRIMARY_BLUE] },
  u_contrast: { value: 1 },
  u_density: { value: 0.69 },
  u_exposure: { value: -0.12 },
  u_glow: { value: 1.11 },
  u_haze: { value: 0.155 },
  u_highlight: { value: [1, 1, 1] as number[] },
  u_intensity: { value: 0.4 },
  u_layers: { value: 6 },
  u_life: { value: 0.85 },
  u_noise: { value: 0.8 },
  u_saturation: { value: 1 },
  u_seed: { value: 12 },
  u_sizeMax: { value: 0.22 },
  u_sizeMin: { value: 0.03 },
  u_softness: { value: 2.24 },
  u_speed: { value: 0.245 },
  u_spread: { value: 1.2 },
} satisfies Record<string, { value: number | number[] }>;
