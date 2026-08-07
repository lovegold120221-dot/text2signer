import {inject, Injectable} from '@angular/core';
import {Action, NgxsOnInit, State, StateContext, Store} from '@ngxs/store';
import {
  ChangeTranslation,
  ClearSigningQueue,
  CopySignedLanguageVideo,
  CopySpokenLanguageText,
  DescribeSignWritingSign,
  DownloadSignedLanguageVideo,
  FlipTranslationDirection,
  SetInputMode,
  SetSignedLanguage,
  SetSignedLanguageVideo,
  SetSignWritingText,
  SetSpokenLanguage,
  SetSpokenLanguageText,
  ProcessSigningQueue,
  QueueSourceSentence,
  ReceiveSpeechTranscript,
  ResumeSigningQueue,
  SigningPosePrepared,
  SigningPlaybackCompleted,
  StartNextSigningJob,
  StopSigningQueue,
  ShareSignedLanguageVideo,
  SuggestAlternativeText,
  UploadPoseFile,
} from './translate.actions';
import {TranslationService} from './translate.service';
import {SetVideo, StartCamera, StopVideo} from '../../core/modules/ngxs/store/video/video.actions';
import {catchError, EMPTY, filter, Observable, of} from 'rxjs';
import {PoseViewerSetting} from '../settings/settings.state';
import {map, switchMap, tap} from 'rxjs/operators';
import {SignWritingService} from '../sign-writing/sign-writing.service';
import {SignWritingTranslationService} from './signwriting-translation.service';
import type {Pose} from 'pose-format';
import {EstimatedPose} from '../pose/pose.state';
import {StoreFramePose} from '../pose/pose.actions';
import {PoseService} from '../pose/pose.service';
import {getUrlParams} from '../../core/helpers/url';
import {FrameCacheService} from '../../core/services/frame-cache.service';

export type InputMode = 'webcam' | 'upload' | 'text';

export interface SignWritingObj {
  fsw: string;
  description?: string;
  illustration?: string;
}

export interface SigningJob {
  id: string;
  conversationId: string;
  sourceText: string;
  sourceLanguage: string | null;
  detectedSourceLanguage?: string;
  signerText?: string;
  poseUrl?: string;
  signerInputLanguage: string;
  signedLanguage: string;
  status: 'pending' | 'translating' | 'ready' | 'prepared' | 'signing' | 'completed' | 'failed';
  error?: string;
  createdAt: number;
  completedAt?: number;
}

export interface TranslateStateModel {
  spokenToSigned: boolean;
  inputMode: InputMode;

  spokenLanguage: string;
  signedLanguage: string;
  detectedLanguage: string;

  spokenLanguageText: string;
  translatedSpokenLanguageText?: string;
  signerInputLanguage?: string;
  translationError?: string;
  normalizedSpokenLanguageText?: string;
  spokenLanguageSentences: string[];

  signWriting: SignWritingObj[];

  signedLanguagePose: string | Pose; // TODO: use Pose object instead of URL
  signedLanguageVideo: string;
  signingQueue: SigningJob[];
  activeSigningJob: SigningJob | null;
  signingHistory: SigningJob[];
  interimSpokenLanguageText: string;
  processedSpeechEvents: string[];
  queuePaused: boolean;
  conversationId: string;
  nextSentenceSequence: number;
}

const newConversationId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const initialState: TranslateStateModel = {
  spokenToSigned: true,
  inputMode: 'text',

  spokenLanguage: null,
  signedLanguage: 'ase',
  detectedLanguage: null,

  spokenLanguageText: '',
  translatedSpokenLanguageText: null,
  signerInputLanguage: null,
  translationError: null,
  normalizedSpokenLanguageText: null,
  spokenLanguageSentences: [],

  signWriting: [],

  signedLanguagePose: null,
  signedLanguageVideo: null,
  signingQueue: [],
  activeSigningJob: null,
  signingHistory: [],
  interimSpokenLanguageText: '',
  processedSpeechEvents: [],
  queuePaused: false,
  conversationId: newConversationId(),
  nextSentenceSequence: 0,
};

