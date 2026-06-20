import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function isUrl(str) {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

async function getInfo(query) {
  // funciona tanto para busca (ytsearch1:...) quanto para URL direta
  const target = isUrl(query) ? query : `ytsearch1:${query}`;
  const { stdout } = await execFileAsync("yt-dlp", [
    target,
    "--skip-download",
    "--print-json",
  ]);
  const data = JSON.parse(stdout);
  return {
    title: data.title,
    url: data.webpage_url,
    channel: data.uploader,
    duration: formatTime(data.duration),
  };
}

async function getMedia(mm, type, query, ctx, t) {
  const info = await getInfo(query);
  const { filePath, cleanup } =
    type === "mp3"
      ? await mm.downloadAudio(info.url, ctx, t)
      : await mm.downloadVideo(info.url, ctx, t);
  return { ...info, filePath, cleanup };
}

function result(title, channel, duration, url, type) {
  const i = type === "mp4" ? "🎬" : "🎵";
  return `

\`\`\`
${i} ${title}
👤 ${channel}
⏱️ ${duration}
\`\`\`
${url}
  `.trim();
}

async function handlePlay(ctx, t, mm, type, query) {
  const { msg } = ctx;
  if (!query) {
    msg.reply(t("needQueryOrUrl", { cmd: type === "mp3" ? "play" : "playv" }));
    return;
  }
  msg.reply(t("downloading"));
  let media;
  try {
    media = await getMedia(mm, type, query, ctx, t);
    await msg.reply(result(media.title, media.channel, media.duration, media.url, type));
    if (type === "mp3") {
      await ctx.sendAudio(media.filePath);
    } else {
      await ctx.sendVideo(media.filePath);
    }
  } catch (err) {
    console.error("[Playit] download failed", { query, type, message: err.message, stderr: err.stderr });
    msg.reply(t("downloadFailed", { error: err.stderr || err.message }));
  } finally {
    media?.cleanup?.();
  }
}

export default async function (ctx) {
  const { msg } = ctx;
  const { t } = ctx.i18n.createT(import.meta.url);
  const pfx = ctx.config.get("CMD_PREFIX");
  const mm = ctx.plugins.require("synt-xerror/manymedia");
  if (!mm) return new Error("[Playit] Dependence not found: synt-xerror/manymedia");

  if (msg.is(pfx + "play")) {
    const query = msg.args.slice(1).join(" ");
    await handlePlay(ctx, t, mm, "mp3", query);
  }

  if (msg.is(pfx + "playv")) {
    const query = msg.args.slice(1).join(" ");
    await handlePlay(ctx, t, mm, "mp4", query);
  }
}

