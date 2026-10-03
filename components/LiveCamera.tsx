'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Loader2, RefreshCw, Upload, X } from 'lucide-react';

type CameraStatus = 'starting' | 'live' | 'error';

const FRIENDLY_ERRORS: Record<string, string> = {
  denied: "We couldn't access your camera. Enable camera permission or upload a photo instead.",
  nocamera: 'No camera was found on this device.',
  busy: 'Your camera is being used by another application.',
  unsupported: 'This browser cannot open the camera directly here.',
  failed: 'Something went wrong while opening the camera.',
};

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function classifyError(err: unknown): string {
  if (typeof DOMException !== 'undefined' && err instanceof DOMException) {
    if (err.name === 'NotAllowedError' || err.name === 'SecurityError') return 'denied';
    if (err.name === 'NotFoundError' || err.name === 'OverconstrainedError') return 'nocamera';
    if (err.name === 'NotReadableError' || err.name === 'AbortError') return 'busy';
  }
  return 'failed';
}

export default function LiveCamera({
  onCapture,
  onClose,
  onFallback,
}: {
  /** Called with the captured JPEG file when the user presses Use Photo. */
  onCapture: (file: File) => void;
  /** Called when the user closes the camera (stream already stopped). */
  onClose: () => void;
  /** Called when the user chooses the file-upload fallback. */
  onFallback: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>('starting');
  const [errorKind, setErrorKind] = useState<string>('failed');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [canSwitch, setCanSwitch] = useState(false);
  const [shot, setShot] = useState<string | null>(null);
  const shotFileRef = useRef<File | null>(null);

  const supported =
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function';

  const start = useCallback(
    async (mode: 'environment' | 'user') => {
      if (!supported) {
        setErrorKind('unsupported');
        setStatus('error');
        return;
      }
      stopStream(streamRef.current);
      streamRef.current = null;
      setStatus('starting');
      setShot(null);
      shotFileRef.current = null;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: mode } },
          audio: false,
        });
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          try {
            await video.play();
          } catch {
            /* autoplay can reject before metadata; the element is muted+playsInline so a retry happens on loadeddata */
          }
        }
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          setCanSwitch(devices.filter((d) => d.kind === 'videoinput').length > 1);
        } catch {
          setCanSwitch(false);
        }
        setStatus('live');
      } catch (err) {
        setErrorKind(classifyError(err));
        setStatus('error');
      }
    },
    [supported]
  );

  useEffect(() => {
    void start(facingMode);
    return () => {
      stopStream(streamRef.current);
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const restartWith = (mode: 'environment' | 'user') => {
    setFacingMode(mode);
    void start(mode);
  };

  const capture = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    // Full camera resolution; stop the stream once the frame is captured.
    stopStream(streamRef.current);
    streamRef.current = null;
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `page-${Date.now()}.jpg`, { type: 'image/jpeg' });
        shotFileRef.current = file;
        setShot(URL.createObjectURL(blob));
      },
      'image/jpeg',
      0.92
    );
  };

  const retake = () => {
    if (shot) URL.revokeObjectURL(shot);
    setShot(null);
    shotFileRef.current = null;
    void start(facingMode);
  };

  const usePhoto = () => {
    const file = shotFileRef.current;
    if (shot) URL.revokeObjectURL(shot);
    if (file) onCapture(file);
    else onClose();
  };

  const close = () => {
    if (shot) URL.revokeObjectURL(shot);
    stopStream(streamRef.current);
    streamRef.current = null;
    onClose();
  };

  if (status === 'error') {
    return (
      <div className="livecam livecam-error" role="alert">
        <Camera size={26} color="#315d4a" aria-hidden />
        <strong>Camera unavailable</strong>
        <p>{FRIENDLY_ERRORS[errorKind] ?? FRIENDLY_ERRORS.failed}</p>
        <div className="cta-row">
          <button className="ghost-small" type="button" onClick={close}>
            Close
          </button>
          <button
            className="primary-small"
            type="button"
            onClick={() => {
              close();
              onFallback();
            }}
          >
            <Upload size={15} aria-hidden /> Upload a photo instead
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="livecam">
      <div className="livecam-frame">
        {status === 'starting' && !shot && (
          <div className="livecam-starting" role="status">
            <Loader2 size={22} className="spin" aria-hidden />
            <span>MotherTongue needs camera access to take a photo…</span>
          </div>
        )}
        <video
          ref={videoRef}
          className="livecam-video"
          autoPlay
          muted
          playsInline
          disablePictureInPicture
          aria-label="Live camera preview"
          style={{ display: shot ? 'none' : 'block' }}
        />
        {status === 'live' && !shot && (
          <div className="livecam-guide" aria-hidden>
            <span>Position page here</span>
          </div>
        )}
        {shot && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shot} className="livecam-video" alt="Captured photo preview" />
        )}
      </div>

      {!shot ? (
        <div className="livecam-controls">
          <button className="ghost-small" type="button" onClick={close}>
            <X size={15} aria-hidden /> Close
          </button>
          <button
            className="capture-btn"
            type="button"
            onClick={capture}
            disabled={status !== 'live'}
            aria-label="Capture photo"
          >
            <span aria-hidden />
          </button>
          {canSwitch ? (
            <button
              className="ghost-small"
              type="button"
              onClick={() => restartWith(facingMode === 'environment' ? 'user' : 'environment')}
              aria-label="Switch camera"
            >
              <RefreshCw size={15} aria-hidden /> Switch
            </button>
          ) : (
            <span className="livecam-spacer" aria-hidden />
          )}
        </div>
      ) : (
        <div className="livecam-controls">
          <button className="ghost-small" type="button" onClick={retake}>
            Retake
          </button>
          <button className="primary-small" type="button" onClick={usePhoto}>
            Use photo
          </button>
        </div>
      )}
    </div>
  );
}
