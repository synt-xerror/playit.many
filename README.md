# playit

ManyBot plugin to play audio or video in WhatsApp from a search term or URL.

## Commands

| Command        | Description                          |
|----------------|---------------------------------------|
| `!play <query or url>`  | Downloads and sends audio (mp3) |
| `!playv <query or url>` | Downloads and sends video (mp4) |

If the argument isn't a valid URL, it searches YouTube and uses the first result.

```
!play rap do minecraft
!playv https://youtu.be/dQw4w9WgXcQ
```

## Dependencies

- [`synt-xerror/manymedia`](https://manybot.stxerr.dev/docs/plugins/manymedia)
- `yt-dlp` installed on the system
