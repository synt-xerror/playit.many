/** @typedef {import("@manybot/types/en").PluginContext} PluginContext */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
const execFileAsync = promisify(execFile);

const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".webm", ".mkv", ".gif"]);

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

/**
 * @param {PluginContext} ctx
 * @param {string|null} rawQuery
 */
async function resolveQuery(ctx, rawQuery) {
  if (rawQuery) return rawQuery;
  if (!ctx.msg.hasReply) return null;
  const quoted = await ctx.msg.getReply();
  return quoted.body;
}

async function getInfo(query, t) {
  const target = isUrl(query) ? query : `ytsearch10:${query}`;

  let stdout;
  try {
    ({ stdout } = await execFileAsync("yt-dlp", [
      target,
      "--skip-download",
      "--no-warnings",
      "--restrict-filenames",
      "--match-filter", "duration < 720",
      "--ignore-errors",
      "--print", "%(webpage_url)s\t%(title)s\t%(uploader)s\t%(duration)s",
    ]));
  } catch (err) {
    if (!err.stdout?.trim()) throw err;
    stdout = err.stdout;
  }
  const line = stdout.trim().split("\n")[0];
  if (!line) throw new Error(t("noResults"));

  const [url, title, uploader, duration] = line.split("\t");
  return {
    title,
    url,
    channel: uploader,
    duration: formatTime(Number(duration)),
  };
}

// Sends one gallery item, picking video or image reply based on extension.
function sendGalleryItem(msg, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return VIDEO_EXTENSIONS.has(ext) ? msg.reply.video(filePath) : msg.reply.image(filePath);
}

// Fallback for /playv links yt-dlp can't handle (image carousels, galleries).
// Only makes sense for direct URLs, not search queries.
async function tryImageFallback(ctx, mm, query) {
  if (!isUrl(query) || !mm.downloadImages) return false;

  const { filePaths, cleanup } = await mm.downloadImages(query, ctx);
  try {
    for (const p of filePaths) await sendGalleryItem(ctx.msg, p);
    return true;
  } finally {
    await cleanup?.();
  }
}

/**
 * @param {PluginContext} ctx
 * @param {string|null} rawQuery
 */
async function handlePlay(ctx, t, mm, type, query) {
  const { msg } = ctx;
  const cmdName = type === "mp3" ? "play" : "playv";
  if (!query) {
    return msg.reply.text(
      t("needQueryOrUrl", { cmd: cmdName })
    );
  }
  await msg.reply.text(t("wait"));
  let media;
  try {
    const info = await getInfo(query, t);
    const { filePath, cleanup } = await (type === "mp3"
      ? mm.downloadAudio(info.url, ctx, t)
      : mm.downloadVideo(info.url, ctx, t));
    media = { filePath, cleanup };
    if (type === "mp3") {
      const audioMessage = await msg.reply.audio(filePath, { asVoice: false });
      const caption = `🎵 *${info.title}* - ${info.channel}`;
      if (audioMessage?.reply?.text) {
        await audioMessage.reply.text(caption, { parse_mode: "Markdown" });
      } else {
        await msg.reply.text(caption, { reply_to_message_id: audioMessage.message_id, parse_mode: "Markdown" });
      }
    } else {
      await msg.reply.video(filePath);
    }
  } catch (err) {
    if (type === "mp4") {
      try {
        const handled = await tryImageFallback(ctx, mm, query);
        if (handled) return;
      } catch (galleryErr) {
        ctx.log.error(`[playit] Gallery fallback failed: ${galleryErr.message}`);
      }
    }
    ctx.log.error(`[playit] Error: ${err.message}`);
    await msg.reply.text(t("error", { message: err.message }));
  } finally {
    await media?.cleanup?.();
  }
}

/**
 * @param {PluginContext} ctx
 * @param {string|null} rawQuery
 */
export default async function (ctx) {
  const { msg } = ctx;
  const { t } = ctx.i18n.createT(import.meta.url);
  const mm = ctx.plugins.require("synt-xerror/manymedia");
  if (!mm) {
    ctx.log.error("[Playit] Dependency not found: synt-xerror/manymedia");
    return;
  }
  if (msg.is("play")) {
    const query = await resolveQuery(ctx, msg.args.join(" "));
    await handlePlay(ctx, t, mm, "mp3", query);
  }
  if (msg.is("playv")) {
    const query = await resolveQuery(ctx, msg.args.join(" "));
    await handlePlay(ctx, t, mm, "mp4", query);
  }
}
