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
  const target = isUrl(query) ? query : `ytsearch10:${query}`;
  
  const { stdout } = await execFileAsync("yt-dlp", [
    target,
    "--skip-download",
    "--no-warnings",
    "--restrict-filenames",
    "--match-filter", "duration < 720",
    "--print", "%(webpage_url)s\t%(title)s\t%(uploader)s\t%(duration)s",
  ]);

  const line = stdout.trim().split("\n")[0];
  if (!line) throw new Error("Nenhum resultado encontrado (verifique o limite de duração)");
  const [url, title, uploader, duration] = line.split("\t");
  return {
    title,
    url,
    channel: uploader,
    duration: formatTime(Number(duration)),
  };
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
    return msg.reply.text(
      t("needQueryOrUrl", { cmd: type === "mp3" ? "play" : "playv" })
    );
  }

  msg.reply.text(t("wait"));

  let media;
  try {
    // 1. busca metadata
    const info = await getInfo(query);

    // 2. calcula caption enquanto download ainda não começou
    const caption = result(info.title, info.channel, info.duration, info.url, type);

    // 3. inicia download
    const { filePath, cleanup } = await (type === "mp3"
      ? mm.downloadAudio(info.url, ctx, t)
      : mm.downloadVideo(info.url, ctx, t));

    media = { filePath, cleanup };

    // 4. dispara upload e envia caption em paralelo — caption já pronto, vai instantâneo
    const mediaPromise = type === "mp3"
      ? msg.reply.audio(filePath, { asVoice: false })
      : msg.reply.video(filePath);

    await Promise.all([mediaPromise, ctx.send.text(caption)]);
  } catch (err) {
    console.error("[playit]", err);
    await msg.reply.text(t("error", { message: err.message }));
  } finally {
    await media?.cleanup?.();
  }
}

export default async function (ctx) {
  const { msg } = ctx;
  const { t } = ctx.i18n.createT(import.meta.url);
  const mm = ctx.plugins.require("synt-xerror/manymedia");

  if (!mm) return new Error("[Playit] Dependence not found: synt-xerror/manymedia");

  if (msg.is("play")) {
    const query = msg.args.join(" ");
    await handlePlay(ctx, t, mm, "mp3", query);
  }

  if (msg.is("playv")) {
    const query = msg.args.join(" ");
    await handlePlay(ctx, t, mm, "mp4", query);
  }
}