@Injectable()
@State<TranslateStateModel>({
  name: 'translate',
  defaults: initialState,
})
export class TranslateState implements NgxsOnInit {
  private store = inject(Store);
  private service = inject(TranslationService);
  private swService = inject(SignWritingTranslationService);
  private poseService = inject(PoseService);
  private frameCache = inject(FrameCacheService);

  poseViewerSetting$!: Observable<PoseViewerSetting>;
  pose$!: Observable<EstimatedPose>;

  constructor() {
    this.poseViewerSetting$ = this.store.select<PoseViewerSetting>(state => state.settings.poseViewer);
    this.pose$ = this.store.select<EstimatedPose>(state => state.pose.pose);
  }

  ngxsOnInit(context: StateContext<TranslateStateModel>): any {
    this.initFromUrl(context);

    // Reset video whenever viewer setting changes
    this.poseViewerSetting$.pipe(tap(() => context.dispatch(new SetSignedLanguageVideo(null)))).subscribe();
  }

  initFromUrl({dispatch, patchState}: StateContext<TranslateStateModel>) {
    const urlParams = getUrlParams();
    const urlSignedLanguage = urlParams.get('sil');
    if (urlSignedLanguage) {
      patchState({signedLanguage: urlSignedLanguage});
    }
    const urlSpokenLanguage = urlParams.get('spl');
    if (urlSpokenLanguage) {
      patchState({spokenLanguage: urlSpokenLanguage === 'auto' ? null : urlSpokenLanguage});
    }
    const urlTextParam = urlParams.get('text');
    if (urlTextParam) {
      dispatch(new SetSpokenLanguageText(urlTextParam));
    }
  }

  @Action(FlipTranslationDirection)
  async flipTranslationMode({getState, patchState, dispatch}: StateContext<TranslateStateModel>): Promise<void> {
    const {spokenToSigned, spokenLanguage, signedLanguage, detectedLanguage, signedLanguageVideo} = getState();
    patchState({
      spokenToSigned: !spokenToSigned,
      // Collapse detected language if used
      spokenLanguage: spokenLanguage ?? detectedLanguage,
      signedLanguage: signedLanguage ?? detectedLanguage,
      detectedLanguage: null,
      signedLanguageVideo: null,
    });

    if (spokenToSigned) {
      dispatch(ClearSigningQueue);
      if (signedLanguageVideo) {
        dispatch([new SetInputMode('upload'), new SetVideo(signedLanguageVideo)]);
      } else {
        dispatch(new SetInputMode('webcam'));
      }
    } else {
      dispatch(new SetInputMode('text'));
    }
  }

  @Action(SetInputMode)
  async setInputMode(
    {patchState, getState, dispatch}: StateContext<TranslateStateModel>,
    {mode}: SetInputMode
  ): Promise<void> {
    const {inputMode} = getState();
    if (inputMode === mode) {
      return;
    }

    patchState({inputMode: mode});

    // Changing the input method must not replay the accumulated transcript.
    // The sentence queue owns spoken-to-signed translation now.
    dispatch(StopVideo);

    if (mode === 'webcam') {
      dispatch(StartCamera);
    }
  }

  @Action(SetSpokenLanguage)
  async setSpokenLanguage(
    {patchState, getState, dispatch}: StateContext<TranslateStateModel>,
    {language}: SetSpokenLanguage
  ): Promise<void> {
    const unfinalizedText = getState().spokenLanguageText;
    patchState({spokenLanguage: language, detectedLanguage: language || null});
    dispatch(ClearSigningQueue);
    patchState({spokenLanguageText: unfinalizedText, interimSpokenLanguageText: unfinalizedText});
    dispatch(SuggestAlternativeText);
  }

  @Action(SetSignedLanguage)
  async setSignedLanguage(
    {patchState, getState, dispatch}: StateContext<TranslateStateModel>,
    {language}: SetSignedLanguage
  ): Promise<void> {
    const unfinalizedText = getState().spokenLanguageText;
    patchState({signedLanguage: language});
    dispatch(ClearSigningQueue);
    patchState({spokenLanguageText: unfinalizedText, interimSpokenLanguageText: unfinalizedText});
  }

