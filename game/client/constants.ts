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
 * Origin that runs Flash. M6 step 4: a different *site* from the app, so that
 * a hostile avatar reaching `window` reaches nothing of ours. See
 * docs/specs/swf-avatar-rendering.md §16.3.
 *
 * Production names it explicitly through VITE_SANDBOX_ORIGIN, baked in at
 * build time; it should be a second deployment of this same server (fly.dev
 * is on the Public Suffix List, so two Fly apps are cross-site, where a
 * subdomain of ours would be same-site and still receive our cookies on
 * requests it makes to us).
 *
 * Dev gets a second origin out of the one Go server for free: `localhost` and
 * `127.0.0.1` are different origins with different cookie jars, so whichever
 * name the page is on, the sandbox uses the other. LAN-IP dev has no second
 * name for the same host, so it falls back to the app origin and isolates
 * nothing — acceptable for dev, and exactly what production must not do.
 *
 * Everything Flash touches has to come from here, not just the sandbox
 * document: the shim reaches into the avatar it loads, and Flash only permits
 * that within one security domain. Pointing the sandbox at an avatar on the
 * app's origin fails twice over — CORS refuses the fetch, and even if it did
 * not, the SDK handshake would not work.
 */
export const SANDBOX_ORIGIN = (() => {
	const configured = import.meta.env.VITE_SANDBOX_ORIGIN;
	if (typeof configured === "string" && configured !== "") {
		// Trailing slashes invite `${origin}/path` to double up.
		return configured.replace(/\/+$/, "");
	}
	const hostname = window.location.hostname
		? window.location.hostname
		: window.parent.location.hostname;
	if (hostname === "127.0.0.1") return "http://localhost:42069";
	if (hostname === "localhost") return "http://127.0.0.1:42069";
	return API_URL;
})();

/** The sandbox document itself. */
export const SANDBOX_URL = `${SANDBOX_ORIGIN}/static/sandbox.html`;

/**
 * Whether the sandbox iframe should carry `sandbox="allow-scripts"`, giving
 * the document an opaque origin.
 *
 * This is the single-app production posture (M6 step 7). When no second
 * origin is configured, the sandbox document would share the app's origin and
 * isolate nothing — so the browser is asked to manufacture an origin instead:
 * an opaque origin has no cookie jar, no storage, and is cross-site to
 * everything, including us. A hostile avatar reaching that window reaches an
 * origin the browser refuses to associate with anything.
 *
 * Never on a private or loopback address, because Private Network Access
 * treats opaque origins as public and blocks their fetches to private
 * addresses — the frame would load nothing (the original §12.4 failure). Dev
 * keeps its loopback-pair isolation and never takes this path; LAN-IP dev
 * falls through to an unisolated same-origin frame, as before.
 */
export const SANDBOX_OPAQUE = (() => {
	if (SANDBOX_ORIGIN !== window.location.origin) return false;
	const hostname = window.location.hostname;
	const isPrivate =
		hostname === "localhost" ||
		hostname.endsWith(".localhost") ||
		hostname === "[::1]" ||
		/^127\./.test(hostname) ||
		/^10\./.test(hostname) ||
		/^192\.168\./.test(hostname) ||
		/^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
		/^169\.254\./.test(hostname);
	return !isPrivate;
})();
