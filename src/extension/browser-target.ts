import browser from './browser';

export const isChromeBuild = 'side_panel' in browser.runtime.getManifest();
