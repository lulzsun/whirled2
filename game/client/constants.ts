export const API_URL = (() => {
	if (["127.0.0.1", "localhost"].includes(window.location.hostname))
		return `${window.location.protocol}//${window.location.hostname}:42069`;
	else return `${window.location.protocol}//${window.location.hostname}`;
})();
