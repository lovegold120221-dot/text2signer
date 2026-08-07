import {InputMode} from './translate.state';

export class FlipTranslationDirection {
  static readonly type = '[Translate] Flip Translation Direction';
}

export class SetInputMode {
  static readonly type = '[Translate] Set Input Mode';

  constructor(public mode: InputMode) {}
}

export class SetSpokenLanguage {
  static readonly type = '[Translate] Set Spoken Language';

  constructor(public language: string) {}
}

export class SetSignedLanguage {
  static readonly type = '[Translate] Set Signed Language';

  constructor(public language: string) {}
}

export class SetSpokenLanguageText {
  static readonly type = '[Translate] Set Spoken Language Text';

  constructor(public text: string) {}
}

export interface SpeechTranscriptUpdate {
  sourceEventId: string;
  finalText: string;
  interimText: string;
}

export class ReceiveSpeechTranscript {
  static readonly type = '[Translate] Receive Speech Transcript';

  constructor(public update: SpeechTranscriptUpdate) {}
}

/** Adds one completed source-language sentence to the sequential signer queue. */
export class QueueSourceSentence {
  static readonly type = '[Translate] Queue Source Sentence';

  constructor(public sentence: string) {}
}

export class ProcessSigningQueue {
  static readonly type = '[Translate] Process Signing Queue';
}

export class StartNextSigningJob {
  static readonly type = '[Translate] Start Next Signing Job';
}

export class SigningPosePrepared {
  static readonly type = '[Translate] Signing Pose Prepared';

  constructor(public jobId: string) {}
}

export class SigningPlaybackCompleted {
  static readonly type = '[Translate] Signing Playback Completed';

  constructor(public jobId: string) {}
}

export class StopSigningQueue {
  static readonly type = '[Translate] Stop Signing Queue';
}

export class ResumeSigningQueue {
  static readonly type = '[Translate] Resume Signing Queue';
}

export class ClearSigningQueue {
  static readonly type = '[Translate] Clear Signing Queue';
}

export class SetSignedLanguageVideo {
  static readonly type = '[Translate] Set Signed Language Video';

  constructor(public url: string) {}
}

// TODO remove this action, this is a mock
export class SetSignWritingText {
  static readonly type = '[Translate] SetSignWritingText';

  constructor(
    public text: string[],
    public jobId?: string
  ) {}
}

export class CopySignedLanguageVideo {
  static readonly type = '[Translate] Copy Signed Language Video';
}

export class CopySpokenLanguageText {
  static readonly type = '[Translate] Copy Spoken Language Text';
}

export class ShareSignedLanguageVideo {
  static readonly type = '[Translate] Share Signed Language Video';
}

export class DownloadSignedLanguageVideo {
  static readonly type = '[Translate] Download Signed Language Video';
}

export class ChangeTranslation {
  static readonly type = '[Translate] Change Translation';
}

export class UploadPoseFile {
  static readonly type = '[Translate] Upload Pose File';

  constructor(public url: string) {}
}

export class SuggestAlternativeText {
  static readonly type = '[Translate] Suggest Alternative Text';
}

export class DescribeSignWritingSign {
  static readonly type = '[Translate] Describe a Single SignWriting Sign';

  constructor(public fsw: string) {}
}
