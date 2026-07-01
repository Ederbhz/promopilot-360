import axios from "axios";
import { env } from "../config/env.js";

export async function sendTelegramMessage(input: {
  chatId?: string;
  message: string;
  imageUrl?: string | null;
}) {
  if (!env.TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN nao configurado.");
  }
  const chatId = input.chatId || env.TELEGRAM_DEFAULT_CHAT_ID;
  if (!chatId) {
    throw new Error("TELEGRAM_DEFAULT_CHAT_ID nao configurado.");
  }

  if (input.imageUrl) {
    const response = await axios.post(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendPhoto`,
      {
        chat_id: chatId,
        photo: input.imageUrl,
        caption: input.message,
        parse_mode: "HTML"
      }
    );
    return response.data;
  }

  const response = await axios.post(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      chat_id: chatId,
      text: input.message,
      disable_web_page_preview: false
    }
  );
  return response.data;
}

export async function testTelegramConnection() {
  if (!env.TELEGRAM_BOT_TOKEN) {
    return { ok: false, message: "TELEGRAM_BOT_TOKEN nao configurado." };
  }
  const response = await axios.get(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getMe`);
  return response.data;
}
