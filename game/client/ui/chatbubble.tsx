import { createElement } from "jsx-dom";

/**
 * Comic chat bubble, styled after the original Whirled client
 * (msoy ComicOverlay.as / BubbleGlyph.as): white rounded bubble, 1px black
 * outline, centered text, and a curved tail hanging off the bottom right of
 * the newest bubble only.
 */

/** Padding between the text and the bubble edge (msoy ChatOverlay.PAD). */
export const BUBBLE_PAD = 10;

/** Vertical space between stacked bubbles (msoy BubbleCloud.BUBBLE_SPACING). */
export const BUBBLE_SPACING = 5;

export type ChatBubbleElement = HTMLElement & {
	tail: SVGElement;
};

/**
 * The per-player stack. Bubbles are appended at the bottom (newest closest to
 * the speaker) and the column grows upward from its anchor point via the
 * translate; render.ts moves the anchor to sit above the player's nameplate
 * every frame.
 */
export const createChatBubbleStackUI = () => {
	const element = createElement("chatbubbles", {}) as HTMLElement;
	element.className =
		"absolute flex flex-col items-center select-none pointer-events-none z-10";
	element.style.gap = `${BUBBLE_SPACING}px`;
	element.style.transform = "translate(-50%, -100%)";
	return element;
};

export const createChatBubbleUI = (message: string): ChatBubbleElement => {
	const tail = (
		<svg
			width="14"
			height="11"
			viewBox="0 0 14 11"
			class="absolute"
			style={{ bottom: "-9px", right: "16%", overflow: "visible" }}
		>
			{/* Fill first so it paints over the bubble's bottom border, the
			    same trick msoy's drawSpeakTail plays with its cover rect. */}
			<path d="M1 0 C5 5 3 8 4 10 C9 7 12 4 13 0 Z" fill="#FFF" />
			<path
				d="M1 0 C5 5 3 8 4 10 C9 7 12 4 13 0"
				fill="none"
				stroke="#000"
				stroke-width="1"
			/>
		</svg>
	) as SVGElement;

	const element = createElement(
		"chatbubble",
		{},
		<>
			<span>{message}</span>
			{tail}
		</>,
	) as ChatBubbleElement;

	element.className =
		"relative block text-black text-xs text-center break-words bg-white border border-black";
	element.style.padding = `${BUBBLE_PAD / 2}px ${BUBBLE_PAD}px`;
	element.style.width = "max-content";
	element.style.maxWidth = "220px";
	// Approximation of the original's BevelFilter: a soft dark shade on the
	// lower right gives the bubble its slight pillow depth.
	element.style.boxShadow = "inset -2px -2px 4px rgba(0, 0, 0, 0.08)";
	element.tail = tail;
	return element;
};
