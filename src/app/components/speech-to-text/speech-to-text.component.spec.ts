import {ComponentFixture, TestBed} from '@angular/core/testing';
import {SimpleChange} from '@angular/core';
import {axe, toHaveNoViolations} from 'jasmine-axe';

import {SpeechToTextComponent} from './speech-to-text.component';
import {AppTranslocoTestingModule} from '../../core/modules/transloco/transloco-testing.module';
import {provideIonicAngular} from '@ionic/angular/standalone';
import {SpeechTranscriptUpdate} from '../../modules/translate/translate.actions';

interface ResultPart {
  transcript: string;
  isFinal: boolean;
}

function makeResults(parts: ResultPart[]) {
  return parts.map(part => {
    const result = [{transcript: part.transcript}] as unknown as SpeechRecognitionResult;
    (result as {isFinal: boolean}).isFinal = part.isFinal;
    return result;
  });
}

class MockSpeechRecognition extends EventTarget {
  continuous = false;
  interimResults = false;
  lang = '';
  running = false;
  startCalls = 0;
  phrases: unknown[] = [];

  start(): void {
    this.startCalls++;
    this.running = true;
    this.dispatchEvent(new Event('start'));
  }

  stop(): void {
    if (this.running) {
      this.running = false;
      this.dispatchEvent(new Event('end'));
    }
  }

  emitResult(parts: ResultPart[]): void {
    const event = new Event('result') as Event & {results: SpeechRecognitionResult[]};
    event.results = makeResults(parts);
    this.dispatchEvent(event);
  }

  emitError(error: string): void {
    const event = new Event('error') as Event & {error: string};
    event.error = error;
    this.dispatchEvent(event);
  }

  endByBrowser(): void {
    this.running = false;
    this.dispatchEvent(new Event('end'));
  }
}

