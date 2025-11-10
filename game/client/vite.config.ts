import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
	publicDir: "../../web/static/",
	build: {
		lib: {
			entry: ["./main.ts", "./preview.ts"],
			fileName: (_, entryName) => {
				switch (entryName) {
					case "main":
						return "game.js";
					default:
						return `${entryName}.js`;
				}
			},
		},
		sourcemap: true,
	},
	server: {
		host: "127.0.0.1",
		origin: "http://127.0.0.1:6969",
		strictPort: true,
		port: 6969,
	},
	esbuild: {
		jsx: "automatic",
		jsxImportSource: "jsx-dom",
	},
	plugins: [tailwindcss()],
});
