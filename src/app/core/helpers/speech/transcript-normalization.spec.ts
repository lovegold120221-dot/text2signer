import {canonicalizeFilipinoTerms, isFilipinoLanguage, normalizeTranscriptForSigning} from './transcript-normalization';

describe('transcript normalization', () => {
  it('recognizes both Tagalog and Filipino locale codes', () => {
    expect(isFilipinoLanguage('tl')).toBeTrue();
    expect(isFilipinoLanguage('tl-PH')).toBeTrue();
    expect(isFilipinoLanguage('fil-PH')).toBeTrue();
    expect(isFilipinoLanguage('en-PH')).toBeFalse();
  });

  it('uses canonical spelling for Filipino JW terminology', () => {
    expect(canonicalizeFilipinoTerms('mga saksi ni jehovah at hesus kristo sa jw dot org')).toBe(
      'Mga Saksi ni Jehova at Jesu-Kristo sa JW.org'
    );
  });

  it('transcribes a Filipino cardinal number as digits', () => {
    expect(normalizeTranscriptForSigning("May isang daan at dalawampu't tatlong dumalo.", 'fil-PH')).toBe(
      'May 123 dumalo.'
    );
  });

  it('transcribes Filipino years and large numbers', () => {
    expect(normalizeTranscriptForSigning("Taong dalawang libo dalawampu't anim.", 'tl')).toBe('Taong 2026.');
    expect(normalizeTranscriptForSigning('isang milyon dalawang daang libo', 'tl')).toBe('1200000');
  });

  it('preserves the leading zero in a spoken phone-number sequence', () => {
    expect(normalizeTranscriptForSigning('sero siyam isa pito dalawa tatlo apat lima anim pito walo', 'tl')).toBe(
      '09172345678'
    );
  });

  it('transcribes Filipino and English decimal numbers', () => {
    expect(normalizeTranscriptForSigning('tatlo punto isa apat', 'tl')).toBe('3.14');
    expect(normalizeTranscriptForSigning('one hundred and twenty three point four five', 'en-US')).toBe('123.45');
  });

  it('normalizes Taglish numbers when source detection is automatic', () => {
    expect(normalizeTranscriptForSigning('jehovah, twenty five at dalawa.', null)).toBe('Jehova, 25 at 2.');
  });

  it('leaves unsupported languages unchanged', () => {
    expect(normalizeTranscriptForSigning('deux cent vingt', 'fr')).toBe('deux cent vingt');
  });
});