describe('SpeechToTextComponent', () => {
  let component: SpeechToTextComponent;
  let fixture: ComponentFixture<SpeechToTextComponent>;

  afterEach(() => {
    delete (globalThis as typeof globalThis & {SpeechRecognitionPhrase?: unknown}).SpeechRecognitionPhrase;
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppTranslocoTestingModule, SpeechToTextComponent],
      providers: [provideIonicAngular()],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(SpeechToTextComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  // TODO: Fix accessibility test once https://github.com/ionic-team/ionic-framework/issues/30047 is resolved
  // it('should pass accessibility test', async () => {
  //   jasmine.addMatchers(toHaveNoViolations);
  //   const a11y = await axe(fixture.nativeElement);
  //   expect(a11y).toHaveNoViolations();
  // });

  describe('speech recognition', () => {
    let mock: MockSpeechRecognition;
    let emitted: string[];
    let transcriptUpdates: SpeechTranscriptUpdate[];

    beforeEach(() => {
      (component as unknown as {SpeechRecognition: unknown}).SpeechRecognition = MockSpeechRecognition;
      component.ngOnInit();
      mock = component.speechRecognition as unknown as MockSpeechRecognition;

      emitted = [];
      transcriptUpdates = [];
      component.changeText.subscribe(text => emitted.push(text));
      component.transcriptUpdate.subscribe(update => transcriptUpdates.push(update));
    });

    const lastEmitted = () => emitted[emitted.length - 1];

    it('configures recognition for continuous dictation', () => {
      expect(mock.continuous).toBeTrue();
      expect(mock.interimResults).toBeTrue();
      expect(mock.lang).toBe(component.lang);
    });

    it('adds the Filipino JW vocabulary when contextual speech biasing is supported', () => {
      class MockSpeechRecognitionPhrase {
        constructor(
          readonly phrase: string,
          readonly boost: number
        ) {}
      }
      (
        globalThis as typeof globalThis & {
          SpeechRecognitionPhrase?: typeof MockSpeechRecognitionPhrase;
        }
      ).SpeechRecognitionPhrase = MockSpeechRecognitionPhrase;

      component.lang = 'fil-PH';
      component.ngOnChanges({lang: new SimpleChange('en', 'fil-PH', false)});

      const phrases = mock.phrases as MockSpeechRecognitionPhrase[];
      expect(phrases.some(item => item.phrase === 'Mga Saksi ni Jehova' && item.boost === 5)).toBeTrue();
      expect(phrases.some(item => item.phrase === 'Bagong Sanlibutang Salin')).toBeTrue();
    });

    it('normalizes Filipino terminology and numbers in finalized speech', () => {
      component.lang = 'fil-PH';
      component.ngOnChanges({lang: new SimpleChange('en', 'fil-PH', false)});
      component.start();
      mock.emitResult([{transcript: "jehovah at dalawampu't tatlo", isFinal: true}]);

      expect(transcriptUpdates[0].finalText).toBe('Jehova at 23');
    });

    it('start clears the text and begins recording', () => {
      expect(component.isRecording).toBeFalse();

      component.start();

      expect(mock.startCalls).toBe(1);
      expect(lastEmitted()).toBe('');
      expect(component.isRecording).toBeTrue();
    });

    it('emits interim results as the user speaks', () => {
      component.start();
      mock.emitResult([{transcript: 'hel', isFinal: false}]);

      expect(lastEmitted()).toBe('hel');
    });

    it('separates a finalized result from the remaining interim text', () => {
      component.start();
      mock.emitResult([
        {transcript: 'hello ', isFinal: true},
        {transcript: 'wor', isFinal: false},
      ]);

      expect(lastEmitted()).toBe('wor');
      expect(transcriptUpdates.length).toBe(1);
      expect(transcriptUpdates[0].finalText).toBe('hello');
    });

    it('does not stop recording when speech pauses (speechend)', () => {
      component.start();
      expect(component.isRecording).toBeTrue();

      mock.dispatchEvent(new Event('speechend'));

      expect(component.isRecording).toBeTrue();
      expect(mock.running).toBeTrue();
    });

    it('auto-restarts when the browser ends the session while still recording', () => {
      component.start();

      mock.endByBrowser();

      expect(mock.startCalls).toBe(2);
      expect(component.isRecording).toBeTrue();
    });

    it('emits each finalized result as a separate job across automatic restarts', () => {
      component.start();
      mock.emitResult([{transcript: 'hello', isFinal: true}]);

      mock.endByBrowser();
      mock.emitResult([{transcript: ' world', isFinal: true}]);

      expect(transcriptUpdates.map(update => update.finalText)).toEqual(['hello', 'world']);
      expect(lastEmitted()).toBe('');
    });

    it('finalizes interim text that the browser ends on a pause', () => {
      component.start();
      mock.emitResult([{transcript: 'hello', isFinal: false}]);

      mock.endByBrowser();
      mock.emitResult([{transcript: ' world', isFinal: true}]);

      expect(transcriptUpdates.map(update => update.finalText)).toEqual(['hello', 'world']);
    });

    it('does not emit the same final result index twice', () => {
      component.start();
      mock.emitResult([{transcript: 'hello', isFinal: true}]);
      mock.emitResult([{transcript: 'hello', isFinal: true}]);

      expect(transcriptUpdates.map(update => update.finalText)).toEqual(['hello']);
    });

    it('stop ends recording and does not auto-restart', () => {
      component.start();

      component.stop();

      expect(component.isRecording).toBeFalse();
      expect(mock.startCalls).toBe(1);
    });

    it('starting again resets the accumulated transcript', () => {
      component.start();
      mock.emitResult([{transcript: 'first', isFinal: true}]);
      mock.endByBrowser();

      component.start();
      mock.emitResult([{transcript: 'second', isFinal: false}]);

      expect(lastEmitted()).toBe('second');
    });

    it('keeps listening after a transient no-speech error', () => {
      component.start();

      mock.emitError('no-speech');
      mock.endByBrowser();

      expect(component.supportError).toBeNull();
      expect(mock.startCalls).toBe(2);
      expect(component.isRecording).toBeTrue();
    });

    it('surfaces a fatal permission error and stops retrying', () => {
      spyOn(navigator.mediaDevices, 'getUserMedia').and.returnValue(
        Promise.resolve({getTracks: () => []} as unknown as MediaStream)
      );
      component.start();

      mock.emitError('not-allowed');
      expect(component.supportError).toBe('not-allowed');

      mock.endByBrowser();
      expect(mock.startCalls).toBe(1);
    });

    it('ignores errors thrown when starting an already-active session', () => {
      spyOn(mock, 'start').and.throwError('InvalidStateError');

      expect(() => component.start()).not.toThrow();
    });

    it('stops handling events after the component is destroyed', () => {
      component.start();
      const count = emitted.length;

      component.ngOnDestroy();
      mock.emitResult([{transcript: 'ignored', isFinal: true}]);

      expect(emitted.length).toBe(count);
    });

    it('stops recognition when the component is destroyed while recording', () => {
      component.start();
      expect(mock.running).toBeTrue();

      component.ngOnDestroy();

      expect(mock.running).toBeFalse();
    });
  });
});
