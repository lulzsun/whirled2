/**
 * Grid snapping for the builder.
 *
 * The important thing here is that TransformControls snaps *deltas*, not
 * absolute positions: it rounds how far you dragged, then adds that to
 * wherever the object already was. So a part that starts at x = 3.7 moves to
 * 4.7, 5.7, 6.7 -- perfectly snapped increments, never once on the grid.
 * That is not what Studio does and it is not what anyone means by "snap to
 * grid"; two parts placed that way will not line up with each other, which
 * is the entire point of snapping.
 *
 * So the gizmo's own snapping is used for the *feel* of a drag -- it makes
 * the handle move in steps -- and the result is then rounded absolutely
 * before it is written or sent. See the change handler in systems/editor.ts.
 */

/** Grid sizes the builder cycles through, coarsest first. */
export const GRID_INCREMENTS = [1, 0.5, 0.25];

/** Rotation snap, in degrees. Twelve of these make a half turn. */
export const ROTATION_SNAP_DEGREES = 15;

/**
 * Smallest scale a snapped part may be given.
 *
 * Rounding scale to the grid is right -- a part's scale is its size, so
 * snapping it is what makes a wall exactly two units long -- but rounding
 * *down* to zero would make the part vanish, and the server rejects
 * anything below 0.05 anyway. A part can always still be made thinner by
 * turning snapping off.
 */
export const MIN_SNAPPED_SCALE = 0.05;

/** Rounds a single value to the nearest multiple of grid. */
export function snapValue(value: number, grid: number): number {
	if (grid <= 0) return value;
	return Math.round(value / grid) * grid;
}

/**
 * Rounds a part's centre so that its *edge* lands on a grid line.
 *
 * Snapping the centre instead is the obvious thing and it is wrong. A unit
 * box centred on a grid line has its faces at half-units, so it meets other
 * unit boxes but nothing else: put a 1-wide part next to a 2-wide part and
 * centre-snapping overlaps them by half a unit. Snapping the near edge makes
 * every part, whatever its size, start and end on a grid line -- so they
 * meet flush, which is the whole reason to snap.
 *
 * It is also what keeps a part resting on the floor. A unit box sitting on
 * y=0 has its centre at 0.5; rounding that centre to a 1-unit grid either
 * buries the box or floats it half a unit off the ground.
 *
 * `size` is the part's full extent along the axis -- its scale, since parts
 * are unit geometry centred on their origin.
 */
export function snapCentreByEdge(
	centre: number,
	size: number,
	grid: number,
): number {
	if (grid <= 0) return centre;
	const half = size / 2;
	return snapValue(centre - half, grid) + half;
}

/**
 * Rounds a size to the grid without letting it collapse.
 *
 * A part that would round to nothing is given the smallest size the server
 * will accept instead, so dragging a scale handle too far shrinks a part
 * rather than deleting it by arithmetic.
 */
export function snapScale(value: number, grid: number): number {
	if (grid <= 0) return value;
	return Math.max(MIN_SNAPPED_SCALE, Math.round(value / grid) * grid);
}

/** Rounds an angle in radians to the nearest ROTATION_SNAP_DEGREES. */
export function snapAngle(radians: number): number {
	const step = (ROTATION_SNAP_DEGREES * Math.PI) / 180;
	return Math.round(radians / step) * step;
}

/**
 * Whether the player is currently asking for free, unsnapped movement.
 *
 * Held rather than toggled, and read from a global key listener rather than
 * from the event, because TransformControls' "change" event carries no
 * modifier state -- by the time the transform is worth rounding, the
 * original mouse event is long gone.
 */
let freeMoveHeld = false;

export function isFreeMoveHeld(): boolean {
	return freeMoveHeld;
}

let listening = false;

export function watchFreeMoveKey(): void {
	if (listening) return;
	listening = true;

	window.addEventListener("keydown", (event) => {
		if (event.key === "Alt") freeMoveHeld = true;
	});
	window.addEventListener("keyup", (event) => {
		if (event.key === "Alt") freeMoveHeld = false;
	});
	// Alt is the key that takes focus out of the page on Windows and Linux
	// (it reaches for the window menu), and a keyup delivered to a window
	// that no longer has focus never arrives. Without this, alt-tabbing
	// mid-drag would leave snapping switched off with nothing held down.
	window.addEventListener("blur", () => {
		freeMoveHeld = false;
	});
}
