import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      // Itera brand type system (brand.devfellowship.com/itera):
      //   Barlow Condensed → display/headline/wordmark (600/700)
      //   Inter            → body/UI/buttons (400–700)
      //   JetBrains Mono   → meta/IDs/timestamps/code (400/500)
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Barlow Condensed', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          dark: "hsl(var(--primary-dark))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
          dark: "hsl(var(--destructive-dark))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
          dark: "hsl(var(--success-dark))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Gamification colors
        life: "hsl(var(--life))",
        streak: "hsl(var(--streak))",
        xp: "hsl(var(--xp))",
        // Itera brand palette (brand.devfellowship.com/itera) — literal hex so
        // the design's utility classes resolve. Canonical brand names + legacy
        // (João Oak) aliases kept side-by-side so existing call-sites keep working.
        //
        //   evergreen      #3FD17F  primary · CTA · slash
        //   evergreen-hi   #62D996  text-on-dark · hover · ring (AAA 11.4:1)
        //   evergreen-soft #1C3A2A  subtle bg · line highlight
        //   clay           #E0A86F  Q&A labels ONLY (never CTA, never green for Q&A)
        //   bg             #0A0908  page
        //   panel          #141210  card/sidebar
        //   panel-2        #1C1916  raised card
        //   ink            #F4EDE2  primary text
        //   muted          #7D7568  meta/labels
        evergreen: "#3FD17F",
        "evergreen-hi": "#62D996",
        "evergreen-soft": "#1C3A2A",
        ink: "#F4EDE2",
        panel: "#141210",
        "panel-2": "#1C1916",
        "brand-bg": "#0A0908",
        "brand-muted": "#7D7568",
        // Legacy (João Oak) aliases — same hex, kept for existing class names.
        "verde-floresta": "#1C3A2A",
        "verde-tech": "#3FD17F",
        menta: "#62D996",
        "azul-marinho": "#16321F",
        gelo: "#F4EDE2",
        obsidiana: "#141210",
        clay: "#E0A86F",
        "input-background": "#1C1916",
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          "0%": { transform: "scale(0.95)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "slide-in-right": {
          "0%": { transform: "translateX(100%)" },
          "100%": { transform: "translateX(0)" },
        },
        // Flat brand pulse — opacity only, NO box-shadow glow (brand forbids glow)
        "pulse-glow": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.4s ease-out",
        "scale-in": "scale-in 0.3s ease-out",
        "slide-in-right": "slide-in-right 0.3s ease-out",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
