import {
  AfterViewInit,
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  ElementRef,
  inject,
  Input,
  OnDestroy,
  viewChild,
} from '@angular/core';
import {Pix2PixService} from '../../../../modules/pix2pix/pix2pix.service';
import {fromEvent} from 'rxjs';
import {takeUntil, tap} from 'rxjs/operators';
import {BasePoseViewerComponent} from '../pose-viewer.component';
import {transferableImage} from '../../../../core/helpers/image/transferable';
import {IonProgressBar, IonSpinner} from '@ionic/angular/standalone';
import {AsyncPipe} from '@angular/common';
import {MatTooltipModule} from '@angular/material/tooltip';
import {TranslocoDirective} from '@jsverse/transloco';

@Component({
  selector: 'app-human-pose-viewer',
  templateUrl: './human-pose-viewer.component.html',
  styleUrls: ['./human-pose-viewer.component.scss'],
  imports: [IonProgressBar, IonSpinner, AsyncPipe, MatTooltipModule, TranslocoDirective],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class HumanPoseViewerComponent extends BasePoseViewerComponent implements AfterViewInit, OnDestroy {
  private pix2pix = inject(Pix2PixService);

  appearance$ = this.store.select<string>(state => state.settings.appearance);

  readonly canvasEl = viewChild<ElementRef<HTMLCanvasElement>>('canvas');

  @Input() src: string;
  @Input() width: string;
  @Input() height: string;

  ready = false;
  modelReady = false;
  totalFrames = 1;

  private localCache: ImageBitmap[] = [];
  private poseFps: number;
  private destroyed = false;
  private loopAnimationId: number | null = null;
  private playbackFrameIndex = 0;
  private encodingStarted = false;

  ngAfterViewInit(): void {
    const pose = this.poseEl().nativeElement;
    const canvas = this.canvasEl().nativeElement;
    const ctx = canvas.getContext('2d');

    this.ngUnsubscribe.subscribe(() => (this.destroyed = true));

    fromEvent(pose, 'firstRender$')
      .pipe(
        tap(async () => {
          this.resetLocal();
          this.poseFps = await this.fps();
          this.totalFrames = this.poseFps * pose.duration;

          await this.pix2pix.loadModel();

          this.totalFrames = Math.round(this.poseFps * pose.duration);

          const poseCanvas = pose.shadowRoot.querySelector('canvas');
          const poseCtx = poseCanvas.getContext('2d', {willReadFrequently: true});
          let queued = 0;

          const iterFrame = async () => {
            if (this.destroyed) return;

            if (pose.ended) {
              if (queued === 0) {
                this.ready = true;
                if (this.standby) {
                  this.signalPrepared();
                } else {
                  this.beginPlayback();
                }
              }
              return;
            }

            queued++;
            await new Promise(requestAnimationFrame);
            const image = await transferableImage(poseCanvas, poseCtx);
            await pose.nextFrame();
            this.translateFrame(image, canvas, ctx).then(() => {
              queued--;
              iterFrame();
            });
          };

          for (let i = 0; i < 3; i++) {
            await iterFrame();
          }
        }),
        takeUntil(this.ngUnsubscribe)
      )
      .subscribe();
  }

  async translateFrame(image: ImageBitmap | ImageData, canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
    const uint8Array: Uint8ClampedArray = await this.pix2pix.translate(image);
    this.modelReady = true;

    const imageData = new ImageData(new Uint8ClampedArray(uint8Array), canvas.width, canvas.height);
    ctx.putImageData(imageData, 0, 0);

    const imageBitmap = await createImageBitmap(imageData);
    this.localCache.push(imageBitmap);
    this.frameIndex++;
  }

  drawFrame(bitmap: ImageBitmap, canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (this.background) {
      ctx.fillStyle = this.background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(bitmap, 0, 0);
  }

  startCanvasLoop(): void {
    if (this.localCache.length === 0) return;

    const canvas = this.canvasEl().nativeElement;
    const ctx = canvas.getContext('2d');
    const interval = 1000 / (this.poseFps * this.playbackRate);

    let lastTime = 0;

    const loop = (time: number) => {
      if (this.destroyed) return;

      if (time - lastTime >= interval) {
        this.drawFrame(this.localCache[this.playbackFrameIndex], canvas, ctx);
        this.playbackFrameIndex++;
        lastTime = time;
        if (this.playbackFrameIndex >= this.localCache.length) {
          this.loopAnimationId = null;
          this.signalPlaybackCompleted();
          return;
        }
      }

      this.loopAnimationId = requestAnimationFrame(loop);
    };

    this.loopAnimationId = requestAnimationFrame(loop);
  }

  protected override onActivated(): void {
    this.beginPlayback();
  }

  protected override onDeactivated(): void {
    super.onDeactivated();
    if (this.loopAnimationId !== null) {
      cancelAnimationFrame(this.loopAnimationId);
      this.loopAnimationId = null;
    }
  }

  private beginPlayback(): void {
    if (!this.ready || this.playbackFrameIndex >= this.localCache.length) return;
    if (!this.encodingStarted) {
      this.encodingStarted = true;
      void this.encodeCachedFrames();
    }
    this.startCanvasLoop();
  }

  private async encodeCachedFrames(): Promise<void> {
    this.frameCache.reset();
    for (let i = 0; i < this.localCache.length; i++) {
      if (this.destroyed) return;
      const bitmap = await createImageBitmap(this.localCache[i]);
      if (i === 0) {
        await this.frameCache.initEncoder(bitmap, this.poseFps * this.playbackRate, this.localCache.length);
      }
      await this.frameCache.addFrame(bitmap);
    }
    if (this.destroyed) return;
    await this.frameCache.finalize();
    this.signalReady();
  }

  private resetLocal(): void {
    if (this.loopAnimationId !== null) {
      cancelAnimationFrame(this.loopAnimationId);
      this.loopAnimationId = null;
    }
    this.localCache.forEach(bitmap => bitmap.close());
    this.localCache = [];
    this.ready = false;
    this.playbackFrameIndex = 0;
    this.encodingStarted = false;
  }

  override reset(): void {
    this.resetLocal();
    super.reset();
  }

  override ngOnDestroy(): void {
    this.destroyed = true;
    this.resetLocal();
    super.ngOnDestroy();
  }

  get progress(): number {
    const poseEl = this.poseEl();
    if (!poseEl) return 0;
    const pose = poseEl.nativeElement;
    if (!pose.duration) return 0;
    return this.localCache.length / this.totalFrames;
  }
}
