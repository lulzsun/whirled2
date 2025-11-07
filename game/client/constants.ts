export const API_URL = (() => {
	const hostname = window.location.hostname;
	const isLocalhost = ["127.0.0.1", "localhost"].includes(hostname);
	const isIpAddress =
		/^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(
			hostname,
		);

	if (isLocalhost || isIpAddress) {
		return `${window.location.protocol}//${hostname}:42069`;
	} else {
		return `${window.location.protocol}//${hostname}`;
	}
})();
