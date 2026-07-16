declare const __SITE_VERSION__: string | undefined;
declare const __CLI_VERSION__: string | undefined;

export const SITE_VERSION =
  typeof __SITE_VERSION__ !== 'undefined' ? __SITE_VERSION__ : 'dev';
export const CLI_VERSION =
  typeof __CLI_VERSION__ !== 'undefined' ? __CLI_VERSION__ : 'dev';
