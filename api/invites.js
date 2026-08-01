import { handleApi } from "../lib/httpApi.js";

export default async function handler(req, res) {
  return handleApi(req, res, "invites");
}
