import type { Config } from "tailwindcss";

export default {
	content: ["./web/**/*.{html,gohtml}", "./game/client/**/*.{html,ts,tsx}"],
	theme: {
		extend: {},
	},
} satisfies Config;
