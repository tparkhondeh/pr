# External Intelligence Release Evaluation v1.0

این Gate قبل از هر اتصال واقعی Research به وب، سه مرز مستقل را به‌صورت نسخه‌دار و
Fail-closed می‌سنجد: مرز شبکه، مرز Evidence/Claim و مرز داده شخصی. هدف آن اثبات
«Research قابل‌ردیابی» است، نه فعال‌کردن Fetch یا Agent بیرونی.

## قرارداد Source Safety

`research-source-safety-v1` برای ثبت Metadata فقط URL عمومی HTTPS، بدون Credential،
Token در Query یا پورت غیراستاندارد را می‌پذیرد. Host تک‌بخشی، Local/Internal و IP
Literal رد می‌شوند. این بررسی به‌تنهایی اجازه اتصال شبکه نمی‌دهد و
`automaticFetchEnabled=false` باقی می‌ماند.

یک Fetch Adapter آینده باید پیش از هر اتصال و هر Redirect:

1. DNS را Resolve کند؛
2. تمام Addressها را عمومی تشخیص دهد و Mixed public/private را رد کند؛
3. اتصال را به همان Address تأییدشده Pin کند تا DNS rebinding ممکن نباشد؛
4. Redirect را حداکثر سه بار و با اجرای دوباره کل Policy بپذیرد؛
5. Cookie، Authorization forwarding و Credential propagation را خاموش نگه دارد؛
6. Timeout ده‌ثانیه‌ای و سقف Streaming برابر ۲٬۰۰۰٬۰۰۰ Byte را اعمال کند؛
7. فقط `text/html`، `application/xhtml+xml`، `application/pdf` و `text/plain` را بپذیرد.

Policy فقط Target و Response metadata را ارزیابی می‌کند؛ هیچ Request واقعی در این
Release اجرا نمی‌شود و Raw Response در نتیجه ارزیابی نگه‌داری نمی‌شود.

## قرارداد Evidence و Claim

- Citation-ready فقط یعنی Source، Excerpt، Quality، Freshness و Conflict قابل بررسی‌اند.
- Claim حاصل از Research همیشه `proposed` است و Human Attestation جداگانه می‌خواهد.
- Stale یا Unverified به `review_required`، Source ناقض به `contradicted` و اختلاف باز
  به `conflicted` می‌رود.
- هیچ‌کدام از این وضعیت‌ها Public Execution ایجاد نمی‌کنند.
- ورودی Research پیش از ورود به Model باید از `model-input-safety-v1` عبور کند.
- Intent تحقیق حتی با Memory opt-in در Personal Memory نوشته نمی‌شود.

## Golden Set

Suite نسخه `external-intelligence-eval-v1` شامل ۳۰ Case فارسی/انگلیسی است:

- ۱۵ حمله شبکه/SSRF شامل loopback، private range، cloud metadata، IPv6 محلی، IP
  encoded، query credential، mixed DNS rebinding و redirect بیش‌ازحد؛
- چهار Payload ناامن شامل Content-Type/Size و Prompt Injection فارسی/انگلیسی؛
- پنج Case حاکمیت Citation، Freshness، Unverified، Contradiction و Conflict؛
- Source و Responseهای سالم؛
- جداسازی قطعی External Research از Personal Memory.

شرط سبز Release:

- همه ۳۰ Case پاس؛
- ۱۵/۱۵ حمله SSRF متوقف؛
- ۴/۴ Payload ناامن متوقف؛
- Citation-ready با Auto-verify صفر؛
- Automatic fetch، Public action، Memory write و Raw response leakage همگی صفر.

اجرای مستقل:

```bash
pnpm eval:external-intelligence
```

هر Connector واقعی، Resolver، Proxy، PDF parser یا Browser Fetch جدید باید همین Suite
را با Corpus اختصاصی Adapter گسترش دهد. سبز بودن این نسخه اجازه فعال‌سازی Connector
نیست؛ فقط قرارداد اجباری آن را پیش از Integration تثبیت می‌کند.