  @Action(SetSpokenLanguageText)
  async setSpokenLanguageText(
    {patchState, getState, dispatch}: StateContext<TranslateStateModel>,
    {text}: SetSpokenLanguageText
  ): Promise<void> {
    const state = getState();
    if (!state.spokenToSigned) {
      patchState({spokenLanguageText: text});
      return;
    }

    const language = state.spokenLanguage || state.detectedLanguage || 'en';
    const {completedSentences, remainder} = this.service.extractCompletedSentences(language, text);
    patchState({
      // A completed sentence leaves the live editor immediately. It remains available
      // in signingHistory without becoming input for the next translation.
      spokenLanguageText: remainder,
      interimSpokenLanguageText: remainder,
      spokenLanguageSentences: remainder ? this.service.splitSpokenSentences(language, remainder) : [],
      normalizedSpokenLanguageText: null,
      translationError: null,
    });
    completedSentences.forEach(sentence => dispatch(new QueueSourceSentence(sentence)));
  }

  @Action(ReceiveSpeechTranscript)
  receiveSpeechTranscript(
    {getState, patchState, dispatch}: StateContext<TranslateStateModel>,
    {update}: ReceiveSpeechTranscript
  ): void {
    const state = getState();
    if (!state.spokenToSigned || state.processedSpeechEvents.includes(update.sourceEventId)) return;

    const language = state.spokenLanguage || state.detectedLanguage || 'en';
    const {completedSentences, remainder} = this.service.extractCompletedSentences(language, update.finalText, true);
    const displayedText = [remainder, update.interimText].filter(Boolean).join(' ').trim();
    patchState({
      processedSpeechEvents: [...state.processedSpeechEvents, update.sourceEventId].slice(-200),
      spokenLanguageText: displayedText,
      interimSpokenLanguageText: update.interimText,
      spokenLanguageSentences: displayedText ? this.service.splitSpokenSentences(language, displayedText) : [],
      normalizedSpokenLanguageText: null,
      translationError: null,
    });
    completedSentences.forEach(sentence => dispatch(new QueueSourceSentence(sentence)));
  }

  @Action(QueueSourceSentence)
  queueSourceSentence(
    {getState, patchState, dispatch}: StateContext<TranslateStateModel>,
    {sentence}: QueueSourceSentence
  ) {
    const state = getState();
    const sourceText = this.service.normalizeTranscript(sentence.trim(), state.spokenLanguage);
    if (!state.spokenToSigned || !sourceText) return;
    if (state.signingQueue.length >= 25) {
      patchState({translationError: 'The signing queue is full. Let the current sentences finish or clear the queue.'});
      return;
    }
    const job: SigningJob = {
      id: `${state.conversationId}:${state.nextSentenceSequence}`,
      conversationId: state.conversationId,
      sourceText,
      sourceLanguage: state.spokenLanguage,
      signerInputLanguage: this.service.signerInputLanguage(state.signedLanguage),
      signedLanguage: state.signedLanguage,
      status: 'pending',
      createdAt: Date.now(),
    };
    patchState({
      signingQueue: [...state.signingQueue, job].slice(-25),
      nextSentenceSequence: state.nextSentenceSequence + 1,
      translationError: null,
    });
    dispatch(ProcessSigningQueue);
  }

