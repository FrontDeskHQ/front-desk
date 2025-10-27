import { Mesh, Program, Renderer, RenderTarget, Triangle } from "ogl";
import { useEffect, useId, useRef } from "react";
import { cn } from "../lib/utils";

export const HorizontalLine = ({
  variant = "full",
  style = "dashed",
  className,
}: {
  variant?: "full" | "outer" | "contained";
  style?: "dashed" | "solid";
  className?: string;
}) => {
  const strokeDasharray = style === "dashed" ? "5 5" : "none";

  return (
    <div
      className={cn(
        "w-full col-span-full text-border",
        variant === "outer" ? "-translate-y-px" : "h-px",
        className,
      )}
    >
      {variant === "full" ? (
        <svg
          className="absolute left-0 w-full h-px"
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <line
            x1="0"
            y1="0.5"
            x2="100%"
            y2="0.5"
            stroke="currentColor"
            strokeWidth="1"
            strokeDasharray={strokeDasharray}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      ) : variant === "contained" ? (
        <svg
          className="w-full h-px"
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <line
            x1="0"
            y1="0.5"
            x2="100%"
            y2="0.5"
            stroke="currentColor"
            strokeWidth="1"
            strokeDasharray={strokeDasharray}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      ) : (
        <>
          <svg
            className="absolute right-full w-[50vw] h-px"
            preserveAspectRatio="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <line
              x1="0"
              y1="0.5"
              x2="100%"
              y2="0.5"
              stroke="currentColor"
              strokeWidth="1"
              strokeDasharray={strokeDasharray}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <svg
            className="absolute left-full w-[50vw] h-px"
            preserveAspectRatio="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <line
              x1="0"
              y1="0.5"
              x2="100%"
              y2="0.5"
              stroke="currentColor"
              strokeWidth="1"
              strokeDasharray={strokeDasharray}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </>
      )}
    </div>
  );
};

export const DashedPattern = ({
  spacing = 8,
  strokeWidth = 1,
  className,
  color = "currentColor",
}: {
  spacing?: number;
  strokeWidth?: number;
  className?: string;
  color?: string;
}) => {
  const reactId = useId();
  const patternId = `dashed-pattern-${reactId}-${spacing}-${strokeWidth}-${color}`;

  return (
    <div className={cn("w-full", className)}>
      <svg
        className="w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <pattern
            id={patternId}
            width={spacing}
            height={spacing}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line
              x1="0"
              y1="0"
              x2="0"
              y2={spacing}
              stroke={color}
              strokeWidth={strokeWidth}
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${patternId})`} />
      </svg>
    </div>
  );
};

const waveVertexShader = `
attribute vec2 uv;
attribute vec2 position;

varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 0, 1);
}
`;

const waveFragmentShader = `
precision highp float;
uniform vec2 resolution;
uniform float time;
uniform float waveSpeed;
uniform float waveFrequency;
uniform float waveAmplitude;
uniform vec3 waveColor;
uniform vec2 mousePos;
uniform int enableMouseInteraction;
uniform float mouseRadius;

