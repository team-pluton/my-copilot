import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(["node_modules/**", ".next/**", "out/**", "core/**", "scripts/deck/**"]), // 덱 생성기는 Node CommonJS 스크립트 — 웹 앱 규칙 밖
]);
