import type { Config } from "tailwindcss"

export default {
    content: [
        './web/**/*.{html,gohtml}',
        "./game/**/*.{html,ts}",
    ],
    theme: {
        extend: {},
    },
    plugins: [],
} satisfies Config
