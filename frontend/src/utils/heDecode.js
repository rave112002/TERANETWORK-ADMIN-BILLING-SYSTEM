import he from "he";

export const heDecode = (html) => {
  if (!html) return "";
  return he.decode(html);
};
