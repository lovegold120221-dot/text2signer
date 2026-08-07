import {ChangeDetectorRef, Component, inject, OnInit} from '@angular/core';
import {Observable} from 'rxjs';
import {PoseViewerSetting} from '../../../../modules/settings/settings.state';
import {Store} from '@ngxs/store';
import {takeUntil, tap} from 'rxjs/operators';
import {
  ClearSigningQueue,
  ResumeSigningQueue,
  ShareSignedLanguageVideo,
  SigningPlaybackCompleted,
  StopSigningQueue,
} from '../../../../modules/translate/translate.actions';
import {FrameCacheService} from '../../../../core/services/frame-cache.service';
import {SigningJob, TranslateState, TranslateStateModel} from '../../../../modules/translate/translate.state';
import {BaseComponent} from '../../../../components/base/base.component';
import {IonButton, IonIcon} from '@ionic/angular/standalone';
import {AvatarPoseViewerComponent} from '../../pose-viewers/avatar-pose-viewer/avatar-pose-viewer.component';
import {SkeletonPoseViewerComponent} from '../../pose-viewers/skeleton-pose-viewer/skeleton-pose-viewer.component';
import {HumanPoseViewerComponent} from '../../pose-viewers/human-pose-viewer/human-pose-viewer.component';
import {ShareDialogComponent} from '../../../../components/share-dialog/share-dialog.component';
import {TranslocoPipe} from '@jsverse/transloco';
import {AsyncPipe} from '@angular/common';
import {MatTooltipModule} from '@angular/material/tooltip';
import {addIcons} from 'ionicons';
import {
  downloadOutline,
  linkOutline,
  pauseOutline,
  playOutline,
  shareOutline,
  shareSocialOutline,
  trashOutline,
} from 'ionicons/icons';
import {SIGN_PLAYBACK_RATE} from '../../pose-viewers/pose-viewer.component';

// How many upcoming signer videos are kept mounted as hidden standby viewers. Each standby
// pre-parses (and for 'person' viewers, pre-renders) its pose while the active video plays, so
// the next signer video is already generated before playback reaches it — the same instance then
// switches to active with no gap between videos.
const MAX_STANDBY_VIEWERS = 2;

@Component({
  selector: 'app-signed-language-output',
  templateUrl: './signed-language-output.component.html',
  styleUrls: ['./signed-language-output.component.scss'],
  imports: [
    IonButton,
    AvatarPoseViewerComponent,
    SkeletonPoseViewerComponent,
    HumanPoseViewerComponent,
    ShareDialogComponent,
    TranslocoPipe,
    AsyncPipe,
    MatTooltipModule,
    IonIcon,
  ],
})
export class SignedLanguageOutputComponent extends BaseComponent implements OnInit {
  private store = inject(Store);
  private cdr = inject(ChangeDetectorRef);
  frameCache = inject(FrameCacheService);

  poseViewerSetting$!: Observable<PoseViewerSetting>;
  activeJob$!: Observable<SigningJob | null>;
  translate$!: Observable<TranslateStateModel>;

  signedLanguageReady = false;
  isLoading = false;
  isMobile: boolean;
  shareDialogUrl: string | null = null;
  private activeSourceText = '';
  private progressRafId: number | null = null;
  private playbackFallbackTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super();

    this.poseViewerSetting$ = this.store.select<PoseViewerSetting>(state => state.settings.poseViewer);
    this.activeJob$ = this.store.select<SigningJob | null>(state => state.translate.activeSigningJob);
    this.translate$ = this.store.select<TranslateStateModel>(state => state.translate);

