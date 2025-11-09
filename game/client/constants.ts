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
