import { cors } from "../lib/httpApi.js";
import { list, put } from "@vercel/blob";

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  const status = {
    ok: true,
    vercel: process.env.VERCEL === "1",
    hasBlobToken: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    hasGithubToken: Boolean(process.env.GITHUB_TOKEN || process.env.GH_TOKEN),
    blobWritable: false,
    githubWritable: Boolean(process.env.GITHUB_TOKEN || process.env.GH_TOKEN),
  };

  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    await put("invites/.storage-check", "ok", {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "text/plain",
      token,
    });
    status.blobWritable = true;
  } catch (err) {
    status.blobError = err?.message || String(err);
  }

  status.ready = status.blobWritable || status.githubWritable;
  status.help = status.ready
    ? "Stockage OK — les confirmations peuvent être enregistrées."
    : "Créez un Blob Store dans Vercel (Storage → Blob) lié au projet, puis Redeploy.";

  return res.status(200).json(status);
}
