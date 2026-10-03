import type { Metadata } from "next";

export const metadata: Metadata = { title: "سياسة الخصوصية — ناشر", robots: { index: false } };

// Public page (no login): Google and Meta require a privacy policy URL for OAuth apps.
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-10 text-sm leading-7">
      <h1 className="text-2xl font-bold">سياسة الخصوصية</h1>
      <p>
        «ناشر» أداة شخصية خاصة يستخدمها صاحبها فقط لنشر محتواه على حساباته في Instagram و YouTube. لا يوجد تسجيل حسابات
        للعامة.
      </p>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">البيانات اللي نستخدمها</h2>
        <ul className="list-disc space-y-1 ps-5">
          <li>صلاحيات الوصول (توكنات) لحساب YouTube وحساب Instagram المربوطين، تُحفظ مشفّرة في السيرفر ولا تُشارك مع أي طرف.</li>
          <li>الفيديو أو الصورة اللي ترفعها، تُحفظ مؤقتاً لين يكتمل النشر ثم تُحذف (وتُحذف تلقائياً بعد 3 أيام كحد أقصى).</li>
          <li>سجل المنشورات (التاريخ، الكابشن، الروابط) لعرضه لصاحب الحساب فقط.</li>
        </ul>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">وش نسوي فيها</h2>
        <p>
          نستخدمها فقط لرفع المحتوى اللي يختاره صاحب الحساب إلى حساباته. لا نبيع ولا نشارك أي بيانات، ولا نستخدمها للإعلانات أو
          التحليل.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">الحذف</h2>
        <p>
          تقدر تفصل أي حساب من صفحة الإعدادات وتنحذف صلاحياته فوراً، أو تلغي الصلاحية من إعدادات حساب Google أو Facebook.
        </p>
      </section>
      <hr className="border-line" />
      <section dir="ltr" className="space-y-2 text-start">
        <h2 className="text-lg font-semibold">Privacy Policy (English)</h2>
        <p>
          Nasher is a private, single-user tool that lets its owner publish their own content to their own Instagram and
          YouTube accounts. Access tokens are stored encrypted on the server and never shared. Uploaded media is kept only
          until publishing completes (at most 3 days). No data is sold, shared, or used for advertising. Disconnecting an
          account in Settings deletes its tokens immediately.
        </p>
      </section>
    </main>
  );
}
