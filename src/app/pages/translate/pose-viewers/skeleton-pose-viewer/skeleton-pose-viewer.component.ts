import {AfterViewInit, Component, CUSTOM_ELEMENTS_SCHEMA, Input} from '@angular/core';
import {fromEvent} from 'rxjs';
import {takeUntil, tap} from 'rxjs/operators';
import {BasePoseViewerComponent} from '../pose-viewer.component';

@Component({
  selector: 'app-skeleton-pose-viewer',
  templateUrl: './skeleton-pose-viewer.component.html',
  styleUrls: ['./skeleton-pose-viewer.component.scss'],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class SkeletonPoseViewerComponent extends BasePoseViewerComponent implements AfterViewInit {
  @Input() src: string;

  private firstPassDone = false;
  private completionSignaled = false;
  private poseFps: number;
  private expectedFrames = Infinity;
  private encodeQueue: Promise<void> = Promise.resolve();
  private metadataReady: Promise<void>;
  private resolveMetadata: () => void;
  private hasStarted = false;

  ngAfterViewInit(): void {
    const pose = this.poseEl().nativeElement;

    fromEvent(pose, 'firstRender$')
      .pipe(
        tap(() => {
          this.metadataReady = new Promise(resolve => (this.resolveMetadata = resolve));

          pose.getPose().then(poseData => {
            this.poseFps = poseData.body.fps;
            this.expectedFrames = Math.round(this.poseFps * pose.duration);
            this.resolveMetadata();
            if (this.standby) {
              pose.pause();
              pose.currentTime = 0;
              this.signalPrepared();
            } else {
              this.initializeActivePlayback();
              this.hasStarted = true;
            }
          });
        }),
        takeUntil(this.ngUnsubscribe)
      )
      .subscribe();

    fromEvent(pose, 'render$')
      .pipe(
        tap(() => {
          if (this.standby || this.firstPassDone) return;
          const poseCanvas = pose.shadowRoot.querySelector('canvas') as HTMLCanvasElement;
          if (!poseCanvas) return;

          const bitmapPromise = createImageBitmap(poseCanvas);

          this.encodeQueue = this.encodeQueue.then(async () => {
            if (this.firstPassDone) return;
            await this.metadataReady;
            const bitmap = await bitmapPromise;
            if (this.firstPassDone) return;

            if (this.frameIndex === 0) {
              await this.frameCache.initEncoder(bitmap, this.poseFps * this.playbackRate, this.expectedFrames);
            }

            await this.frameCache.addFrame(bitmap);
            this.frameIndex++;

            if (this.frameIndex >= this.expectedFrames) {
              this.firstPassDone = true;
              await this.frameCache.finalize();
              this.signalReady();
            }
          });
        }),
        takeUntil(this.ngUnsubscribe)
      )
      .subscribe();

    fromEvent(pose, 'ended$')
      .pipe(
        tap(() => {
          if (this.standby || this.completionSignaled) return;
          this.completionSignaled = true;
          const needsFinalize = !this.firstPassDone;
          this.encodeQueue.then(async () => {
            if (needsFinalize && !this.firstPassDone) {
              this.firstPassDone = true;
              await this.frameCache.finalize();
              this.signalReady();
            }
            this.signalPlaybackCompleted();
          });
        }),
        takeUntil(this.ngUnsubscribe)
      )
      .subscribe();
  }

  protected override onActivated(): void {
    if (!this.hasStarted) {
      this.initializeActivePlayback();
      this.poseEl().nativeElement.currentTime = 0;
      this.hasStarted = true;
    }
    super.onActivated();
  }

  private initializeActivePlayback(): void {
    this.firstPassDone = false;
    this.completionSignaled = false;
    this.encodeQueue = Promise.resolve();
    this.metadataReady = Promise.resolve();
    this.reset();
  }
}
