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

	const iframe = (
		<iframe
			id="swf-sandbox"
			srcDoc={srcDoc.outerHTML}
			sandbox="allow-scripts"
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
