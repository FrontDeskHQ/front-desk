import { useEffect, useRef } from "react";

import { blurFrag } from "./shaders/blur.frag";
import { compositeFrag } from "./shaders/composite.frag";

type UniformValue = number | number[];

interface AnimatedShaderOptions {
  vertex: string;
  fragment: string;
  uniforms: Record<string, { value: UniformValue }>;
}

interface AnimatedShaderResult {
  containerRef: React.RefObject<HTMLDivElement | null>;
  uniformsRef: React.MutableRefObject<Record<string, UniformValue>>;
}

interface RenderTargetLike {
  width: number;
  height: number;
  texture: unknown;
  setSize: (w: number, h: number) => void;
}

interface ProgramLike {
  uniforms: Record<string, { value: UniformValue | unknown }>;
}

interface BloomPipeline {
  canvas: HTMLCanvasElement;
  dpr: number;
  sceneMesh: unknown;
  blurMesh: unknown;
  compositeMesh: unknown;
  sceneProgram: ProgramLike;
  blurProgram: ProgramLike;
  compositeProgram: ProgramLike;
  sceneTarget: RenderTargetLike;
  blurTargetA: RenderTargetLike;
  blurTargetB: RenderTargetLike;
  renderer: {
    setSize: (w: number, h: number) => void;
    render: (opts: {
      scene: unknown;
      target?: unknown;
      clear?: boolean;
    }) => void;
  };
}

interface OglModule {
  Renderer: new (opts: Record<string, unknown>) => BloomPipeline["renderer"] & {
    gl: { canvas: unknown };
  };
  Triangle: new (gl: unknown) => unknown;
  Program: new (gl: unknown, opts: Record<string, unknown>) => ProgramLike;
  Mesh: new (gl: unknown, opts: Record<string, unknown>) => unknown;
  RenderTarget: new (
    gl: unknown,
    opts: Record<string, unknown>
  ) => RenderTargetLike;
}

interface PlaybackState {
  active: boolean;
  mounting: boolean;
  pageVisible: boolean;
  pipeline: BloomPipeline | null;
  visible: boolean;
}

function mountCanvas(canvas: HTMLCanvasElement, container: HTMLDivElement) {
  container.append(canvas);
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.display = "block";
}

const POST_UNIFORM_KEYS = new Set([
  "u_aberration",
  "u_bloom",
  "u_contrast",
  "u_exposure",
  "u_noise",
  "u_saturation",
]);

const BLUR_DIR_H = [1, 0];
const BLUR_DIR_V = [0, 1];

function syncSceneUniforms(
  program: ProgramLike,
  values: Record<string, UniformValue>
) {
  for (const [name, value] of Object.entries(values)) {
    if (POST_UNIFORM_KEYS.has(name)) {
      continue;
    }
    const uniform = program.uniforms[name];
    if (uniform) {
      uniform.value = value;
    }
  }
}

function syncPostUniforms(
  program: ProgramLike,
  values: Record<string, UniformValue>
) {
  for (const name of POST_UNIFORM_KEYS) {
    const uniform = program.uniforms[name];
    if (uniform && values[name] !== undefined) {
      uniform.value = values[name];
    }
  }
}

function createTarget(
  ogl: OglModule,
  gl: unknown,
  width: number,
  height: number
): RenderTargetLike {
  return new ogl.RenderTarget(gl, {
    depth: false,
    height: Math.max(1, height),
    width: Math.max(1, width),
  });
}

function createFullscreen(
  ogl: OglModule,
  gl: unknown,
  geometry: unknown,
  vertex: string,
  fragment: string,
  uniforms: Record<string, { value: UniformValue | unknown }>
) {
  const program = new ogl.Program(gl, {
    depthTest: false,
    depthWrite: false,
    fragment,
    uniforms,
    vertex,
  });
  return {
    mesh: new ogl.Mesh(gl, { geometry, program }),
    program,
  };
}

function pixelSize(width: number, height: number, dpr: number) {
  const pw = Math.max(1, Math.floor(width * dpr));
  const ph = Math.max(1, Math.floor(height * dpr));
  // Quarter-res bloom: softer halo, ~4× cheaper blur fill
  return {
    bh: Math.max(1, Math.floor(ph / 4)),
    bw: Math.max(1, Math.floor(pw / 4)),
    ph,
    pw,
  };
}

