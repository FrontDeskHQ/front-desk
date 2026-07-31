export const redGlareFrag = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_density;
uniform float u_cellSize;
uniform float u_sizeMin;
uniform float u_sizeMax;
uniform float u_softness;
uniform float u_intensity;
uniform float u_speed;
uniform float u_glow;
uniform float u_seed;
uniform float u_layers;
uniform float u_spread;
uniform float u_life;
uniform float u_haze;
uniform vec3 u_color;
uniform vec3 u_highlight;
uniform vec3 u_background;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21) + u_seed);
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec2 hash22(vec2 p) {
  float n = hash21(p);
  return vec2(n, hash21(p + n + 19.19));
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

// 3 octaves — fine detail was ~9% amplitude and mostly lost under bloom/grain
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 m = mat2(0.80, 0.60, -0.60, 0.80);
  for (int i = 0; i < 3; i++) {
    v += a * noise(p);
    p = m * p * 2.02;
    a *= 0.5;
  }
  return v;
}

// Cheap pulse — sine carrier + one noise octave for irregularity
float lifeNoise(vec2 id, float layerIndex) {
  float phase = hash21(id + layerIndex * 19.3 + 71.0) * 6.2831853;
  float rate = mix(0.7, 1.2, hash21(id + 88.2 + layerIndex));
  float speed = 0.06 + u_life * 0.1;
  float t = u_time * speed * rate + phase;
  float wobble = noise(vec2(
    id.x * 0.35 + layerIndex * 12.7 + 203.1,
    id.y * 0.3 + t * 0.15 + 157.4
  ));
  return 0.5 + 0.5 * sin(t) * mix(0.75, 1.0, wobble);
}

float glareBlob(float distSq, float radius, float softness) {
  float radiusSq = max(radius * radius, 1e-8);
  float edge = mix(0.002, 0.08, clamp(softness / 3.0, 0.0, 1.0));
  float outer = 1.0 + edge * 0.25;
  float outerSq = outer * outer * radiusSq;
  if (distSq >= outerSq) {
    return 0.0;
  }
  float nd = sqrt(distSq / radiusSq);
  return 1.0 - smoothstep(1.0 - edge, 1.0 + edge * 0.25, nd);
}

float layerContribution(vec2 uv, float layerIndex, float scale) {
  float layerT = layerIndex / max(u_layers - 1.0, 1.0);
  // Parallax: bigger (near) layers drift faster, fine (far) layers slower
  float parallax = mix(1.5, 0.2, layerT);
  float time = u_time * u_speed * parallax;

  // Slow drift + light domain warp for organic motion
  vec2 drift = vec2(time * 0.31, time * -0.19);
  vec2 p = uv + drift * 0.15;
  if (u_spread > 1e-4) {
    // One FBM + one noise octave for the other axis (was two full FBMs)
    float wx = fbm(uv * 1.4 + drift + layerIndex * 3.1);
    float wy = noise(uv * 2.1 - drift.yx + 17.0 + layerIndex);
    vec2 warp = vec2(wx, wy);
    p += (warp - 0.5) * u_spread * 0.08;
  }

  vec2 cell = floor(p / scale);
  float sum = 0.0;
  // Large layers still sparser; fine layers denser, but not packed solid
  float layerDensity = clamp(
    mix(u_density * 0.48, u_density * 0.9, pow(layerT, 0.7)),
    0.0,
    1.0
  );

  float edge = mix(0.002, 0.08, clamp(u_softness / 3.0, 0.0, 1.0));
  float outer = 1.0 + edge * 0.25;
  float sizeBias = mix(1.35, 0.55, layerT);
  float radiusScale = sizeBias * scale * 2.4;
  float maxRadius = u_sizeMax * radiusScale;
  float maxDistSq = (outer * maxRadius) * (outer * maxRadius);

  // 3×3 neighborhood so blobs spill across cell borders
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 id = cell + vec2(float(x), float(y));
      vec2 rnd = hash22(id + layerIndex * 13.7);

      // Per-cell density gate only — no spatial mask
      if (rnd.x > layerDensity) {
        continue;
      }

      // Geometry first so we can skip lifeNoise for off-screen blobs
      vec2 offset = hash22(id + 91.7 + layerIndex);
      vec2 center = (id + offset * 0.85 + 0.075) * scale;

      float sizeT = hash21(id + 4.2 + layerIndex);
      float radius = mix(u_sizeMin, u_sizeMax, sizeT) * radiusScale;

      vec2 delta = p - center;
      // Mild elliptical stretch for "circular-ish" / cat-eye feel
      float ellipticity = mix(0.82, 1.0, hash21(id + 11.1));
      delta.x *= ellipticity;

      float distSq = dot(delta, delta);
      // Conservative cull using max possible radius, then precise cull
      if (distSq >= maxDistSq) {
        continue;
      }
      float blob = glareBlob(distSq, radius, u_softness);
      if (blob <= 0.0) {
        continue;
      }

      // Independent pulse — wider swing so appear/disappear reads clearly
      float pulse = smoothstep(0.25, 0.72, lifeNoise(id, layerIndex));
      float visibility = mix(1.0, pulse, u_life);
      if (visibility <= 1e-4) {
        continue;
      }

      float bright = mix(0.35, 1.0, hash21(id + 7.7)) * visibility;
      // Sparse bright outliers — more common on fine layers
      bright *= mix(0.7, 1.8, step(mix(0.94, 0.86, layerT), hash21(id + 2.3)));

      sum += blob * bright;
    }
  }

  // Fine layers stay visible as pin lights without washing out
  float layerGain = mix(1.05, 0.7, layerT);
  return sum * layerGain;
}

void main() {
  vec2 uv = v_uv;
  float aspect = u_resolution.x / max(u_resolution.y, 1.0);
  uv.x *= aspect;

  // Center origin for nicer framing
  uv -= vec2(aspect * 0.5, 0.5);

  vec3 col = u_background;

  // Soft noise haze — almost dark, gently tints the void
  if (u_haze > 1e-4) {
    float hazeTime = u_time * u_speed * 0.035;
    float haze =
      fbm(uv * 1.6 + vec2(hazeTime, -hazeTime * 0.7) + 41.0) * 0.7 +
      fbm(uv * 3.2 + vec2(-hazeTime * 0.5, hazeTime * 0.4) + 93.0) * 0.3;
    haze = pow(haze, 1.4);
    col += u_color * haze * u_haze;
  }

  float glare = 0.0;
  // Successive /1.4 matches u_cellSize / pow(1.4, i) without pow()
  float scale = u_cellSize;
  for (int i = 0; i < 8; i++) {
    if (float(i) >= u_layers) {
      break;
    }
    glare += layerContribution(uv, float(i), scale);
    scale /= 1.4;
  }

  glare *= u_intensity;
  // Soft-cap additive stacking so overlaps stay tinted, not white
  glare = glare / (1.0 + glare * 0.85);

  // Additive color over tinted dark base — no white hotspot blowout
  col += u_color * glare;
  col += u_highlight * glare * glare * 0.25;

  // Soft bloom-ish tone curve
  col = pow(max(col, 0.0), vec3(1.0 / max(u_glow, 0.01)));

  fragColor = vec4(col, 1.0);
}
`;
