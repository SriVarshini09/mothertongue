import type { EngineKind } from '../capabilities';
import type { DeliveryProfile } from '@/types/speech';

export type CloudAudioResult = {
  url: string;
  engine: EngineKind;
};

export interface CloudSpeechEngine {
  readonly kind: Extract<EngineKind, 'cloud'>;
  synthesize(input: {
    text: string;
    language: string;
    onProgress?: (done: number, total: number) => void;
  }): Promise<CloudAudioResult>;
}

export type DeviceVoiceInfo = {
  name: string;
  lang: string;
  localService: boolean;
};

export interface DeviceSpeechEngine {
  readonly kind: Extract<EngineKind, 'local'>;
  supported(): boolean;
  /** Device voices matching a language (best first). Pure query, no speech. */
  voicesFor(language: string): DeviceVoiceInfo[];
  speak(input: {
    text: string;
    language: string;
    rate?: number;
    pitch?: number;
    onEnd?: () => void;
    onError?: (message: string) => void;
  }): void;
  pause(): void;
  resume(): void;
  stop(): void;
  speaking(): boolean;
  paused(): boolean;
}

export type { DeliveryProfile };