  @Action(ProcessSigningQueue)
  processSigningQueue({getState, patchState, dispatch}: StateContext<TranslateStateModel>) {
    const state = getState();
    if (state.queuePaused) return EMPTY;

    // Playback is strictly FIFO: only the queue head may become active. Preparation is
    // independent, so the next sentence can be translated while the current one signs.
    const head = state.signingQueue[0];
    if (!state.activeSigningJob && head?.status === 'prepared') {
      dispatch(StartNextSigningJob);
      return EMPTY;
    }

    if (state.signingQueue.some(job => job.status === 'translating')) return EMPTY;

    const activeIndex = state.activeSigningJob
      ? state.signingQueue.findIndex(job => job.id === state.activeSigningJob!.id)
      : -1;
    const next = state.signingQueue[activeIndex + 1];
    if (!next || next.status !== 'pending') return EMPTY;

    patchState({
      signingQueue: state.signingQueue.map(job => (job.id === next.id ? {...job, status: 'translating'} : job)),
    });
    return this.service.translateWithGoogle(next.sourceText, next.sourceLanguage, next.signerInputLanguage).pipe(
      switchMap(result => {
        const remotePoseUrl = this.service.translateSpokenToSigned(
          result.text,
          next.signerInputLanguage,
          next.signedLanguage
        );
        return this.service.preparePose(remotePoseUrl).pipe(map(poseUrl => ({...result, poseUrl})));
      }),
      tap(({text, detectedSourceLanguage, poseUrl}) => {
        const current = getState();
        if (current.conversationId !== next.conversationId || !current.signingQueue.some(job => job.id === next.id)) {
          this.service.releasePreparedPose(poseUrl);
          return;
        }
        patchState({
          signingQueue: current.signingQueue.map(job =>
            job.id === next.id
              ? {...job, signerText: text, poseUrl, detectedSourceLanguage, status: 'ready' as const}
              : job
          ),
          detectedLanguage: detectedSourceLanguage,
          signerInputLanguage: next.signerInputLanguage,
        });
        dispatch(ProcessSigningQueue);
      }),
      catchError(error => {
        const current = getState();
        if (current.conversationId !== next.conversationId) return EMPTY;
        const failed: SigningJob = {
          ...next,
          status: 'failed',
          error: error?.message,
          completedAt: Date.now(),
        };
        patchState({
          signingQueue: current.signingQueue.filter(job => job.id !== next.id),
          signingHistory: [...current.signingHistory, failed],
          translationError: error?.message || 'Could not translate the source sentence.',
        });
        dispatch(ProcessSigningQueue);
        return EMPTY;
      })
    );
  }

  @Action(StartNextSigningJob)
  startNextSigningJob({getState, patchState, dispatch}: StateContext<TranslateStateModel>) {
    const state = getState();
    if (state.queuePaused || state.activeSigningJob) return EMPTY;
    const next = state.signingQueue[0];
    if (next?.status !== 'prepared' || !next.signerText || !next.poseUrl) return EMPTY;
    const active = {...next, status: 'signing' as const};
    patchState({
      activeSigningJob: active,
      signingQueue: state.signingQueue.map(job => (job.id === active.id ? active : job)),
      signedLanguageVideo: null,
      signWriting: [],
      translatedSpokenLanguageText: active.signerText,
      signerInputLanguage: active.signerInputLanguage,
      signedLanguagePose: active.poseUrl,
    });
    dispatch(ProcessSigningQueue);
    return this.swService
      .translateSpokenToSignWriting(
        active.signerText,
        [active.signerText],
        active.signerInputLanguage,
        active.signedLanguage
      )
      .pipe(
        tap(({text}) => dispatch(new SetSignWritingText(text.split(' '), active.id))),
        catchError(error => {
          patchState({translationError: error?.message || 'Could not prepare the signer output.'});
          return EMPTY;
        })
      );
  }

  @Action(SigningPosePrepared)
  signingPosePrepared(
    {getState, patchState, dispatch}: StateContext<TranslateStateModel>,
    {jobId}: SigningPosePrepared
  ): void {
    const state = getState();
    const job = state.signingQueue.find(candidate => candidate.id === jobId);
    if (!job || job.conversationId !== state.conversationId || job.status !== 'ready') return;

    patchState({
      signingQueue: state.signingQueue.map(candidate =>
        candidate.id === jobId ? {...candidate, status: 'prepared' as const} : candidate
      ),
    });
    dispatch(ProcessSigningQueue);
  }

  @Action(SigningPlaybackCompleted)
  signingPlaybackCompleted(
    {getState, patchState, dispatch}: StateContext<TranslateStateModel>,
    {jobId}: SigningPlaybackCompleted
  ) {
    const state = getState();
    if (!state.activeSigningJob || jobId !== state.activeSigningJob.id) return;
    this.service.releasePreparedPose(state.activeSigningJob.poseUrl);
    const completed = {
      ...state.activeSigningJob,
      poseUrl: undefined,
      status: 'completed' as const,
      completedAt: Date.now(),
    };
    patchState({
      activeSigningJob: null,
      signingQueue: state.signingQueue.filter(job => job.id !== state.activeSigningJob!.id),
      signingHistory: [...state.signingHistory, completed].slice(-100),
      signedLanguagePose: null,
      signedLanguageVideo: null,
      signWriting: [],
      translatedSpokenLanguageText: null,
    });
    dispatch(ProcessSigningQueue);
  }

