import sanitizeHtml from "sanitize-html";

const allowedTags = [
  "a",
  "blockquote",
  "br",
  "em",
  "h2",
  "h3",
  "h4",
  "hr",
  "li",
  "ol",
  "p",
  "strong",
  "u",
  "ul"
];

export function sanitizeEcommerceProductDescription(value: string | null | undefined) {
  const sanitized = sanitizeHtml(value?.trim() ?? "", {
    allowedTags,
    allowedAttributes: {
      a: ["href", "target", "rel"]
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesAppliedToAttributes: ["href"],
    disallowedTagsMode: "discard",
    enforceHtmlBoundary: true,
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        rel: "noopener noreferrer"
      })
    }
  });

  return sanitized || null;
}
