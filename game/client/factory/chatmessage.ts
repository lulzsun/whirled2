import { addEntity, entityExists, removeEntity } from "bitecs";
import { World } from "./world";
import { createChatMessageUI } from "../ui/chatmessage";

const LIFETIME_PER_CHAR = 275;
const MIN_LIFETIME = 20000;
const MAX_LIFETIME = 50000;
const FADE_DURATION = 600;
const LIVE_OPACITY = 0.75;
const SPACING = 1;
const MAX_HISTORY = 200;
const TOP_RESERVE = 120;
const HISTORY_MAX_HEIGHT = "min(50vh, 400px)";

export type ChatMessage = HTMLElement & {
	eid: number;
	expired: boolean;
	expireTimer: number;
	fadeTimer: number;
};

type SubtitleState = {
	lastExpire: number;
	history: boolean;
};

const stateByWorld = new WeakMap<World, SubtitleState>();

const getState = (world: World): SubtitleState => {
	let state = stateByWorld.get(world);
	if (state === undefined) {
		state = { lastExpire: 0, history: false };
		stateByWorld.set(world, state);
	}
	return state;
};

const getChatbox = (world: World) =>
	world.renderer.domElement.parentElement!.querySelector(
		"#chatbox",
	) as HTMLElement;

export const createChatMessage = (
	world: World,
	username: string = "Guest",
	nickname: string = "Guest",
	message: string = "placeholder",
): ChatMessage => {
	const state = getState(world);
	const chatbox = getChatbox(world);

	const eid = addEntity(world);
	const ui = chatbox.appendChild(
		createChatMessageUI(username, nickname, message),
	);
	window.htmx.process(ui);
	const entity = Object.assign(ui, {
		eid,
		expired: false,
		expireTimer: 0,
		fadeTimer: 0,
	});
	entity.style.marginTop = `${SPACING}px`;
	entity.style.opacity = `${LIVE_OPACITY}`;

	// Lifetime proportional to length, clamped, and never expiring before a
	// line that was said earlier.
	const now = performance.now();
	const start = Math.max(now, state.lastExpire);
	state.lastExpire =
		start + Math.min(message.length * LIFETIME_PER_CHAR, MAX_LIFETIME);
	state.lastExpire = Math.min(now + MAX_LIFETIME, state.lastExpire);
	const expireAt = Math.max(now + MIN_LIFETIME, state.lastExpire);

	entity.expireTimer = window.setTimeout(() => {
		if (state.history) {
			// The scrollback is open; retire the line without the fade, the
			// user is looking at history anyway.
			expireChatMessage(world, entity);
			return;
		}
		entity.style.transition = `opacity ${FADE_DURATION}ms linear`;
		entity.style.opacity = "0";
		entity.fadeTimer = window.setTimeout(() => {
			expireChatMessage(world, entity);
		}, FADE_DURATION);
	}, expireAt - now);

	// Drop lines pushed past the top of the view, oldest first, the way
	// scrollUpSubtitles retired anything above the target bounds.
	if (!state.history) {
		const viewHeight =
			world.renderer.domElement.parentElement!.getBoundingClientRect()
				.height;
		while (
			chatbox.getBoundingClientRect().height >
			viewHeight - TOP_RESERVE
		) {
			const oldest = liveMessages(chatbox)[0];
			if (oldest === undefined || oldest === entity) break;
			expireChatMessage(world, oldest);
		}
	}

	// The scrollback keeps only so much.
	while (chatbox.children.length > MAX_HISTORY) {
		removeChatMessage(world, chatbox.children[0] as ChatMessage);
	}

	if (state.history) chatbox.scrollTop = chatbox.scrollHeight;

	return entity;
};

/**
 * Show or hide the history scrollback; wired to the chat input's focus. All
 * retained lines (expired included) become visible and scrollable while it
 * is up, and the live fade-out state returns when it goes away.
 */
export const setChatHistoryMode = (world: World, enabled: boolean) => {
	const state = getState(world);
	if (state.history === enabled) return;
	state.history = enabled;

	const chatbox = getChatbox(world);
	if (enabled) {
		chatbox.style.maxHeight = HISTORY_MAX_HEIGHT;
		chatbox.style.overflowY = "auto";
	} else {
		chatbox.style.maxHeight = "";
		chatbox.style.overflowY = "";
	}

	for (let i = 0; i < chatbox.children.length; i++) {
		const glyph = chatbox.children[i] as ChatMessage;
		if (enabled) {
			// A glyph caught mid-fade rejoins the history at full standing.
			clearTimeout(glyph.fadeTimer);
			glyph.style.transition = "";
			glyph.style.opacity = `${LIVE_OPACITY}`;
			glyph.style.display = "";
		} else if (glyph.expired) {
			glyph.style.display = "none";
		}
	}

	if (enabled) chatbox.scrollTop = chatbox.scrollHeight;
};

/** The lines still showing in live mode, oldest first. */
const liveMessages = (chatbox: HTMLElement): ChatMessage[] => {
	const live: ChatMessage[] = [];
	for (let i = 0; i < chatbox.children.length; i++) {
		const glyph = chatbox.children[i] as ChatMessage;
		if (!glyph.expired) live.push(glyph);
	}
	return live;
};

/** Retire a line from the live view, keeping it for the scrollback. */
const expireChatMessage = (world: World, glyph: ChatMessage) => {
	clearTimeout(glyph.expireTimer);
	clearTimeout(glyph.fadeTimer);
	glyph.expired = true;
	glyph.style.transition = "";
	glyph.style.opacity = `${LIVE_OPACITY}`;
	if (!getState(world).history) glyph.style.display = "none";
};

/** Drop a line entirely; it is gone from the scrollback too. */
const removeChatMessage = (world: World, glyph: ChatMessage) => {
	clearTimeout(glyph.expireTimer);
	clearTimeout(glyph.fadeTimer);
	if (entityExists(world, glyph.eid)) removeEntity(world, glyph.eid);
	glyph.remove();
};