vec4 mod289(vec4 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
vec2 fade(vec2 t) { return t*t*t*(t*(t*6.0-15.0)+10.0); }

float cnoise(vec2 P) {
  vec4 Pi = floor(P.xyxy) + vec4(0.0,0.0,1.0,1.0);
  vec4 Pf = fract(P.xyxy) - vec4(0.0,0.0,1.0,1.0);
  Pi = mod289(Pi);
  vec4 ix = Pi.xzxz;
  vec4 iy = Pi.yyww;
  vec4 fx = Pf.xzxz;
  vec4 fy = Pf.yyww;
  vec4 i = permute(permute(ix) + iy);
  vec4 gx = fract(i * (1.0/41.0)) * 2.0 - 1.0;
  vec4 gy = abs(gx) - 0.5;
  vec4 tx = floor(gx + 0.5);
  gx = gx - tx;
  vec2 g00 = vec2(gx.x, gy.x);
  vec2 g10 = vec2(gx.y, gy.y);
  vec2 g01 = vec2(gx.z, gy.z);
  vec2 g11 = vec2(gx.w, gy.w);
  vec4 norm = taylorInvSqrt(vec4(dot(g00,g00), dot(g01,g01), dot(g10,g10), dot(g11,g11)));
  g00 *= norm.x; g01 *= norm.y; g10 *= norm.z; g11 *= norm.w;
  float n00 = dot(g00, vec2(fx.x, fy.x));
  float n10 = dot(g10, vec2(fx.y, fy.y));
  float n01 = dot(g01, vec2(fx.z, fy.z));
  float n11 = dot(g11, vec2(fx.w, fy.w));
  vec2 fade_xy = fade(Pf.xy);
  vec2 n_x = mix(vec2(n00, n01), vec2(n10, n11), fade_xy.x);
  return 2.3 * mix(n_x.x, n_x.y, fade_xy.y);
}

const int OCTAVES = 4;
float fbm(vec2 p) {
  float value = 0.0;
  float amp = 1.0;
  float freq = waveFrequency;
  for (int i = 0; i < OCTAVES; i++) {
    value += amp * abs(cnoise(p));
    p *= freq;
    amp *= waveAmplitude;
  }
  return value;
}

float pattern(vec2 p) {
  vec2 p2 = p - time * waveSpeed;
  return fbm(p + fbm(p2)); 
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  uv -= 0.5;
  uv.x *= resolution.x / resolution.y;
  float f = pattern(uv);
  if (enableMouseInteraction == 1) {
    vec2 mouseNDC = (mousePos / resolution - 0.5) * vec2(1.0, -1.0);
    mouseNDC.x *= resolution.x / resolution.y;
    float dist = length(uv - mouseNDC);
    float effect = 1.0 - smoothstep(0.0, mouseRadius, dist);
    f -= 0.5 * effect;
  }
  vec3 col = mix(vec3(0.0), waveColor, f);
  gl_FragColor = vec4(col, 1.0);
}
`;

const ditherVertexShader = `
attribute vec2 uv;
attribute vec2 position;

varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 0, 1);
}
`;

const ditherFragmentShader = `
precision highp float;

uniform sampler2D tMap;
uniform vec2 resolution;
uniform float colorNum;
uniform float pixelSize;

varying vec2 vUv;

