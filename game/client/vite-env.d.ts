/// <reference types="vite/client" />

interface ImportMetaEnv {
	/**
	 * Origin of the Flash sandbox deployment, e.g. https://whirled2-swf.fly.dev.
	 * Baked in at build time; see SANDBOX_ORIGIN in constants.ts. Unset in dev,
	 * where the localhost/127.0.0.1 pairing provides the second origin.
	 */
	readonly VITE_SANDBOX_ORIGIN?: string;
}