function buildPipeline(
  ogl: OglModule,
  gl: unknown,
  vertex: string,
  fragment: string,
  uniforms: Record<string, { value: UniformValue }>,
  width: number,
  height: number,
  dpr: number,
  renderer: BloomPipeline["renderer"],
  canvas: HTMLCanvasElement
): BloomPipeline {
  const { pw, ph, bw, bh } = pixelSize(width, height, dpr);
  const geometry = new ogl.Triangle(gl);

  const scene = createFullscreen(ogl, gl, geometry, vertex, fragment, {
    ...uniforms,
    u_resolution: { value: [pw, ph] },
    u_time: { value: 0 },
  });
  const blur = createFullscreen(ogl, gl, geometry, vertex, blurFrag, {
    tMap: { value: null },
    u_direction: { value: BLUR_DIR_H },
    u_texel: { value: [1 / bw, 1 / bh] },
  });
  const composite = createFullscreen(ogl, gl, geometry, vertex, compositeFrag, {
    tBloom: { value: null },
    tScene: { value: null },
    u_aberration: { value: 0 },
    u_bloom: { value: 0 },
    u_contrast: { value: 1 },
    u_exposure: { value: 0 },
    u_noise: { value: 0 },
    u_resolution: { value: [pw, ph] },
    u_saturation: { value: 1 },
    u_time: { value: 0 },
  });

  return {
    blurMesh: blur.mesh,
    blurProgram: blur.program,
    blurTargetA: createTarget(ogl, gl, bw, bh),
    blurTargetB: createTarget(ogl, gl, bw, bh),
    canvas,
    compositeMesh: composite.mesh,
    compositeProgram: composite.program,
    dpr,
    renderer,
    sceneMesh: scene.mesh,
    sceneProgram: scene.program,
    sceneTarget: createTarget(ogl, gl, pw, ph),
  };
}

function resizePipeline(
  pipeline: BloomPipeline,
  width: number,
  height: number
) {
  const { pw, ph, bw, bh } = pixelSize(width, height, pipeline.dpr);
  pipeline.renderer.setSize(width, height);
  pipeline.sceneTarget.setSize(pw, ph);
  pipeline.blurTargetA.setSize(bw, bh);
  pipeline.blurTargetB.setSize(bw, bh);
  pipeline.sceneProgram.uniforms.u_resolution.value = [pw, ph];
  pipeline.compositeProgram.uniforms.u_resolution.value = [pw, ph];
  pipeline.blurProgram.uniforms.u_texel.value = [1 / bw, 1 / bh];
}

function blurPass(
  pipeline: BloomPipeline,
  source: unknown,
  target: RenderTargetLike,
  direction: number[]
) {
  pipeline.blurProgram.uniforms.tMap.value = source;
  pipeline.blurProgram.uniforms.u_direction.value = direction;
  pipeline.renderer.render({
    clear: true,
    scene: pipeline.blurMesh,
    target,
  });
}

function applyBloom(pipeline: BloomPipeline, bloomAmount: number): unknown {
  if (bloomAmount <= 0.001) {
    return pipeline.sceneTarget.texture;
  }
  // Single separable pair — tighter bloom, half the blur passes
  blurPass(
    pipeline,
    pipeline.sceneTarget.texture,
    pipeline.blurTargetA,
    BLUR_DIR_H
  );
  blurPass(
    pipeline,
    pipeline.blurTargetA.texture,
    pipeline.blurTargetB,
    BLUR_DIR_V
  );
  return pipeline.blurTargetB.texture;
}

function renderFrame(
  pipeline: BloomPipeline,
  values: Record<string, UniformValue>
) {
  const bloomAmount = Number(values.u_bloom ?? 0);
  pipeline.renderer.render({
    clear: true,
    scene: pipeline.sceneMesh,
    target: pipeline.sceneTarget,
  });
  syncPostUniforms(pipeline.compositeProgram, values);
  pipeline.compositeProgram.uniforms.tScene.value =
    pipeline.sceneTarget.texture;
  pipeline.compositeProgram.uniforms.tBloom.value = applyBloom(
    pipeline,
    bloomAmount
  );
  pipeline.renderer.render({ clear: true, scene: pipeline.compositeMesh });
}

async function initPipeline(
  container: HTMLDivElement,
  vertex: string,
  fragment: string,
  uniforms: Record<string, { value: UniformValue }>
): Promise<BloomPipeline> {
  const ogl = (await import("ogl")) as OglModule;
  const dpr = Math.min(window.devicePixelRatio, 1.5);
  const width = Math.max(container.clientWidth, window.innerWidth);
  const height = Math.max(container.clientHeight, window.innerHeight);
  const renderer = new ogl.Renderer({
    alpha: false,
    antialias: false,
    dpr,
    height,
    powerPreference: "high-performance",
    webgl: 2,
    width,
  });
  const canvas = renderer.gl.canvas as HTMLCanvasElement;
  mountCanvas(canvas, container);
  return buildPipeline(
    ogl,
    renderer.gl,
    vertex,
    fragment,
    uniforms,
    width,
    height,
    dpr,
    renderer,
    canvas
  );
}

function attachResizeObserver(
  container: HTMLDivElement,
  pipeline: BloomPipeline
): ResizeObserver {
  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const w = entry.contentRect.width;
      const h = entry.contentRect.height;
      if (w <= 0 || h <= 0) {
        continue;
      }
      resizePipeline(pipeline, w, h);
    }
  });
  observer.observe(container);
  return observer;
}

