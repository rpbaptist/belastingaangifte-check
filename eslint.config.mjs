import coreWebVitals from "eslint-config-next/core-web-vitals";
import prettier from "eslint-config-prettier";

const config = [{ ignores: [".claude/"] }, ...coreWebVitals, prettier];

export default config;
