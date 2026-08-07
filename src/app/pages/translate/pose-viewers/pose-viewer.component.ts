import {
  Component,
  ElementRef,
  inject,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
  viewChild,
} from '@angular/core';
import {Store} from '@ngxs/store';
import {BaseComponent} from '../../../components/base/base.component';
import {FrameCacheService} from '../../../core/services/frame-cache.service';
import {
  SetSignedLanguageVideo,
  SigningPlaybackCompleted,
  SigningPosePrepared,
} from '../../../modules/translate/translate.actions';

/** Production signing speed chosen to stay close to live speech without making signs abrupt. */
export const SIGN_PLAYBACK_RATE = 1.2;

@Component({
  selector: 'app-pose-viewer',
  template: ``,
  styles: [],
})
export abstract class BasePoseViewerComponent extends BaseComponent implements OnInit, OnChanges, OnDestroy {
  @Input({required: true}) jobId: string;
  @Input() standby = false;
  protected store = inject(Store);
  protected frameCache = inject(FrameCacheService);
  private zone = inject(NgZone);

  readonly poseEl = viewChild<ElementRef<HTMLPoseViewerElement>>('poseViewer');

  background: string = '';
  readonly playbackRate = SIGN_PLAYBACK_RATE;

  frameIndex = 0;

  static isCustomElementDefined = false;

  private onVisibilityChange = () => {
    const pose = this.poseEl()?.nativeElement;
    if (!pose) return;
    if (document.hidden) {
      pose.pause();
    } else if (!this.standby) {
      pose.play();
    }
  };

  async ngOnInit() {
    const el = document.querySelector('app-signed-language-output');
    if (el) {
      this.background = getComputedStyle(el).backgroundColor;
    }

    document.addEventListener('visibilitychange', this.onVisibilityChange);
    await this.definePoseViewerElement();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes.standby || changes.standby.firstChange) return;

    queueMicrotask(() => {
      if (!this.poseEl()) return;
      if (this.standby) {
        this.onDeactivated();
      } else {
        this.onActivated();
      }
    });
  }

  async definePoseViewerElement() {
    if (!BasePoseViewerComponent.isCustomElementDefined) {
      BasePoseViewerComponent.isCustomElementDefined = true;

      const {defineCustomElements} = await import(/* webpackChunkName: "pose-viewer" */ 'pose-viewer/loader');
      defineCustomElements();
    }
  }

  override ngOnDestroy(): void {
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    super.ngOnDestroy();
    this.reset();
  }

  async fps() {
    const pose = await this.poseEl().nativeElement.getPose();
    return pose.body.fps;
  }

  signalReady(): void {
    this.zone.run(() => this.store.dispatch(new SetSignedLanguageVideo('ready')));
  }

  signalPrepared(): void {
    this.zone.run(() => this.store.dispatch(new SigningPosePrepared(this.jobId)));
  }

  signalPlaybackCompleted(): void {
    if (this.standby) return;
    this.zone.run(() => this.store.dispatch(new SigningPlaybackCompleted(this.jobId)));
  }

  protected onActivated(): void {
    const pose = this.poseEl()?.nativeElement;
    if (!pose) return;
    pose.playbackRate = this.playbackRate;
    pose.play();
  }

  protected onDeactivated(): void {
    this.poseEl()?.nativeElement.pause();
  }

  reset(): void {
    this.frameCache.reset();
    this.frameIndex = 0;
  }
}
