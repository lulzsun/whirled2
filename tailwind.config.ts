import type { Config } from "tailwindcss";

export default {
	content: ["./web/**/*.{html,gohtml}", "./game/client/**/*.{html,ts,tsx}"],
	theme: {
		extend: {},
	},
	plugins: [require("@tailwindcss/container-queries")],
} satisfies Config;
