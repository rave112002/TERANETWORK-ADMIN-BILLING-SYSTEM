import { decode } from "html-entities";
import { viewHandlerCopyable } from "./view";

export const decodeHTML = (str, isCopyable = false) => {
  if (str == null) return "";
  if (typeof str !== "string") str = String(str);

  let prev = str;
  let next = decode(str);

  while (next !== prev) {
    prev = next;
    next = decode(prev);
  }

  return isCopyable ? viewHandlerCopyable(next) : next;
};
