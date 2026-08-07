import {inject, Injectable} from '@angular/core';
import {Observable, of} from 'rxjs';
import {map} from 'rxjs/operators';
import {HttpClient, HttpParams} from '@angular/common/http';
import {environment} from '../../../environments/environment';
import {IANASignedLanguages} from '../../core/helpers/iana/languages';
import {normalizeTranscriptForSigning} from '../../core/helpers/speech/transcript-normalization';

export interface GoogleTranslationResult {
  text: string;
  detectedSourceLanguage: string;
  targetLanguage: string;
}

export interface CompletedSentenceExtraction {
  completedSentences: string[];
  remainder: string;
}

@Injectable({
  providedIn: 'root',
})
export class TranslationService {
  private http = inject(HttpClient);

  signedLanguages = [
    'ase',
    'gsg',
    'fsl',
    'bfi',
    'ils',
    'sgg',
    'ssr',
    'slf',
    'isr',
    'ssp',
    'jos',
    'rsl-by',
    'bqn',
    'csl',
    'csq',
    'cse',
    'dsl',
    'ins',
    'nzs',
    'eso',
    'fse',
    'asq',
    'gss-cy',
    'gss',
    'icl',
    'ise',
    'jsl',
    'lsl',
    'lls',
    'psc',
    'pso',
    'bzs',
    'psr',
    'rms',
    'rsl',
    'svk',
    'aed',
    'csg',
    'csf',
    'mfs',
    'swl',
    'tsm',
    'ukl',
    'pks',
  ];

  spokenLanguages = [
    'en',
    'de',
    'fr',
    'af',
    'sq',
    'am',
    'ar',
    'hy',
    'az',
    'eu',
    'be',
    'bn',
    'bs',
    'bg',
    'ca',
    'ceb',
    'ny',
    'zh',
    'co',
    'hr',
    'cs',
    'da',
    'nl',
    'eo',
    'et',
    'tl',
    'fi',
    'fy',
    'gl',
    'ka',
    'es',
    'el',
    'gu',
    'ht',
    'ha',
    'haw',
    'he',
    'hi',
    'hmn',
    'hu',
    'is',
    'ig',
    'id',
    'ga',
    'it',
    'ja',
    'jv',
    'kn',
    'kk',
    'km',
    'rw',
    'ko',
    'ku',
    'ky',
    'lo',
    'la',
    'lv',
    'lt',
    'lb',
    'mk',
    'mg',
    'ms',
    'ml',
    'mt',
    'mi',
    'mr',
    'mn',
    'my',
    'ne',
    'no',
    'or',
    'ps',
    'fa',
    'pl',
    'pt',
    'pa',
    'ro',
    'ru',
    'sm',
    'gd',
    'sr',
    'st',
    'sn',
    'sd',
    'si',
    'sk',
    'sl',
    'so',
    'su',
    'sw',
    'sv',
    'tg',
    'ta',
    'tt',
    'te',
    'th',
    'tr',
    'tk',
    'uk',
    'ur',
    'ug',
    'uz',
    'vi',
    'cy',
    'xh',
    'yi',
    'yo',
    'zu',
    'ilo',
    'hil',
    'pam',
    'pag',
    'war',
  ];

  private lastSpokenLanguageSegmenter: {language: string; segmenter: Intl.Segmenter};

  splitSpokenSentences(language: string, text: string): string[] {
    // If the browser does not support the Segmenter API (FireFox<127), return the whole text as a single segment
    if (!('Segmenter' in Intl)) {
      return [text];
    }

    // Construct a segmenter for the given language, can take 1ms~
    if (this.lastSpokenLanguageSegmenter?.language !== language) {
      this.lastSpokenLanguageSegmenter = {
        language,
        segmenter: new Intl.Segmenter(language, {granularity: 'sentence'}),
      };
    }
    const segments = this.lastSpokenLanguageSegmenter.segmenter.segment(text);
    return Array.from(segments).map(segment => segment.segment);
  }