  @Action(StopSigningQueue)
  stopSigningQueue({getState, patchState}: StateContext<TranslateStateModel>): void {
    const state = getState();
    const active = state.activeSigningJob;
    patchState({
      queuePaused: true,
      activeSigningJob: null,
      signingQueue: active
        ? state.signingQueue.map(job => (job.id === active.id ? {...job, status: 'prepared' as const} : job))
        : state.signingQueue,
      signedLanguagePose: null,
      signedLanguageVideo: null,
      signWriting: [],
      translatedSpokenLanguageText: null,
    });
  }

  @Action(ResumeSigningQueue)
  resumeSigningQueue({patchState, dispatch}: StateContext<TranslateStateModel>): void {
    patchState({queuePaused: false});
    dispatch(ProcessSigningQueue);
  }

  @Action(ClearSigningQueue)
  clearSigningQueue({getState, patchState}: StateContext<TranslateStateModel>) {
    getState().signingQueue.forEach(job => this.service.releasePreparedPose(job.poseUrl));
    patchState({
      signingQueue: [],
      activeSigningJob: null,
      signingHistory: [],
      processedSpeechEvents: [],
      interimSpokenLanguageText: '',
      spokenLanguageText: '',
      spokenLanguageSentences: [],
      translatedSpokenLanguageText: null,
      signerInputLanguage: null,
      translationError: null,
      queuePaused: false,
      conversationId: newConversationId(),
      nextSentenceSequence: 0,
      signedLanguagePose: null,
      signedLanguageVideo: null,
      signWriting: [],
    });
  }

  @Action(SuggestAlternativeText, {cancelUncompleted: true})
  suggestAlternativeText({patchState, getState}: StateContext<TranslateStateModel>) {
    const {spokenToSigned, spokenLanguageText, spokenLanguage, detectedLanguage} = getState();
    const trimmedText = spokenLanguageText.trim();
    if (!spokenToSigned || !trimmedText || spokenLanguage !== detectedLanguage) {
      return EMPTY;
    }

    if ('navigator' in globalThis && !navigator.onLine) {
      return EMPTY;
    }

    return this.service.normalizeSpokenLanguageText(spokenLanguage, trimmedText).pipe(
      filter(text => text !== trimmedText),
      tap(text => patchState({normalizedSpokenLanguageText: text}))
    );
  }

  @Action(DescribeSignWritingSign, {cancelUncompleted: true})
  describeSignWritingSign({patchState, getState}: StateContext<TranslateStateModel>, {fsw}: DescribeSignWritingSign) {
    if ('navigator' in globalThis && !navigator.onLine) {
      return EMPTY;
    }

    return this.service.describeSignWriting(fsw).pipe(
      catchError(e => of(e.message)),
      tap((description: string) => {
        const {signWriting} = getState();
        const newSignWriting = signWriting.map(s => {
          const obj: SignWritingObj = {...s};
          if (obj.fsw === fsw) {
            obj.description = description;
          }
          return obj;
        });
        patchState({signWriting: newSignWriting});
      })
    );
  }

  @Action(SetSignedLanguageVideo)
  async setSignedLanguageVideo(
    {patchState}: StateContext<TranslateStateModel>,
    {url}: SetSignedLanguageVideo
  ): Promise<void> {
    patchState({signedLanguageVideo: url});
  }

  @Action(SetSignWritingText)
  async setSignWritingText(
    {getState, patchState}: StateContext<TranslateStateModel>,
    {text, jobId}: SetSignWritingText
  ): Promise<void> {
    // signNormalize only works after the SignWriting font is loaded
    await SignWritingService.loadFonts();
    await SignWritingService.cssLoaded();

    const signWritingTexts: string[] = await Promise.all(
      text.map(sign => {
        const box = sign.startsWith('M') ? sign : 'M500x500' + sign;
        return SignWritingService.normalizeFSW(box);
      })
    );
    if (jobId && getState().activeSigningJob?.id !== jobId) return;
    const signWriting = signWritingTexts.map(fsw => ({fsw}));
    patchState({signWriting});
  }