    this.isMobile =
      'navigator' in globalThis &&
      navigator.maxTouchPoints > 0 &&
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    addIcons({downloadOutline, linkOutline, pauseOutline, playOutline, shareOutline, shareSocialOutline, trashOutline});
  }

  ngOnInit(): void {
    this.store
      .select<string>(state => state.translate.signedLanguageVideo)
      .pipe(
        tap(video => {
          this.signedLanguageReady = !!video;
          this.updateLoadingState();
        }),
        takeUntil(this.ngUnsubscribe)
      )
      .subscribe();

    this.store
      .select<SigningJob | null>(state => state.translate.activeSigningJob)
      .pipe(
        tap(job => {
          this.clearPlaybackFallback();
          this.activeSourceText = job?.sourceText || '';
          this.updateLoadingState();
          if (job) {
            this.startProgressTracking();
            const wordCount = job.sourceText.trim().split(/\s+/).length;
            const estimatedPlaybackMs = (10_000 + wordCount * 2_500) / SIGN_PLAYBACK_RATE;
            const fallbackMs = Math.min(120_000, Math.max(15_000, estimatedPlaybackMs));
            this.playbackFallbackTimer = setTimeout(
              () => this.store.dispatch(new SigningPlaybackCompleted(job.id)),
              fallbackMs
            );
          } else {
            this.stopProgressTracking();
          }
        }),
        takeUntil(this.ngUnsubscribe)
      )
      .subscribe();
  }

  private updateLoadingState(): void {
    this.isLoading = !!this.activeSourceText && !this.signedLanguageReady;
    this.cdr.detectChanges();
  }

  private startProgressTracking(): void {
    if (this.progressRafId !== null) return;
    const tick = () => {
      this.cdr.detectChanges();
      if (this.frameCache.encoding) {
        this.progressRafId = requestAnimationFrame(tick);
      } else {
        this.progressRafId = null;
      }
    };
    this.progressRafId = requestAnimationFrame(tick);
  }

  private stopProgressTracking(): void {
    if (this.progressRafId !== null) {
      cancelAnimationFrame(this.progressRafId);
      this.progressRafId = null;
    }
  }

  downloadTranslation(): void {
    const blob = this.frameCache.blob;
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    const text = this.activeSourceText || 'sign-translation';
    const ext = '.' + blob.type.split('/').pop();
    const filename =
      encodeURIComponent(text)
        .replaceAll('%20', '-')
        .slice(0, 250 - ext.length) + ext;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  shareTranslation(): void {
    if (this.isMobile) {
      this.store.dispatch(ShareSignedLanguageVideo);
    } else {
      const state = this.store.selectSnapshot<TranslateStateModel>(state => state.translate);
      this.shareDialogUrl = TranslateState.buildShareUrl(state);
    }
  }

  stopQueue(): void {
    this.store.dispatch(StopSigningQueue);
  }

  resumeQueue(): void {
    this.store.dispatch(ResumeSigningQueue);
  }

  clearQueue(): void {
    this.store.dispatch(ClearSigningQueue);
  }

  visibleJobs(state: TranslateStateModel): SigningJob[] {
    const active = state.activeSigningJob;
    const buffered = state.signingQueue.filter(
      job => job.id !== active?.id && (job.status === 'ready' || job.status === 'prepared')
    );
    // Mount the active viewer plus up to MAX_STANDBY_VIEWERS upcoming jobs as hidden standby
    // viewers. Standby viewers pre-generate their signed video while the current one plays, so
    // playback advances to an already-prepared video with no gap. While paused, the formerly
    // active head stays mounted too so it can resume instantly.
    return active ? [active, ...buffered.slice(0, MAX_STANDBY_VIEWERS)] : buffered.slice(0, MAX_STANDBY_VIEWERS);
  }

  nextBufferedJob(state: TranslateStateModel): SigningJob | null {
    return state.signingQueue.find(job => job.id !== state.activeSigningJob?.id) || null;
  }

  private clearPlaybackFallback(): void {
    if (this.playbackFallbackTimer !== null) {
      clearTimeout(this.playbackFallbackTimer);
      this.playbackFallbackTimer = null;
    }
  }

  override ngOnDestroy(): void {
    this.clearPlaybackFallback();
    this.stopProgressTracking();
    super.ngOnDestroy();
  }
}
