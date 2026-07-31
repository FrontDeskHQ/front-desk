export const blurFrag = `#version 300 es
precision mediump float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D tMap;
uniform vec2 u_direction;
uniform vec2 u_texel;

void main() {
  vec2 off = u_direction * u_texel;
  vec3 color = texture(tMap, v_uv).rgb * 0.227027027;
  color += texture(tMap, v_uv + off * 1.3846153846).rgb * 0.3162162162;
  color += texture(tMap, v_uv - off * 1.3846153846).rgb * 0.3162162162;
  color += texture(tMap, v_uv + off * 3.2307692308).rgb * 0.0702702703;
  color += texture(tMap, v_uv - off * 3.2307692308).rgb * 0.0702702703;
  fragColor = vec4(color, 1.0);
}
`;
