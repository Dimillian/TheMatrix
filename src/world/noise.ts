const fract = (value: number): number => value - Math.floor(value);

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const smoothstep = (value: number): number => value * value * (3 - 2 * value);

export function hash2D(x: number, z: number, seed: number): number {
  return fract(Math.sin(x * 127.1 + z * 311.7 + seed * 74.7) * 43758.5453123);
}

export function valueNoise2D(x: number, z: number, seed: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const x1 = x0 + 1;
  const z1 = z0 + 1;

  const tx = smoothstep(x - x0);
  const tz = smoothstep(z - z0);

  const v00 = hash2D(x0, z0, seed);
  const v10 = hash2D(x1, z0, seed);
  const v01 = hash2D(x0, z1, seed);
  const v11 = hash2D(x1, z1, seed);

  return lerp(lerp(v00, v10, tx), lerp(v01, v11, tx), tz);
}

export function fbm2D(
  x: number,
  z: number,
  seed: number,
  octaves: number,
  lacunarity = 2,
  gain = 0.5,
): number {
  let amplitude = 0.5;
  let frequency = 1;
  let sum = 0;
  let normalization = 0;

  for (let octave = 0; octave < octaves; octave += 1) {
    sum += valueNoise2D(x * frequency, z * frequency, seed + octave * 17) * amplitude;
    normalization += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }

  return normalization === 0 ? 0 : sum / normalization;
}
