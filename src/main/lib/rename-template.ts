/**
 * 파일명 리네임 템플릿 치환 함수
 *
 * 템플릿 문자열의 {variableName} 패턴을 컨텍스트 값으로 치환한다.
 * 배열 필드(makers, categories, tags)는 쉼표+공백으로 결합된다.
 * null 또는 빈 문자열 값은 빈 문자열로 치환된다.
 */

/** 템플릿 치환에 사용할 컨텍스트 */
export interface TemplateContext {
  externalId: string | null;
  title: string;
  originalTitle: string;
  translatedTitle: string | null;
  maker: string | null;
  makers: string[];
  category: string | null;
  categories: string[];
  publishDate: string | null;
  publishYear: string | null;
  tag: string | null;
  tags: string[];
  provider: string | null;
}

/** Windows 파일명으로 사용할 수 없는 문자 */
const INVALID_FILENAME_CHARS = /[\\/:*?"<>|]/g;

/**
 * 파일명으로 사용할 수 없는 특수문자를 제거한다.
 *
 * - Windows 금지 문자: \ / : * ? " < > |
 * - 제거 후 공백 정리
 */
function sanitizeFilename(name: string): string {
  const sanitized = name.replace(INVALID_FILENAME_CHARS, "");
  // 연속 공백 → 단일 공백, 앞뒤 공백 제거
  return sanitized.replace(/\s+/g, " ").trim();
}

/** 컨텍스트 키와 템플릿 변수명 매핑 */
const TEMPLATE_VARIABLES: {
  key: keyof TemplateContext;
  placeholder: string;
}[] = [
  { key: "externalId", placeholder: "{externalId}" },
  { key: "title", placeholder: "{title}" },
  { key: "originalTitle", placeholder: "{originalTitle}" },
  { key: "translatedTitle", placeholder: "{translatedTitle}" },
  { key: "maker", placeholder: "{maker}" },
  { key: "makers", placeholder: "{makers}" },
  { key: "category", placeholder: "{category}" },
  { key: "categories", placeholder: "{categories}" },
  { key: "publishDate", placeholder: "{publishDate}" },
  { key: "publishYear", placeholder: "{publishYear}" },
  { key: "tag", placeholder: "{tag}" },
  { key: "tags", placeholder: "{tags}" },
  { key: "provider", placeholder: "{provider}" },
];

/**
 * 템플릿 문자열의 변수를 컨텍스트 값으로 치환한다.
 *
 * @param template - "{variableName}" 패턴이 포함된 템플릿 문자열
 * @param context - 치환할 값이 담긴 컨텍스트
 * @returns 치환된 문자열
 */
export function applyTemplate(
  template: string,
  context: TemplateContext,
): string {
  let result = template;

  for (const { key, placeholder } of TEMPLATE_VARIABLES) {
    const value = context[key];

    // null → 빈 문자열, 배열 → 쉼표+공백 결합, 문자열 → 그대로
    let replacement: string;
    if (value === null) {
      replacement = "";
    } else if (Array.isArray(value)) {
      replacement = value.join(", ");
    } else {
      replacement = String(value);
    }

    result = result.replaceAll(placeholder, replacement);
  }

  return sanitizeFilename(result);
}
