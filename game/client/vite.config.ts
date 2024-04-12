import { defineConfig } from "vite";

export default defineConfig({
	build: {
		lib: {
			entry: "./main.ts",
			name: "game",
			fileName: "game",
		},
		sourcemap: true,
	},
	server: {
		host: "127.0.0.1",
		origin: "http://127.0.0.1:6969",
		strictPort: true,
		port: 6969,
	},
});
