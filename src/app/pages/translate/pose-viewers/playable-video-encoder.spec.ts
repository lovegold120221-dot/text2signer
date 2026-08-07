import {Capacitor} from '@capacitor/core';
import {PlayableVideoEncoder} from './playable-video-encoder';

describe('PlayableVideoEncoder', () => {
  it('disables optional MP4 export in native Android WebView', () => {
    spyOn(Capacitor, 'getPlatform').and.returnValue('android');

    expect(PlayableVideoEncoder.isSupported()).toBeFalse();
  });
});
