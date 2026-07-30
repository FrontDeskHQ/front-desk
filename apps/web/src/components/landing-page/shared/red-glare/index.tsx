import { RED_GLARE_UNIFORMS } from "./red-glare-defaults";
import { fullscreenVert } from "./shaders/fullscreen.vert";
import { redGlareFrag } from "./shaders/red-glare.frag";
import { useAnimatedShader } from "./use-animated-shader";

/**
 * Blue glare — animated WebGL field of drifting bokeh blobs, used as the hero
 * backdrop. Tinted to match the primary button (#345BCA). Ported from the
 * personal-site lab version with its dialkit control panel dropped: the values
 * in `red-glare-defaults` are the tuned preset and nothing on the landing page
 * changes them.
 *
 * `ogl` is imported dynamically inside the hook, so it stays out of the
 * initial bundle and never runs during SSR. If WebGL is unavailable the
 * canvas simply never mounts and the flat `background` below shows through.
 *
 * Purely decorative — `aria-hidden`, never a focus or hit target.
 */
export function RedGlareBackground({ className }: { className?: string }) {
  const { containerRef } = useAnimatedShader({
    fragment: redGlareFrag,
    uniforms: RED_GLARE_UNIFORMS,
    vertex: fullscreenVert,
  });

  return (
    <div
      ref={containerRef}
      aria-hidden
      className={className}
      style={{ background: "#030510" }}
    />
  );
}
