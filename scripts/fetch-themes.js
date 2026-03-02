import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 테마 목록
const themes = [
  "default",
  "Amber Minimal",
  "Amethyst Haze",
  "Bold Tech",
  "Bubblegum",
  "Caffeine",
  "Candyland",
  "Catppuccin",
  "Claude",
  "Claymorphism",
  "Clean Slate",
  "Cosmic Night",
  "Cyberpunk",
  "Darkmatter",
  "Doom 64",
  "Elegant Luxury",
  "Graphite",
  "Kodama Grove",
  "Midnight Bloom",
  "Mocha Mousse",
  "Modern Minimal",
  "Mono",
  "Nature",
  "Neo Brutalism",
  "Northern Lights",
  "Notebook",
  "Ocean Breeze",
  "Pastel Dreams",
  "Perpetuity",
  "Quantum Rose",
  "Retro Arcade",
  "Soft Pop",
  "Solar Dusk",
  "Starry Night",
  "Sunset Horizon",
  "Supabase",
  "T3 Chat",
  "Tangerine",
  "Twitter",
  "Vercel",
  "Vintage Paper",
  "Violet Bloom",
];

// 테마 이름을 파일명으로 변환 (소문자, 공백을 하이픈으로)
const toFileName = (name) => {
  return name.toLowerCase().replace(/\s+/g, "-");
};

// 테마 이름을 API URL용으로 변환
const toApiName = (name) => {
  return name.toLowerCase().replace(/\s+/g, "-");
};

// CSS 변수를 CSS 파일 형식으로 변환
const generateCSS = (themeData, themeName) => {
  const { cssVars } = themeData;

  let css = `/* ${themeName} Theme - tweakcn */\n\n`;

  // Light mode
  css += ":root {\n";
  if (cssVars.light) {
    for (const [key, value] of Object.entries(cssVars.light)) {
      css += `  --${key}: ${value};\n`;
    }
  }
  css += "}\n\n";

  // Dark mode
  css += ".dark {\n";
  if (cssVars.dark) {
    for (const [key, value] of Object.entries(cssVars.dark)) {
      css += `  --${key}: ${value};\n`;
    }
  }
  css += "}\n";

  return css;
};

// 모든 테마 다운로드
const fetchAllThemes = async () => {
  const themesDir = path.join(
    __dirname,
    "../src/renderer/public/assets/themes",
  );

  // 디렉토리가 없으면 생성
  if (!fs.existsSync(themesDir)) {
    fs.mkdirSync(themesDir, { recursive: true });
  }

  console.log(`📦 ${themes.length}개의 테마를 다운로드합니다...\n`);

  const results = {
    success: [],
    failed: [],
  };

  for (const themeName of themes) {
    const apiName = toApiName(themeName);
    const fileName = toFileName(themeName);
    const url = `https://tweakcn.com/r/themes/${apiName}.json`;

    try {
      console.log(`⬇️  다운로드 중: ${themeName}...`);
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const css = generateCSS(data, themeName);

      const filePath = path.join(themesDir, `${fileName}.css`);
      fs.writeFileSync(filePath, css, "utf-8");

      console.log(`✅ 완료: ${fileName}.css`);
      results.success.push(themeName);
    } catch (error) {
      console.error(`❌ 실패: ${themeName} - ${error.message}`);
      results.failed.push({ name: themeName, error: error.message });
    }
  }

  // 결과 요약
  console.log("\n" + "=".repeat(50));
  console.log(`\n✅ 성공: ${results.success.length}개`);
  console.log(`❌ 실패: ${results.failed.length}개`);

  if (results.failed.length > 0) {
    console.log("\n실패한 테마:");
    results.failed.forEach(({ name, error }) => {
      console.log(`  - ${name}: ${error}`);
    });
  }

  // 테마 목록을 TypeScript 타입으로 생성
  const themeNames = results.success.map(toFileName);
  const typeDefinition = `// 자동 생성된 테마 타입\nexport type ColorTheme = ${themeNames.map((n) => `'${n}'`).join(" | ")};\n`;

  const typePath = path.join(__dirname, "../src/renderer/types/themes.ts");
  const typeDir = path.dirname(typePath);

  if (!fs.existsSync(typeDir)) {
    fs.mkdirSync(typeDir, { recursive: true });
  }

  fs.writeFileSync(typePath, typeDefinition, "utf-8");
  console.log(`\n📝 타입 정의 생성 완료: src/renderer/types/themes.ts`);
};

// 실행
fetchAllThemes().catch(console.error);
