import { useState, useCallback, useRef, useEffect } from 'react';
import type { Viewport } from '@/types/circuit';

/** Maximum zoom level */
const MAX_ZOOM = 5;
/** Minimum zoom level */
const MIN_ZOOM = 0.15;

/**
 * Manages viewport pan & zoom state with mouse interaction helpers.
 *
 * Features:
 * - Mouse wheel zoom centered on cursor position
 * - Middle mouse button drag to pan
 * - Space + left-click drag to pan
 * - Exposes setViewport for programmatic changes (e.g. reset view)
 */
export const useViewport = (
  initial: Viewport = { offsetX: 0, offsetY: 0, zoom: 1 },
) => {
  const [viewport, setViewport] = useState<Viewport>(initial);
  const isPanning = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const spaceHeld = useRef(false);

  // Track whether space is held (for Space+drag pan)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        spaceHeld.current = true;
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceHeld.current = false;
        isPanning.current = false;
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      // Middle mouse button or Alt+Left click → pan
      if (
        e.button === 1 ||
        (e.button === 0 && e.altKey) ||
        (e.button === 0 && spaceHeld.current)
      ) {
        isPanning.current = true;
        lastMouse.current = { x: e.clientX, y: e.clientY };
        // Prevent default middle-click paste on Linux
        if (e.button === 1) {
          e.preventDefault();
        }
      }
    },
    [],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      if (!isPanning.current) return;
      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      setViewport((vp) => ({
        ...vp,
        offsetX: vp.offsetX + dx,
        offsetY: vp.offsetY + dy,
      }));
    },
    [],
  );

  const handleMouseUp = useCallback(() => {
    isPanning.current = false;
  }, []);

  /**
   * Zoom centered on a screen-space point (e.g. cursor position).
   * The world point under the cursor stays fixed.
   */
  const zoomAtPoint = useCallback(
    (screenX: number, screenY: number, factor: number) => {
      setViewport((vp) => {
        const newZoom = Math.min(Math.max(vp.zoom * factor, MIN_ZOOM), MAX_ZOOM);
        const actualFactor = newZoom / vp.zoom;

        // Adjust offsets so the point under the cursor stays fixed
        return {
          offsetX: screenX - (screenX - vp.offsetX) * actualFactor,
          offsetY: screenY - (screenY - vp.offsetY) * actualFactor,
          zoom: newZoom,
        };
      });
    },
    [],
  );

  /** Zoom centered on canvas center (for toolbar buttons) */
  const zoomCentered = useCallback(
    (factor: number) => {
      // We'll use the canvas center — approximate as window center
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      zoomAtPoint(cx, cy, factor);
    },
    [zoomAtPoint],
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      zoomAtPoint(e.clientX, e.clientY, factor);
    },
    [zoomAtPoint],
  );

  /** Reset the viewport to default (100% zoom, origin) */
  const resetView = useCallback(() => {
    setViewport({ offsetX: 0, offsetY: 0, zoom: 1 });
  }, []);

  /** Fit the viewport to show all content (bounding box based) */
  const fitAll = useCallback(
    (
      canvasWidth: number,
      canvasHeight: number,
      bounds: { minX: number; minY: number; maxX: number; maxY: number } | null,
    ) => {
      if (!bounds) {
        resetView();
        return;
      }

      const contentW = bounds.maxX - bounds.minX + 100; // padding
      const contentH = bounds.maxY - bounds.minY + 100;
      const scaleX = canvasWidth / contentW;
      const scaleY = canvasHeight / contentH;
      const zoom = Math.min(scaleX, scaleY, MAX_ZOOM);
      const clampedZoom = Math.max(zoom, MIN_ZOOM);

      const centerX = (bounds.minX + bounds.maxX) / 2;
      const centerY = (bounds.minY + bounds.maxY) / 2;

      setViewport({
        offsetX: canvasWidth / 2 - centerX * clampedZoom,
        offsetY: canvasHeight / 2 - centerY * clampedZoom,
        zoom: clampedZoom,
      });
    },
    [resetView],
  );

  // Attach global mouseup so panning stops even if cursor leaves the canvas
  useEffect(() => {
    const up = () => {
      isPanning.current = false;
    };
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, []);

  return {
    viewport,
    setViewport,
    handlers: { handleMouseDown, handleMouseMove, handleMouseUp, handleWheel },
    zoomAtPoint,
    zoomCentered,
    resetView,
    fitAll,
    isPanning,
    spaceHeld,
  };
};