function paintFrame(
  pipeline: BloomPipeline,
  uniformsRef: React.MutableRefObject<Record<string, UniformValue>>,
  t: number
) {
  pipeline.sceneProgram.uniforms.u_time.value = t;
  pipeline.compositeProgram.uniforms.u_time.value = t;
  syncSceneUniforms(pipeline.sceneProgram, uniformsRef.current);
  renderFrame(pipeline, uniformsRef.current);
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function startLoop(
  getPipeline: () => BloomPipeline | null,
  isActive: () => boolean,
  uniformsRef: React.MutableRefObject<Record<string, UniformValue>>,
  start: number
) {
  let rafId = 0;
  let running = true;

  // Reduced motion: paint one frame of the field and leave it there
  if (prefersReducedMotion()) {
    const pipeline = getPipeline();
    if (pipeline) {
      paintFrame(pipeline, uniformsRef, 0);
    }
    return () => {
      // nothing running to cancel
    };
  }

  function tick(now: number) {
    const pipeline = getPipeline();
    if (!(running && isActive() && pipeline)) {
      return;
    }
    paintFrame(pipeline, uniformsRef, (now - start) / 1000);
    rafId = requestAnimationFrame(tick);
  }

  rafId = requestAnimationFrame(tick);
  return () => {
    running = false;
    cancelAnimationFrame(rafId);
  };
}

function isPlaying(state: PlaybackState) {
  return (
    state.active &&
    state.visible &&
    state.pageVisible &&
    state.pipeline !== null
  );
}

function watchPlayback(
  container: HTMLDivElement,
  state: PlaybackState,
  activate: () => void,
  ensureLoop: () => void,
  pauseLoop: () => void
) {
  function onVisibilityChange() {
    state.pageVisible = document.visibilityState !== "hidden";
    if (state.pageVisible && state.visible) {
      ensureLoop();
    } else {
      pauseLoop();
    }
  }

  document.addEventListener("visibilitychange", onVisibilityChange);

  const intersectionObserver = new IntersectionObserver((entries) => {
    state.visible = entries.some((entry) => entry.isIntersecting);
    if (state.visible) {
      activate();
    } else {
      pauseLoop();
    }
  });
  intersectionObserver.observe(container);

  return () => {
    document.removeEventListener("visibilitychange", onVisibilityChange);
    intersectionObserver.disconnect();
  };
}

async function finishMount(
  container: HTMLDivElement,
  vertex: string,
  fragment: string,
  initialUniforms: Record<string, { value: UniformValue }>,
  state: PlaybackState
) {
  const next = await initPipeline(container, vertex, fragment, initialUniforms);
  if (!state.active) {
    next.canvas.remove();
    return null;
  }
  state.pipeline = next;
  return attachResizeObserver(container, next);
}

async function mountPipeline(
  container: HTMLDivElement,
  vertex: string,
  fragment: string,
  initialUniforms: Record<string, { value: UniformValue }>,
  state: PlaybackState
) {
  if (state.mounting || state.pipeline) {
    return null;
  }
  state.mounting = true;
  try {
    return await finishMount(
      container,
      vertex,
      fragment,
      initialUniforms,
      state
    );
  } finally {
    state.mounting = false;
  }
}

function runAnimatedShader(
  container: HTMLDivElement,
  vertex: string,
  fragment: string,
  initialUniforms: Record<string, { value: UniformValue }>,
  uniformsRef: React.MutableRefObject<Record<string, UniformValue>>
) {
  const state: PlaybackState = {
    active: true,
    mounting: false,
    pageVisible: document.visibilityState !== "hidden",
    pipeline: null,
    visible: true,
  };
  let resizeObserver: ResizeObserver | null = null;
  let stopLoop: (() => void) | undefined;
  const start = performance.now();

  function pauseLoop() {
    stopLoop?.();
    stopLoop = undefined;
  }

  function ensureLoop() {
    if (isPlaying(state) && !stopLoop) {
      stopLoop = startLoop(
        () => state.pipeline,
        () => isPlaying(state),
        uniformsRef,
        start
      );
    }
  }

  async function activate() {
    if (state.pipeline) {
      ensureLoop();
      return;
    }
    try {
      resizeObserver = await mountPipeline(
        container,
        vertex,
        fragment,
        initialUniforms,
        state
      );
      ensureLoop();
    } catch {
      // WebGL initialization failed
    }
  }

  const unwatch = watchPlayback(
    container,
    state,
    activate,
    ensureLoop,
    pauseLoop
  );
  activate();

  return () => {
    state.active = false;
    pauseLoop();
    unwatch();
    resizeObserver?.disconnect();
    container.querySelector("canvas")?.remove();
    state.pipeline = null;
  };
}

export function useAnimatedShader({
  vertex,
  fragment,
  uniforms,
}: AnimatedShaderOptions): AnimatedShaderResult {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const uniformsRef = useRef<Record<string, UniformValue>>(
    Object.fromEntries(
      Object.entries(uniforms).map(([key, entry]) => [key, entry.value])
    )
  );
  const initialUniforms = useRef(uniforms);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    return runAnimatedShader(
      container,
      vertex,
      fragment,
      initialUniforms.current,
      uniformsRef
    );
  }, [vertex, fragment]);

  return { containerRef, uniformsRef };
}
