import { viewHandlerCopyable } from "./itemFormat";

export const decodeHtmlEntities = (html, isCopyable = false) => {
  var txt = document.createElement("textarea");
  txt.innerHTML = html;
  return isCopyable ? viewHandlerCopyable(txt.value) : txt.value;
};

export const arrayToSelectDropdown = (arr, keyValue, keyLabel) => {
  return arr.map((obj) => ({ label: obj[keyLabel], value: obj[keyValue] }));
};
