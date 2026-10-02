// Errors with a clear Arabic message for the UI, plus raw details for debugging.
export class PublishError extends Error {
  constructor(
    public userMessage: string,
    public details?: string,
  ) {
    super(details ? `${userMessage} — ${details}` : userMessage);
  }
}

export function toPublishError(err: unknown): PublishError {
  if (err instanceof PublishError) return err;
  const message = err instanceof Error ? err.message : String(err);
  if (/fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|socket hang up|network/i.test(message)) {
    return new PublishError("انقطع الاتصال مع المنصة أثناء النشر. جرّب مرة ثانية.", message);
  }
  return new PublishError("صار خطأ غير متوقع أثناء النشر.", message);
}

interface GoogleErrorBody {
  error?: { code?: number; message?: string; errors?: { reason?: string; message?: string }[]; status?: string } | string;
  error_description?: string;
}

export function youtubeError(status: number, body: unknown): PublishError {
  const b = (body ?? {}) as GoogleErrorBody;
  const err = typeof b.error === "object" ? b.error : undefined;
  const reason = err?.errors?.[0]?.reason ?? (typeof b.error === "string" ? b.error : undefined);
  const raw = err?.message ?? b.error_description ?? JSON.stringify(body);
  const details = `HTTP ${status}${reason ? ` (${reason})` : ""}: ${raw}`;

  switch (reason) {
    case "quotaExceeded":
    case "rateLimitExceeded":
    case "userRateLimitExceeded":
      return new PublishError("تجاوزت حصة YouTube API اليومية. حاول بكرة، أو اطلب زيادة الحصة من Google Cloud.", details);
    case "uploadLimitExceeded":
      return new PublishError("وصلت حد الرفع اليومي لقناتك على يوتيوب. حاول بعد ٢٤ ساعة.", details);
    case "youtubeSignupRequired":
      return new PublishError("حساب Google المربوط ما عنده قناة يوتيوب. سوّ قناة ثم أعد الربط.", details);
    case "invalidTitle":
      return new PublishError("عنوان يوتيوب غير صالح (لازم يكون بين ١ و١٠٠ حرف وبدون < أو >).", details);
    case "invalidDescription":
      return new PublishError("وصف يوتيوب غير صالح أو أطول من المسموح.", details);
    case "invalidTags":
      return new PublishError("التاقات غير صالحة أو مجموعها أطول من ٥٠٠ حرف.", details);
    case "invalid_grant":
      return new PublishError("انتهت صلاحية ربط يوتيوب أو تم إلغاؤه. أعد الربط من صفحة الإعدادات.", details);
  }
  if (status === 401) return new PublishError("صلاحية ربط يوتيوب انتهت. أعد الربط من صفحة الإعدادات.", details);
  if (status === 403) return new PublishError("يوتيوب رفض الطلب (صلاحيات ناقصة أو الحساب مقيّد).", details);
  if (status >= 500) return new PublishError("خوادم يوتيوب فيها مشكلة مؤقتة. جرّب بعد شوي.", details);
  return new PublishError("يوتيوب رفض الطلب.", details);
}

interface MetaErrorBody {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    error_user_title?: string;
    error_user_msg?: string;
  };
}

export function instagramError(status: number, body: unknown): PublishError {
  const err = ((body ?? {}) as MetaErrorBody).error;
  const code = err?.code;
  const sub = err?.error_subcode;
  const details = `HTTP ${status} code=${code ?? "?"}${sub ? ` subcode=${sub}` : ""}: ${err?.message ?? JSON.stringify(body)}`;
  const userMsg = err?.error_user_msg;

  if (code === 190 || sub === 463 || sub === 460) {
    return new PublishError("انتهت صلاحية ربط انستقرام. أعد الربط من صفحة الإعدادات.", details);
  }
  if (code === 10 || code === 200 || (code !== undefined && code >= 200 && code < 300)) {
    return new PublishError("صلاحيات انستقرام ناقصة. أعد الربط ووافق على كل الصلاحيات المطلوبة.", details);
  }
  if (code === 4 || code === 17 || code === 32 || code === 613 || sub === 2207042) {
    return new PublishError("وصلت حد النشر أو الطلبات في انستقرام. حاول بعد فترة.", details);
  }
  switch (sub) {
    case 2207026:
      return new PublishError("صيغة الفيديو غير مدعومة في انستقرام. استخدم MP4 (H.264 + AAC).", details);
    case 2207004:
      return new PublishError("الصورة أكبر من الحجم المسموح في انستقرام (8 ميقا).", details);
    case 2207009:
    case 36003:
      return new PublishError("أبعاد الصورة/الفيديو غير مقبولة في انستقرام (النسبة لازم تكون بين 4:5 و 1.91:1 للصور).", details);
    case 2207052:
    case 9004:
      return new PublishError("انستقرام ما قدر يحمّل الملف. جرّب مرة ثانية.", details);
    case 2207001:
    case 2207003:
      return new PublishError("انستقرام واجه مشكلة مؤقتة أثناء معالجة الملف. جرّب مرة ثانية.", details);
  }
  if (userMsg) return new PublishError(`انستقرام: ${userMsg}`, details);
  if (status >= 500) return new PublishError("خوادم انستقرام فيها مشكلة مؤقتة. جرّب بعد شوي.", details);
  return new PublishError("انستقرام رفض الطلب.", details);
}
