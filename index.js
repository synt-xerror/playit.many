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
      // 1. Enviamos o áudio e guardamos a resposta (que contém os dados da mensagem enviada)
      const audioMessage = await msg.reply.audio(filePath, { asVoice: false });
      
      // 2. Criamos o texto com o título e o autor (canal)
      const caption = `🎵 *${info.title}* - ${info.channel}`;
      
      // 3. Respondemos diretamente à mensagem do áudio usando o método reply do framework
      // Nota: Dependendo da sua biblioteca, pode ser 'audioMessage.reply.text' ou 'ctx.reply.text' passando o message_id.
      // A forma mais comum em libs baseadas em contexto é usar o reply da própria mensagem retornada:
      if (audioMessage?.reply?.text) {
        await audioMessage.reply.text(caption, { parse_mode: "Markdown" });
      } else {
        // Fallback caso sua biblioteca não anexe o helper reply na mensagem retornada
        await msg.reply.text(caption, { reply_to_message_id: audioMessage.message_id, parse_mode: "Markdown" });
      }
    } else {
      // Para vídeos, continua enviando normalmente sem texto extra
      await msg.reply.video(filePath);
    }
  } catch (err) {
    ctx.log.error(`[playit] Error: ${err.message}`);
    await msg.reply.text(t("error", { message: err.message }));
  } finally {
    await media?.cleanup?.();
  }
}

export default async function (ctx) {
  const { msg } = ctx;
  const { t } = ctx.i18n.createT(import.meta.url);
  const mm = ctx.plugins.require("synt-xerror/manymedia");

  if (!mm) {
    ctx.log.error("[Playit] Dependency not found: synt-xerror/manymedia");
    return;
  }

  if (msg.is("play")) {
    const query = msg.args.join(" ");
    await handlePlay(ctx, t, mm, "mp3", query);
  }

  if (msg.is("playv")) {
    const query = msg.args.join(" ");
    await handlePlay(ctx, t, mm, "mp4", query);
  }
}
