import {AfterViewInit, Component, CUSTOM_ELEMENTS_SCHEMA, Input, OnDestroy} from '@angular/core';
import {BasePoseViewerComponent} from '../pose-viewer.component';
import {fromEvent} from 'rxjs';
import {takeUntil, tap} from 'rxjs/operators';
import {AnimationComponent} from '../../../../components/animation/animation.component';

@Component({
  selector: 'app-avatar-pose-viewer',
  templateUrl: './avatar-pose-viewer.component.html',
  styleUrls: ['./avatar-pose-viewer.component.scss'],
  imports: [AnimationComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class AvatarPoseViewerComponent extends BasePoseViewerComponent implements AfterViewInit, OnDestroy {
  @Input() src: string;

  effectiveFps: number = 1;
  private playbackTimer: ReturnType<typeof setTimeout> | null = null;
  private remainingPlaybackMs = 0;
  private playbackStartedAt = 0;

  ngAfterViewInit(): void {
    const poseEl = this.poseEl().nativeElement;
    // TODO reset animation through the store
    fromEvent(poseEl, 'firstRender$')
      .pipe(
        tap(async () => {
          const pose = await poseEl.getPose();

          this.effectiveFps = pose.body.fps * this.playbackRate;
          this.remainingPlaybackMs = (poseEl.duration * 1000) / this.playbackRate;
          if (this.standby) {
            this.signalPrepared();
          } else {
            this.startPlaybackTimer();
          }
          // TODO send pose tensor to the animation service (through the store)
        }),
        takeUntil(this.ngUnsubscribe)
      )
      .subscribe();
  }

  protected override onActivated(): void {
    this.startPlaybackTimer();
  }

  protected override onDeactivated(): void {
    if (this.playbackTimer !== null) {
      clearTimeout(this.playbackTimer);
      this.playbackTimer = null;
      this.remainingPlaybackMs = Math.max(0, this.remainingPlaybackMs - (performance.now() - this.playbackStartedAt));
    }
  }

  private startPlaybackTimer(): void {
    if (!this.remainingPlaybackMs || this.playbackTimer !== null) return;
    this.playbackStartedAt = performance.now();
    this.playbackTimer = setTimeout(() => {
      this.playbackTimer = null;
      this.remainingPlaybackMs = 0;
      this.signalPlaybackCompleted();
    }, this.remainingPlaybackMs);
  }

  override ngOnDestroy(): void {
    if (this.playbackTimer !== null) clearTimeout(this.playbackTimer);
    super.ngOnDestroy();
  }
}
