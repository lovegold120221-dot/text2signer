import {TestBed} from '@angular/core/testing';
import {TranslationService} from './translate.service';
import {provideHttpClient} from '@angular/common/http';
import {HttpTestingController, provideHttpClientTesting} from '@angular/common/http/testing';
import {firstValueFrom} from 'rxjs';

describe('TranslationService', () => {
  let service: TranslationService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TranslationService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('should create', () => {
    expect(service).toBeTruthy();
  });

  it('should split spoken language sentences', () => {
    // splitSpokenSentences
    const sentences = ['Hello. ', 'My name is Inigo Montoya. ', 'You killed my father. ', 'Prepare to die. '];
    const text = sentences.join('');
    const language = 'en';
    const result = service.splitSpokenSentences(language, text);
    if ('Segmenter' in Intl) {
      expect(result).toEqual(sentences);
    } else {
      expect(result).toEqual([text]);
    }
  });

  it('should extract completed sentences and leave only the unfinished suffix', () => {
    expect(service.extractCompletedSentences('tl', 'Kumusta ka? Magandang umaga. Salamat')).toEqual({
      completedSentences: ['Kumusta ka?', 'Magandang umaga.'],
      remainder: 'Salamat',
    });
  });

  it('should finalize an unpunctuated browser speech segment after a pause', () => {
    expect(service.extractCompletedSentences('tl', 'Magandang umaga', true)).toEqual({
      completedSentences: ['Magandang umaga'],
      remainder: '',
    });
  });

  it('should preserve the signed-language list and resolve its spoken bridge language', () => {
    expect(service.signerInputLanguage('ase')).toBe('en');
    expect(service.signerInputLanguage('gsg')).toBe('de');
    expect(service.signerInputLanguage('fsl')).toBe('fr');
    expect(service.signerInputLanguage('ils')).toBe('en');
  });

  it('should ask Google Translate to auto-detect Tagalog and translate it for the signer', () => {
    let result;
    service.translateWithGoogle('Magandang umaga.', null, 'en').subscribe(value => (result = value));

    const request = httpTesting.expectOne(
      request =>
        request.url === 'https://translate.googleapis.com/translate_a/single' &&
        request.params.get('sl') === 'auto' &&
        request.params.get('tl') === 'en' &&
        request.params.get('q') === 'Magandang umaga.'
    );
    request.flush([[['Good morning.', 'Magandang umaga.']], null, 'tl']);

    expect(result).toEqual({text: 'Good morning.', detectedSourceLanguage: 'tl', targetLanguage: 'en'});
  });

  it('should normalize Filipino terminology and spoken numbers before signing', () => {
    expect(service.normalizeTranscript("jehovah at dalawampu't tatlo", null)).toBe('Jehova at 23');
  });

  it('should skip Google Translate when source text already matches the signer input language', () => {
    let result;
    service.translateWithGoogle('Hello.', 'en', 'en').subscribe(value => (result = value));

    expect(result).toEqual({text: 'Hello.', detectedSourceLanguage: 'en', targetLanguage: 'en'});
  });

  it('should fail safely when Google Translate returns an invalid response', () => {
    let error: Error;
    service.translateWithGoogle('Kumusta?', null, 'en').subscribe({error: value => (error = value)});

    httpTesting.expectOne(request => request.url.includes('translate.googleapis.com')).flush({});

    expect(error.message).toBe('Google Translate returned an invalid response.');
  });

  it('should prefetch a pose without a Referer and expose a local Blob URL', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch').and.resolveTo(new Response(new Blob(['pose']), {status: 200}));
    const createUrlSpy = spyOn(URL, 'createObjectURL').and.returnValue('blob:prepared-pose');

    const preparedUrl = await firstValueFrom(service.preparePose('https://example.test/sign.pose'));

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://example.test/sign.pose',
      jasmine.objectContaining({referrerPolicy: 'no-referrer'})
    );
    expect(createUrlSpy).toHaveBeenCalled();
    expect(preparedUrl).toBe('blob:prepared-pose');
  });

  it('should release prepared Blob URLs only', () => {
    const revokeSpy = spyOn(URL, 'revokeObjectURL');

    service.releasePreparedPose('https://example.test/sign.pose');
    service.releasePreparedPose('blob:prepared-pose');

    expect(revokeSpy).toHaveBeenCalledOnceWith('blob:prepared-pose');
  });
});
