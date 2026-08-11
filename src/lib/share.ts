import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';

const WEB_URL = 'https://queenchat.ru';
const APK_URL = `${WEB_URL}/downloads/queenchat.apk`;

export type QueenChatShareLanguage = 'ru' | 'en';

export function getQueenChatInvitation(language: QueenChatShareLanguage) {
  if (language === 'ru') {
    return `Присоединяйся ко мне в QueenChat 👑\n\nВеб-версия:\n${WEB_URL}\n\nAndroid:\n${APK_URL}`;
  }

  return `Join me on QueenChat 👑\n\nWeb:\n${WEB_URL}\n\nAndroid:\n${APK_URL}`;
}

async function copyInvitation(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();

  if (!copied) throw new Error('Clipboard is unavailable');
}

/** Opens the operating-system share sheet, or copies the full invitation if unavailable. */
export async function shareQueenChat(language: QueenChatShareLanguage): Promise<'shared' | 'copied'> {
  const text = getQueenChatInvitation(language);
  const payload = { title: 'QueenChat', text, url: WEB_URL };

  if (Capacitor.isNativePlatform()) {
    try {
      await Share.share({ ...payload, dialogTitle: 'QueenChat' });
      return 'shared';
    } catch (error) {
      console.warn('[Share] Native share unavailable, using clipboard fallback', error);
    }
  } else if (navigator.share) {
    try {
      await navigator.share(payload);
      return 'shared';
    } catch (error) {
      // A cancelled system sheet should not replace the user's clipboard.
      if (error instanceof DOMException && error.name === 'AbortError') return 'shared';
      console.warn('[Share] Web Share unavailable, using clipboard fallback', error);
    }
  }

  await copyInvitation(text);
  return 'copied';
}

export { APK_URL, WEB_URL };
