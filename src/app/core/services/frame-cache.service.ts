import {Injectable} from '@angular/core';
import {drawWatermark} from '../helpers/watermark';
import {PlayableVideoEncoder} from '../../pages/translate/pose-viewers/playable-video-encoder';

@Injectable({providedIn: 'root'})
export class FrameCacheService {
  private encoder: PlayableVideoEncoder | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private _blob: Blob | null = null;
  private _fps = 0;
  private _totalFrames = 0;
  private _frameIndex = 0;
  private videoEncodingUnavailable = false;

  get progress(): number {
    return this._totalFrames > 0 ? this._frameIndex / this._totalFrames : 0;
  }

  get encoding(): boolean {
    return this._totalFrames > 0 && !this._blob;
  }

  get blob(): Blob | null {
    return this._blob;
  }

  reset(): void {
    this.encoder?.close();
    this.encoder = null;
    this.canvas = null;
    this.ctx = null;
    this._blob = null;
    this._fps = 0;
    this._totalFrames = 0;
    this._frameIndex = 0;
  }

  async initEncoder(firstFrame: ImageBitmap, fps: number, totalFrames: number): Promise<void> {
    this._fps = fps;
    this._totalFrames = totalFrames;
    this._frameIndex = 0;
    this._blob = null;

    this.canvas = document.createElement('canvas');
    this.canvas.width = firstFrame.width;
    this.canvas.height = firstFrame.height;
    this.ctx = this.canvas.getContext('2d');

    if (PlayableVideoEncoder.isSupported() && !this.videoEncodingUnavailable) {
      const encoder = new PlayableVideoEncoder(firstFrame, fps);
      try {
        await encoder.init();
        this.encoder = encoder;
      } catch (error) {
        this.disableVideoEncoding(encoder, error);
      }
    }
  }

  async addFrame(frame: ImageBitmap): Promise<void> {
    this.ctx.drawImage(frame, 0, 0);
    drawWatermark(this.canvas, this._frameIndex, this._totalFrames, this._fps);

    const watermarked = await createImageBitmap(this.canvas);

    try {
      if (this.encoder) await this.encoder.addFrame(watermarked);
    } catch (error) {
      this.disableVideoEncoding(this.encoder, error);
    } finally {
      watermarked.close();
      frame.close();
    }
    this._frameIndex++;
  }

  async finalize(): Promise<Blob> {
    if (this.encoder) {
      this._blob = await this.encoder.finalize();
      this.encoder = null;
    } else {
      this._blob = new Blob([], {type: 'video/mp4'});
    }

    this.canvas = null;
    this.ctx = null;
    return this._blob;
  }

  private disableVideoEncoding(encoder: PlayableVideoEncoder, error: unknown): void {
    this.videoEncodingUnavailable = true;
    try {
      encoder?.close();
    } catch {
      // The codec may already have closed itself while rejecting its configuration.
    }
    this.encoder = null;
    console.warn('MP4 export is unavailable on this device; sign playback will continue without video export.', error);
  }
}