float bayerMatrix8x8(vec2 coord) {
  float x = mod(coord.x, 8.0);
  float y = mod(coord.y, 8.0);
  int index = int(y) * 8 + int(x);
  
  // Bayer matrix values
  if (index == 0) return 0.0/64.0;
  if (index == 1) return 48.0/64.0;
  if (index == 2) return 12.0/64.0;
  if (index == 3) return 60.0/64.0;
  if (index == 4) return 3.0/64.0;
  if (index == 5) return 51.0/64.0;
  if (index == 6) return 15.0/64.0;
  if (index == 7) return 63.0/64.0;
  
  if (index == 8) return 32.0/64.0;
  if (index == 9) return 16.0/64.0;
  if (index == 10) return 44.0/64.0;
  if (index == 11) return 28.0/64.0;
  if (index == 12) return 35.0/64.0;
  if (index == 13) return 19.0/64.0;
  if (index == 14) return 47.0/64.0;
  if (index == 15) return 31.0/64.0;
  
  if (index == 16) return 8.0/64.0;
  if (index == 17) return 56.0/64.0;
  if (index == 18) return 4.0/64.0;
  if (index == 19) return 52.0/64.0;
  if (index == 20) return 11.0/64.0;
  if (index == 21) return 59.0/64.0;
  if (index == 22) return 7.0/64.0;
  if (index == 23) return 55.0/64.0;
  
  if (index == 24) return 40.0/64.0;
  if (index == 25) return 24.0/64.0;
  if (index == 26) return 36.0/64.0;
  if (index == 27) return 20.0/64.0;
  if (index == 28) return 43.0/64.0;
  if (index == 29) return 27.0/64.0;
  if (index == 30) return 39.0/64.0;
  if (index == 31) return 23.0/64.0;
  
  if (index == 32) return 2.0/64.0;
  if (index == 33) return 50.0/64.0;
  if (index == 34) return 14.0/64.0;
  if (index == 35) return 62.0/64.0;
  if (index == 36) return 1.0/64.0;
  if (index == 37) return 49.0/64.0;
  if (index == 38) return 13.0/64.0;
  if (index == 39) return 61.0/64.0;
  
  if (index == 40) return 34.0/64.0;
  if (index == 41) return 18.0/64.0;
  if (index == 42) return 46.0/64.0;
  if (index == 43) return 30.0/64.0;
  if (index == 44) return 33.0/64.0;
  if (index == 45) return 17.0/64.0;
  if (index == 46) return 45.0/64.0;
  if (index == 47) return 29.0/64.0;
  
  if (index == 48) return 10.0/64.0;
  if (index == 49) return 58.0/64.0;
  if (index == 50) return 6.0/64.0;
  if (index == 51) return 54.0/64.0;
  if (index == 52) return 9.0/64.0;
  if (index == 53) return 57.0/64.0;
  if (index == 54) return 5.0/64.0;
  if (index == 55) return 53.0/64.0;
  
  if (index == 56) return 42.0/64.0;
  if (index == 57) return 26.0/64.0;
  if (index == 58) return 38.0/64.0;
  if (index == 59) return 22.0/64.0;
  if (index == 60) return 41.0/64.0;
  if (index == 61) return 25.0/64.0;
  if (index == 62) return 37.0/64.0;
  if (index == 63) return 21.0/64.0;
  
  return 0.0;
}

vec3 dither(vec2 uv, vec3 color) {
  vec2 scaledCoord = floor(uv * resolution / pixelSize);
  float threshold = bayerMatrix8x8(scaledCoord) - 0.25;
  float step = 1.0 / (colorNum - 1.0);
  color += threshold * step;
  float bias = 0.2;
  color = clamp(color - bias, 0.0, 1.0);
  return floor(color * (colorNum - 1.0) + 0.5) / (colorNum - 1.0);
}

