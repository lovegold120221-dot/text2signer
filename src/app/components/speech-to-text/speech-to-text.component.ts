import {Component, Input, OnChanges, OnInit, output, SimpleChanges} from '@angular/core';
import {fromEvent} from 'rxjs';
import {takeUntil} from 'rxjs/operators';
import {BaseComponent} from '../base/base.component';
import {MatTooltipModule, TooltipPosition} from '@angular/material/tooltip';
import {IonButton, IonIcon} from '@ionic/angular/standalone';
import {TranslocoDirective} from '@jsverse/transloco';
import {addIcons} from 'ionicons';
import {micOffOutline, micOutline, stopCircleOutline} from 'ionicons/icons';
import {SpeechTranscriptUpdate} from '../../modules/translate/translate.actions';
import {FILIPINO_JW_SPEECH_VOCABULARY} from '../../core/helpers/speech/filipino-jw-vocabulary';
import {isFilipinoLanguage, normalizeTranscriptForSigning} from '../../core/helpers/speech/transcript-normalization';

const FATAL_ERRORS = ['not-allowed', 'language-not-supported', 'service-not-allowed'];
const SPEECH_PHRASE_BOOST = 5;

interface ContextualSpeechRecognition extends SpeechRecognition {
  phrases?: unknown[];
}

type SpeechRecognitionPhraseConstructor = new (phrase: string, boost: number) => unknown;

@Component({
  selector: 'app-speech-to-text',
  templateUrl: './speech-to-text.component.html',
  styleUrls: ['./speech-to-text.component.css'],
  imports: [IonButton, IonIcon, MatTooltipModule, TranslocoDirective],
})
export class SpeechToTextComponent extends BaseComponent implements OnInit, OnChanges {
  @Input() lang = 'en';
  readonly changeText = output<string>();
  /** Final and interim speech are separate so a finalized sentence is submitted exactly once. */
  readonly transcriptUpdate = output<SpeechTranscriptUpdate>();
  @Input() matTooltipPosition: TooltipPosition = 'above';

  SpeechRecognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
  speechRecognition!: SpeechRecognition;

  supportError = null;
  isRecording = false;

  // The browser ends recognition on its own after a few seconds of silence. While the user
  // wants to keep recording, we restart it on `end` so dictation survives natural pauses.
  private userRequestedRecording = false;
  private sessionTranscript = '';
  private readonly recognitionSourceId = Math.random().toString(36).slice(2);
  private recognitionSessionId = 0;
  private finalizedResultIndexes = new Set<number>();

  constructor() {
    super();

    addIcons({stopCircleOutline, micOutline, micOffOutline});
  }

  ngOnInit(): void {
    if (!this.SpeechRecognition) {
      this.supportError = 'browser-not-supported';
      return;
    }

    this.speechRecognition = new this.SpeechRecognition();
    this.speechRecognition.continuous = true;
    this.speechRecognition.interimResults = true;
    this.speechRecognition.lang = this.lang;
    this.applyContextualPhrases();

    fromEvent(this.speechRecognition, 'result')
      .pipe(takeUntil(this.ngUnsubscribe))
      .subscribe((event: SpeechRecognitionEvent) => {
        let interimText = '';
        for (let i = 0; i < event.results.length; i++) {
          const result = event.results[i];
          const transcript = normalizeTranscriptForSigning(result[0].transcript.trim(), this.lang);
          if (result.isFinal) {
            if (transcript && !this.finalizedResultIndexes.has(i)) {
              this.finalizedResultIndexes.add(i);
              this.transcriptUpdate.emit({
                sourceEventId: `${this.recognitionSourceId}:${this.recognitionSessionId}:result:${i}`,
                finalText: transcript,
                interimText: '',
              });
            }
          } else {
            interimText = [interimText, transcript].filter(Boolean).join(' ');
          }
        }

        this.sessionTranscript = interimText;
        this.changeText.emit(interimText);
      });

    fromEvent(this.speechRecognition, 'error')
      .pipe(takeUntil(this.ngUnsubscribe))
      .subscribe((event: SpeechRecognitionErrorEvent) => {
        if (FATAL_ERRORS.includes(event.error)) {
          this.supportError = event.error;
          this.userRequestedRecording = false;
        } else {
          this.supportError = null;
        }

        // Try accessing microphone, to request permission
        if (event.error === 'not-allowed') {
          this.requestPermission();
        }
      });

    fromEvent(this.speechRecognition, 'start')
      .pipe(takeUntil(this.ngUnsubscribe))
      .subscribe(() => {
        this.isRecording = true;
      });

    fromEvent(this.speechRecognition, 'end')
      .pipe(takeUntil(this.ngUnsubscribe))
      .subscribe(() => {
        const finalized = this.sessionTranscript.trim();
        if (finalized) {
          this.transcriptUpdate.emit({
            sourceEventId: `${this.recognitionSourceId}:${this.recognitionSessionId}:end`,
            finalText: finalized,
            interimText: '',
          });
        }
        this.sessionTranscript = '';
        this.changeText.emit('');

        if (this.userRequestedRecording) {
          this.beginRecognitionSession();
          this.safeStart();
        } else {
          this.isRecording = false;
        }
      });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.lang && this.speechRecognition) {
      this.speechRecognition.lang = this.lang;
      this.applyContextualPhrases();
    }
  }

  override ngOnDestroy(): void {
    this.userRequestedRecording = false;
    super.ngOnDestroy();
    this.speechRecognition?.stop(); // Release the microphone after listeners are detached
  }

  requestPermission() {
    navigator.mediaDevices.getUserMedia({video: false, audio: true}).then(stream => {
      stream.getTracks().forEach(track => track.stop());
      this.supportError = null;
    });
  }

  start() {
    this.userRequestedRecording = true;
    this.sessionTranscript = '';
    this.changeText.emit('');
    this.beginRecognitionSession();
    this.safeStart();
  }

  stop() {
    this.userRequestedRecording = false;
    // TODO: ongoing safari bug: the microphone can stay active after stop
    // https://stackoverflow.com/questions/75498609/safari-webkitspeechrecognition-continuous-bug
    this.speechRecognition.stop();
  }

  private safeStart() {
    try {
      this.speechRecognition.start();
    } catch {
      // start() throws InvalidStateError when recognition is already running; the existing
      // session keeps the microphone open, so there is nothing to recover from.
    }
  }

  private beginRecognitionSession(): void {
    this.recognitionSessionId += 1;
    this.finalizedResultIndexes.clear();
  }

  private applyContextualPhrases(): void {
    const recognition = this.speechRecognition as ContextualSpeechRecognition;
    if (!('phrases' in recognition)) return;

    const Phrase = (globalThis as typeof globalThis & {SpeechRecognitionPhrase?: SpeechRecognitionPhraseConstructor})
      .SpeechRecognitionPhrase;
    recognition.phrases =
      Phrase && isFilipinoLanguage(this.lang)
        ? FILIPINO_JW_SPEECH_VOCABULARY.map(phrase => new Phrase(phrase, SPEECH_PHRASE_BOOST))
        : [];
  }
}