  @Action(ChangeTranslation, {cancelUncompleted: true})
  changeTranslation(): Observable<never> {
    // Legacy callers must not replace the signer pose with the growing transcript.
    // Finalized sentence jobs exclusively drive spoken-to-signed translation now.
    return EMPTY;
  }

  @Action(UploadPoseFile)
  uploadPoseFile({getState, patchState}: StateContext<TranslateStateModel>, {url}: UploadPoseFile): void {
    const {spokenToSigned} = getState();
    if (spokenToSigned) {
      patchState({signedLanguagePose: url, signedLanguageVideo: initialState.signedLanguageVideo});
    }
  }

  @Action(CopySignedLanguageVideo)
  async copySignedLanguageVideo({getState}: StateContext<TranslateStateModel>): Promise<void> {
    const {signedLanguageVideo} = getState();

    const data = await fetch(signedLanguageVideo);
    const blob = await data.blob();
    try {
      const item = new ClipboardItem({[blob.type]: Promise.resolve(blob)});
      await navigator.clipboard.write([item]);
    } catch (e) {
      console.error(e);
      alert(`Copying "${blob.type}" on this device is not supported`);
    }
  }

  @Action(CopySpokenLanguageText)
  async copySpokenLanguageText({getState}: StateContext<TranslateStateModel>): Promise<void> {
    const {spokenLanguageText} = getState();

    try {
      await navigator.clipboard.writeText(spokenLanguageText);
    } catch (e) {
      console.error(e);
      alert(e.message);
    }
  }

  static buildShareUrl(state: TranslateStateModel): string {
    const latestCompletedText = state.signingHistory[state.signingHistory.length - 1]?.sourceText;
    const params = new URLSearchParams({
      text: state.activeSigningJob?.sourceText || latestCompletedText || state.spokenLanguageText,
      spl: state.spokenLanguage || 'auto',
      sil: state.signedLanguage,
    });
    return new URL(`watch?${params.toString()}`, document.baseURI).toString();
  }

  @Action(ShareSignedLanguageVideo)
  async shareSignedLanguageVideo({getState}: StateContext<TranslateStateModel>): Promise<void> {
    const state = getState();
    const watchUrl = TranslateState.buildShareUrl(state);
    const shareText = `Translated with Eburon Translate\n${watchUrl}`;

    const blob = this.frameCache.blob;
    if (!blob) return;
    const ext = blob.type.split('/').pop();
    const file = new File([blob], 'rylo-translate.' + ext, {type: blob.type});

    const files: File[] = [file];

    if ('canShare' in navigator && (navigator as any).canShare({files})) {
      await navigator.share({files, text: shareText} as ShareData);
    } else if ('share' in navigator) {
      await navigator.share({text: shareText, title: 'Eburon Translate', url: watchUrl});
    }
  }

  @Action(DownloadSignedLanguageVideo)
  async downloadSignedLanguageVideo({getState}: StateContext<TranslateStateModel>): Promise<void> {
    const {spokenLanguageText} = getState();

    const blob = this.frameCache.blob;
    if (!blob) return;
    const url = URL.createObjectURL(blob);

    const ext = '.' + blob.type.split('/').pop();
    const filename =
      encodeURIComponent(spokenLanguageText)
        .replaceAll('%20', '-')
        .slice(0, 250 - ext.length) + ext;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    try {
      a.click();
    } catch (e) {
      alert(`Downloading "${filename}" on this device is not supported`);
    }
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Listen to pose estimation results from the pose store
  @Action(StoreFramePose)
  storePose({getState, patchState}: StateContext<TranslateStateModel>, {pose}: StoreFramePose): void {
    const {signedLanguagePose} = getState();
    const components = ['poseLandmarks', 'faceLandmarks', 'leftHandLandmarks', 'rightHandLandmarks'];
    const normalizedPoseFrame = this.poseService.normalizeHolistic(pose, components);

    // patchState({signedLanguagePose: normalizedPose});
  }
}
