export const API_URL = (() => {
	const hostname = window.location.hostname
		? window.location.hostname
		: window.parent.location.hostname;
	const isLocalhost = ["127.0.0.1", "localhost"].includes(hostname);
	const isIpAddress =
		/^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(
			hostname,
		);

	const protocol =
		window.location.protocol === "about:"
			? window.parent.location.protocol
			: window.location.protocol;

	if (isLocalhost || isIpAddress) {
		return `${protocol}//${hostname}:42069`;
	} else {
		return `${protocol}//${hostname}`;
	}
})();

/**
 * Origin that runs Flash.
 *
 * Still the app's own, so it isolates nothing yet: M6 step 3 built the
 * boundary, step 4 moves it. See docs/specs/swf-avatar-rendering.md §16.3.
 *
 * Everything Flash touches has to come from here, not just the sandbox
 * document: the shim reaches into the avatar it loads, and Flash only permits
 * that within one security domain. Pointing the sandbox at an avatar on the
 * app's origin fails twice over — CORS refuses the fetch, and even if it did
 * not, the SDK handshake would not work.
 */
export const SANDBOX_ORIGIN = API_URL;

/** The sandbox document itself. */
export const SANDBOX_URL = `${SANDBOX_ORIGIN}/static/sandbox.html`;
