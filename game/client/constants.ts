export const API_URL = (() => {
	if (["127.0.0.1", "localhost"].includes(window.location.hostname))
		return `http://${window.location.hostname}:42069`;
	else return `http://${window.location.hostname}`;
})();
