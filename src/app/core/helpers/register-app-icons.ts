import {addIcons} from 'ionicons';
import {
  accessibility,
  addOutline,
  airplane,
  alertCircleOutline,
  analytics,
  arrowForward,
  cameraReverseOutline,
  chatbubbles,
  checkmarkOutline,
  chevronDown,
  chevronDownOutline,
  chevronForwardOutline,
  closeOutline,
  cloudDownloadOutline,
  code,
  copyOutline,
  diceOutline,
  downloadOutline,
  earOutline,
  ellipseOutline,
  ellipsisHorizontal,
  gitCommit,
  home,
  images,
  imagesOutline,
  informationCircle,
  informationCircleOutline,
  language,
  linkOutline,
  logoAppleAr,
  mic,
  micOffOutline,
  micOutline,
  pauseOutline,
  person,
  personCircle,
  playCircleOutline,
  playOutline,
  refresh,
  shareOutline,
  shareSocialOutline,
  sparkles,
  stopCircleOutline,
  trash,
  trashOutline,
  videocamOffOutline,
  videocamOutline,
  volumeMedium,
  volumeMediumOutline,
  volumeMuteOutline,
} from 'ionicons/icons';

/**
 * Registers every app icon with Ionicons up front so named <ion-icon> elements
 * always resolve to inline SVG data before they connect.
 *
 * Previously each component registered its own icons via addIcons in its
 * constructor. On the first paint of a prerendered page, Stencil upgrades the
 * <ion-icon> elements already present in the server HTML before the owning
 * Angular component has been constructed, so the icon lookup missed and fell
 * back to getAssetPath(), which produced "Could not load icon" warnings and a
 * "Failed to construct 'URL': Invalid base URL" error.
 *
 * The module is registered from the browser "polyfills" bundle (see
 * angular.json), which is loaded as a module script before main.js and its
 * @ionic/core chunk. The registry is therefore populated before the
 * <ion-icon> custom element is defined and prerendered elements are upgraded.
 * A main.ts import did not help: the bundler evaluates the entry's dependency
 * chunks (including @ionic/core) before the entry body, so addIcons ran after
 * the first icon lookup.
 *
 * SSR-safe guard: addIcons writes to window.Ionicons.map, which does not exist
 * on the server (Node). The browser-only polyfills entry never runs server-side,
 * but the guard keeps this module safe if imported elsewhere.
 */
if (typeof window !== 'undefined')
  addIcons({
    accessibility,
    addOutline,
    airplane,
    alertCircleOutline,
    analytics,
    arrowForward,
    cameraReverseOutline,
    chatbubbles,
    checkmarkOutline,
    chevronDown,
    chevronDownOutline,
    chevronForwardOutline,
    closeOutline,
    cloudDownloadOutline,
    code,
    copyOutline,
    diceOutline,
    downloadOutline,
    earOutline,
    ellipseOutline,
    ellipsisHorizontal,
    gitCommit,
    home,
    images,
    imagesOutline,
    informationCircle,
    informationCircleOutline,
    language,
    linkOutline,
    logoAppleAr,
    mic,
    micOffOutline,
    micOutline,
    pauseOutline,
    person,
    personCircle,
    playCircleOutline,
    playOutline,
    refresh,
    shareOutline,
    shareSocialOutline,
    sparkles,
    stopCircleOutline,
    trash,
    trashOutline,
    videocamOffOutline,
    videocamOutline,
    volumeMedium,
    volumeMediumOutline,
    volumeMuteOutline,
  });
