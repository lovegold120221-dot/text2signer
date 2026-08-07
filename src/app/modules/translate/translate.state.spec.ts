import {provideHttpClient} from '@angular/common/http';
import {provideHttpClientTesting} from '@angular/common/http/testing';
import {TestBed} from '@angular/core/testing';
import {provideStore, Store} from '@ngxs/store';
import {EMPTY, of, Subject} from 'rxjs';
import {ngxsConfig} from '../../app.config';
import {SettingsState} from '../settings/settings.state';
import {SignWritingTranslationService} from './signwriting-translation.service';
import {
  ClearSigningQueue,
  ProcessSigningQueue,
  ReceiveSpeechTranscript,
  ResumeSigningQueue,
  SetSpokenLanguageText,
  SigningPosePrepared,
  SigningPlaybackCompleted,
  StopSigningQueue,
} from './translate.actions';
import {GoogleTranslationResult, TranslationService} from './translate.service';
import {TranslateState, TranslateStateModel} from './translate.state';

describe('TranslateState sentence queue', () => {
  let store: Store;
  let translationService: TranslationService;
  let translationResponses: Subject<GoogleTranslationResult>[];

  const state = () => store.selectSnapshot<TranslateStateModel>(snapshot => snapshot.translate);

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideStore([SettingsState, TranslateState], ngxsConfig),
      ],
    });
    store = TestBed.inject(Store);
    translationService = TestBed.inject(TranslationService);
    translationResponses = [];

    spyOn(translationService, 'translateWithGoogle').and.callFake(() => {
      const response = new Subject<GoogleTranslationResult>();
      translationResponses.push(response);
      return response;
    });
    spyOn(translationService, 'translateSpokenToSigned').and.callFake(
      (text, spoken, signed) => `pose://${signed}/${spoken}/${encodeURIComponent(text)}`
    );
    spyOn(translationService, 'preparePose').and.callFake(poseUrl => of(`prepared:${poseUrl}`));
    spyOn(translationService, 'releasePreparedPose');
    spyOn(TestBed.inject(SignWritingTranslationService), 'translateSpokenToSignWriting').and.returnValue(EMPTY);
  });

  it('auto-clears source text and prepares the next sentence while the current sentence signs', () => {
    store.dispatch(new SetSpokenLanguageText('Kumusta ka? Magandang umaga. Hindi pa tapos'));

    expect(state().spokenLanguageText).toBe('Hindi pa tapos');
    expect(state().signingQueue.map(job => job.sourceText)).toEqual(['Kumusta ka?', 'Magandang umaga.']);
    expect(translationService.translateWithGoogle).toHaveBeenCalledTimes(1);
    expect(translationService.translateWithGoogle).toHaveBeenCalledWith('Kumusta ka?', null, 'en');

    translationResponses[0].next({text: 'How are you?', detectedSourceLanguage: 'tl', targetLanguage: 'en'});

    const firstJob = state().signingQueue[0];
    expect(firstJob.status).toBe('ready');
    expect(state().activeSigningJob).toBeNull();
    expect(firstJob.sourceText).toBe('Kumusta ka?');
    expect(firstJob.poseUrl).toContain(encodeURIComponent('How are you?'));

    store.dispatch(new SigningPosePrepared(firstJob.id));

    expect(state().activeSigningJob.id).toBe(firstJob.id);
    expect(state().signedLanguagePose).toBe(firstJob.poseUrl);
    expect(translationService.translateWithGoogle).toHaveBeenCalledTimes(2);
    expect(translationService.translateWithGoogle).toHaveBeenCalledWith('Magandang umaga.', null, 'en');

    translationResponses[1].next({text: 'Good morning.', detectedSourceLanguage: 'tl', targetLanguage: 'en'});
    const secondJob = state().signingQueue[1];
    store.dispatch(new SigningPosePrepared(secondJob.id));
    expect(state().signingQueue[1].status).toBe('prepared');

    store.dispatch(new SigningPlaybackCompleted(firstJob.id));

    expect(state().signingHistory.map(job => job.sourceText)).toEqual(['Kumusta ka?']);
    expect(state().activeSigningJob.id).toBe(secondJob.id);
    expect(translationService.translateWithGoogle).toHaveBeenCalledTimes(2);
  });

  it('never promotes a prepared later job ahead of an unprepared queue head', () => {
    const current = state();
    const first: TranslateStateModel['signingQueue'][number] = {
      id: `${current.conversationId}:0`,
      conversationId: current.conversationId,
      sourceText: 'First.',
      sourceLanguage: 'en',
      signerText: 'First.',
      signerInputLanguage: 'en',
      signedLanguage: 'ase',
      poseUrl: 'pose://first',
      status: 'ready',
      createdAt: 1,
    };
    const second = {...first, id: `${current.conversationId}:1`, sourceText: 'Second.', status: 'prepared' as const};
    store.reset({
      ...store.snapshot(),
      translate: {...current, signingQueue: [first, second], nextSentenceSequence: 2},
    });

    store.dispatch(ProcessSigningQueue);
    expect(state().activeSigningJob).toBeNull();

    store.dispatch(new SigningPosePrepared(first.id));
    expect(state().activeSigningJob.id).toBe(first.id);
  });

  it('keeps exactly one prepared look-ahead job and replenishes it after promotion', () => {
    store.dispatch(new SetSpokenLanguageText('First. Second. Third.'));
    translationResponses[0].next({text: 'First.', detectedSourceLanguage: 'en', targetLanguage: 'en'});
    store.dispatch(new SigningPosePrepared(state().signingQueue[0].id));

    expect(state().activeSigningJob.sourceText).toBe('First.');
    expect(translationResponses.length).toBe(2);

    translationResponses[1].next({text: 'Second.', detectedSourceLanguage: 'en', targetLanguage: 'en'});
    store.dispatch(new SigningPosePrepared(state().signingQueue[1].id));

    expect(state().signingQueue.map(job => job.status)).toEqual(['signing', 'prepared', 'pending']);
    expect(translationResponses.length).toBe(2);

    store.dispatch(new SigningPlaybackCompleted(state().activeSigningJob.id));

    expect(state().activeSigningJob.sourceText).toBe('Second.');
    expect(translationResponses.length).toBe(3);
    expect(translationService.translateWithGoogle).toHaveBeenCalledWith('Third.', null, 'en');
  });

  it('deduplicates browser events without suppressing intentionally repeated sentences', () => {
    const update = {sourceEventId: 'speech-1', finalText: 'Oo', interimText: ''};
    store.dispatch(new ReceiveSpeechTranscript(update));
    store.dispatch(new ReceiveSpeechTranscript(update));
    store.dispatch(new ReceiveSpeechTranscript({...update, sourceEventId: 'speech-2'}));

    expect(state().signingQueue.map(job => job.sourceText)).toEqual(['Oo', 'Oo']);
  });

  it('normalizes Filipino terms and spoken numbers before translating the queued sentence', () => {
    store.dispatch(
      new ReceiveSpeechTranscript({
        sourceEventId: 'speech-filipino-number',
        finalText: "jehovah at isang daan at dalawampu't tatlo",
        interimText: '',
      })
    );

    expect(state().signingQueue[0].sourceText).toBe('Jehova at 123');
    expect(translationService.translateWithGoogle).toHaveBeenCalledWith('Jehova at 123', null, 'en');
  });

  it('stops, resumes, and clears playback without re-translating the active sentence', () => {
    store.dispatch(new SetSpokenLanguageText('Salamat.'));
    translationResponses[0].next({text: 'Thank you.', detectedSourceLanguage: 'tl', targetLanguage: 'en'});
    store.dispatch(new SigningPosePrepared(state().signingQueue[0].id));
    expect(state().activeSigningJob).not.toBeNull();

    store.dispatch(StopSigningQueue);
    expect(state().queuePaused).toBeTrue();
    expect(state().activeSigningJob).toBeNull();
    expect(state().signingQueue[0].status).toBe('prepared');

    store.dispatch(ResumeSigningQueue);
    expect(state().queuePaused).toBeFalse();
    expect(state().activeSigningJob.sourceText).toBe('Salamat.');
    expect(translationService.translateWithGoogle).toHaveBeenCalledTimes(1);

    store.dispatch(ClearSigningQueue);
    expect(state().signingQueue).toEqual([]);
    expect(state().signingHistory).toEqual([]);
    expect(state().activeSigningJob).toBeNull();
    expect(state().spokenLanguageText).toBe('');
  });
});
