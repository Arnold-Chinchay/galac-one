/** Coordinates are original-grid pixel centers, X right and Y down. */
export interface Point { x: number; y: number; }
export interface ViewRect { left: number; top: number; width: number; height: number; }

function viewScale(rect: ViewRect, width: number, height: number, zoom: number) {
  return Math.min(rect.width / width, rect.height / height) * zoom;
}

/** Pan is a CSS pixel translation applied after scaling, zoom is around image center. */
export function screenToImage(clientX: number, clientY: number, rect: ViewRect, width: number, height: number, zoom = 1, pan: Point = { x: 0, y: 0 }): Point | null {
  const scale = viewScale(rect, width, height, zoom);
  if (!(width > 0 && height > 0 && scale > 0)) return null;
  const x = (clientX - rect.left - rect.width / 2 - pan.x) / scale + width / 2 - 0.5;
  const y = (clientY - rect.top - rect.height / 2 - pan.y) / scale + height / 2 - 0.5;
  if (x < -0.5 || x > width - 0.5 || y < -0.5 || y > height - 0.5) return null;
  return { x: Math.max(0, Math.min(width - 1, x)), y: Math.max(0, Math.min(height - 1, y)) };
}

export function imageToScreen(point: Point, rect: ViewRect, width: number, height: number, zoom = 1, pan: Point = { x: 0, y: 0 }): Point {
  const scale = viewScale(rect, width, height, zoom);
  return {
    x: rect.left + rect.width / 2 + pan.x + (point.x + 0.5 - width / 2) * scale,
    y: rect.top + rect.height / 2 + pan.y + (point.y + 0.5 - height / 2) * scale,
  };
}

export function clampPan(pan: Point, rect: Pick<ViewRect, 'width' | 'height'>, width: number, height: number, zoom = 1): Point {
  const scale = Math.min(rect.width / width, rect.height / height) * zoom;
  const maxX = Math.max(0, (width * scale - rect.width) / 2);
  const maxY = Math.max(0, (height * scale - rect.height) / 2);
  return { x: Math.max(-maxX, Math.min(maxX, pan.x)), y: Math.max(-maxY, Math.min(maxY, pan.y)) };
}
