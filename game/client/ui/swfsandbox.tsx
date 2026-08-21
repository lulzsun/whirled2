// SUPERSEDED at M4, along with swf.ts. Nothing calls createSwfSandbox any
// more; see the note at the top of game/client/swf.ts.

import { API_URL } from "../constants";

export const createSwfSandbox = (
	swfFile: string,
): Promise<HTMLIFrameElement> => {
	const nonce = Math.random().toString(36).substring(2);
	const hostname = window.location.hostname
		? window.location.hostname
		: window.parent.location.hostname;
	const srcDoc = (
		<html>
			<head>
				<meta
					http-equiv="Content-Security-Policy"
					content={`
                        default-src 'none'; 
                        script-src http://127.0.0.1:6969 ${API_URL} 'nonce-${nonce}' 'wasm-unsafe-eval' 'unsafe-eval'; 
                        style-src 'unsafe-inline';
                        connect-src http://127.0.0.1:6969 ${API_URL} data:;
                    `}
				/>
			</head>
			<script src={`${API_URL}/static/ruffle.js`}></script>
			<body data-swf={`${swfFile}`}>
				<div id="ruffle"></div>
				<script type="module" nonce={nonce}>{`
                var script = document.createElement("script");
                script.type = "module";
                script.onerror = function () {
                    var fallbackScript = document.createElement("script");
                    fallbackScript.type = "module";
                    fallbackScript.src = 'http://${hostname}:6969/swf.ts';
                    document.body.appendChild(fallbackScript);
                };
                script.src = "${API_URL}/static/swf.js";
                document.body.appendChild(script);
            `}</script>
			</body>
		</html>
	);

	// A srcdoc iframe has an opaque origin. Current Chrome blocks subresource
	// loads from a null-origin document to a loopback address — Private Network
	// Access treats a null origin as public and 127.0.0.1 as private — so in
	// local development ruffle.js never loads inside the sandbox, no frames are
	// ever streamed, and createSwfAvatar awaits forever.
	// See docs/specs/swf-avatar-rendering.md §12.4.
	//
	// allow-same-origin restores those loads by giving the iframe the parent's
	// origin, but that also defeats the isolation this sandbox exists to
	// provide: the SWF can then reach into the page. That trade is acceptable
	// only on a local dev machine, never for user-uploaded content in
	// production.
	//
	// import.meta.env.DEV is substituted at build time, so the production
	// bundle contains the strict attribute with no runtime branch. The real fix
	// is W3 (move Flash emulation into a worker), which needs no opaque
	// document and isolates strictly better.
	const sandbox = import.meta.env.DEV
		? "allow-scripts allow-same-origin"
		: "allow-scripts";

	const iframe = (
		<iframe
			id="swf-sandbox"
			srcDoc={srcDoc.outerHTML}
			sandbox={sandbox}
		></iframe>
	) as HTMLIFrameElement;

	const container = document.getElementById("ruffle") ?? document.body;
	container.appendChild(iframe);

	const readyPromise = new Promise<HTMLIFrameElement>((resolve) => {
		const handler = (event: MessageEvent) => {
			// this sandbox is ready when the first frame can be rendered
			if (
				event.source === iframe.contentWindow &&
				event.data.type === "frame"
			) {
				window.removeEventListener("message", handler);
				resolve(iframe);
			}
		};
		window.addEventListener("message", handler);
	});

	return readyPromise;
};
