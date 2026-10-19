# Selected combat audio

The selected original audition recordings are stored unmodified as 48 kHz, mono,
16-bit PCM WAV files. They contain no third-party or commercial-game recordings.

| Game event | Audition selection | Source file |
| --- | --- | --- |
| Player gunshot (rifle and pistol) | C — 清脆晶响 | `c-shot.wav` |
| Body hit | A — 干脆竞技 | `a-hit.wav` |
| Head hit without a kill | A — 干脆竞技 | `a-headshot.wav` |
| Body kill | A — 干脆竞技 | `a-kill.wav` |
| Headshot kill | A — 干脆竞技 | `a-headshot-kill.wav` |

`build.py` validates these WAV files and embeds their PCM into the standalone
HTML. Runtime audio buffers are created once, synchronously on audio activation;
there is no network download or asynchronous decoding before the first shot.

The selected shot uses gain 0.55 and hit confirmations use gain 0.75, followed
by a shared 0.55 output gain. These retain the audition's relative mix and
headroom. Samples are not pitch-shifted or normalized again. Enemy gunshots,
armor feedback and other existing procedural sounds retain their existing mix.
