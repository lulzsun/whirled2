import { defineConfig } from "vite";

export default defineConfig({
	server: {
		origin: "http://localhost:6969",
		strictPort: true,
		port: 6969,
	},
});
