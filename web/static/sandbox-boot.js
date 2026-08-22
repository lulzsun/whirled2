// Bootstrap for the Flash sandbox (sandbox.html). A separate file rather than
// an inline script because the sandbox document's CSP is `script-src 'self'`
// plus the vite dev origins, with no 'unsafe-inline' -- an avatar that finds
// an injection hole here should have nowhere to put a script.
//
// Built bundle in production; the vite dev server otherwise. Same shape as
// components/preview.gohtml, but with the dev host written out rather than
// read from window.parent -- the parent is cross-origin here, and reading its
// location throws.
const script = document.createElement("script");
script.type = "module";
script.src = "./sandbox.js";
script.onerror = () => {
	const fallback = document.createElement("script");
	fallback.type = "module";
	fallback.src = "http://127.0.0.1:6969/sandbox.ts";
	document.body.appendChild(fallback);
};
document.body.appendChild(script);