void main() {
  vec2 normalizedPixelSize = pixelSize / resolution;
  vec2 uvPixel = normalizedPixelSize * floor(vUv / normalizedPixelSize);
  vec4 color = texture2D(tMap, uvPixel);
  color.rgb = dither(vUv, color.rgb);
  gl_FragColor = color;
}
`;

interface DitherProps {
  waveSpeed?: number;
  waveFrequency?: number;
  waveAmplitude?: number;
  waveColor?: [number, number, number];
  colorNum?: number;
  pixelSize?: number;
  disableAnimation?: boolean;
  enableMouseInteraction?: boolean;
  mouseRadius?: number;
  className?: string;
}

export default function Dither({
  waveSpeed = 0.05,
  waveFrequency = 3,
  waveAmplitude = 0.3,
  waveColor = [0.5, 0.5, 0.5],
  colorNum = 4,
  pixelSize = 2,
  disableAnimation = false,
  enableMouseInteraction = true,
  mouseRadius = 1,
  className,
}: DitherProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const canvas = canvasRef.current;
    const container = containerRef.current;

    // Initialize renderer
    const renderer = new Renderer({
      canvas,
      width: container.clientWidth,
      height: container.clientHeight,
      dpr: window.devicePixelRatio,
      alpha: false,
    });
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);

    // Create geometry - full screen triangle
    const geometry = new Triangle(gl);

    // Wave program uniforms
    const waveUniforms = {
      time: { value: 0 },
      resolution: { value: [gl.canvas.width, gl.canvas.height] },
      waveSpeed: { value: waveSpeed },
      waveFrequency: { value: waveFrequency },
      waveAmplitude: { value: waveAmplitude },
      waveColor: { value: [...waveColor] },
      mousePos: { value: [0, 0] },
      enableMouseInteraction: { value: enableMouseInteraction ? 1 : 0 },
      mouseRadius: { value: mouseRadius },
    };

    // Wave program
    const waveProgram = new Program(gl, {
      vertex: waveVertexShader,
      fragment: waveFragmentShader,
      uniforms: waveUniforms,
    });

    const waveMesh = new Mesh(gl, { geometry, program: waveProgram });

    // Create render target for post-processing
    const renderTarget = new RenderTarget(gl, {
      width: gl.canvas.width,
      height: gl.canvas.height,
    });

    // Dither post-process program
    const ditherUniforms = {
      tMap: { value: renderTarget.texture },
      resolution: { value: [gl.canvas.width, gl.canvas.height] },
      colorNum: { value: colorNum },
      pixelSize: { value: pixelSize },
    };

    const ditherProgram = new Program(gl, {
      vertex: ditherVertexShader,
      fragment: ditherFragmentShader,
      uniforms: ditherUniforms,
    });

    const ditherMesh = new Mesh(gl, { geometry, program: ditherProgram });

    // Mouse tracking
    const mousePos = [0, 0];

    const handlePointerMove = (e: PointerEvent) => {
      if (!enableMouseInteraction) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio;
      mousePos[0] = (e.clientX - rect.left) * dpr;
      mousePos[1] = (rect.height - (e.clientY - rect.top)) * dpr;
    };

    // Handle resize
    const handleResize = () => {
      const rect = container.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;

      if (width === 0 || height === 0) return;

      canvas.width = width * window.devicePixelRatio;
      canvas.height = height * window.devicePixelRatio;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      renderer.setSize(width, height);

      const pixelWidth = canvas.width;
      const pixelHeight = canvas.height;

      waveUniforms.resolution.value = [pixelWidth, pixelHeight];
      ditherUniforms.resolution.value = [pixelWidth, pixelHeight];

      renderTarget.setSize(pixelWidth, pixelHeight);
      ditherUniforms.tMap.value = renderTarget.texture;
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    canvas.addEventListener("pointermove", handlePointerMove);

    // Animation loop
    const startTime = Date.now();
    let animationFrameId: number;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      // Update uniforms
      if (!disableAnimation) {
        const elapsed = (Date.now() - startTime) * 0.001;
        waveUniforms.time.value = elapsed;
      }

      waveUniforms.waveSpeed.value = waveSpeed;
      waveUniforms.waveFrequency.value = waveFrequency;
      waveUniforms.waveAmplitude.value = waveAmplitude;
      waveUniforms.waveColor.value = [...waveColor];
      waveUniforms.enableMouseInteraction.value = enableMouseInteraction
        ? 1
        : 0;
      waveUniforms.mouseRadius.value = mouseRadius;
      waveUniforms.mousePos.value = mousePos;

      ditherUniforms.colorNum.value = colorNum;
      ditherUniforms.pixelSize.value = pixelSize;

      // Render wave to texture
      renderer.render({
        scene: waveMesh,
        target: renderTarget,
      });

      // Render dithered result to screen
      renderer.render({
        scene: ditherMesh,
      });
    };

    animate();

    // Cleanup
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
      canvas.removeEventListener("pointermove", handlePointerMove);
    };
  }, [
    waveSpeed,
    waveFrequency,
    waveAmplitude,
    waveColor,
    colorNum,
    pixelSize,
    disableAnimation,
    enableMouseInteraction,
    mouseRadius,
  ]);

  return (
    <div
      ref={containerRef}
      className={cn("-z-10 absolute inset-0 overflow-hidden", className)}
    >
      <canvas
        ref={canvasRef}
        className="block"
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          position: "absolute",
          top: 0,
          left: 0,
        }}
      />
    </div>
  );
}