  extractCompletedSentences(
    language: string,
    text: string,
    forceFinalizeRemainder = false
  ): CompletedSentenceExtraction {
    const completedSentences: string[] = [];
    let remainder = '';
    const sentenceEnding = /[.!?…]["')\]]*\s*$/;

    if ('Segmenter' in Intl) {
      for (const segment of this.splitSpokenSentences(language, text)) {
        if (sentenceEnding.test(segment)) {
          completedSentences.push(segment.trim());
        } else {
          remainder += segment;
        }
      }
    } else {
      const completeSentence = /[^.!?…]*[.!?…]+["')\]]*\s*/g;
      let consumed = 0;
      for (const match of text.matchAll(completeSentence)) {
        const sentence = match[0].trim();
        if (sentence) completedSentences.push(sentence);
        consumed = (match.index ?? consumed) + match[0].length;
      }
      remainder = text.slice(consumed);
    }

    if (forceFinalizeRemainder && remainder.trim()) {
      completedSentences.push(remainder.trim());
      remainder = '';
    }

    return {completedSentences, remainder: remainder.trimStart()};
  }

  normalizeSpokenLanguageText(language: string, text: string): Observable<string> {
    const params = new URLSearchParams();
    params.set('lang', language);
    params.set('text', text);
    const url = `https://text-normalization.${environment.apiDomain}/?` + params.toString();

    return this.http.get<{text: string}>(url).pipe(map(response => response.text));
  }

  /** Normalize domain terminology and spoken numbers before creating a signing job. */
  normalizeTranscript(text: string, sourceLanguage: string | null): string {
    return normalizeTranscriptForSigning(text, sourceLanguage);
  }

  /**
   * Resolve the spoken bridge language understood by the selected signer.
   * The signed-language list itself remains authoritative and unchanged.
   */
  signerInputLanguage(signedLanguage: string): string {
    return IANASignedLanguages.find(language => language.signed === signedLanguage)?.spoken || 'en';
  }

  /**
   * Translate source text through the same public endpoint used by the free Google Translate web client.
   * `sourceLanguage` is null for automatic detection.
   */
  translateWithGoogle(
    text: string,
    sourceLanguage: string | null,
    targetLanguage: string
  ): Observable<GoogleTranslationResult> {
    if (sourceLanguage === targetLanguage) {
      return of({text, detectedSourceLanguage: sourceLanguage, targetLanguage});
    }

    const params = new HttpParams()
      .set('client', 'gtx')
      .set('sl', sourceLanguage || 'auto')
      .set('tl', targetLanguage)
      .set('dt', 't')
      .set('q', text);

    return this.http
      .get<unknown>('https://translate.googleapis.com/translate_a/single', {params})
      .pipe(map(response => this.parseGoogleTranslation(response, sourceLanguage, targetLanguage)));
  }

  private parseGoogleTranslation(
    response: unknown,
    sourceLanguage: string | null,
    targetLanguage: string
  ): GoogleTranslationResult {
    if (!Array.isArray(response) || !Array.isArray(response[0])) {
      throw new Error('Google Translate returned an invalid response.');
    }

    const text = response[0]
      .map(segment => (Array.isArray(segment) && typeof segment[0] === 'string' ? segment[0] : ''))
      .join('')
      .trim();

    if (!text) {
      throw new Error('Google Translate returned an empty translation.');
    }

    const detectedSourceLanguage = typeof response[2] === 'string' ? response[2] : sourceLanguage || targetLanguage;
    return {text, detectedSourceLanguage, targetLanguage};
  }

  describeSignWriting(fsw: string): Observable<string> {
    const params = new URLSearchParams();
    params.set('fsw', fsw);
    const url = `https://sw-description.${environment.apiDomain}/?` + params.toString();

    return this.http.get<{description: string}>(url).pipe(map(response => response.description));
  }

  translateSpokenToSigned(text: string, spokenLanguage: string, signedLanguage: string): string {
    const api = 'https://us-central1-sign-mt.cloudfunctions.net/spoken_text_to_signed_pose';
    return `${api}?text=${encodeURIComponent(text)}&spoken=${spokenLanguage}&signed=${signedLanguage}`;
  }

  /**
   * Download a pose before it is promoted to the active viewer. The existing Cloud
   * Function rejects localhost Referer headers, so the fetch intentionally omits one.
   * A Blob URL also lets the standby viewer parse the already-downloaded response.
   */
  preparePose(poseUrl: string): Observable<string> {
    return new Observable<string>(subscriber => {
      const controller = new AbortController();
      fetch(poseUrl, {referrerPolicy: 'no-referrer', signal: controller.signal})
        .then(response => {
          if (!response.ok) throw new Error(`Could not prepare sign pose (${response.status}).`);
          return response.blob();
        })
        .then(blob => {
          if (subscriber.closed) return;
          subscriber.next(URL.createObjectURL(blob));
          subscriber.complete();
        })
        .catch(error => {
          if (!subscriber.closed && error?.name !== 'AbortError') subscriber.error(error);
        });

      return () => controller.abort();
    });
  }

  releasePreparedPose(poseUrl?: string): void {
    if (poseUrl?.startsWith('blob:')) URL.revokeObjectURL(poseUrl);
  }
}
