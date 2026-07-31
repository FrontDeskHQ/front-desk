export const compositeFrag = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform float u_bloom;
uniform float u_exposure;
uniform float u_contrast;
uniform float u_saturation;
uniform float u_noise;
uniform float u_aberration;
uniform float u_time;
uniform vec2 u_resolution;

// High-quality 3D hash — avoids the axis streaks cheap hashes show
vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

vec3 sampleGrade(vec2 uv) {
  vec3 scene = texture(tScene, uv).rgb;
  if (u_bloom <= 1e-4) {
    return scene;
  }
  return scene + texture(tBloom, uv).rgb * u_bloom;
}

// Camera grain — fine per-pixel, per-channel, signal-dependent
vec3 cameraGrain(vec3 col, vec2 fragCoord, float amount, float time) {
  // Continuous time + large irrational offsets so frames never lattice-align
  vec3 grain = hash33(vec3(fragCoord, time * 1.7 + 17.13)) * 2.0 - 1.0;
  // Slight mono mix keeps it film-like instead of pure digital RGB static
  float mono = dot(grain, vec3(0.333));
  grain = mix(vec3(mono), grain, 0.65);

  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  // Peak in midtones; ease off crushed blacks / clipped whites
  float response =
    smoothstep(0.0, 0.06, luma) * (1.0 - smoothstep(0.75, 1.05, luma));
  response = mix(0.4, 1.0, response);

  float strength = amount * 0.18;
  col *= 1.0 + grain * strength * response;
  col += grain * strength * 0.03 * response;

  return col;
}

void main() {
  vec3 col;

  // Radial chromatic aberration — R/B split from center
  if (u_aberration > 1e-4) {
    vec2 centered = v_uv - 0.5;
    vec2 ca = centered * u_aberration * 0.02;
    float r = sampleGrade(v_uv + ca).r;
    float g = sampleGrade(v_uv).g;
    float b = sampleGrade(v_uv - ca).b;
    col = vec3(r, g, b);
  } else {
    col = sampleGrade(v_uv);
  }

  // Exposure in stops
  col *= exp2(u_exposure);

  // Contrast around mid-gray
  col = (col - 0.5) * u_contrast + 0.5;

  // Saturation
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(luma), col, u_saturation);

  if (u_noise > 1e-4) {
    col = cameraGrain(col, gl_FragCoord.xy, u_noise, u_time);
  }

  fragColor = vec4(max(col, 0.0), 1.0);
}
`;
