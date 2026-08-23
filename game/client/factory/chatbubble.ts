import { World } from "./world";
import {
	BUBBLE_PAD,
	ChatBubbleElement,
	createChatBubbleStackUI,
	createChatBubbleUI,
} from "../ui/chatbubble";

/**
 * Comic chat bubbles, behaving like the original Whirled client's
 * ComicOverlay/BubbleCloud/BubbleGlyph trio:
 *
 * - at most 3 bubbles per speaker; the oldest is dropped to make room
 * - only the newest bubble of a speaker keeps its tail
 * - every bubble on screen ages globally: each new bubble anywhere pushes the
 *   rest one age level down, alpha = 0.5 + 0.5 * (7 - age) / 7
 * - a bubble lives for a time proportional to its text length, clamped to
 *   [15s, 40s], and consecutive bubbles expire in the order they were said
 * - expiry is a 600ms linear fade to nothing
 */

/** ms of life per character of text (msoy DISPLAY_DURATION_PARAMS[1]). */
const LIFETIME_PER_CHAR = 200;
/** Shortest time a bubble stays up, ms. */
const MIN_LIFETIME = 15000;
/** Longest time a bubble stays up, ms. */
const MAX_LIFETIME = 40000;
/** Length of the expiry fade, ms (msoy ChatGlyph.FADE_DURATION). */
const FADE_DURATION = 600;
/** Bubbles a single speaker may have up at once. */
const MAX_BUBBLES_PER_USER = 3;
/** Age level at which a bubble bottoms out at half transparency. */
const MAX_AGE = 7;

export type ChatBubbleStack = HTMLElement;

type ChatBubble = ChatBubbleElement & {
	expireTimer: number;
	fadeTimer: number;
	fading: boolean;
};

type BubbleState = {
	/** Every live bubble in the world, newest first. */
	all: ChatBubble[];
	/** When the most recently scheduled bubble expires; keeps order. */
	lastExpire: number;
};

const stateByWorld = new WeakMap<World, BubbleState>();

const getState = (world: World): BubbleState => {
	let state = stateByWorld.get(world);
	if (state === undefined) {
		state = { all: [], lastExpire: 0 };
		stateByWorld.set(world, state);
	}
	return state;
};

export const createChatBubbleStack = (world: World): ChatBubbleStack => {
	return world.renderer.domElement.parentElement!.appendChild(
		createChatBubbleStackUI(),
	);
};

export const pushChatBubble = (
	world: World,
	stack: ChatBubbleStack,
	message: string,
) => {
	const state = getState(world);
	const bubble = createChatBubbleUI(message) as ChatBubble;
	bubble.fading = false;

	// Older bubbles of the same speaker lose their tail.
	for (let i = 0; i < stack.children.length; i++) {
		(stack.children[i] as ChatBubble).tail.style.display = "none";
	}

	stack.appendChild(bubble);

	// Round the corners the way drawRoundedBubble did: proportional to the
	// bubble's size, never tighter than the padding, capped for huge bubbles.
	const corner = Math.min(
		Math.max(
			Math.max(bubble.offsetWidth, bubble.offsetHeight) / 2,
			BUBBLE_PAD * 2,
		),
		75,
	);
	bubble.style.borderRadius = `${corner / 2}px`;

	// Per-speaker cap.
	while (stack.children.length > MAX_BUBBLES_PER_USER) {
		removeChatBubble(world, stack.children[0] as ChatBubble);
	}

	// Global aging: a new bubble anywhere pushes everything else down a level.
	state.all.unshift(bubble);
	for (let i = 0; i < state.all.length; i++) {
		setAgeLevel(state.all[i], i);
	}

	// Lifetime proportional to length, clamped, and never expiring before a
	// bubble that was said earlier.
	const now = performance.now();
	const start = Math.max(now, state.lastExpire);
	state.lastExpire =
		start + Math.min(message.length * LIFETIME_PER_CHAR, MAX_LIFETIME);
	state.lastExpire = Math.min(now + MAX_LIFETIME, state.lastExpire);
	const expireAt = Math.max(now + MIN_LIFETIME, state.lastExpire);

	bubble.expireTimer = window.setTimeout(() => {
		bubble.fading = true;
		bubble.style.transition = `opacity ${FADE_DURATION}ms linear`;
		bubble.style.opacity = "0";
		bubble.fadeTimer = window.setTimeout(() => {
			removeChatBubble(world, bubble);
		}, FADE_DURATION);
	}, expireAt - now);
};

const setAgeLevel = (bubble: ChatBubble, age: number) => {
	if (bubble.fading) return;
	age = Math.min(age, MAX_AGE);
	bubble.style.opacity = `${0.5 + 0.5 * ((MAX_AGE - age) / MAX_AGE)}`;
};

const removeChatBubble = (world: World, bubble: ChatBubble) => {
	clearTimeout(bubble.expireTimer);
	clearTimeout(bubble.fadeTimer);
	const state = getState(world);
	const index = state.all.indexOf(bubble);
	if (index !== -1) state.all.splice(index, 1);
	bubble.remove();
};

/** Tear down a speaker's whole stack; used when the player leaves. */
export const destroyChatBubbleStack = (
	world: World,
	stack: ChatBubbleStack,
) => {
	while (stack.children.length > 0) {
		removeChatBubble(world, stack.children[0] as ChatBubble);
	}
	stack.remove();
};
