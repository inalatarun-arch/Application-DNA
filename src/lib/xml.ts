/** XML helpers shared by the DOCX, BPMN, draw.io and Visio writers. */
// eslint-disable-next-line no-control-regex
const ILLEGAL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

export const xmlText = (s: string): string =>
  s.replace(ILLEGAL, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const xmlAttr = (s: string): string => xmlText(s).replace(/"/g, '&quot;').replace(/\r?\n/g, '&#10;');

export const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
