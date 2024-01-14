import type { Config } from "tailwindcss"

export default {
    content: [
        './web/**/*.{html,gohtml}',
        "./game/client/**/*.{html,ts}",
    ],
    theme: {
        extend: {},
    },
    plugins: [],
} satisfies Config
